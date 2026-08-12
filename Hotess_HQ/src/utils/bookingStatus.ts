import { BookingStatus, type ReservationBooking } from '../types';
import { parseServerTime, vnEpochMs } from './date';
import { toMinutes } from './timeWindow';

/**
 * Bookings nobody can act on any more: cancelled, no-showed or closed out —
 * whether by a person (3, 7, 8) or by the backend's own housekeeping (9
 * auto-close, 10 auto-cancel). They hold no table, cannot be checked in, and
 * carry no status chip.
 *
 * Deliberately one list. The floor plan, the check-in search and the waitlist
 * each used to keep their own copy of "which statuses are dead", so every
 * status the API grew had to be found and added in three places — and a miss
 * showed up as a cancelled booking still holding a table on the floor plan.
 */
export const TERMINAL_BOOKING_STATUSES: ReadonlySet<number> = new Set<number>([
  BookingStatus.Cancel,
  BookingStatus.NoShow,
  BookingStatus.Close,
  BookingStatus.AutoClose,
  BookingStatus.AutoCancel,
]);

/** True when the booking is closed business — see TERMINAL_BOOKING_STATUSES. */
export function isTerminalBooking(status: number | null | undefined): boolean {
  return status != null && TERMINAL_BOOKING_STATUSES.has(Number(status));
}

/**
 * Confirm/Reserved bookings whose reservation datetime has already passed are
 * treated as Overdue on the frontend (mirrors HQ_FE_V2's getEffectiveStatus).
 */
export function getEffectiveStatus(
  booking: Pick<ReservationBooking, 'status' | 'reservationDate' | 'reservationTime'>,
): number {
  const status = booking.status ?? 0;
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
