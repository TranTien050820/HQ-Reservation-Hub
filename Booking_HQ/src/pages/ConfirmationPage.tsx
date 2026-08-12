import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import type { ReservationBooking } from '../api/types';
import { useStoreData } from '../store/StoreDataContext';
import { formatDateHeadingWithYear, formatTime } from '../lib/i18nFormat';
import { restaurantPhoto } from '../lib/restaurantImages';

export default function ConfirmationPage() {
  const { id } = useParams();
  const { publicKey, data } = useStoreData();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const booking = (location.state as { booking?: ReservationBooking } | null)?.booking;

  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-600">
        ✓
      </div>
      <h1 className="text-2xl font-bold">{t('confirmation.title')}</h1>
      <p className="mt-2 text-neutral-600">{t('confirmation.subtitle')}</p>

      <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 text-left">
        {booking?.sNum != null && (
          <img
            src={restaurantPhoto(booking.sNum)}
            alt=""
            className="h-32 w-full object-cover"
            loading="lazy"
          />
        )}
        <div className="p-6">
          <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-4">
            <div>
              <span className="text-sm text-neutral-500">{t('confirmation.reservationNo')}</span>
              <p className="font-mono font-semibold">{booking?.reservationNo ?? `#${id}`}</p>
            </div>
            <div className="shrink-0 rounded-lg border border-neutral-200 bg-white p-2">
              <QRCodeSVG value={booking?.reservationNo ?? `#${id}`} size={72} />
            </div>
          </div>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.name')}</dt>
              <dd className="font-medium">{booking?.bookingName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.date')}</dt>
              <dd className="font-medium">
                {booking?.reservationDate ? formatDateHeadingWithYear(booking.reservationDate, i18n.language) : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.time')}</dt>
              <dd className="font-medium">{formatTime(booking?.reservationTime, i18n.language)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.partySize')}</dt>
              <dd className="font-medium">{booking?.partySize ?? '—'} {t('confirmation.guests')}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Pre-ordering needs the reservation code — it is what ties the order to this booking
          and what the hostess releases to the kitchen at check-in (§8.4). */}
      {booking?.reservationNo && (
        <div className="mt-6 rounded-xl border border-resy-red/30 bg-red-50 p-5 text-left">
          <h3 className="font-bold">{t('preorder.ctaTitle')}</h3>
          <p className="mt-1 text-sm text-neutral-600">{t('preorder.ctaSubtitle')}</p>
          <Link
            to={`/${publicKey}/preorder/${encodeURIComponent(booking.reservationNo)}`}
            state={{ booking }}
            className="mt-3 inline-block rounded-lg bg-resy-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            {t('preorder.ctaButton')}
          </Link>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-left">
        <h3 className="text-sm font-semibold uppercase text-neutral-500">{t('restaurant.goodToKnow')}</h3>
        <ul className="mt-3 flex flex-col gap-2.5 text-sm text-neutral-600">
          {((data?.goodToKnows ?? []).length > 0
            ? (data?.goodToKnows ?? []).map((item) => item.content)
            : (t('restaurant.goodToKnowItems', { returnObjects: true }) as string[])
          ).map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="mt-0.5 text-resy-red">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Link
          to={`/${publicKey}`}
          className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold transition-colors hover:border-neutral-500"
        >
          {t('confirmation.bookAnother')}
        </Link>
        <Link
          to={`/${publicKey}/bookings`}
          className="rounded-lg bg-resy-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
        >
          {t('confirmation.viewReservations')}
        </Link>
      </div>
    </div>
  );
}
