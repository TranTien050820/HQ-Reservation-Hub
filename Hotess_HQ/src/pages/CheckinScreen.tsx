import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { QrScannerModal } from '../components/QrScannerModal';
import { SearchResultsModal } from '../components/SearchResultsModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  AlertIcon,
  ArmchairIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  ClockIcon,
  LayoutIcon,
  ScanIcon,
  SearchIcon,
  UsersIcon,
} from '../components/icons';
import { searchBookings } from '../api/bookings';
import { fetchAvailableSlots } from '../api/availableSlots';
import { fetchWaitlists } from '../api/waitlists';
import { usePreOrders } from '../hooks/usePreOrders';
import { BookingStatus, WaitlistStatus, type ReservationBooking } from '../types';
import { apiErrorMessage } from '../utils/apiError';
import { todayStr } from '../utils/date';
import { isTerminalBooking } from '../utils/bookingStatus';

/** The four numbers a hostess is asked for at the door, before anyone searches anything. */
interface DoorStats {
  freeTables: number | null;
  waiting: number | null;
  bookingsToday: number | null;
  seated: number | null;
}

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
  const [stats, setStats] = useState<DoorStats>({
    freeTables: null,
    waiting: null,
    bookingsToday: null,
    seated: null,
  });
  /** Booking still in New(1) that the hostess has been asked to confirm seating for. */
  const [unconfirmed, setUnconfirmed] = useState<ReservationBooking | null>(null);
  const { preOrdersFor } = usePreOrders(linkInfo);

  /**
   * The door summary. Every number is counted server-side (`pageSize: 1`, read
   * `totalRecords`) so this stays four small calls however busy the day is, and
   * each one settles independently — a store with no OrderHub/slot data still
   * gets the counts that did come back rather than an empty strip.
   */
  useEffect(() => {
    if (!linkInfo) return;
    let cancelled = false;
    const set = (patch: Partial<DoorStats>) => {
      if (!cancelled) setStats((prev) => ({ ...prev, ...patch }));
    };
    const date = todayStr();

    fetchAvailableSlots(linkInfo, date)
      .then((slots) => set({ freeTables: slots.reduce((sum, s) => sum + (s.numberOfUnused ?? 0), 0) }))
      .catch(() => set({ freeTables: null }));

    fetchWaitlists(linkInfo, { expectedDate: date, status: WaitlistStatus.Waiting, pageSize: 1 })
      .then((page) => set({ waiting: page.totalRecords }))
      .catch(() => set({ waiting: null }));

    searchBookings({ ...linkInfo, reservationDate: date, pageSize: 1 })
      .then((page) => set({ bookingsToday: page.totalRecords }))
      .catch(() => set({ bookingsToday: null }));

    searchBookings({ ...linkInfo, reservationDate: date, status: BookingStatus.Seated, pageSize: 1 })
      .then((page) => set({ seated: page.totalRecords }))
      .catch(() => set({ seated: null }));

    return () => {
      cancelled = true;
    };
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
        // Only drop bookings this guest can no longer arrive on. Seated stays in on
        // purpose: the guest is here, in the room, and the question the search is
        // really being asked is "which table are they on?" — dropping the row answers
        // that with "không tìm thấy đặt chỗ", which sends the hostess hunting.
        const merged = new Map<number, ReservationBooking>();
        for (const b of [...byCode.items, ...byPhone.items]) {
          if (!isTerminalBooking(b.status)) merged.set(b.globalId, b);
        }
        setResults(Array.from(merged.values()));
      } catch (err) {
        toast.error(apiErrorMessage(err, t('common.error')));
      } finally {
        setIsSearching(false);
      }
    },
    [linkInfo, t, toast],
  );

  const openSeating = useCallback(
    (booking: ReservationBooking) => {
      navigate('../seating', { state: { booking } });
    },
    [navigate],
  );

  /**
   * New(1) means the store never confirmed this reservation — it may be a duplicate,
   * an unpaid deposit, or a slot nobody ever agreed to hold. Seating is still the
   * hostess's call (the guest is standing at the door), so this asks rather than
   * refuses; it just must not happen by accident.
   */
  const goSeating = useCallback(
    (booking: ReservationBooking) => {
      if (Number(booking.status) === BookingStatus.New) {
        setUnconfirmed(booking);
        return;
      }
      openSeating(booking);
    },
    [openSeating],
  );

  useEffect(() => {
    if (isSearching || !searched || results.length !== 1) return;
    // An already-seated guest isn't being checked in, so jumping straight to the
    // floor plan would hide the very thing that was looked up. Let the result card
    // show which table they are on instead.
    if (Number(results[0].status) === BookingStatus.Seated) return;
    goSeating(results[0]);
  }, [isSearching, searched, results, goSeating]);

  // One seated match still opens the card (see above); one checkinable match has
  // already navigated away by now.
  const resultsOpen =
    !isSearching && (results.length > 1 || (results.length === 1 && Number(results[0].status) === BookingStatus.Seated));

  const handleScan = useCallback(
    (text: string) => {
      setQrOpen(false);
      setQuery(text);
      void runSearch(text);
    },
    [runSearch],
  );

  const hasQuery = query.trim().length > 0;

  const statCards: {
    key: string;
    label: string;
    value: number | null;
    Icon: ComponentType<{ size?: number }>;
    tone: string;
  }[] = [
    { key: 'free', label: t('checkin.statFreeTables'), value: stats.freeTables, Icon: ArmchairIcon, tone: 'text-ok' },
    { key: 'waiting', label: t('checkin.statWaiting'), value: stats.waiting, Icon: ClockIcon, tone: 'text-warn' },
    { key: 'today', label: t('checkin.statBookingsToday'), value: stats.bookingsToday, Icon: CalendarPlusIcon, tone: 'text-info' },
    { key: 'seated', label: t('checkin.statSeated'), value: stats.seated, Icon: UsersIcon, tone: 'text-brand-ink' },
  ];

  const shortcuts: {
    to: string;
    Icon: ComponentType<{ size?: number }>;
    title: string;
    desc: string;
    badge: number | null;
  }[] = [
    { to: '../booking', Icon: CalendarPlusIcon, title: t('checkin.newBooking'), desc: t('checkin.newBookingDesc'), badge: null },
    { to: '../seating', Icon: LayoutIcon, title: t('checkin.zoneMap'), desc: t('checkin.zoneMapDesc'), badge: null },
    { to: '../waitlist', Icon: ClockIcon, title: t('checkin.waitlist'), desc: t('checkin.waitlistDesc'), badge: stats.waiting },
  ];

  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-4 py-2 sm:gap-5">
      <section className="glass-card mx-auto w-full max-w-[980px] px-5 py-7 text-center sm:px-10 sm:py-9">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{t('checkin.title')}</h1>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-muted sm:text-[15px]">{t('checkin.scanDesc')}</p>

        <div className="search-shell mx-auto mt-5 max-w-[620px]">
          <SearchIcon size={20} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && hasQuery && runSearch(query)}
            placeholder={t('checkin.searchPlaceholder')}
            aria-label={t('checkin.searchPlaceholder')}
          />
          <button
            onClick={() => (hasQuery ? runSearch(query) : setQrOpen(true))}
            className="touch-btn btn-primary flex shrink-0 items-center gap-2 rounded-full px-5 font-semibold"
          >
            {hasQuery ? <SearchIcon size={18} /> : <ScanIcon size={18} />}
            <span className="hidden sm:inline">{hasQuery ? t('checkin.searchButton') : t('checkin.scanQr')}</span>
          </button>
        </div>

        {isSearching && <Spinner label={t('common.loading')} />}

        {!isSearching && searched && results.length === 0 && (
          <div className="note note-warn mx-auto mt-4 max-w-[620px] p-3.5 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertIcon size={16} className="shrink-0" />
              {t('checkin.noResults')}
            </p>
            <p className="mt-1 pl-6 opacity-85">{t('checkin.noResultsHint')}</p>
            <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
              <button
                onClick={() => navigate('../waitlist')}
                className="chip-btn btn-warning rounded-lg px-3.5 text-xs font-semibold"
              >
                {t('checkin.addToWaitlist')}
              </button>
              <button
                onClick={() => navigate('../booking')}
                className="chip-btn btn-secondary rounded-lg px-3.5 text-xs font-semibold"
              >
                {t('checkin.newBooking')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* The room, at a glance. This is the space the first redesign left blank —
          filling it with the counts the hostess is asked for beats padding. */}
      <div className="mx-auto grid w-full max-w-[980px] grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map(({ key, label, value, Icon, tone }) => (
          <div key={key} className="stat-card">
            <span className={`icon-tile h-10 w-10 ${tone}`}>
              <Icon size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-none text-ink tabular-nums">
                {value == null ? '—' : value}
              </p>
              <p className="mt-1 truncate text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Three across only once there is room for the descriptions to sit on two
          lines — at tablet-portrait width a 3-up row squeezed them into four. */}
      <div className="mx-auto grid w-full max-w-[980px] gap-3 lg:grid-cols-3">
        {shortcuts.map(({ to, Icon, title, desc, badge }) => (
          <button key={to} onClick={() => navigate(to)} className="action-card touch-btn p-4 sm:p-5">
            <span className="icon-tile h-12 w-12">
              <Icon size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">{title}</span>
                {badge != null && badge > 0 && (
                  <span className="chip bg-[var(--gold)] text-[var(--gold-fg)]">{badge}</span>
                )}
              </span>
              {/* No truncation: a shortcut whose description ends in "…" tells
                  the hostess nothing she didn't already get from the title. */}
              <span className="mt-1 block text-[13px] leading-snug text-muted">{desc}</span>
            </span>
            <ChevronRightIcon size={18} className="mt-1 shrink-0 text-faint" />
          </button>
        ))}
      </div>

      <QrScannerModal open={qrOpen} onClose={() => setQrOpen(false)} onScan={handleScan} />
      <SearchResultsModal
        open={resultsOpen}
        results={results}
        preOrdersFor={preOrdersFor}
        onSelect={goSeating}
        onClose={() => {
          // Also clear `searched`: leaving it set would drop the hostess onto the
          // "Không tìm thấy đặt chỗ" panel right after she closed a card that did
          // find her guest.
          setResults([]);
          setSearched(false);
        }}
      />
      <ConfirmDialog
        open={!!unconfirmed}
        title={t('checkin.notConfirmedTitle')}
        message={t('checkin.notConfirmedMsg', {
          name: unconfirmed?.bookingName ?? '',
          code: unconfirmed?.reservationNo ?? '',
        })}
        confirmLabel={t('common.yes')}
        cancelLabel={t('common.no')}
        onConfirm={() => {
          const booking = unconfirmed;
          setUnconfirmed(null);
          if (booking) openSeating(booking);
        }}
        onCancel={() => setUnconfirmed(null)}
      />
    </div>
  );
}
