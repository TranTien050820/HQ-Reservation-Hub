import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useBookingsByPhone, useCancelBooking } from '../api/queries';
import { useStoreData } from '../store/StoreDataContext';
import { ReservationStatus, type ReservationBooking } from '../api/types';
import { canCancelBooking, getEffectiveStatus, isUpcomingBooking, statusBadgeClass } from '../lib/bookingStatus';
import BookingReview from '../components/BookingReview';
import { formatDateShort, formatTime } from '../lib/i18nFormat';
import { restaurantPhoto } from '../lib/restaurantImages';

interface SearchFormValues {
  phone: string;
}

const PAST_PAGE_SIZE = 5;

export default function MyBookingsPage() {
  const { t, i18n } = useTranslation();
  const { publicKey, data } = useStoreData();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [searchedPhone, setSearchedPhone] = useState<string | null>(null);
  const [pastVisibleCount, setPastVisibleCount] = useState(PAST_PAGE_SIZE);

  const { register, handleSubmit } = useForm<SearchFormValues>({ defaultValues: { phone: '' } });
  const bookingsQuery = useBookingsByPhone(searchedPhone ?? '', data?.linkInfo?.siteId, data?.linkInfo?.sNum);
  const cancelBookingMutation = useCancelBooking();

  const bookings: ReservationBooking[] | null = bookingsQuery.data ?? null;
  const loading = bookingsQuery.isFetching;
  const error =
    cancelError ??
    (bookingsQuery.isError
      ? bookingsQuery.error instanceof Error
        ? bookingsQuery.error.message
        : t('myBookings.errorLoad')
      : null);

  const upcomingBookings = bookings?.filter((b) => isUpcomingBooking(b)) ?? [];
  const pastBookings = bookings?.filter((b) => !isUpcomingBooking(b)) ?? [];
  const visiblePastBookings = pastBookings.slice(0, pastVisibleCount);

  const onSearch = ({ phone }: SearchFormValues) => {
    if (!phone.trim()) return;
    setCancelError(null);
    setPastVisibleCount(PAST_PAGE_SIZE);
    setSearchedPhone(phone.trim());
    void bookingsQuery.refetch();
  };

  const handleCancel = async (booking: ReservationBooking) => {
    if (!booking.globalId) return;
    if (!confirm(t('myBookings.confirmCancel', { ref: booking.reservationNo ?? '' }))) return;
    setCancellingId(booking.globalId);
    setCancelError(null);
    try {
      await cancelBookingMutation.mutateAsync(booking.globalId);
      void bookingsQuery.refetch();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : t('myBookings.errorCancel'));
    } finally {
      setCancellingId(null);
    }
  };

  const renderBooking = (booking: ReservationBooking) => {
    const effectiveStatus = getEffectiveStatus(booking);
    const canCancel = canCancelBooking(booking);
    return (
      <div
        key={booking.globalId}
        className="flex flex-col gap-4 rounded-2xl border border-neutral-200 p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center"
      >
        <img
          src={restaurantPhoto(booking.sNum ?? 0)}
          alt=""
          className="h-20 w-full rounded-xl object-cover sm:h-20 sm:w-24"
          loading="lazy"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(effectiveStatus)}`}>
              {t(`myBookings.status.${effectiveStatus}`, { defaultValue: t('myBookings.status.unknown') })}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            <span className="font-medium text-neutral-800">
              {formatDateShort(booking.reservationDate ?? '', i18n.language)}
            </span>
            <span className="text-neutral-400"> &middot; </span>
            {formatTime(booking.reservationTime, i18n.language)}
            <span className="text-neutral-400"> &middot; </span>
            {booking.partySize ?? '—'} {t('myBookings.guests')}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {t('myBookings.reservationNo')}{' '}
            <span className="font-mono">{booking.reservationNo ?? `#${booking.globalId}`}</span>
          </p>
          {booking.status === ReservationStatus.Close && booking.globalId != null && (
            <BookingReview bookingId={booking.globalId} />
          )}
        </div>
        <div className="flex shrink-0 gap-2 sm:flex-col sm:items-stretch">
          <Link
            to={`/${publicKey}/bookings/${booking.globalId}`}
            state={{ booking }}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-center text-sm font-medium text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red"
          >
            {t('myBookings.viewDetails')}
          </Link>
          {canCancel && (
            <button
              onClick={() => handleCancel(booking)}
              disabled={cancellingId === booking.globalId}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red disabled:opacity-60"
            >
              {cancellingId === booking.globalId ? t('myBookings.cancelling') : t('myBookings.cancel')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{t('myBookings.title')}</h1>
      <p className="mt-1 text-sm text-neutral-600">{t('myBookings.subtitle')}</p>

      <form onSubmit={handleSubmit(onSearch)} className="mt-6 flex gap-3">
        <input
          type="tel"
          placeholder={t('myBookings.phonePlaceholder')}
          {...register('phone', { required: true })}
          className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-resy-red px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
        >
          {loading ? t('myBookings.searching') : t('myBookings.search')}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-resy-red">{error}</p>}

      {bookings && bookings.length === 0 && (
        <p className="mt-8 text-neutral-500">{t('myBookings.noResults')}</p>
      )}

      {upcomingBookings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {t('myBookings.upcoming')}
          </h2>
          <div className="mt-3 flex flex-col gap-3">{upcomingBookings.map(renderBooking)}</div>
        </section>
      )}

      {pastBookings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{t('myBookings.past')}</h2>
          <div className="mt-3 flex flex-col gap-3">{visiblePastBookings.map(renderBooking)}</div>
          {pastVisibleCount < pastBookings.length && (
            <button
              onClick={() => setPastVisibleCount((c) => c + PAST_PAGE_SIZE)}
              className="mt-4 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red"
            >
              {t('myBookings.showMore')}
            </button>
          )}
        </section>
      )}

      {bookings && (
        <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold">{t('myBookings.ctaTitle')}</h3>
            <p className="mt-1 text-sm text-neutral-600">{t('myBookings.ctaSubtitle')}</p>
          </div>
          <Link
            to={`/${publicKey}`}
            className="shrink-0 rounded-lg bg-resy-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            {t('myBookings.ctaButton')}
          </Link>
        </div>
      )}
    </div>
  );
}
