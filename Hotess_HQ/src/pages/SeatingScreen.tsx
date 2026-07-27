import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { TableGrid, type TableExtraInfo } from '../components/TableGrid';
import { TableLegend } from '../components/TableLegend';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { fetchAvailableSlots } from '../api/availableSlots';
import { searchBookings, updateBooking } from '../api/bookings';
import { todayStr } from '../utils/date';
import { getEffectiveStatus } from '../utils/bookingStatus';
import { computeSeatWindow } from '../utils/timeWindow';
import { buildTableOccupancy } from '../utils/tableOccupancy';
import { suggestTables } from '../utils/tableSuggestion';
import {
  BookingStatus,
  type AvailableSlot,
  type ReservationBooking,
  type ReservationZone,
  type TableSetup,
} from '../types';

/**
 * When AvailableSlots has no row for a zone (e.g. no data yet for today),
 * fall back to the zone's own configured capacity (`zone.availableSlots`,
 * from ReservationZones) — NOT a count of every physical table in the zone's
 * sections, which is the total dining tables regardless of the slot quota
 * configured for reservations.
 */
function resolveZoneSlot(zone: ReservationZone, slots: AvailableSlot[]) {
  const found = slots.find((s) => s.zoneID === zone.zoneID);
  const total = found?.availableSlots ?? zone.availableSlots ?? 0;
  const used = found?.numberOfUsed ?? 0;
  const free = found?.numberOfUnused ?? total;
  return { total, used, free };
}

