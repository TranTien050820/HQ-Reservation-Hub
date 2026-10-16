import { BookingStatus, type ReservationBooking } from '../types';
import { parseServerTime, vnEpochMs } from './date';
import { toMinutes } from './timeWindow';

/**
 * Bookings nobody can act on any more: rejected, cancelled, no-showed or closed
 * out — whether by a person (0 reject, 3, 7, 8) or by the backend's own
 * housekeeping (9 auto-close, 10 auto-cancel, 11 auto-reject). They hold no
 * table, cannot be checked in, and are never offered for seating.
 *
 * Deliberately one list. The floor plan, the check-in search and the waitlist
 * each used to keep their own copy of "which statuses are dead", so every
 * status the API grew had to be found and added in three places — and a miss
 * showed up as a cancelled booking still holding a table on the floor plan.
 * Reject(0) and AutoReject(11) were exactly such a miss: once a New booking
 * could hold tables the guest picked ahead (YC2), a rejected one would have
 * kept painting them as reserved.
 */
export const TERMINAL_BOOKING_STATUSES: ReadonlySet<number> = new Set<number>([
  BookingStatus.Reject,
  BookingStatus.Cancel,
  BookingStatus.NoShow,
  BookingStatus.Close,
  BookingStatus.AutoClose,
  BookingStatus.AutoCancel,
  BookingStatus.AutoReject,
]);

/** True when the booking is closed business — see TERMINAL_BOOKING_STATUSES. */
export function isTerminalBooking(status: number | null | undefined): boolean {
  return status != null && TERMINAL_BOOKING_STATUSES.has(Number(status));
}

/** Turned down rather than called off: the restaurant said no (0), or never answered in time (11). */
export function isRejectedBooking(status: number | null | undefined): boolean {
  return status != null && (Number(status) === BookingStatus.Reject || Number(status) === BookingStatus.AutoReject);
}

/**
 * What a booking that came back with no status at all reads as: matches no chip and no state.
 * NOT 0 — that is Reject, and painting an unknown booking "Nhà hàng từ chối" would be a lie.
 */
const NO_STATUS = -1;

/**
 * Confirm/Reserved bookings whose reservation datetime has already passed are
 * treated as Overdue on the frontend (mirrors HQ_FE_V2's getEffectiveStatus).
 */
export function getEffectiveStatus(
  booking: Pick<ReservationBooking, 'status' | 'reservationDate' | 'reservationTime'>,
): number {
  const status = booking.status ?? NO_STATUS;
  if (status !== BookingStatus.Confirm && status !== BookingStatus.Reserved) return status;
  // Vietnam wall-clock, not the device's: a tablet an hour behind would otherwise
  // hold a whole hour of bookings at Reserved after they had already gone late.
  const bookingDateTime = vnEpochMs(booking.reservationDate, toMinutes(booking.reservationTime) ?? 23 * 60 + 59);
  if (bookingDateTime == null) return status;
  return bookingDateTime < Date.now() ? BookingStatus.Overdue : status;
}

/**
 * When the party actually sat down, as epoch ms.
 *
 * `dateSeat` is the backend's own stamp, written when the booking moved to
 * Seated — the only value that says when the guests really arrived. Bookings
 * seated before that column was populated fall back to the start of their seat
 * hold, which is the booked time rather than the arrival, so it can read early
 * for a late guest; still better than showing nothing on a table that visibly
 * has people on it.
 *
 * Null when the booking isn't seated or carries neither.
 */
export function seatedAtMs(booking: ReservationBooking): number | null {
  if (Number(booking.status) !== BookingStatus.Seated) return null;
  const stamped = parseServerTime(booking.dateSeat);
  if (stamped != null) return stamped;
  // Earliest active hold: a merged party has one row per table, all with the
  // same window, and a retired row (isActive === 0) is a table they left.
  const starts = (booking.seatTables ?? [])
    .filter((st) => st.isActive !== 0)
    .map((st) => vnEpochMs(st.reserDate ?? booking.reservationDate, toMinutes(st.reserStartTime) ?? 0))
    .filter((ms): ms is number => ms != null);
  return starts.length > 0 ? Math.min(...starts) : null;
}

/**
 * The tables a booking holds right now. `isActive === 0` rows are retired — a table the party
 * moved off, or pre-picked tables the restaurant let go — and a missing flag still counts.
 */
export function activeSeatTablenums(booking: Pick<ReservationBooking, 'seatTables'>): number[] {
  return (booking.seatTables ?? [])
    .filter((st) => st.isActive !== 0)
    .map((st) => st.reserTable ?? st.tableNum)
    .filter((v): v is number => v != null);
}

/**
 * YC2 — the tables a still-New booking holds because the guest (or the partner who sold the
 * booking) picked them ahead: "Bàn khách chọn". Only stations that hold New bookings keep
 * them. Confirming such a booking makes it Reserved(4) with these tables, unless the confirm
 * sends `seatTables: []`. Empty for any other status.
 */
export function pickedTablenumsOfNew(booking: Pick<ReservationBooking, 'status' | 'seatTables'>): number[] {
  return Number(booking.status) === BookingStatus.New ? activeSeatTablenums(booking) : [];
}
