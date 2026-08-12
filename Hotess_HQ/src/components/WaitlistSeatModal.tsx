import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from './ToastProvider';
import { Spinner } from './Spinner';
import { TableGrid } from './TableGrid';
import { TableLegend } from './TableLegend';
import { BookingDetailModal } from './BookingDetailModal';
import { PeriodTimePicker } from './PeriodTimePicker';
import { AlertIcon, ArrowLeftIcon, StarIcon } from './icons';
import { searchBookings } from '../api/bookings';
import { fetchAllPages } from '../api/paginate';
import { updateWaitlist } from '../api/waitlists';
import { usePosOpenTables } from '../hooks/usePosOpenTables';
import { apiErrorMessage } from '../utils/apiError';
import { buildTableOccupancy, isTableBlocked, isTableReservable } from '../utils/tableOccupancy';
import { isExcessCapacity, suggestTables } from '../utils/tableSuggestion';
import { computeSeatWindow, isBeyondCurrentUse, toMinutes } from '../utils/timeWindow';
import { formatHHmm, nowHHmm, toTimeSpan } from '../utils/waitlist';
import { todayStr } from '../utils/date';
import { WaitlistStatus, type ReservationBooking, type ReservationWaitlist, type TableSetup } from '../types';

interface WaitlistSeatModalProps {
  entry: ReservationWaitlist;
  onClose: () => void;
  /** Fired after the backend has created/updated the booking and its seat rows. */
  onSeated: (tablenums: number[]) => void;
}

/**
 * Waiting(0)/Confirmed(1) -> Reserved(2). The backend owns the whole
 * transition: it creates (or upgrades) the ReservationBookings row and inserts
 * the seat rows itself, so this never calls the bookings API to write.
 *
 * Zones, sections, zone↔section links and table setups all come from the store
 * link info that is already loaded — the only read this makes is the day's
 * bookings, which is what tells us who is sitting where.
 */