export function SeatingScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { linkInfo } = useStore();
  const location = useLocation();
  const activeBooking = (location.state as { booking?: ReservationBooking } | null)?.booking;
  const zones = useMemo(() => linkInfo?.zones ?? [], [linkInfo]);
  const allTables = useMemo(() => linkInfo?.tableSetups ?? [], [linkInfo]);
  const zoneSectionLinks = useMemo(() => linkInfo?.zoneSectionLinks ?? [], [linkInfo]);
  const sections = useMemo(() => linkInfo?.sections ?? [], [linkInfo]);

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedZoneID, setSelectedZoneID] = useState<number | null>(null);
  const [tableInfo, setTableInfo] = useState<Map<number, TableExtraInfo>>(new Map()); // tablenum -> {state, globalId, merged}
  const [bookingsByGlobalId, setBookingsByGlobalId] = useState<Map<number, ReservationBooking>>(new Map());
  const [detailBooking, setDetailBooking] = useState<ReservationBooking | null>(null);
  const [pickerGlobalIds, setPickerGlobalIds] = useState<number[] | null>(null);
  const [selectedTablenums, setSelectedTablenums] = useState<Set<number>>(new Set());
  const [seatedPartySize, setSeatedPartySize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const partySize = activeBooking?.partySize ?? 1;

  const tables = useMemo(() => {
    if (selectedZoneID == null) return [];
    const secNums = new Set(zoneSectionLinks.filter((l) => l.zoneID === selectedZoneID).map((l) => l.secNum));
    return allTables.filter((tb) => secNums.has(tb.secnum));
  }, [allTables, zoneSectionLinks, selectedZoneID]);

  const selectedCapacity = useMemo(
    () => tables.filter((tb) => selectedTablenums.has(tb.tablenum)).reduce((sum, tb) => sum + (tb.maxnumcust ?? 0), 0),
    [tables, selectedTablenums],
  );

  // "Free right now" — same availability rule TableGrid uses for its own
  // `available` state, kept in sync here so suggestions never offer a table
  // that the grid itself would show as taken.
  const freeTables = useMemo(
    () => tables.filter((tb) => tb.canreserve && !tableInfo.get(tb.tablenum)?.state),
    [tables, tableInfo],
  );

  // Tables the booking being seated already holds (e.g. reserved in advance) —
  // "active now" filtering elsewhere can make these read as plain "available",
  // so surface them distinctly instead of letting staff mistake them for a
  // random free table.
  const ownTablenums = useMemo(() => {
    const nums = (activeBooking?.seatTables ?? [])
      .map((st) => st.reserTable ?? st.tableNum)
      .filter((v): v is number => v != null);
    return new Set(nums);
  }, [activeBooking]);

  // Only meaningful while actively seating a checked-in booking — ported from
  // HQ_FE_V2's AvailabilityChecker (Lịch khả dụng): a single big-enough table
  // always wins over merging; combos are same-section, prefer fewer/closer
  // tables. See src/utils/tableSuggestion.ts. The guest's own already-held
  // table (if any) is always pinned first so it's never pushed out by the
  // display cap.
  const suggestion = useMemo(
    () => (activeBooking ? suggestTables(freeTables, partySize, ownTablenums) : { single: [], combos: [] }),
    [activeBooking, freeTables, partySize, ownTablenums],
  );

  const refreshOverview = useCallback(async () => {
    if (!linkInfo) return;
    const s = await fetchAvailableSlots(linkInfo, todayStr());
    setSlots(s);
    if (activeBooking?.zoneID) setSelectedZoneID(activeBooking.zoneID);
  }, [linkInfo, activeBooking]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  const loadOccupiedTables = useCallback(
    async (zoneID: number) => {
      if (!linkInfo) return;
      setLoading(true);
      try {
        const todaysBookings = await searchBookings({ ...linkInfo, reservationDate: todayStr(), pageSize: 500 });
        setBookingsByGlobalId(new Map(todaysBookings.items.map((b) => [b.globalId, b])));

        const seatedSum = todaysBookings.items
          .filter((b) => b.zoneID === zoneID && getEffectiveStatus(b) === BookingStatus.Seated)
          .reduce((sum, b) => sum + (b.partySize || 0), 0);
        setSeatedPartySize(seatedSum);

        // While actively seating a party only holds covering "now" block a
        // table; with no active booking this screen is a whole-day floor-plan
        // browser instead (like HQ_FE_V2's FloorPlanTab default "Tất cả ca"
        // view), so every non-terminal booking today marks its table.
        setTableInfo(
          buildTableOccupancy(todaysBookings.items, { blocking: activeBooking ? 'now' : 'all-day' }),
        );

        // If this booking already has tables assigned (e.g. re-opened from
        // check-in), pre-select them instead of making the hostess re-pick —
        // regardless of time window, since we're continuing this same booking.
        if (activeBooking?.zoneID === zoneID) {
          const activeTablenums = (activeBooking.seatTables ?? [])
            .map((st) => st.reserTable ?? st.tableNum)
            .filter((v): v is number => v != null);
          setSelectedTablenums(new Set(activeTablenums));
        } else {
          setSelectedTablenums(new Set());
        }
      } catch {
        toast.error(t('common.error'));
      } finally {
        setLoading(false);
      }
    },
    [linkInfo, toast, t, activeBooking],
  );

  useEffect(() => {
    if (selectedZoneID != null) loadOccupiedTables(selectedZoneID);
  }, [selectedZoneID, loadOccupiedTables]);

  const scrollToTable = (tablenum: number) => {
    // Wait a tick so the modal has closed / the grid has re-rendered the new
    // selection before we measure its position.
    requestAnimationFrame(() => {
      document.getElementById(`seat-table-${tablenum}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const toggleTable = (table: TableSetup) => {
    setSelectedTablenums((prev) => {
      const next = new Set(prev);
      if (next.has(table.tablenum)) next.delete(table.tablenum);
      else next.add(table.tablenum);
      return next;
    });
  };

  const viewBooking = (globalIds: number[]) => {
    if (globalIds.length <= 1) {
      setDetailBooking(bookingsByGlobalId.get(globalIds[0]) ?? null);
    } else {
      setPickerGlobalIds(globalIds);
    }
  };

  const seatToZone = async () => {
    if (!activeBooking || selectedZoneID == null || !linkInfo) return;
    try {
      await updateBooking({
        globalId: activeBooking.globalId,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        status: BookingStatus.Seated,
        zoneID: selectedZoneID,
      });
      toast.success(t('seating.seatSuccess'));
      navigate('../seating', { replace: true });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const seatToTables = async () => {
    if (!activeBooking || selectedZoneID == null || selectedTablenums.size === 0 || !linkInfo) return;
    try {
      const date = activeBooking.reservationDate || todayStr();
      const zone = zones.find((z) => z.zoneID === selectedZoneID);
      const { reserStartTime, reserEndTime } = computeSeatWindow(
        activeBooking.reservationTime,
        zone?.isUseDurationMinutes ? zone.durationMinutes : undefined,
      );
      const seatTables = Array.from(selectedTablenums).map((tablenum) => ({
        tableNum: tablenum,
        reserTable: tablenum,
        reserDate: date,
        reserStartTime,
        reserEndTime,
      }));
      await updateBooking({
        globalId: activeBooking.globalId,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        status: BookingStatus.Seated,
        zoneID: selectedZoneID,
        seatTables,
      });
      toast.success(t('seating.seatSuccess'));
      navigate('../seating', { replace: true });
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col lg:h-full lg:min-h-0">
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <button
          onClick={() => navigate('../checkin')}
          aria-label={t('common.back')}
          className="chip-btn btn-secondary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-white">{t('seating.title')}</h1>
      </div>

      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-visible">
        <div className="glass-card shrink-0 p-4 lg:w-72 lg:overflow-y-auto">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t('seating.zones')}</h2>
          <div className="space-y-2">
            {zones.map((z) => {
              const slot = resolveZoneSlot(z, slots);
              return (
                <button
                  key={z.zoneID}
                  onClick={() => setSelectedZoneID(z.zoneID)}
                  className={`touch-btn w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedZoneID === z.zoneID
                      ? 'border-[#ef4444] bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_4px_16px_rgba(239,68,68,0.35)]'
                      : 'border-white/10 bg-slate-800/40 text-slate-200 hover:border-[#ef4444]/40 hover:bg-slate-700/50'
                  }`}
                >
                  <p className="font-semibold">{z.zoneName}</p>
                  <p className={`text-xs ${selectedZoneID === z.zoneID ? 'text-white/80' : 'text-slate-400'}`}>
                    {t('seating.free')}: {slot.free}/{slot.total}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card flex flex-col p-4 lg:min-h-0 lg:flex-1">
          {activeBooking && (
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <p className="text-sm text-slate-300">
                {activeBooking.bookingName} · {activeBooking.bookingPhone} · {partySize}p
              </p>
              <button
                onClick={() => setDetailBooking(activeBooking)}
                className="chip-btn btn-secondary shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold"
              >
                {t('seating.viewBooking')}
              </button>
            </div>
          )}
          {selectedZoneID == null && <p className="text-sm text-slate-400">{t('seating.selectZone')}</p>}

          {selectedZoneID != null && (
            <>
              {(() => {
                const zone = zones.find((z) => z.zoneID === selectedZoneID);
                if (!zone) return null;
                const slot = resolveZoneSlot(zone, slots);
                return (
                  <div className="mb-4 grid shrink-0 grid-cols-4 gap-2 text-center text-sm">
                    <div className="stat-tile">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('seating.total')}</p>
                      <p className="text-lg font-bold text-white">{slot.total}</p>
                    </div>
                    <div className="stat-tile">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('seating.used')}</p>
                      <p className="text-lg font-bold text-[#f87171]">{slot.used}</p>
                    </div>
                    <div className="stat-tile">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('seating.free')}</p>
                      <p className="text-lg font-bold text-emerald-400">{slot.free}</p>
                    </div>
                    <div className="stat-tile">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{t('seating.seated')}</p>
                      <p className="text-lg font-bold text-white">{seatedPartySize}</p>
                    </div>
                  </div>
                );
              })()}

              {loading ? (
                <Spinner label={t('common.loading')} />
              ) : (
                <>
                  <p className="mb-2 shrink-0 text-xs text-slate-400">{t('seating.selectTableHint')}</p>
                  <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                    <TableGrid
                      tables={tables}
                      sections={sections}
                      tableInfo={tableInfo}
                      selectedTablenums={selectedTablenums}
                      ownTablenums={ownTablenums}
                      partySize={partySize}
                      onToggle={toggleTable}
                      onViewBooking={viewBooking}
                      readOnly={!activeBooking}
                      filterBarExtra={
                        activeBooking && (suggestion.single.length > 0 || suggestion.combos.length > 0) ? (
                          <button
                            onClick={() => setSuggestionsOpen(true)}
                            className="chip-btn flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/20 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/30"
                          >
                            ★ {t('seating.suggestions')}
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/25 px-1 text-[10px]">
                              {suggestion.single.length || suggestion.combos.length}
                            </span>
                          </button>
                        ) : undefined
                      }
                    />
                  </div>

                  <div className="mt-3 shrink-0">
                    <TableLegend />
                  </div>

                  {activeBooking && selectedTablenums.size > 0 && selectedCapacity < partySize && (
                    <p className="mt-3 shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                      ⚠ {t('seating.capacityWarning', { selected: selectedCapacity, party: partySize })}
                    </p>
                  )}

                  <div className="mt-4 flex shrink-0 flex-wrap gap-2">
                    {activeBooking && (
                      <button
                        onClick={seatToZone}
                        disabled={selectedTablenums.size > 0}
                        className="chip-btn btn-primary rounded-xl px-4 text-sm font-semibold"
                      >
                        {t('seating.seatToZone')}
                      </button>
                    )}
                    {activeBooking && (
                      <button
                        onClick={seatToTables}
                        disabled={selectedTablenums.size === 0}
                        className="chip-btn btn-success rounded-xl px-4 text-sm font-semibold"
                      >
                        {t('seating.seatToTable')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {suggestionsOpen && (
        <div
          className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSuggestionsOpen(false)}
        >
          <div
            className="glass-card modal-panel flex max-h-[85vh] w-full max-w-sm flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 shrink-0 text-center text-lg font-semibold text-white">{t('seating.suggestions')}</h3>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {suggestion.single.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestion.single.map((tb) => {
                  const isOwn = ownTablenums.has(tb.tablenum);
                  const isSelected = selectedTablenums.size === 1 && selectedTablenums.has(tb.tablenum);
                  return (
                    <button
                      key={tb.globalId}
                      onClick={() => {
                        setSelectedTablenums(new Set([tb.tablenum]));
                        setSuggestionsOpen(false);
                        scrollToTable(tb.tablenum);
                      }}
                      className={`chip-btn rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isSelected
                          ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                          : isOwn
                            ? 'bg-violet-500/20 text-violet-200 hover:bg-violet-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      }`}
                    >
                      {isOwn && '★ '}#{tb.tablenum} ({tb.maxnumcust ?? 0} {t('seating.seats')})
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mx-auto max-w-xs space-y-1.5">
                {suggestion.combos.map((combo) => {
                  const nums = combo.map((tb) => tb.tablenum);
                  const cap = combo.reduce((s, tb) => s + (tb.maxnumcust ?? 0), 0);
                  const isSelected =
                    selectedTablenums.size === nums.length && nums.every((n) => selectedTablenums.has(n));
                  return (
                    <button
                      key={nums.join('-')}
                      onClick={() => {
                        setSelectedTablenums(new Set(nums));
                        setSuggestionsOpen(false);
                        scrollToTable(nums[0]);
                      }}
                      className={`chip-btn flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1 text-xs font-semibold ${
                        isSelected
                          ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                          : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      }`}
                    >
                      <span>{nums.map((n) => `#${n}`).join(' + ')}</span>
                      <span className="opacity-80">
                        {cap} {t('seating.seats')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            </div>
            <button
              onClick={() => setSuggestionsOpen(false)}
              className="chip-btn btn-secondary mx-auto mt-4 w-32 shrink-0 rounded-xl text-sm font-medium"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {pickerGlobalIds && (
        <div
          className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPickerGlobalIds(null)}
        >
          <div className="glass-card modal-panel w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-white">{t('seating.multipleBookings')}</h3>
            <div className="space-y-2">
              {pickerGlobalIds.map((globalId) => {
                const b = bookingsByGlobalId.get(globalId);
                if (!b) return null;
                return (
                  <button
                    key={globalId}
                    onClick={() => {
                      setPickerGlobalIds(null);
                      setDetailBooking(b);
                    }}
                    className="touch-btn w-full rounded-xl border border-white/10 bg-slate-800/40 px-4 py-3 text-left hover:border-[#ef4444]/40 hover:bg-slate-700/50"
                  >
                    <p className="font-semibold text-white">
                      {b.bookingName} · {b.partySize}p
                    </p>
                    <p className="text-xs text-slate-400">
                      {b.reservationNo} {b.reservationTime ? `· ${b.reservationTime.slice(0, 5)}` : ''}
                    </p>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPickerGlobalIds(null)}
              className="chip-btn btn-secondary mx-auto mt-4 w-32 rounded-xl text-sm font-medium"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <BookingDetailModal booking={detailBooking} onClose={() => setDetailBooking(null)} />
    </div>
  );
}
