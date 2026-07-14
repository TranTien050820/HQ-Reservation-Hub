import { useTranslation } from 'react-i18next';
import { BOOKING_STATUS_CONFIG, type ReservationBooking } from '../types';
import { getEffectiveStatus } from '../utils/bookingStatus';

interface BookingDetailModalProps {
  booking: ReservationBooking | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right font-medium text-white">{value ?? '-'}</span>
    </div>
  );
}

export function BookingDetailModal({ booking, onClose }: BookingDetailModalProps) {
  const { t } = useTranslation();
  if (!booking) return null;

  const effectiveStatus = getEffectiveStatus(booking);
  const cfg = BOOKING_STATUS_CONFIG[effectiveStatus];

  return (
    <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass-card modal-panel w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{t('seating.bookingDetail')}</h3>
          {cfg && (
            <span className="chip text-white" style={{ backgroundColor: cfg.color }}>
              {t(cfg.label)}
            </span>
          )}
        </div>
        <div className="divide-y divide-white/10">
          <Row label={t('seating.reservationCode')} value={booking.reservationNo} />
          <Row label={t('booking.name')} value={booking.bookingName} />
          <Row label={t('booking.phone')} value={booking.bookingPhone} />
          {booking.bookingEmail && <Row label={t('common.email')} value={booking.bookingEmail} />}
          <Row label={t('seating.date')} value={booking.reservationDate} />
          {booking.reservationTime && <Row label={t('seating.time')} value={booking.reservationTime.slice(0, 5)} />}
          <Row label={t('booking.partySize')} value={booking.numOfGuest} />
          {booking.zoneName && <Row label={t('booking.zone')} value={booking.zoneName} />}
          {booking.tableNumbers && booking.tableNumbers.length > 0 && (
            <Row label={t('seating.assignedTables')} value={booking.tableNumbers.join(', ')} />
          )}
          {booking.notes && <Row label={t('booking.notes')} value={booking.notes} />}
        </div>
        <button
          onClick={onClose}
          className="touch-btn btn-secondary mt-4 w-full rounded-xl font-medium"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
