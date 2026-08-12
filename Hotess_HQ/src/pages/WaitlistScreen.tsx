import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WaitlistCard } from '../components/WaitlistCard';
import { WaitlistFormModal, type WaitlistFormValues } from '../components/WaitlistFormModal';
import { WaitlistSeatModal } from '../components/WaitlistSeatModal';
import { AlertIcon, ArrowLeftIcon, ChevronRightIcon, ClockIcon, PlusIcon, RefreshIcon, StarIcon } from '../components/icons';
import { createWaitlist, fetchAllWaitlists, updateWaitlist } from '../api/waitlists';
import { fetchReservationNosByStatus, searchBookings } from '../api/bookings';
import { apiErrorMessage } from '../utils/apiError';
import { formatVnDate, todayStr } from '../utils/date';
import { compareQueue, elapsedMinutes, isVip, toTimeSpan } from '../utils/waitlist';
import { BookingStatus, WaitlistStatus, type ReservationWaitlist } from '../types';

type TabKey = 'all' | 'waiting' | 'confirmed' | 'reserved';

const TAB_STATUSES: Record<Exclude<TabKey, 'all'>, number[]> = {
  waiting: [WaitlistStatus.Waiting],
  confirmed: [WaitlistStatus.Confirmed],
  reserved: [WaitlistStatus.Reserved],
};

/**
 * The only waitlist statuses this screen shows. Cancelled(3) and Expired(4) are
 * closed business — they have no tab, so they are dropped outright rather than
 * padding the "all" tab with rows that cannot be filtered to.
 */
const QUEUE_STATUSES: number[] = [WaitlistStatus.Waiting, WaitlistStatus.Confirmed, WaitlistStatus.Reserved];

/**
 * Reserved(2) only means a table is held for the guest — they are still the
 * hostess's problem until something happens to the *booking*, not to the
 * waitlist row: Seated(6) when they sit down, Close(8) when their table is
 * closed out, or the backend's housekeeping closing (9) / releasing (10) it on
 * its own. Any of them and they are done with this screen.
 *
 * Cancel(3)/NoShow(7) are deliberately absent: those transitions move the
 * waitlist row itself, which this screen already filters on.
 */
const LEFT_QUEUE_BOOKING_STATUSES: number[] = [
  BookingStatus.Seated,
  BookingStatus.Close,
  BookingStatus.AutoClose,
  BookingStatus.AutoCancel,
];

/** Rows rendered at once. A thousand cards would stall a tablet long before it helps anyone. */
const PAGE_SIZE = 20;

/** Guests still waiting sort above guests who already have a table. */
const STATUS_GROUP: Record<number, number> = {
  [WaitlistStatus.Waiting]: 0,
  [WaitlistStatus.Confirmed]: 0,
  [WaitlistStatus.Reserved]: 1,
};

/** Wait timers are the whole point of this screen, so they tick without a refetch. */
const TICK_MS = 30_000;

/** Values BookingFormScreen hands over when a zone turns out to be full. */
interface BookingPrefill {
  bookingName?: string;
  bookingPhone?: string;
  zoneID?: string;
  partySize?: number;
  notes?: string;
}

