import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
import { BOOKING_STATUS_CONFIG, BookingStatus, ExtraFieldType, type PreOrder, type ReservationBooking } from '../types';
import { getEffectiveStatus, seatedAtMs } from '../utils/bookingStatus';
import { formatVnHHmm } from '../utils/date';
import { formatDuration } from '../utils/duration';
import { PreOrderPanel } from './PreOrderPanel';

/** The sitting timer moves on its own — a panel left open must not freeze at "45 phút". */
const TICK_MS = 30_000;

interface BookingDetailModalProps {
  booking: ReservationBooking | null;
  /** Food this guest ordered ahead, if any — still parked, not yet at the kitchen. */
  preOrders?: PreOrder[];
  /** Provided only when the booking can actually be released (seated, with a table). */
  onRelease?: () => void;
  releasing?: boolean;
  /** Guest arrived and no longer wants the food — possible right up until it is released. */
  onCancelPreOrders?: () => void;
  cancellingPreOrders?: boolean;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value ?? '-'}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-faint">{children}</p>;
}

export function BookingDetailModal({
  booking,
  preOrders = [],
  onRelease,
  releasing,
  onCancelPreOrders,
  cancellingPreOrders,
  onClose,
}: BookingDetailModalProps) {
  const { t } = useTranslation();
  const { linkInfo } = useStore();

  // Keyed off "is a panel open", not off the booking object: the floor plan hands
  // in a fresh object on every poll, and restarting the timer each time would stop
  // it ever firing.
  const isOpen = booking != null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [isOpen]);

  if (!booking) return null;

  const effectiveStatus = getEffectiveStatus(booking);
  // How long the party has been on the table — the question staff actually ask of
  // a seated booking ("bàn này ngồi bao lâu rồi?"), which neither the booked time
  // nor the status chip answers.
  const seatedAt = seatedAtMs(booking);
  const sittingMinutes = seatedAt != null ? Math.max(0, Math.floor((now - seatedAt) / 60_000)) : null;
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
    <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass-card modal-panel flex max-h-[85vh] w-full max-w-sm flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">{t('seating.bookingDetail')}</h3>
          {cfg && (
            <span className="chip text-white" style={{ backgroundColor: cfg.color }}>
              {t(cfg.label)}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="divide-y divide-[var(--line-soft)]">
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
          {/* Only for a guest who is really on the table: the stored status, not the
              effective one, since Overdue is derived and never means "sat down". */}
          {Number(booking.status) === BookingStatus.Seated && seatedAt != null && (
            <>
              <Row
                label={t('seating.seatedAt')}
                value={<span className="text-ok">{formatVnHHmm(seatedAt)}</span>}
              />
              <Row
                label={t('seating.sittingFor')}
                value={
                  <span className="text-ok">{formatDuration(sittingMinutes ?? 0, t)}</span>
                }
              />
            </>
          )}
          {(booking.extraValues ?? [])
            .filter((ev) => ev.fieldValue)
            .map((ev) => {
              const key = String(ev.fieldID);
              const config = configByFieldID.get(key);
              const value =
                config?.fieldType === ExtraFieldType.Option
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

          <PreOrderPanel
            preOrders={preOrders}
            onRelease={onRelease}
            releasing={releasing}
            onCancel={onCancelPreOrders}
            cancelling={cancellingPreOrders}
          />

          {booking.customerNote && (
            <div className="mt-4 rounded-xl border border-line bg-surface p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {t('seating.customerNote')}
              </p>
              <p className="whitespace-pre-line text-sm text-ink">{booking.customerNote}</p>
            </div>
          )}

          {booking.internalNote && (
            <div className="note note-warn mt-3 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-80">
                {t('seating.internalNote')}
              </p>
              <p className="whitespace-pre-line text-sm">{booking.internalNote}</p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="chip-btn btn-secondary mx-auto mt-3 w-32 shrink-0 rounded-lg text-sm font-medium"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
