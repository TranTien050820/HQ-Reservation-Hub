import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>;
}

export function BookingDetailModal({ booking, onClose }: BookingDetailModalProps) {
  const { t } = useTranslation();
  const { linkInfo } = useStore();
  if (!booking) return null;

  const effectiveStatus = getEffectiveStatus(booking);
  const cfg = BOOKING_STATUS_CONFIG[effectiveStatus];
  const zoneName = linkInfo?.zones.find((z) => z.zoneID === booking.zoneID)?.zoneName;
  const tableNumbers = (booking.seatTables ?? [])
    .map((st) => st.reserTable ?? st.tableNum)
    .filter((v): v is number => v != null);
  // extraValues[].fieldName can come back blank from the search endpoint — the
  // config already loaded with the store's link info is the reliable label source.
  const configByFieldID = new Map((linkInfo?.extraFieldConfigs ?? []).map((c) => [String(c.fieldID), c]));
  const optionTextByFieldID = new Map<string, Map<string, string>>();
  for (const opt of linkInfo?.extraFieldOptions ?? []) {
    if (opt.fieldID == null || opt.optionValue == null) continue;
    const key = String(opt.fieldID);
    if (!optionTextByFieldID.has(key)) optionTextByFieldID.set(key, new Map());
    optionTextByFieldID.get(key)!.set(opt.optionValue, opt.optionText ?? opt.optionValue);
  }
  const hasBooker = !!(booking.bookerName || booking.bookerPhone || booking.bookerEmail);

  return (
    <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="glass-card modal-panel flex max-h-[85vh] w-full max-w-sm flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{t('seating.bookingDetail')}</h3>
          {cfg && (
            <span className="chip text-white" style={{ backgroundColor: cfg.color }}>
              {t(cfg.label)}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="divide-y divide-white/10">
          <Row label={t('seating.reservationCode')} value={booking.reservationNo} />
          <Row label={t('booking.name')} value={booking.bookingName} />
          <Row label={t('booking.phone')} value={booking.bookingPhone} />
          {booking.bookingEmail && <Row label={t('common.email')} value={booking.bookingEmail} />}
          <Row label={t('seating.date')} value={booking.reservationDate} />
          {booking.reservationTime && <Row label={t('seating.time')} value={booking.reservationTime.slice(0, 5)} />}
          <Row label={t('booking.partySize')} value={booking.partySize} />
          {zoneName && <Row label={t('booking.zone')} value={zoneName} />}
          {tableNumbers.length > 0 && (
            <Row label={t('seating.assignedTables')} value={tableNumbers.join(', ')} />
          )}
          {(booking.extraValues ?? [])
            .filter((ev) => ev.fieldValue)
            .map((ev) => {
              const key = String(ev.fieldID);
              const config = configByFieldID.get(key);
              const value =
                config?.fieldType === 3
                  ? (optionTextByFieldID.get(key)?.get(ev.fieldValue!) ?? ev.fieldValue)
                  : ev.fieldValue;
              return (
                <Row
                  key={ev.globalId ?? ev.fieldID}
                  label={ev.fieldName || config?.fieldName || ''}
                  value={value}
                />
              );
            })}

          {hasBooker && (
            <>
              <SectionLabel>{t('seating.booker')}</SectionLabel>
              {booking.bookerName && <Row label={t('booking.name')} value={booking.bookerName} />}
              {booking.bookerPhone && <Row label={t('booking.phone')} value={booking.bookerPhone} />}
              {booking.bookerEmail && <Row label={t('common.email')} value={booking.bookerEmail} />}
            </>
          )}
        </div>

          {booking.customerNote && (
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-800/40 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('seating.customerNote')}
              </p>
              <p className="whitespace-pre-line text-sm text-white">{booking.customerNote}</p>
            </div>
          )}

          {booking.internalNote && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
                {t('seating.internalNote')}
              </p>
              <p className="whitespace-pre-line text-sm text-amber-100">{booking.internalNote}</p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="chip-btn btn-secondary mx-auto mt-4 w-32 shrink-0 rounded-xl text-sm font-medium"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
