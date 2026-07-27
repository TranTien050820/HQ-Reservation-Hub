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
import { searchBookings } from '../api/bookings';
import { updateWaitlist } from '../api/waitlists';
import { buildTableOccupancy } from '../utils/tableOccupancy';
import { suggestTables } from '../utils/tableSuggestion';
import { computeSeatWindow, toMinutes } from '../utils/timeWindow';
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
  const [bookings, setBookings] = useState<ReservationBooking[]>([]);
  const [detailBooking, setDetailBooking] = useState<ReservationBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  /** Table to bring into view after a suggestion is applied. */
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);

  useEffect(() => {
    if (!linkInfo) return;
    let cancelled = false;
    setLoading(true);
    searchBookings({ ...linkInfo, reservationDate: date, pageSize: 500 })
      .then((page) => {
        if (!cancelled) setBookings(page.items);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('common.error'));
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
  const tableInfo = useMemo(() => {
    const startMinutes = toMinutes(reserStartTime);
    const endMinutes = toMinutes(reserEndTime);
    if (startMinutes == null || endMinutes == null) return buildTableOccupancy(bookings, { blocking: 'all-day' });
    return buildTableOccupancy(bookings, { blocking: { startMinutes, endMinutes } });
  }, [bookings, reserStartTime, reserEndTime]);

  const bookingsByGlobalId = useMemo(() => new Map(bookings.map((b) => [b.globalId, b])), [bookings]);

  const freeTables = useMemo(
    () => tables.filter((tb) => tb.canreserve && !tableInfo.get(tb.tablenum)?.state),
    [tables, tableInfo],
  );

  const suggestion = useMemo(() => suggestTables(freeTables, partySize), [freeTables, partySize]);

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
      if (next.has(table.tablenum)) next.delete(table.tablenum);
      else next.add(table.tablenum);
      return next;
    });
  };

  const applySuggestion = (tablenums: number[]) => {
    setSelectedTablenums(new Set(tablenums));
    setScrollTarget(tablenums[0]);
  };

  const doSeat = async () => {
    if (!linkInfo || zoneID == null || !canSeat) return;
    setSubmitting(true);
    try {
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
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <>
      <div
        className="modal-backdrop fixed inset-0 z-[9996] flex items-stretch justify-center bg-black/70 p-2 sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="glass-card modal-panel flex max-h-full w-full max-w-4xl flex-col p-4 sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">{t('waitlist.seatTitle')}</h3>
              <p className="text-sm text-slate-400">
                {entry.guestName} · {partySize} {t('waitlist.guests')} · {entry.phoneNumber}
              </p>
            </div>
            {/* This time is sent as expectedTime too, so it decides the booking's
                ReservationTime and its period — the picker flags a time no
                period covers instead of letting it through silently. */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t('waitlist.seatFrom')}</span>
              <PeriodTimePicker
                date={date}
                value={startTime}
                compact
                onChange={(v) => {
                  setStartTime(v);
                  setSelectedTablenums(new Set());
                }}
              />
              <span className="text-xs text-slate-500">→ {formatHHmm(reserEndTime)}</span>
            </div>
          </div>

          <div className="mb-3 flex shrink-0 flex-wrap gap-2">
            {zones.map((z) => (
              <button
                key={z.zoneID}
                onClick={() => {
                  setZoneID(z.zoneID);
                  setSelectedTablenums(new Set());
                }}
                className={`chip-btn rounded-full px-4 text-sm font-medium ${
                  zoneID === z.zoneID
                    ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_4px_16px_rgba(239,68,68,0.35)]'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {z.zoneName}
              </button>
            ))}
          </div>

          {/* Picking a suggestion is the normal way to seat someone, so it sits
              above the floor plan and outside the scroll area — always one tap
              away instead of behind a toggle and a scroll. */}
          {!loading && zoneID != null && suggestionOptions.length > 0 && (
            <div className="mb-3 shrink-0 rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                ★ {t('seating.suggestions')}
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
                        isSelected
                          ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                          : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
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

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <Spinner label={t('common.loading')} />
            ) : zoneID == null ? (
              <p className="py-8 text-center text-sm text-slate-400">{t('seating.selectZone')}</p>
            ) : (
              <TableGrid
                tables={tables}
                sections={sections}
                tableInfo={tableInfo}
                selectedTablenums={selectedTablenums}
                partySize={partySize}
                onToggle={toggleTable}
                onViewBooking={(globalIds) => setDetailBooking(bookingsByGlobalId.get(globalIds[0]) ?? null)}
              />
            )}
          </div>

          {zoneID != null && !loading && (
            <div className="mt-3 shrink-0">
              <TableLegend />
            </div>
          )}

          {selectedTablenums.size > 0 && (
            <div
              className={`mt-3 shrink-0 rounded-xl border px-3 py-2 text-xs ${
                canSeat
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-950/20 text-amber-300'
              }`}
            >
              {Array.from(selectedTablenums)
                .map((n) => `#${n}`)
                .join(' + ')}{' '}
              · {selectedCapacity} {t('seating.seats')} / {partySize} {t('waitlist.guests')}
              {!canSeat && ` — ${t('waitlist.needMoreSeats')}`}
            </div>
          )}

          <div className="mt-4 flex shrink-0 gap-3">
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
