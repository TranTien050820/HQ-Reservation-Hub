import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { QrScannerModal } from '../components/QrScannerModal';
import { SearchResultsModal } from '../components/SearchResultsModal';
import { searchBookings } from '../api/bookings';
import { fetchWaitlists } from '../api/waitlists';
import { BookingStatus, WaitlistStatus, type ReservationBooking } from '../types';
import { todayStr } from '../utils/date';

export function CheckinScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { linkInfo } = useStore();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<ReservationBooking[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);

  useEffect(() => {
    if (!linkInfo) return;
    // Status is filtered server-side here — this badge only needs the count of
    // guests still waiting, not the whole day's list.
    fetchWaitlists(linkInfo, { expectedDate: todayStr(), status: WaitlistStatus.Waiting, pageSize: 1 })
      .then((page) => setWaitlistCount(page.totalRecords))
      .catch(() => setWaitlistCount(0));
  }, [linkInfo]);

  const runSearch = useCallback(
    async (raw: string) => {
      if (!linkInfo || !raw.trim()) return;
      setIsSearching(true);
      setSearched(true);
      try {
        const trimmed = raw.trim();
        // The backend only accepts one keyword field per request, so probe
        // ReservationNo and BookingPhone in parallel and merge the results.
        const [byCode, byPhone] = await Promise.all([
          searchBookings({ ...linkInfo, reservationNo: trimmed, reservationDate: todayStr() }),
          searchBookings({ ...linkInfo, bookingPhone: trimmed, reservationDate: todayStr() }),
        ]);
        // Only exclude bookings that can no longer be checked in today.
        const NOT_CHECKINABLE = new Set<number>([
          BookingStatus.Cancel,
          BookingStatus.Seated,
          BookingStatus.NoShow,
          BookingStatus.Close,
        ]);
        const isCheckinable = (b: ReservationBooking) => !NOT_CHECKINABLE.has(Number(b.status));
        const merged = new Map<number, ReservationBooking>();
        for (const b of [...byCode.items, ...byPhone.items]) {
          if (isCheckinable(b)) merged.set(b.globalId, b);
        }
        setResults(Array.from(merged.values()));
      } catch {
        toast.error(t('common.error'));
      } finally {
        setIsSearching(false);
      }
    },
    [linkInfo, t, toast],
  );

  const goSeating = useCallback(
    (booking: ReservationBooking) => {
      navigate('../seating', { state: { booking } });
    },
    [navigate],
  );

  useEffect(() => {
    if (!isSearching && searched && results.length === 1) {
      goSeating(results[0]);
    }
  }, [isSearching, searched, results, goSeating]);

  const handleScan = useCallback(
    (text: string) => {
      setQrOpen(false);
      setQuery(text);
      void runSearch(text);
    },
    [runSearch],
  );

  return (
    <div className="space-y-12">
      <div className="glass-card mx-auto max-w-[600px] p-8 text-center">
        <h1 className="mb-2 text-3xl font-bold text-white">{t('checkin.title')}</h1>
        <p className="mb-8 text-slate-400">{t('checkin.scanDesc')}</p>

        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-1.5 sm:flex-row sm:rounded-full">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && runSearch(query)}
            placeholder={t('checkin.searchPlaceholder')}
            className="min-h-[40px] flex-1 rounded-xl border border-white/10 bg-black/20 px-5 text-white outline-none placeholder:text-slate-500 sm:rounded-full sm:border-none sm:bg-transparent"
          />
          <button
            onClick={() => (query.trim() ? runSearch(query) : setQrOpen(true))}
            className="touch-btn btn-primary shrink-0 rounded-full px-6 font-semibold"
          >
            {query.trim() ? t('checkin.searchButton') : t('checkin.scanQr')}
          </button>
        </div>

        {isSearching && <Spinner label={t('common.loading')} />}

        {!isSearching && searched && results.length === 0 && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-left">
            <p className="font-medium text-amber-200">{t('checkin.noResults')}</p>
            <p className="mt-1 text-sm text-amber-300/80">{t('checkin.noResultsHint')}</p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => navigate('../waitlist')}
                className="touch-btn btn-warning rounded-xl px-4 text-sm font-semibold"
              >
                {t('checkin.addToWaitlist')}
              </button>
              <button
                onClick={() => navigate('../booking')}
                className="touch-btn btn-secondary rounded-xl px-4 text-sm font-semibold"
              >
                {t('checkin.newBooking')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        <button
          onClick={() => navigate('../booking')}
          className="touch-btn glass-card group p-8 text-left transition hover:-translate-y-1 hover:border-[#ef4444]/50"
        >
          <div className="mb-6 text-5xl">📝</div>
          <p className="mb-2 text-xl font-bold text-white">{t('checkin.newBooking')}</p>
          <p className="text-slate-400">{t('checkin.newBookingDesc')}</p>
        </button>
        <button
          onClick={() => navigate('../seating')}
          className="touch-btn glass-card group p-8 text-left transition hover:-translate-y-1 hover:border-[#ef4444]/50"
        >
          <div className="mb-6 text-5xl">📍</div>
          <p className="mb-2 text-xl font-bold text-white">{t('checkin.zoneMap')}</p>
          <p className="text-slate-400">{t('checkin.zoneMapDesc')}</p>
        </button>
        <button
          onClick={() => navigate('../waitlist')}
          className="touch-btn glass-card group relative p-8 text-left transition hover:-translate-y-1 hover:border-[#ef4444]/50"
        >
          <div className="mb-6 text-5xl">🕒</div>
          <p className="mb-2 text-xl font-bold text-white">{t('checkin.waitlist')}</p>
          <p className="text-slate-400">{t('checkin.waitlistDesc')}</p>
          {waitlistCount > 0 && (
            <span className="chip absolute right-6 top-6 bg-[#ffd700] text-black">{waitlistCount}</span>
          )}
        </button>
      </div>

      <QrScannerModal open={qrOpen} onClose={() => setQrOpen(false)} onScan={handleScan} />
      <SearchResultsModal
        open={!isSearching && results.length > 1}
        results={results}
        onSelect={goSeating}
        onClose={() => setResults([])}
      />
    </div>
  );
}
