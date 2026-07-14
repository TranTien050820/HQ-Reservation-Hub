import { ReservationStatus, type ReservationBooking } from '../api/types';

/**
 * HQ-WebOffice-API status codes aren't a simple linear lifecycle:
 * 1 Pending, 2 Confirmed, 3 Cancelled by restaurant, 4 Seated, 5 Overdue, 6/8 Arrived, 7 No-show/cancelled by guest.
 * The widget also derives two client-side-only outcomes once the reservation time has passed:
 * a still-pending (1) booking reads as "restaurant never confirmed", and 2/3/4 read as Overdue.
 * Cancelling only ever applies to a still-pending, not-yet-overdue (1) booking — which itself
 * reports back as status 7, since there's no dedicated "cancelled by guest" code.
 */
function getReservationDateTime(booking: ReservationBooking): Date | null {
  if (!booking.reservationDate) return null;
  return new Date(`${booking.reservationDate}T${booking.reservationTime ?? '00:00:00'}`);
}

const OVERDUE_ELIGIBLE_STATUSES: number[] = [
  ReservationStatus.Confirm,
  ReservationStatus.Cancel,
  ReservationStatus.Reserved,
];

/** Not a real backend status — a client-side-only bucket for "still pending" past its reservation time. */
export const RESTAURANT_NO_CONFIRM_STATUS = 100;

/** The status to actually display/act on — raw status, unless it should now read as Overdue/unconfirmed. */
export function getEffectiveStatus(booking: ReservationBooking, now: Date = new Date()): number {
  const status = booking.status ?? ReservationStatus.New;
  const dateTime = getReservationDateTime(booking);
  const isPast = !!dateTime && dateTime.getTime() < now.getTime();
  if (status === ReservationStatus.New && isPast) return RESTAURANT_NO_CONFIRM_STATUS;
  if (OVERDUE_ELIGIBLE_STATUSES.includes(status) && isPast) return ReservationStatus.Overdue;
  return status;
}

export function canCancelBooking(booking: ReservationBooking, now: Date = new Date()): boolean {
  return getEffectiveStatus(booking, now) === ReservationStatus.New;
}

/** Still worth showing under "Upcoming" — pending, confirmed, or seated and not yet overdue. */
export function isUpcomingBooking(booking: ReservationBooking, now: Date = new Date()): boolean {
  const effective = getEffectiveStatus(booking, now);
  return (
    effective === ReservationStatus.New ||
    effective === ReservationStatus.Confirm ||
    effective === ReservationStatus.Reserved
  );
}

export function statusBadgeClass(effectiveStatus: number): string {
  switch (effectiveStatus) {
    case ReservationStatus.Confirm:
      return 'bg-green-100 text-green-700';
    case ReservationStatus.Reserved:
      return 'bg-blue-100 text-blue-700';
    case ReservationStatus.Seated:
    case ReservationStatus.Close:
      return 'bg-green-100 text-green-700';
    case ReservationStatus.Overdue:
      return 'bg-orange-100 text-orange-700';
    case ReservationStatus.Cancel:
    case ReservationStatus.NoShow:
    case RESTAURANT_NO_CONFIRM_STATUS:
      return 'bg-neutral-100 text-neutral-500';
    default:
      return 'bg-amber-100 text-amber-700';
  }
}
