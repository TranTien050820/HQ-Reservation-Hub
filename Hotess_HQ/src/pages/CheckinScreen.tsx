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
import { lookupBookingsAnyDate, searchBookings } from '../api/bookings';
import { fetchAvailableSlots } from '../api/availableSlots';
import { fetchWaitlists } from '../api/waitlists';
import { usePreOrders } from '../hooks/usePreOrders';
import { BookingStatus, WaitlistStatus, type ReservationBooking } from '../types';
import { apiErrorMessage } from '../utils/apiError';
import { formatVnDate, todayStr, vnEpochMs } from '../utils/date';
import { isTerminalBooking } from '../utils/bookingStatus';
import { normalizeScan } from '../utils/scan';

/** How many near-miss bookings the empty-result panel lists before it just gives a count. */
const MISS_ROWS = 3;

/**
 * Nearest to today first.
 *
 * A guest standing at the door with the wrong day is out by a day or two, essentially never
 * by a year — so the booking that explains their slip is the one closest to today, not the
 * one the backend happened to return first.
 */
function byClosenessToToday(a: ReservationBooking, b: ReservationBooking): number {
  const today = vnEpochMs(todayStr()) ?? 0;
  const distance = (booking: ReservationBooking) =>
    Math.abs((vnEpochMs(booking.reservationDate) ?? 0) - today);
  return distance(a) - distance(b);
}

/** The four numbers a hostess is asked for at the door, before anyone searches anything. */
interface DoorStats {
  freeTables: number | null;
  waiting: number | null;
  bookingsToday: number | null;
  seated: number | null;
}

export function CheckinScreen() {
  const { t, i18n } = useTranslation();
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
  /**
   * What was actually searched for, and what it was extracted from.
   *
   * A lookup that finds nothing is the one moment the hostess has to compare the app against
   * the paper in the guest's hand, and she cannot do that against a search box showing a code
   * the app derived rather than the string the QR carried.
   */
  const [lastSearch, setLastSearch] = useState<{ raw: string; code: string } | null>(null);
  /**
   * Bookings that DO match what was searched, just not as something today's list can show —
   * booked for another date, or already cancelled/closed.
   *
   * Only ever filled when the normal search found nothing. It exists because the backend ANDs
   * its filters: a real code on the guest's slip disappears behind `ReservationDate=today` and
   * comes back as "không tìm thấy đặt chỗ", which is the one answer that is actively wrong.
   */
  const [missMatches, setMissMatches] = useState<ReservationBooking[]>([]);
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
        const entered = raw.trim();
        // Booking channels encode either a bare code or the whole booking link, and a guest
        // just as often forwards that link for the hostess to paste. One rule covers both:
        // pull the code out of a URL, leave anything else exactly as typed.
        const trimmed = normalizeScan(entered);
        setLastSearch({ raw: entered, code: trimmed });
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
        const found = Array.from(merged.values());
        setResults(found);

        // Nothing for today does not mean nothing exists. Look again without the date, and
        // let the panel below say which it is — wrong day, or a booking already called off.
        // Deliberately inside the same `isSearching` window, so the spinner covers it.
        setMissMatches(found.length > 0 ? [] : (await lookupBookingsAnyDate(linkInfo, trimmed)).sort(byClosenessToToday));
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
      // The box shows what the camera read, warts and all — `runSearch` is what turns a
      // booking link into a code, and it records both so a miss can show them.
      setQuery(text.trim());
      void runSearch(text);
    },
    [runSearch],
  );

  const hasQuery = query.trim().length > 0;

  /** "18/09/2026 · 17:00", or just the date for a booking that never got a time. */
  const whenOf = (booking: ReservationBooking) => {
    const date = formatVnDate(i18n.language, vnEpochMs(booking.reservationDate) ?? 0);
    const time = booking.reservationTime?.slice(0, 5);
    return time ? `${date} · ${time}` : date;
  };

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
            onChange={(e) => {
              setQuery(e.target.value);
              setLastSearch(null);
              setMissMatches([]);
            }}
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
            {/* The code that was actually searched, and — when the QR held a URL — the
                string it came out of. Both, because the hostess is checking the app
                against a printed slip and only one of the two is on that slip. */}
            {lastSearch && (
              <div className="mt-2 pl-6 text-xs">
                <p className="text-muted">
                  {t('checkin.scannedCode')}{' '}
                  <span className="font-mono font-semibold text-ink">{lastSearch.code}</span>
                </p>
                {lastSearch.raw !== lastSearch.code && (
                  <p className="mt-0.5 break-all text-faint">
                    {t('checkin.scannedRaw')} <span className="font-mono">{lastSearch.raw}</span>
                  </p>
                )}
              </div>
            )}
            {/* The code IS real — it just isn't a booking for today. Naming the actual reason
                is the difference between "phiếu của anh ghi ngày 18/08" and sending the guest
                away. Read-only on purpose: seating from here would write a seat hold stamped
                with that other date. */}
            {missMatches.length > 0 && (
              <div className="mt-3 border-t border-current/15 pt-2.5 pl-6">
                <p className="text-xs font-semibold">{t('checkin.missTitle')}</p>
                <div className="mt-1.5 space-y-1.5">
                  {missMatches.slice(0, MISS_ROWS).map((b) => (
                    <div key={b.globalId} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink">
                        {b.bookingName}
                        <span className="text-xs font-normal text-muted">
                          {b.bookingPhone} · {b.partySize}p
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-mono">{b.reservationNo}</span> ·{' '}
                        {/* "Đã huỷ" wins over "ngày khác": a cancelled booking dated last week
                            is not a guest who came on the wrong day, and showing only the date
                            invites the hostess to seat them anyway. */}
                        {isTerminalBooking(b.status)
                          ? t('checkin.missClosed', { when: whenOf(b) })
                          : t('checkin.missOtherDate', { when: whenOf(b) })}
                      </p>
                    </div>
                  ))}
                </div>
                {missMatches.length > MISS_ROWS && (
                  <p className="mt-1.5 text-xs opacity-80">
                    {t('checkin.missMore', { count: missMatches.length - MISS_ROWS })}
                  </p>
                )}
              </div>
            )}
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
