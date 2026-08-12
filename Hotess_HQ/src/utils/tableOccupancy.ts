import { BookingStatus, type ReservationBooking, type TableSetup } from '../types';
import { getEffectiveStatus, isTerminalBooking } from './bookingStatus';
import { isSeatWindowActiveNow, seatWindowOverlaps } from './timeWindow';

/**
 * `canreserve` on TableSetup takes a table out of reservation service entirely —
 * not a time-slot conflict but a standing "never seat a booking here" flag set by
 * the store, so it holds for every window and outranks any occupancy state.
 *
 * A missing value counts as NOT reservable, same as 0: the flag is what grants
 * the table to reservations, and a table the setup doesn't vouch for must not be
 * seated into by default.
 */
export function isTableReservable(table: Pick<TableSetup, 'canreserve'> | undefined): boolean {
  return !!table?.canreserve;
}

/**
 * Per-table view of the day's bookings, shared by the seating floor plan and
 * the waitlist seat picker so both screens can never disagree about which
 * table is free.
 */
export interface TableOccupancy {
  /**
   * Absent means the table has no booking at all today.
   *
   * `upcoming` is deliberately NOT a blocking state: the table is free for the
   * window being judged, but something else claims it later (or earlier) the
   * same day. It still has to be shown — a table with a booking rendered as
   * plain "Trống" is the one thing staff must never see.
   *
   * `posOpen` comes from the POS (PosLocal/TabInfo), not from a booking, so such
   * an entry can have an empty `globalIds`.
   */
  state?: 'reserved' | 'occupied' | 'overdue' | 'upcoming' | 'posOpen';
  /** Every distinct booking holding this table (a table can have more than one — e.g. lunch + dinner, or a mismatched double-booking). */
  globalIds: number[];
  merged: boolean;
  /** Other table numbers sharing this same booking (merged for a larger party). */
  mergedWith?: number[];
  /** Earliest start time ("HH:mm:ss") of a hold that falls outside the judged window — what makes the table `upcoming`. */
  nextTime?: string;
  /**
   * The state describes the table right now, not the window being judged, so it
   * is shown but does not block — see `ignoreCurrentUse`. Only ever set on
   * "busy now" states (`occupied`, `posOpen`); the first hold that really
   * collides with the judged window clears it.
   */
  advisory?: boolean;
}

/** States that actually stop the table being picked. `upcoming` is informational. */
const BLOCKING_STATES = new Set<TableOccupancy['state']>(['reserved', 'occupied', 'overdue', 'posOpen']);

/** True when some other booking holds this table for the window that was judged. */
export function isTableBlocked(info: TableOccupancy | undefined): boolean {
  return info != null && info.advisory !== true && BLOCKING_STATES.has(info.state);
}

/** When several bookings claim one table, the most "committed" state wins the colour. */
const STATE_PRIORITY: Record<NonNullable<TableOccupancy['state']>, number> = {
  upcoming: 0,
  reserved: 1,
  overdue: 2,
  // A live POS check outranks a reservation-side hold (guests are demonstrably
  // on the table) but not `occupied`, which says the same thing and additionally
  // names the booking sitting there.
  posOpen: 3,
  occupied: 4,
};

export interface OccupancyOptions {
  /**
   * How to decide whether a seat row still blocks its table:
   *  - `'all-day'`  — every row of a non-terminal booking blocks (whole-day floor-plan browsing).
   *  - `'now'`      — only rows whose window covers the current clock time.
   *  - `{ startMinutes, endMinutes }` — only rows overlapping that window, for
   *    seating a guest at a chosen time rather than right now.
   *
   * A seatTables row is a time-slot hold, not an all-day marker: a table held
   * 23:30–01:30 must not block a different party at 12:00 lunch the same day.
   * Rows that don't block are still reported, as `upcoming`.
   */
  blocking: 'all-day' | 'now' | { startMinutes: number; endMinutes: number };
  /** Booking globalId to ignore — the one being (re)seated, so its own hold doesn't read as a conflict. */
  ignoreBookingGlobalId?: number;
  /**
   * Tables with an open check on the POS (PosLocal/TabInfo). These block no
   * matter which window is being judged: an open check is a fact about the table
   * right now, not a time-slot hold — and it outranks `ignoreBookingGlobalId`,
   * so even the table a booking already holds ("Đã giữ cho khách này") is blocked
   * while a check is open on it. Someone is sitting there either way.
   */
  posOpenTablenums?: Set<number>;
  /**
   * Set when the judged window starts far enough ahead (see
   * `CURRENT_USE_LOOKAHEAD_MINUTES`) that whoever is on a table right now will
   * have left by then. It downgrades the two "busy this second" blocks — an open
   * POS check, and a seated party whose own hold no longer covers the window — to
   * advisory, so the table can still be picked for that later window.
   *
   * ONLY for holding a table in advance (xếp/đặt trước). Walking a guest onto a
   * table right now must never set this: a table with an open POS check or guests
   * on it cannot be sat into, however far off the booking's own time is.
   *
   * It never touches a hold that overlaps the window either: a table already
   * booked for the window stays blocked whatever the lookahead says.
   */
  ignoreCurrentUse?: boolean;
}

