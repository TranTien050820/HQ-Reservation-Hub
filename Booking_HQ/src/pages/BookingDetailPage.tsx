import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { ReservationStatus, type ReservationBooking } from '../api/types';
import { useStoreData } from '../store/StoreDataContext';
import { getEffectiveStatus, statusBadgeClass } from '../lib/bookingStatus';
import { formatDateHeadingWithYear, formatTime } from '../lib/i18nFormat';
import { restaurantPhoto } from '../lib/restaurantImages';

export default function BookingDetailPage() {
  const { publicKey, data } = useStoreData();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const settings = data?.settings;
  const booking = (location.state as { booking?: ReservationBooking } | null)?.booking;

  if (!booking) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-neutral-600">{t('bookingDetail.notFound')}</p>
        <Link
          to={`/${publicKey}/bookings`}
          className="mt-4 inline-block text-sm font-semibold text-resy-red hover:underline"
        >
          ← {t('myBookings.title')}
        </Link>
      </div>
    );
  }

  const effectiveStatus = getEffectiveStatus(booking);
  const reservationRef = booking.reservationNo ?? `#${booking.globalId}`;

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <button onClick={() => navigate(-1)} className="text-sm text-neutral-500 hover:text-resy-red">
        ← {t('bookingDetail.back')}
      </button>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
        {booking.sNum != null && (
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
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(effectiveStatus)}`}
              >
                {t(`myBookings.status.${effectiveStatus}`, { defaultValue: t('myBookings.status.unknown') })}
              </span>
              <p className="mt-1.5 font-mono font-semibold">{reservationRef}</p>
            </div>
            <div className="shrink-0 rounded-lg border border-neutral-200 bg-white p-2">
              <QRCodeSVG value={reservationRef} size={72} />
            </div>
          </div>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.name')}</dt>
              <dd className="font-medium">{booking.bookingName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.date')}</dt>
              <dd className="font-medium">
                {booking.reservationDate ? formatDateHeadingWithYear(booking.reservationDate, i18n.language) : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.time')}</dt>
              <dd className="font-medium">{formatTime(booking.reservationTime, i18n.language)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">{t('confirmation.partySize')}</dt>
              <dd className="font-medium">
                {booking.partySize ?? '—'} {t('confirmation.guests')}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {booking.seatTables && booking.seatTables.length > 0 && (
        <div className="mt-6 rounded-xl border border-neutral-200 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {t('bookingDetail.seatTables')}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {booking.seatTables.map((seat, index) => {
              const tableNum = booking.status === ReservationStatus.Reserved ? seat.reserTable : seat.tableNum;
              return (
                <li key={index} className="flex items-center justify-between">
                  <span className="font-medium">{t('bookingDetail.tableLabel', { num: tableNum })}</span>
                  <span className="text-neutral-500">
                    {formatTime(seat.reserStartTime, i18n.language)} – {formatTime(seat.reserEndTime, i18n.language)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <Link
          to={`/${publicKey}/menu`}
          className="flex items-center justify-between rounded-xl border border-neutral-200 px-5 py-4 text-sm font-semibold text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red"
        >
          {t('bookingDetail.viewMenu')} →
        </Link>

        {settings?.phoneNumber && (
          <div className="rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              {t('restaurant.contact')}
            </h3>
            <p className="mt-2 text-sm text-neutral-700">{settings.phoneNumber}</p>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {t('restaurant.goodToKnow')}
          </h3>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-neutral-600">
            {((data?.goodToKnows ?? []).length > 0
              ? (data?.goodToKnows ?? []).map((item) => item.content)
              : (t('restaurant.goodToKnowItems', { returnObjects: true }) as string[])
            ).map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-resy-red">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