export function WaitlistSeatModal({ entry, onClose, onSeated }: WaitlistSeatModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { linkInfo } = useStore();
  const { user } = useAuth();

  const zones = useMemo(() => linkInfo?.zones ?? [], [linkInfo]);
  const allTables = useMemo(() => linkInfo?.tableSetups ?? [], [linkInfo]);
  const sections = useMemo(() => linkInfo?.sections ?? [], [linkInfo]);
  const zoneSectionLinks = useMemo(() => linkInfo?.zoneSectionLinks ?? [], [linkInfo]);

  const date = entry.expectedDate.slice(0, 10);
  const partySize = entry.partySize ?? 1;

  const [zoneID, setZoneID] = useState<number | null>(entry.zoneId ?? null);
  // Seating happens now. A guest expected at 11:30 but only seated at 14:00
  // would otherwise get a hold of 11:30–13:30, a window that is already over.
  const [startTime, setStartTime] = useState(() => {
    const wanted = entry.expectedTime?.slice(0, 5) || nowHHmm();
    if (date !== todayStr()) return wanted;
    const now = nowHHmm();
    return wanted < now ? now : wanted;
  });
  const [selectedTablenums, setSelectedTablenums] = useState<Set<number>>(new Set());
  /** Off by default: one table per guest, so a tap replaces the previous pick instead of stacking tables up. */
  const [mergeMode, setMergeMode] = useState(false);
  const [bookings, setBookings] = useState<ReservationBooking[]>([]);
  const [detailBooking, setDetailBooking] = useState<ReservationBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  /** Table to bring into view after a suggestion is applied. */
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  // A waitlist guest has no prior hold, so every table the POS has a check open
  // on is off limits — those tables already have people on them.
  const { posOpenTablenums, posOpenFailed, reloadPosOpenTables } = usePosOpenTables(linkInfo);

  useEffect(() => {
    if (!linkInfo) return;
    let cancelled = false;
    setLoading(true);
    // Every page, not one big one: a booking past the page ceiling would leave
    // its table showing as free and get the guest double-seated.
    fetchAllPages((pageIndex, pageSize) => searchBookings({ ...linkInfo, reservationDate: date, pageIndex, pageSize }))
      .then((page) => {
        if (!cancelled) setBookings(page.items);
      })
      .catch((err) => {
        if (!cancelled) toast.error(apiErrorMessage(err, t('common.error')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkInfo, date, toast, t]);

  // Runs after the grid has committed the new selection. Deliberately an effect
  // rather than requestAnimationFrame, and an instant jump rather than a smooth
  // one: both frame callbacks and smooth scrolling depend on the compositor and
  // silently do nothing when it is stalled. The chip and the summary bar
  // already state what was picked, so the grid only has to catch up.
  useEffect(() => {
    if (scrollTarget == null) return;
    document.getElementById(`seat-table-${scrollTarget}`)?.scrollIntoView({ block: 'center' });
    setScrollTarget(null);
  }, [scrollTarget]);

  const zone = useMemo(() => zones.find((z) => z.zoneID === zoneID), [zones, zoneID]);

  // The hold length is the zone's configured duration when it opts into one,
  // otherwise computeSeatWindow's default — same rule the seating screen uses.
  const { reserStartTime, reserEndTime } = useMemo(
    () => computeSeatWindow(startTime, zone?.isUseDurationMinutes ? zone.durationMinutes : undefined),
    [startTime, zone],
  );

  const tables = useMemo(() => {
    if (zoneID == null) return [];
    const secNums = new Set(zoneSectionLinks.filter((l) => l.zoneID === zoneID).map((l) => l.secNum));
    return allTables.filter((tb) => secNums.has(tb.secnum));
  }, [allTables, zoneSectionLinks, zoneID]);

  // Conflicts are judged against the window we're about to book, not against
  // "now" — a guest expected at 19:00 must not be blocked by a lunch hold.
  // This action holds the table in advance (status -> Reserved), it doesn't walk
  // anyone onto it, so a slot hours ahead (e.g. 21:00 picked at 14:00) may take a
  // table that is busy right now — POS check open or a party mid-meal — because
  // they'll be gone by then. A table *booked* for 21:00 is still off limits, and
  // holding for the next few hours still respects who's on the table now.
  const ignoreCurrentUse = useMemo(() => isBeyondCurrentUse(date, startTime), [date, startTime]);

  const tableInfo = useMemo(() => {
    const startMinutes = toMinutes(reserStartTime);
    const endMinutes = toMinutes(reserEndTime);
    if (startMinutes == null || endMinutes == null) {
      return buildTableOccupancy(bookings, { blocking: 'all-day', posOpenTablenums });
    }
    return buildTableOccupancy(bookings, {
      blocking: { startMinutes, endMinutes },
      posOpenTablenums,
      ignoreCurrentUse,
    });
  }, [bookings, reserStartTime, reserEndTime, posOpenTablenums, ignoreCurrentUse]);

  const bookingsByGlobalId = useMemo(() => new Map(bookings.map((b) => [b.globalId, b])), [bookings]);

  // `upcoming` tables are free for the window we're seating into, so they stay
  // suggestible — only a hold that actually overlaps takes a table out.
  const freeTables = useMemo(
    () => tables.filter((tb) => isTableReservable(tb) && !isTableBlocked(tableInfo.get(tb.tablenum))),
    [tables, tableInfo],
  );

  /** Whole store, not just the open zone — the submit guard has to judge every picked table. */
  const tableByNum = useMemo(() => new Map(allTables.map((tb) => [tb.tablenum, tb])), [allTables]);

  // A table that is busy right now is pickable for a far-off slot but shouldn't
  // be *recommended* while genuinely quiet tables exist, so it only enters the
  // suggestions when nothing else can seat the party.
  const suggestion = useMemo(() => {
    const quiet = freeTables.filter((tb) => tableInfo.get(tb.tablenum)?.advisory !== true);
    const preferred = suggestTables(quiet, partySize);
    if (preferred.single.length > 0 || preferred.combos.length > 0) return preferred;
    return suggestTables(freeTables, partySize);
  }, [freeTables, tableInfo, partySize]);

  // suggestTables returns either single tables that fit outright or, when none
  // does, merge combos — flatten both into one chip list so the strip renders
  // the same way either way.
  const suggestionOptions = useMemo(() => {
    if (suggestion.single.length > 0) {
      return suggestion.single.map((tb) => ({
        key: `t${tb.tablenum}`,
        tablenums: [tb.tablenum],
        capacity: tb.maxnumcust ?? 0,
      }));
    }
    return suggestion.combos.map((combo) => ({
      key: combo.map((tb) => tb.tablenum).join('-'),
      tablenums: combo.map((tb) => tb.tablenum),
      capacity: combo.reduce((sum, tb) => sum + (tb.maxnumcust ?? 0), 0),
    }));
  }, [suggestion]);

  const selectedCapacity = useMemo(
    () => tables.filter((tb) => selectedTablenums.has(tb.tablenum)).reduce((sum, tb) => sum + (tb.maxnumcust ?? 0), 0),
    [tables, selectedTablenums],
  );

  const canSeat = selectedTablenums.size > 0 && selectedCapacity >= partySize;

  const toggleTable = (table: TableSetup) => {
    setSelectedTablenums((prev) => {
      const next = new Set(prev);
      if (next.has(table.tablenum)) {
        next.delete(table.tablenum);
        return next;
      }
      if (!mergeMode) return new Set([table.tablenum]);
      next.add(table.tablenum);
      return next;
    });
  };

  const changeMergeMode = (on: boolean) => {
    setMergeMode(on);
    if (!on) setSelectedTablenums((prev) => (prev.size > 1 ? new Set([Array.from(prev)[0]]) : prev));
  };

  const applySuggestion = (tablenums: number[]) => {
    // A multi-table suggestion *is* a merge — switch the mode on with it, or the
    // next tap on a table would collapse it back to one.
    if (tablenums.length > 1) setMergeMode(true);
    setSelectedTablenums(new Set(tablenums));
    setScrollTarget(tablenums[0]);
  };

  const doSeat = async () => {
    if (!linkInfo || zoneID == null || !canSeat) return;
    setSubmitting(true);
    try {
      // The store's standing "no reservations on this table" flag, checked here as
      // well as in the grid: unlike a POS check it holds for every window, so no
      // amount of seating far ahead makes such a table pickable.
      const notReservable = Array.from(selectedTablenums).filter((n) => !isTableReservable(tableByNum.get(n)));
      if (notReservable.length > 0) {
        toast.error(t('seating.unavailableBlocked', { tables: notReservable.map((n) => `#${n}`).join(', ') }));
        setSelectedTablenums((prev) => new Set(Array.from(prev).filter((n) => isTableReservable(tableByNum.get(n)))));
        return;
      }
      // A check can be opened on the chosen table while this modal is open, so
      // re-read the POS before writing instead of trusting the loaded colours.
      // Skipped when seating far enough ahead that an open check doesn't matter.
      if (!ignoreCurrentUse) {
        const fresh = await reloadPosOpenTables();
        const posNow = fresh ?? posOpenTablenums;
        const conflicts = Array.from(selectedTablenums).filter((n) => posNow.has(n));
        if (conflicts.length > 0) {
          toast.error(t('seating.posOpenBlocked', { tables: conflicts.map((n) => `#${n}`).join(', ') }));
          setSelectedTablenums((prev) => new Set(Array.from(prev).filter((n) => !posNow.has(n))));
          return;
        }
      }
      const tablenums = Array.from(selectedTablenums);
      await updateWaitlist({
        globalId: entry.globalId,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        status: WaitlistStatus.Reserved,
        zoneId: zoneID,
        // Keep the booking's ReservationTime in step with the seat window when
        // the hostess seats the guest at a different time than they asked for.
        expectedTime: toTimeSpan(startTime),
        channelID: linkInfo.channelId,
        internalNote: entry.notes ?? undefined,
        userModified: user?.userId,
        seatTables: tablenums.map((tablenum) => ({
          tableNum: tablenum,
          reserTable: tablenum,
          reserDate: `${date}T00:00:00`,
          reserStartTime,
          reserEndTime,
        })),
      });
      onSeated(tablenums);
    } catch (err) {
      // ReservationWaitlists refuses with a reason (missing required field, slot gone,
      // entry already settled) — passing it straight through beats a generic line.
      toast.error(apiErrorMessage(err, t('seating.seatError')));
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <>
      <div
        className="modal-backdrop fixed inset-0 z-[9996] flex items-stretch justify-center p-2 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="glass-card modal-panel flex max-h-full w-full max-w-4xl flex-col p-3 sm:p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-ink">{t('waitlist.seatTitle')}</h3>
              <p className="text-xs text-muted">
                {entry.guestName} · {partySize} {t('waitlist.guests')} · {entry.phoneNumber}
              </p>
            </div>
            {/* This time is sent as expectedTime too, so it decides the booking's
                ReservationTime and its period — the picker flags a time no
                period covers instead of letting it through silently. */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{t('waitlist.seatFrom')}</span>
              <PeriodTimePicker
                date={date}
                value={startTime}
                compact
                onChange={(v) => {
                  setStartTime(v);
                  setSelectedTablenums(new Set());
                }}
              />
              <span className="flex items-center gap-1 text-xs text-faint">
                <ArrowLeftIcon size={12} className="rotate-180" />
                {formatHHmm(reserEndTime)}
              </span>
            </div>
          </div>

          <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
            {zones.map((z) => (
              <button
                key={z.zoneID}
                onClick={() => {
                  setZoneID(z.zoneID);
                  setSelectedTablenums(new Set());
                }}
                className={`chip-btn rounded-full px-4 text-sm font-medium ${
                  zoneID === z.zoneID ? 'pill-on' : 'pill'
                }`}
              >
                {z.zoneName}
              </button>
            ))}
          </div>

          {posOpenFailed && zoneID != null && (
            <p className="note note-warn mb-2 shrink-0">
              <AlertIcon size={14} className="mr-1 inline shrink-0" />
              {t('seating.posUnavailable')}
            </p>
          )}

          {/* Picking a suggestion is the normal way to seat someone, so it sits
              above the floor plan and outside the scroll area — always one tap
              away instead of behind a toggle and a scroll. */}
          {!loading && zoneID != null && suggestionOptions.length > 0 && (
            <div className="note note-ok mb-2 shrink-0 p-2">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <StarIcon size={13} className="mr-1 inline" />
                {t('seating.suggestions')}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {suggestionOptions.map((option) => {
                  const isSelected =
                    selectedTablenums.size === option.tablenums.length &&
                    option.tablenums.every((n) => selectedTablenums.has(n));
                  return (
                    <button
                      key={option.key}
                      onClick={() => applySuggestion(option.tablenums)}
                      className={`chip-btn shrink-0 rounded-full px-3 text-xs font-semibold ${
                        isSelected ? 'pill-on' : 'bg-[var(--ok-bg)] text-ok hover:brightness-105'
                      }`}
                    >
                      {option.tablenums.map((n) => `#${n}`).join(' + ')}
                      <span className="ml-1 opacity-75">
                        {option.capacity} {t('seating.seats')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Above the floor plan: below it the legend sits past every table in
              the zone, so nobody reading the colours ever reaches it. */}
          {zoneID != null && !loading && (
            <div className="mb-2 shrink-0 border-b border-line-soft pb-2">
              <TableLegend />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <Spinner label={t('common.loading')} />
            ) : zoneID == null ? (
              <p className="py-8 text-center text-sm text-muted">{t('seating.selectZone')}</p>
            ) : (
              <TableGrid
                tables={tables}
                sections={sections}
                tableInfo={tableInfo}
                selectedTablenums={selectedTablenums}
                partySize={partySize}
                onToggle={toggleTable}
                onViewBooking={(globalIds) => setDetailBooking(bookingsByGlobalId.get(globalIds[0]) ?? null)}
                mergeMode={mergeMode}
                onMergeModeChange={changeMergeMode}
              />
            )}
          </div>

          {selectedTablenums.size > 0 && (
            <div
              className={`note mt-2 shrink-0 ${canSeat ? 'note-ok' : 'note-warn'}`}
            >
              {Array.from(selectedTablenums)
                .map((n) => `#${n}`)
                .join(' + ')}{' '}
              · {selectedCapacity} {t('seating.seats')} / {partySize} {t('waitlist.guests')}
              {!canSeat && ` — ${t('waitlist.needMoreSeats')}`}
            </div>
          )}

          {isExcessCapacity(selectedCapacity, partySize) && (
            <p className="note note-warn mt-2 shrink-0">
              <AlertIcon size={14} className="mr-1 inline shrink-0" />
              {t('seating.excessCapacityWarning', {
                tables: selectedTablenums.size,
                selected: selectedCapacity,
                party: partySize,
                excess: selectedCapacity - partySize,
              })}
            </p>
          )}

          <div className="mt-3 flex shrink-0 gap-2">
            <button onClick={onClose} className="touch-btn btn-secondary flex-1 rounded-xl font-medium">
              {t('common.cancel')}
            </button>
            <button
              onClick={doSeat}
              disabled={!canSeat || submitting}
              className="touch-btn btn-success flex-[2] rounded-xl font-semibold"
            >
              {t('waitlist.seat')}
              {selectedTablenums.size > 0 &&
                ` ${Array.from(selectedTablenums)
                  .map((n) => `#${n}`)
                  .join(' + ')}`}
            </button>
          </div>
        </div>
      </div>

      <BookingDetailModal booking={detailBooking} onClose={() => setDetailBooking(null)} />
    </>
  );
}