export function buildTableOccupancy(
  bookings: ReservationBooking[],
  { blocking, ignoreBookingGlobalId, posOpenTablenums, ignoreCurrentUse }: OccupancyOptions,
): Map<number, TableOccupancy> {
  const info = new Map<number, TableOccupancy>();

  for (const tablenum of posOpenTablenums ?? []) {
    info.set(tablenum, {
      state: 'posOpen',
      globalIds: [],
      merged: false,
      mergedWith: [],
      advisory: ignoreCurrentUse === true,
    });
  }

  for (const booking of bookings) {
    // A dead booking's seat rows no longer occupy a physical table.
    if (isTerminalBooking(booking.status)) continue;
    if (ignoreBookingGlobalId != null && booking.globalId === ignoreBookingGlobalId) continue;

    // isActive === 0 marks a seat row the backend has retired (e.g. the booking
    // was moved to another table); undefined means the backend didn't send the
    // flag at all, which is not the same thing and must still count.
    const seatRows = (booking.seatTables ?? []).filter((st) => st.isActive !== 0);
    if (seatRows.length === 0) continue;

    const effective = getEffectiveStatus(booking);
    let bookedState: NonNullable<TableOccupancy['state']>;
    if (effective === BookingStatus.Seated) bookedState = 'occupied';
    else if (effective === BookingStatus.Overdue) bookedState = 'overdue';
    else bookedState = 'reserved';

    // A party physically at the table holds it until the booking is closed.
    // Their configured 2h window expiring doesn't stand them up, so a Seated
    // booking blocks regardless of the window being judged — otherwise a table
    // with guests still on it flips back to "free" mid-meal. The exception is a
    // window hours away (`ignoreCurrentUse`), where that party is long gone.
    const seatedNow = effective === BookingStatus.Seated;
    const seatedBlocksAnyWindow = seatedNow && ignoreCurrentUse !== true;

    /** tablenum -> does any of this booking's rows block the judged window. */
    const blockingByTable = new Map<number, boolean>();
    /** tablenum -> earliest non-blocking hold start, for the `upcoming` hint. */
    const nextTimeByTable = new Map<number, string>();

    for (const row of seatRows) {
      const tablenum = row.reserTable ?? row.tableNum;
      if (tablenum == null) continue;
      const blocks =
        blocking === 'all-day' ||
        seatedBlocksAnyWindow ||
        (blocking === 'now'
          ? isSeatWindowActiveNow(row.reserStartTime, row.reserEndTime)
          : seatWindowOverlaps(row.reserStartTime, row.reserEndTime, blocking.startMinutes, blocking.endMinutes));

      blockingByTable.set(tablenum, (blockingByTable.get(tablenum) ?? false) || blocks);
      if (!blocks && row.reserStartTime) {
        const current = nextTimeByTable.get(tablenum);
        if (current == null || row.reserStartTime < current) nextTimeByTable.set(tablenum, row.reserStartTime);
      }
    }

    const uniqueTablenums = Array.from(blockingByTable.keys());
    if (uniqueTablenums.length === 0) continue;

    for (const tablenum of uniqueTablenums) {
      const blocked = blockingByTable.get(tablenum) === true;
      // A seated party that no longer covers the window is still worth showing as
      // "Đang dùng" — the hostess needs to know someone is on that table now —
      // but as advisory, not as a conflict with a booking hours later.
      const advisory = !blocked && seatedNow;
      const state = blocked || advisory ? bookedState : 'upcoming';
      const nextTime = blocked ? undefined : nextTimeByTable.get(tablenum);
      const mergedWithForThis = uniqueTablenums.filter((n) => n !== tablenum);
      const existing = info.get(tablenum);
      if (!existing) {
        info.set(tablenum, {
          state,
          globalIds: [booking.globalId],
          merged: mergedWithForThis.length > 0,
          mergedWith: mergedWithForThis,
          nextTime,
          advisory,
        });
      } else {
        // Accumulate rather than overwrite so every booking on the table stays visible.
        existing.globalIds.push(booking.globalId);
        if (mergedWithForThis.length > 0) {
          existing.merged = true;
          existing.mergedWith = Array.from(new Set([...(existing.mergedWith ?? []), ...mergedWithForThis]));
        }
        const existingAdvisory = existing.advisory === true;
        if (existingAdvisory && blocked) {
          // First hold that really collides with the window wins the colour
          // outright: an advisory "busy right now" note must never be what a
          // blocked table shows as its reason.
          existing.state = state;
          existing.advisory = false;
        } else if (
          existingAdvisory === advisory &&
          STATE_PRIORITY[state] > STATE_PRIORITY[existing.state ?? 'upcoming']
        ) {
          existing.state = state;
        }
        if (nextTime != null && (existing.nextTime == null || nextTime < existing.nextTime)) {
          existing.nextTime = nextTime;
        }
      }
    }
  }

  return info;
}
