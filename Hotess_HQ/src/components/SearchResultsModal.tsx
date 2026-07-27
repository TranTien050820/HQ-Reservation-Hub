import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
import type { ReservationBooking } from '../types';

interface SearchResultsModalProps {
  open: boolean;
  results: ReservationBooking[];
  onSelect: (booking: ReservationBooking) => void;
  onClose: () => void;
}

export function SearchResultsModal({ open, results, onSelect, onClose }: SearchResultsModalProps) {
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
    <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass-card modal-panel max-h-[80vh] w-full max-w-lg overflow-hidden p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold text-white">{t('checkin.multipleResults')}</h3>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('checkin.filterByNamePhone')}
          className="field touch-btn mb-4 px-4"
        />
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filtered.map((r) => (
            <button
              key={r.globalId}
              onClick={() => onSelect(r)}
              className="touch-btn flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-left transition hover:border-[#ef4444]/50 hover:bg-slate-700/60"
            >
              <span>
                <span className="block font-medium text-white">{r.bookingName}</span>
                <span className="block text-xs text-slate-400">
                  {r.bookingPhone} · {r.reservationNo} · {r.partySize}p
                </span>
              </span>
              <span className="chip bg-[#ef4444]/20 text-[#f87171]">{zoneName(r.zoneID) ?? '-'}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t('checkin.noResults')}</p>}
        </div>
        <button
          onClick={onClose}
          className="chip-btn btn-secondary mx-auto mt-4 w-32 rounded-xl text-sm font-medium"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
