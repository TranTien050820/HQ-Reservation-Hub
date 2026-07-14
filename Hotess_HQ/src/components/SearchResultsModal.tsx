import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReservationBooking } from '../types';

interface SearchResultsModalProps {
  open: boolean;
  results: ReservationBooking[];
  onSelect: (booking: ReservationBooking) => void;
  onClose: () => void;
}

export function SearchResultsModal({ open, results, onSelect, onClose }: SearchResultsModalProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  if (!open) return null;

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
              key={r.reservationId}
              onClick={() => onSelect(r)}
              className="touch-btn flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-800/50 px-4 py-3 text-left transition hover:border-[#ef4444]/50 hover:bg-slate-700/60"
            >
              <span>
                <span className="block font-medium text-white">{r.bookingName}</span>
                <span className="block text-xs text-slate-400">
                  {r.bookingPhone} · {r.reservationNo} · {r.numOfGuest}p
                </span>
              </span>
              <span className="chip bg-[#ef4444]/20 text-[#f87171]">{r.zoneName}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t('checkin.noResults')}</p>}
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
