import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
import { BOOKING_STATUS_CONFIG, BookingStatus, type PreOrder, type ReservationBooking } from '../types';
import { activeSeatTablenums, getEffectiveStatus, pickedTablenumsOfNew } from '../utils/bookingStatus';
import { partyText } from '../utils/charges';
import { PreOrderBadge } from './PreOrderPanel';
import { ArmchairIcon, LayoutIcon } from './icons';

interface SearchResultsModalProps {
  open: boolean;
  results: ReservationBooking[];
  /** Lets the hostess see which of several matches arrives with food already ordered. */
  preOrdersFor?: (reservationNo: string | null | undefined) => PreOrder[];
  onSelect: (booking: ReservationBooking) => void;
  onClose: () => void;
}

export function SearchResultsModal({ open, results, preOrdersFor, onSelect, onClose }: SearchResultsModalProps) {
  const { t } = useTranslation();
  const { linkInfo } = useStore();
  const [filter, setFilter] = useState('');
  if (!open) return null;

  const zoneName = (zoneID?: number | null) => linkInfo?.zones.find((z) => z.zoneID === zoneID)?.zoneName;

  const filtered = results.filter(
    (r) =>
      r.bookingName.toLowerCase().includes(filter.toLowerCase()) ||
      r.bookingPhone.includes(filter),
  );

  return (
    <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-card modal-panel max-h-[80vh] w-full max-w-lg overflow-hidden p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold text-ink">
          {results.length > 1 ? t('checkin.multipleResults') : t('checkin.searchResult')}
        </h3>
        {results.length > 1 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('checkin.filterByNamePhone')}
            className="field chip-btn mb-3 px-4"
          />
        )}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filtered.map((r) => {
            const status = getEffectiveStatus(r);
            const cfg = BOOKING_STATUS_CONFIG[status];
            // Deliberately keyed off the stored status, not the effective one: only a
            // genuinely Seated booking has a table to report.
            const seated = Number(r.status) === BookingStatus.Seated;
            // Where to find them: a retired seat row (`isActive === 0`) is a table they moved off.
            const tablenums = seated ? activeSeatTablenums(r) : [];
            // Tables the guest picked ahead on a booking still waiting for the restaurant (YC2).
            const picked = pickedTablenumsOfNew(r);
            return (
            <button
              key={r.globalId}
              onClick={() => onSelect(r)}
              className="touch-btn flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-brand/50 hover:bg-surface-hover"
            >
              <span>
                <span className="block font-semibold text-ink">{r.bookingName}</span>
                <span className="block text-xs text-muted">
                  {r.bookingPhone} · {r.reservationNo} · {partyText(r, t)}
                </span>
                {picked.length > 0 && (
                  <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-info">
                    <LayoutIcon size={13} className="shrink-0" />
                    {t('checkin.pickedTables', { tables: picked.map((n) => `#${n}`).join(', ') })}
                  </span>
                )}
                {/* Where to find a guest who is already sitting down. Seated with no
                    table means they were seated to the zone only — say that rather
                    than showing nothing, which reads as "no information". */}
                {seated && (
                  <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ok">
                    <ArmchairIcon size={13} className="shrink-0" />
                    {tablenums.length > 0
                      ? t('checkin.seatedAtTables', { tables: tablenums.map((n) => `#${n}`).join(', ') })
                      : t('checkin.seatedNoTable')}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <PreOrderBadge count={preOrdersFor?.(r.reservationNo).length ?? 0} />
                {cfg && (
                  <span className="chip text-white" style={{ backgroundColor: cfg.color }}>
                    {t(cfg.label)}
                  </span>
                )}
                <span className="chip bg-[var(--primary-wash)] text-brand-ink">{zoneName(r.zoneID) ?? '-'}</span>
              </span>
            </button>
            );
          })}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('checkin.noResults')}</p>}
        </div>
        <button
          onClick={onClose}
          className="chip-btn btn-secondary mx-auto mt-3 w-32 rounded-lg text-sm font-medium"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
