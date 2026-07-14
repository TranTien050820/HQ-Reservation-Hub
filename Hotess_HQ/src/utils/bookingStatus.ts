import { BookingStatus, type ReservationBooking } from '../types';

/**
 * Confirm/Reserved bookings whose reservation datetime has already passed are
 * treated as Overdue on the frontend (mirrors HQ_FE_V2's getEffectiveStatus).
 */
export function getEffectiveStatus(
  booking: Pick<ReservationBooking, 'status' | 'reservationDate' | 'reservationTime'>,
): number {
  const status = booking.status ?? 0;
  if (status !== BookingStatus.Confirm && status !== BookingStatus.Reserved) return status;
  if (!booking.reservationDate) return status;
  const timeStr = booking.reservationTime?.slice(0, 5) ?? '23:59';
  const bookingDateTime = new Date(`${booking.reservationDate}T${timeStr}:00`);
  return bookingDateTime < new Date() ? BookingStatus.Overdue : status;
}
