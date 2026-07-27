import { BookingStatus, type ReservationBooking } from '../types';
import { getEffectiveStatus } from './bookingStatus';
import { isSeatWindowActiveNow, seatWindowOverlaps } from './timeWindow';

/**
 * Per-table view of the day's bookings, shared by the seating floor plan and
 * the waitlist seat picker so both screens can never disagree about which
 * table is free.
 */
export interface TableOccupancy {
  /** Absent means the table has no currently-relevant booking. */
  state?: 'reserved' | 'occupied' | 'overdue';
  /** Every distinct booking holding this table (a table can have more than one — e.g. lunch + dinner, or a mismatched double-booking). */
  globalIds: number[];
  merged: boolean;
  /** Other table numbers sharing this same booking (merged for a larger party). */
  mergedWith?: number[];
}

/** Statuses whose seatTables no longer occupy a physical table. */
const TERMINAL = new Set<number>([BookingStatus.Cancel, BookingStatus.NoShow, BookingStatus.Close]);

/** When several bookings claim one table, the most "committed" state wins the colour. */
const STATE_PRIORITY: Record<NonNullable<TableOccupancy['state']>, number> = {
  reserved: 1,
  overdue: 2,
  occupied: 3,
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
   */
  blocking: 'all-day' | 'now' | { startMinutes: number; endMinutes: number };
  /** Booking globalId to ignore — the one being (re)seated, so its own hold doesn't read as a conflict. */
  ignoreBookingGlobalId?: number;
}

export function buildTableOccupancy(
  bookings: ReservationBooking[],
  { blocking, ignoreBookingGlobalId }: OccupancyOptions,
): Map<number, TableOccupancy> {
  const info = new Map<number, TableOccupancy>();

  for (const booking of bookings) {
    if (TERMINAL.has(Number(booking.status))) continue;
    if (ignoreBookingGlobalId != null && booking.globalId === ignoreBookingGlobalId) continue;

    const seatRows = booking.seatTables ?? [];
    const activeRows =
      blocking === 'all-day'
        ? seatRows
        : blocking === 'now'
          ? seatRows.filter((st) => isSeatWindowActiveNow(st.reserStartTime, st.reserEndTime))
          : seatRows.filter((st) =>
              seatWindowOverlaps(st.reserStartTime, st.reserEndTime, blocking.startMinutes, blocking.endMinutes),
            );

    // `reserTable` is the reservation's held table; `tableNum` is only set once
    // the party has physically been seated, so prefer reserTable for identity.
    const tablenums = activeRows
      .map((st) => st.reserTable ?? st.tableNum)
      .filter((v): v is number => v != null);
    if (tablenums.length === 0) continue;

    const uniqueTablenums = Array.from(new Set(tablenums));
    const effective = getEffectiveStatus(booking);
    let state: NonNullable<TableOccupancy['state']>;
    if (effective === BookingStatus.Seated) state = 'occupied';
    else if (effective === BookingStatus.Overdue) state = 'overdue';
    else state = 'reserved';

    for (const tablenum of uniqueTablenums) {
      const mergedWithForThis = uniqueTablenums.filter((n) => n !== tablenum);
      const existing = info.get(tablenum);
      if (!existing) {
        info.set(tablenum, {
          state,
          globalIds: [booking.globalId],
          merged: mergedWithForThis.length > 0,
          mergedWith: mergedWithForThis,
        });
      } else {
        // Accumulate rather than overwrite so every booking on the table stays visible.
        existing.globalIds.push(booking.globalId);
        if (mergedWithForThis.length > 0) {
          existing.merged = true;
          existing.mergedWith = Array.from(new Set([...(existing.mergedWith ?? []), ...mergedWithForThis]));
        }
        if (STATE_PRIORITY[state] > STATE_PRIORITY[existing.state ?? 'reserved']) existing.state = state;
      }
    }
  }

  return info;
}