export function WaitlistScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { linkInfo } = useStore();
  const { user } = useAuth();
  const zones = useMemo(() => linkInfo?.zones ?? [], [linkInfo]);

  const [entries, setEntries] = useState<ReservationWaitlist[]>([]);
  /** Set when the page walker stopped short, so the list can say so instead of looking complete. */
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('waiting');
  /** Narrows whichever tab is open to priority guests — a filter, not a fifth tab. */
  const [vipOnly, setVipOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Carried over from "this zone is full → add to waitlist" on the booking form.
  const [prefill, setPrefill] = useState<Partial<WaitlistFormValues> | null>(() => {
    const raw = (location.state as { prefill?: BookingPrefill } | null)?.prefill;
    if (!raw) return null;
    return {
      guestName: raw.bookingName ?? '',
      phoneNumber: raw.bookingPhone ?? '',
      partySize: raw.partySize ?? 2,
      zoneId: raw.zoneID ?? '',
      notes: raw.notes ?? '',
    };
  });
  const [formOpen, setFormOpen] = useState(() => !!(location.state as { prefill?: BookingPrefill } | null)?.prefill);
  const [editEntry, setEditEntry] = useState<ReservationWaitlist | null>(null);
  const [seatEntry, setSeatEntry] = useState<ReservationWaitlist | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationWaitlist | null>(null);
  const [noShowTarget, setNoShowTarget] = useState<ReservationWaitlist | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    if (!linkInfo) return;
    setLoading(true);
    try {
      const date = todayStr();
      // Ask the server for only the three statuses this screen shows, one query
      // each. A busy day's cancelled and expired rows can dwarf the live queue,
      // and there is no point paging through them just to drop them here.
      const statusPages = await Promise.all(
        QUEUE_STATUSES.map((status) => fetchAllWaitlists(linkInfo, { expectedDate: date, status })),
      );
      const rows = statusPages.flatMap((p) => p.items);

      // A waitlist row can't say whether the guest actually sat down — that
      // lives on the linked booking. Only rows that reached Confirmed/Reserved
      // have one, so early in a shift, when everybody is still waiting, this
      // second (and heaviest) query is skipped entirely.
      const settled = rows.some((e) => e.reservationNo)
        ? await fetchReservationNosByStatus(linkInfo, date, LEFT_QUEUE_BOOKING_STATUSES)
        : { reservationNos: new Set<string>(), truncated: false };

      // Filtering happens here rather than per-tab so every tab counter and
      // stat downstream is automatically about people still in the queue.
      setEntries(rows.filter((e) => !e.reservationNo || !settled.reservationNos.has(String(e.reservationNo))));
      setTruncated(statusPages.some((p) => p.truncated) || settled.truncated);
      setNow(Date.now());
    } catch (err) {
      toast.error(apiErrorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [linkInfo, toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  /** Every status transition is a PUT — the backend does the booking/slot side effects itself. */
  const transition = async (entry: ReservationWaitlist, status: number, successKey: string) => {
    if (!linkInfo) return;
    setBusyId(entry.globalId);
    try {
      await updateWaitlist({
        globalId: entry.globalId,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        status,
        channelID: linkInfo.channelId,
        userModified: user?.userId,
      });
      toast.success(t(successKey, { name: entry.guestName }));
      await load();
    } catch (err) {
      // These PUTs fail for concrete reasons (a required field the DTO lets through as
      // null, an entry someone else already moved) — show the backend's own words.
      toast.error(apiErrorMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmitForm = async (values: WaitlistFormValues) => {
    if (!linkInfo) return;
    setSubmitting(true);
    try {
      const common = {
        guestName: values.guestName.trim(),
        phoneNumber: values.phoneNumber.trim(),
        email: values.email.trim() || undefined,
        partySize: Number(values.partySize),
        expectedDate: values.expectedDate,
        // Without a time the backend books the guest at 00:00 and can't resolve
        // the period, so this is always sent.
        expectedTime: toTimeSpan(values.expectedTime),
        zoneId: values.zoneId ? Number(values.zoneId) : undefined,
        priority: values.priority ? 1 : 0,
        notes: values.notes.trim() || undefined,
      };
      if (editEntry) {
        await updateWaitlist({
          globalId: editEntry.globalId,
          siteId: linkInfo.siteId,
          sNum: linkInfo.sNum,
          statNum: linkInfo.statNum,
          userModified: user?.userId,
          ...common,
        });
        toast.success(t('common.save'));
      } else {
        await createWaitlist({
          siteId: linkInfo.siteId,
          sNum: linkInfo.sNum,
          statNum: linkInfo.statNum,
          userCreated: user?.userId,
          ...common,
        });
        toast.success(t('waitlist.success'));
      }
      setFormOpen(false);
      setEditEntry(null);
      setPrefill(null);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t(editEntry ? 'common.error' : 'waitlist.error')));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Reserved entries hold a table but nobody has marked the guest as seated
   * yet — that is done on the seating screen, and it is what takes them off
   * this list. Looked up on demand by reservationNo rather than by keeping the
   * day's bookings in memory, which would not scale with the guest count.
   */
  const openBooking = async (entry: ReservationWaitlist) => {
    if (!linkInfo || !entry.reservationNo) return;
    setBusyId(entry.globalId);
    try {
      const result = await searchBookings({
        ...linkInfo,
        reservationNo: entry.reservationNo,
        reservationDate: entry.expectedDate.slice(0, 10),
        pageSize: 1,
      });
      const booking = result.items[0];
      if (!booking) {
        toast.error(t('common.notFound'));
        return;
      }
      navigate('../seating', { state: { booking } });
    } catch (err) {
      toast.error(apiErrorMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const by = (statuses: number[]) => entries.filter((e) => statuses.includes(e.status)).length;
    return {
      all: entries.length,
      waiting: by(TAB_STATUSES.waiting),
      confirmed: by(TAB_STATUSES.confirmed),
      reserved: by(TAB_STATUSES.reserved),
    };
  }, [entries]);

  const inTab = useCallback(
    (e: ReservationWaitlist) => (tab === 'all' ? true : TAB_STATUSES[tab].includes(e.status)),
    [tab],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries
      .filter(inTab)
      .filter((e) => !vipOnly || isVip(e))
      .filter(
        (e) =>
          !term ||
          e.guestName?.toLowerCase().includes(term) ||
          e.phoneNumber?.includes(term) ||
          e.waitlistNo?.toLowerCase().includes(term),
      )
      .sort((a, b) => (STATUS_GROUP[a.status] ?? 3) - (STATUS_GROUP[b.status] ?? 3) || compareQueue(a, b));
  }, [entries, inTab, vipOnly, search]);

  /** VIPs under the current tab — what the filter would leave, so the chip never promises rows it can't show. */
  const vipInTab = useMemo(() => entries.filter((e) => inTab(e) && isVip(e)).length, [entries, inTab]);

  // Changing what you're looking at should start you at the top of it.
  useEffect(() => {
    setPage(1);
  }, [tab, search, vipOnly]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // A refresh can shrink the list under the current page — clamp on read rather
  // than in an effect, so there's never a frame showing an empty page.
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(pageStart, pageStart + PAGE_SIZE);

  /**
   * Steps by `delta`, clamped. Must be a functional update: React batches the
   * taps in one render, so reading `currentPage` from this closure would make
   * three quick taps on a tablet advance a single page.
   */
  const stepPage = (delta: number) =>
    setPage((prev) => {
      const from = Math.min(Math.max(prev, 1), totalPages);
      return Math.min(Math.max(from + delta, 1), totalPages);
    });

  /** 1-based place in line, VIPs first — computed over the whole queue, not the filtered view. */
  const queuePositions = useMemo(() => {
    const map = new Map<number, number>();
    entries
      .filter((e) => e.status === WaitlistStatus.Waiting)
      .sort(compareQueue)
      .forEach((e, i) => map.set(e.globalId, i + 1));
    return map;
  }, [entries]);

  const stats = useMemo(() => {
    const waiting = entries.filter((e) => e.status === WaitlistStatus.Waiting);
    const waits = waiting.map((e) => elapsedMinutes(e.dateCreated, now));
    return {
      waiting: waiting.length,
      avg: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
      longest: waits.length ? Math.max(...waits) : 0,
      vip: waiting.filter((e) => (e.priority ?? 0) > 0).length,
      confirmed: counts.confirmed,
    };
  }, [entries, now, counts.confirmed]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'waiting', label: t('waitlist.tabWaiting'), count: counts.waiting },
    { key: 'confirmed', label: t('waitlist.tabConfirmed'), count: counts.confirmed },
    { key: 'reserved', label: t('waitlist.tabReserved'), count: counts.reserved },
    { key: 'all', label: t('waitlist.tabAll'), count: counts.all },
  ];

  const statTiles = [
    { label: t('waitlist.waitingCount'), value: String(stats.waiting), tone: 'text-ink' },
    { label: t('waitlist.avgWait'), value: `${stats.avg} ${t('waitlist.minutes')}`, tone: 'text-ink' },
    { label: t('waitlist.longestWait'), value: `${stats.longest} ${t('waitlist.minutes')}`, tone: stats.longest > 20 ? 'text-bad' : 'text-ink' },
    { label: t('waitlist.vipWaiting'), value: String(stats.vip), tone: stats.vip > 0 ? 'text-gold' : 'text-ink' },
    { label: t('waitlist.tabConfirmed'), value: String(stats.confirmed), tone: 'text-info' },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate('../checkin')}
          aria-label={t('common.back')}
          className="chip-btn btn-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <ArrowLeftIcon size={17} />
        </button>
        <h1 className="text-lg font-bold text-ink">{t('waitlist.title')}</h1>
        <span className="text-xs text-muted">{formatVnDate(i18n.language === 'vi' ? 'vi-VN' : 'en-US')}</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={load}
            aria-label={t('common.retry')}
            className="chip-btn btn-secondary flex h-9 w-9 items-center justify-center rounded-full"
          >
            <RefreshIcon size={17} />
          </button>
          <button
            onClick={() => {
              setEditEntry(null);
              setPrefill(null);
              setFormOpen(true);
            }}
            className="chip-btn btn-primary flex items-center gap-1.5 rounded-full px-5 text-sm font-semibold"
          >
            <PlusIcon size={16} />
            {t('waitlist.addGuest')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {statTiles.map((s) => (
          <div key={s.label} className="stat-tile text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted">{s.label}</p>
            <p className={`text-base font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('waitlist.searchPlaceholder')}
          className="field chip-btn mb-2 px-4"
        />

        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`chip-btn flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ${
                tab === tb.key ? 'pill-on' : 'pill'
              }`}
            >
              {tb.label}
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                  tab === tb.key ? 'bg-white/25' : 'bg-[var(--surface-hover)]'
                }`}
              >
                {tb.count}
              </span>
            </button>
          ))}
          {/* Sits with the tabs but toggles independently: it narrows whichever
              tab is open rather than replacing the status the hostess picked. */}
          <button
            onClick={() => setVipOnly((v) => !v)}
            aria-pressed={vipOnly}
            className={`chip-btn ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ${
              vipOnly
                ? 'bg-[var(--gold)] text-[var(--gold-fg)] shadow-[0_4px_14px_rgba(234,179,8,0.3)]'
                : 'pill text-gold'
            }`}
          >
            <StarIcon size={14} />
            {t('waitlist.vipOnly')}
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                vipOnly ? 'bg-black/15' : 'bg-[var(--surface-hover)]'
              }`}
            >
              {vipInTab}
            </span>
          </button>
        </div>

        {truncated && (
          <p className="note note-warn mb-2 flex items-start gap-1.5">
            <AlertIcon size={14} className="mt-px shrink-0" />
            {t('waitlist.truncated')}
          </p>
        )}

        {loading ? (
          <Spinner label={t('common.loading')} />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <span className="icon-tile h-12 w-12">
              <ClockIcon size={22} />
            </span>
            <p className="text-sm text-muted">{t('waitlist.empty')}</p>
            <button
              onClick={() => {
                setEditEntry(null);
                setPrefill(null);
                setFormOpen(true);
              }}
              className="chip-btn btn-secondary flex items-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
            >
              <PlusIcon size={15} />
              {t('waitlist.addGuest')}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {pageItems.map((entry) => (
                <WaitlistCard
                  key={entry.globalId}
                  entry={entry}
                  queuePosition={queuePositions.get(entry.globalId)}
                  now={now}
                  busy={busyId === entry.globalId}
                  onConfirm={(e) => transition(e, WaitlistStatus.Confirmed, 'waitlist.confirmed')}
                  onSeat={setSeatEntry}
                  onEdit={(e) => {
                    setEditEntry(e);
                    setPrefill(null);
                    setFormOpen(true);
                  }}
                  onNoShow={setNoShowTarget}
                  onCancel={setCancelTarget}
                  onOpenBooking={openBooking}
                />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {t('waitlist.pageRange', {
                  from: pageStart + 1,
                  to: pageStart + pageItems.length,
                  total: visible.length,
                })}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => stepPage(-1)}
                    disabled={currentPage <= 1}
                    aria-label={t('waitlist.prevPage')}
                    className="chip-btn btn-secondary flex items-center rounded-lg px-4 text-sm font-medium"
                  >
                    <ChevronRightIcon size={16} className="rotate-180" />
                  </button>
                  <span className="text-xs text-muted">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => stepPage(1)}
                    disabled={currentPage >= totalPages}
                    aria-label={t('waitlist.nextPage')}
                    className="chip-btn btn-secondary flex items-center rounded-lg px-4 text-sm font-medium"
                  >
                    <ChevronRightIcon size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <WaitlistFormModal
        open={formOpen}
        entry={editEntry}
        prefill={prefill}
        zones={zones}
        submitting={submitting}
        onClose={() => {
          setFormOpen(false);
          setEditEntry(null);
        }}
        onSubmit={handleSubmitForm}
      />

      {seatEntry && (
        <WaitlistSeatModal
          entry={seatEntry}
          onClose={() => setSeatEntry(null)}
          onSeated={(tablenums) => {
            toast.success(t('waitlist.seated', { tables: tablenums.map((n) => `#${n}`).join(' + ') }));
            setSeatEntry(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!noShowTarget}
        title={t('waitlist.confirmNoShow')}
        message={t('waitlist.confirmNoShowMsg')}
        confirmLabel={t('waitlist.noShow')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          const target = noShowTarget;
          setNoShowTarget(null);
          if (target) transition(target, WaitlistStatus.Expired, 'waitlist.markedNoShow');
        }}
        onCancel={() => setNoShowTarget(null)}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title={t('waitlist.confirmCancel')}
        message={t('waitlist.confirmCancelMsg')}
        confirmLabel={t('waitlist.cancel')}
        cancelLabel={t('common.close')}
        danger
        onConfirm={() => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (target) transition(target, WaitlistStatus.Cancelled, 'waitlist.cancelled');
        }}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
