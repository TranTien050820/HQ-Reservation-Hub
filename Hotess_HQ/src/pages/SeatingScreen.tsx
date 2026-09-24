import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { TableGrid } from '../components/TableGrid';
import { TableLegend } from '../components/TableLegend';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PreOrderBadge } from '../components/PreOrderPanel';
import { AlertIcon, ArmchairIcon, ArrowLeftIcon, LayoutIcon, RefreshIcon, StarIcon } from '../components/icons';
import { fetchAvailableSlots } from '../api/availableSlots';
import { searchBookings, updateBooking } from '../api/bookings';
import {
  bookingScope,
  cancelReservationOrders,
  hasPreOrdersForReservation,
  releaseReservationOrders,
} from '../api/orderHub';
import { fetchAllPages } from '../api/paginate';
import { usePosOpenTables } from '../hooks/usePosOpenTables';
import { usePreOrders } from '../hooks/usePreOrders';
import { formatVnHHmm, todayStr } from '../utils/date';
import { apiErrorMessage, tableRefusalMessage, tableRefusalOf } from '../utils/apiError';
import { getEffectiveStatus } from '../utils/bookingStatus';
import { computeSeatWindow, toMinutes } from '../utils/timeWindow';
import { buildTableOccupancy, isTableBlocked, isTableReservable } from '../utils/tableOccupancy';
import { isExcessCapacity, suggestTables } from '../utils/tableSuggestion';
import {
  BookingStatus,
  type AvailableSlot,
  type ReservationBooking,
  type ReservationReleaseResult,
  type ReservationZone,
  type SiteScope,
  type TableSetup,
} from '../types';

/**
 * One booking's pre-order action: which booking, and the booking's own station scope that
 * every Release / Cancel carries (SPEC-06 R-10) — not the scope of the link this terminal opened.
 */
interface PreOrderTarget {
  reservationNo: string;
  scope: SiteScope;
}

/**
 * When AvailableSlots has no row for a zone (e.g. no data yet for today),
 * fall back to the zone's own configured capacity (`zone.availableSlots`,
 * from ReservationZones) — NOT a count of every physical table in the zone's
 * sections, which is the total dining tables regardless of the slot quota
 * configured for reservations.
 */
/**
 * How often the open floor plan re-reads itself. Tuned to POS checks, which open and close
 * far faster than bookings change — a full sweep is three small calls, so this is cheap
 * enough to run all service without being slow enough to seat a guest onto a taken table.
 */
const FLOOR_PLAN_REFRESH_MS = 30_000;

/** The tables a booking holds right now. `isActive === 0` rows are retired moves, not its table. */
function heldTablenums(booking: ReservationBooking): number[] {
  return (booking.seatTables ?? [])
    .filter((st) => st.isActive !== 0)
    .map((st) => st.reserTable ?? st.tableNum)
    .filter((v): v is number => v != null);
}

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
  const { user } = useAuth();
  const location = useLocation();
  const activeBooking = (location.state as { booking?: ReservationBooking } | null)?.booking;
  const zones = useMemo(() => linkInfo?.zones ?? [], [linkInfo]);
  /**
   * Tables the server refused for this restaurant while the screen was open
   * (`TABLE_NOT_IN_RESTAURANT`). The refusal is final — the same table is refused every time
   * (SPEC-06 §4.10) — so each one is folded into the store setup as `canreserve = 0`: the grid
   * greys it out, suggestions skip it, and every guard that already refuses an out-of-service
   * table refuses it too, instead of letting the hostess tap it into the same 403 again.
   */
  const [refusedTablenums, setRefusedTablenums] = useState<ReadonlySet<number>>(() => new Set());
  const allTables = useMemo(() => {
    const setups = linkInfo?.tableSetups ?? [];
    if (refusedTablenums.size === 0) return setups;
    return setups.map((tb) => (refusedTablenums.has(tb.tablenum) ? { ...tb, canreserve: 0 } : tb));
  }, [linkInfo, refusedTablenums]);
  const zoneSectionLinks = useMemo(() => linkInfo?.zoneSectionLinks ?? [], [linkInfo]);
  const sections = useMemo(() => linkInfo?.sections ?? [], [linkInfo]);

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedZoneID, setSelectedZoneID] = useState<number | null>(null);
  const [bookings, setBookings] = useState<ReservationBooking[]>([]);
  const [detailBooking, setDetailBooking] = useState<ReservationBooking | null>(null);
  const [pickerGlobalIds, setPickerGlobalIds] = useState<number[] | null>(null);
  const [selectedTablenums, setSelectedTablenums] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  /** When the plan on screen was last read from the server — shown so staleness is visible. */
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  /** Stops a slow sweep from being overtaken by the next tick and writing results out of order. */
  const refreshingRef = useRef(false);
  /**
   * Merging off, one table per booking: picking a table replaces the previous
   * pick instead of quietly stacking up. Lives here rather than in TableGrid
   * because it governs what a tap does, not just which tables are pickable.
   */
  const [mergeMode, setMergeMode] = useState(false);
  const partySize = activeBooking?.partySize ?? 1;

  const { posOpenTablenums, posOpenFailed, reloadPosOpenTables } = usePosOpenTables(linkInfo);
  const { preOrdersFor, preOrdersFailed, reloadPreOrders } = usePreOrders(linkInfo);
  const [releasing, setReleasing] = useState(false);
  /** Held open after Release so warnings (price drift, skipped orders) get read, not toasted away. */
  const [releaseResult, setReleaseResult] = useState<ReservationReleaseResult | null>(null);
  /** Set when the panel interrupted a seating flow that was on its way back to the floor plan. */
  const [returnAfterRelease, setReturnAfterRelease] = useState(false);
  /**
   * Booking whose Release failed after the guest was already seated — offer a retry.
   * `expectOrders` travels with it so the retry reads its result the way the first try would.
   */
  const [releaseRetry, setReleaseRetry] = useState<{ target: PreOrderTarget; expectOrders: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** Booking awaiting the "really call the food off?" confirmation. */
  const [cancelTarget, setCancelTarget] = useState<PreOrderTarget | null>(null);
  /**
   * Bumped whenever this screen changes a booking's food, so the open booking card re-reads
   * its own orders. The card fetches per booking (`H-04`) and would otherwise keep showing
   * the set from before the Release/Cancel that just ran.
   */
  const [preOrderTick, setPreOrderTick] = useState(0);
  const preOrdersChanged = useCallback(() => {
    void reloadPreOrders();
    setPreOrderTick((n) => n + 1);
  }, [reloadPreOrders]);
  const activePreOrders = preOrdersFor(activeBooking?.reservationNo);

  /** Release / Cancel target of a booking: its number and its own station (SPEC-06 R-10). */
  const targetOf = useCallback(
    (booking: ReservationBooking | null | undefined): PreOrderTarget | null =>
      booking?.reservationNo && linkInfo
        ? { reservationNo: String(booking.reservationNo), scope: bookingScope(booking, linkInfo) }
        : null,
    [linkInfo],
  );

  /**
   * Tables just written by this screen — `[]` for a zone-only seating, `null` while
   * nothing has been seated yet.
   *
   * `activeBooking` is a snapshot handed over in router state and is never refetched,
   * so after a successful Seat it still says Reserved. That matters because the screen
   * does not always leave afterwards: a failed pre-order Release keeps the hostess here
   * to retry, and without this the Seat buttons would still be live under her.
   */
  const [justSeatedTables, setJustSeatedTables] = useState<number[] | null>(null);

  /**
   * The guest is already at a table — either the booking arrived here Seated (opened
   * from a check-in search to see where they are sitting) or this screen just seated
   * them. Seating a second time would write a fresh set of seat rows over a party that
   * is already sitting down, so the screen only *shows*: the grid goes read-only and
   * the Seat buttons give way to a banner naming their tables. Releasing their
   * pre-ordered food from the booking card stays available.
   */
  const alreadySeated =
    activeBooking != null &&
    (justSeatedTables != null || Number(activeBooking.status) === BookingStatus.Seated);

  /** Where that guest actually is. `isActive === 0` rows are retired moves, not their table. */
  const seatedTablenums = useMemo(() => {
    if (justSeatedTables != null) return justSeatedTables;
    if (!alreadySeated) return [];
    return (activeBooking?.seatTables ?? [])
      .filter((st) => st.isActive !== 0)
      .map((st) => st.reserTable ?? st.tableNum)
      .filter((v): v is number => v != null);
  }, [justSeatedTables, alreadySeated, activeBooking]);

  // How many guests actually walked in, which is often not what was booked.
  // Held as a string so the hostess can clear the box while retyping; an empty
  // or nonsensical value falls back to the booked party size on submit rather
  // than sending 0 or NaN.
  const [actualQtyInput, setActualQtyInput] = useState(() => String(activeBooking?.actualQty ?? partySize));
  const actualQty = useMemo(() => {
    const n = Number(actualQtyInput);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : partySize;
  }, [actualQtyInput, partySize]);

  const tables = useMemo(() => {
    if (selectedZoneID == null) return [];
    const secNums = new Set(zoneSectionLinks.filter((l) => l.zoneID === selectedZoneID).map((l) => l.secNum));
    return allTables.filter((tb) => secNums.has(tb.secnum));
  }, [allTables, zoneSectionLinks, selectedZoneID]);

  const selectedCapacity = useMemo(
    () => tables.filter((tb) => selectedTablenums.has(tb.tablenum)).reduce((sum, tb) => sum + (tb.maxnumcust ?? 0), 0),
    [tables, selectedTablenums],
  );

  /** Whole store, not just the open zone — the submit guard has to judge every picked table. */
  const tableByNum = useMemo(() => new Map(allTables.map((tb) => [tb.tablenum, tb])), [allTables]);

  const bookingsByGlobalId = useMemo(() => new Map(bookings.map((b) => [b.globalId, b])), [bookings]);

  const seatedPartySize = useMemo(
    () =>
      bookings
        .filter((b) => b.zoneID === selectedZoneID && getEffectiveStatus(b) === BookingStatus.Seated)
        .reduce((sum, b) => sum + (b.partySize || 0), 0),
    [bookings, selectedZoneID],
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

  /**
   * A table the booking already holds that the store has since taken out of service
   * (`canreserve = 0`). Carried through as its own list because it must not be
   * re-selected on load, yet the hostess still needs telling why her guest's table
   * is greyed out.
   */
  const ownUnavailableTablenums = useMemo(
    () => Array.from(ownTablenums).filter((n) => !isTableReservable(tableByNum.get(n))),
    [ownTablenums, tableByNum],
  );

  /**
   * Tables this booking holds that are not in its zone's sections — a hold written against
   * another zone, or a table outside the restaurant altogether (SPEC-06 R-11). They are kept
   * out of the pre-selection below: the grid only draws the zone's tables, so such a pick
   * would ride into the Seat payload without ever being seen. Named here so the guest's table
   * does not just silently fail to come up selected.
   */
  const ownOutsideZoneTablenums = useMemo(() => {
    if (!activeBooking || alreadySeated || activeBooking.zoneID == null || activeBooking.zoneID !== selectedZoneID) {
      return [];
    }
    const inZone = new Set(tables.map((tb) => tb.tablenum));
    return heldTablenums(activeBooking).filter((n) => !inZone.has(n));
  }, [activeBooking, alreadySeated, selectedZoneID, tables]);

  // The hold this booking is about to take, which is what conflicts must be
  // judged against — NOT "now". Seating a 19:00 reservation at 15:00 has to
  // compare against 19:00–21:00, otherwise every 19:00 table reads as free and
  // the one we pick reads as free to the next hostess too. Same rule (and the
  // same zone duration) that `seatToTables` uses when it writes the rows.
  const seatWindow = useMemo(() => {
    const zone = zones.find((z) => z.zoneID === selectedZoneID);
    return computeSeatWindow(
      activeBooking?.reservationTime,
      zone?.isUseDurationMinutes ? zone.durationMinutes : undefined,
    );
  }, [zones, selectedZoneID, activeBooking]);

  // While actively seating a party, only holds overlapping that party's window
  // block a table; with no active booking this screen is a whole-day floor-plan
  // browser instead (like HQ_FE_V2's FloorPlanTab default "Tất cả ca" view), so
  // every non-terminal booking today marks its table. Either way, a table with
  // a booking outside the window still comes back as `upcoming` rather than
  // silently blank. The booking being seated is excluded so its own hold reads
  // as "held for this guest" instead of as a conflict with itself.
  const tableInfo = useMemo(() => {
    // A booking that is already seated is browsing, not seating: it must NOT be
    // excluded from the occupancy, or the very tables its guests are sitting at
    // would render as free to whoever looks next.
    if (!activeBooking || alreadySeated) {
      return buildTableOccupancy(bookings, { blocking: 'all-day', posOpenTablenums });
    }
    // computeSeatWindow always returns a well-formed HH:mm:ss pair (falling back
    // to the current clock), so these parse.
    const startMinutes = toMinutes(seatWindow.reserStartTime) ?? 0;
    const endMinutes = toMinutes(seatWindow.reserEndTime) ?? 0;
    // No `ignoreCurrentUse` here on purpose: this screen walks a guest onto the
    // table now (status -> Seated), so a table with an open POS check or another
    // party still on it is off limits regardless of how far off the booking's own
    // time is. Holding a table in advance is the waitlist picker's job.
    //
    // The POS set is NOT narrowed to "other people's" tables either: a check open
    // on the table this booking already holds still means someone is sitting
    // there, so "Đã giữ cho khách này" loses to it.
    return buildTableOccupancy(bookings, {
      blocking: { startMinutes, endMinutes },
      ignoreBookingGlobalId: activeBooking.globalId,
      posOpenTablenums,
    });
  }, [bookings, activeBooking, alreadySeated, seatWindow, posOpenTablenums]);

  // "Free for this booking's window" — same availability rule TableGrid uses,
  // kept in sync here so suggestions never offer a table the grid shows as
  // taken. An `upcoming` table is genuinely free for this window, so it stays
  // suggestible.
  const freeTables = useMemo(
    () => tables.filter((tb) => isTableReservable(tb) && !isTableBlocked(tableInfo.get(tb.tablenum))),
    [tables, tableInfo],
  );

  // Only meaningful while actively seating a checked-in booking — ported from
  // HQ_FE_V2's AvailabilityChecker (Lịch khả dụng): a single big-enough table
  // always wins over merging; combos are same-section, prefer fewer/closer
  // tables. See src/utils/tableSuggestion.ts. The guest's own already-held
  // table (if any) is always pinned first so it's never pushed out by the
  // display cap.
  const suggestion = useMemo(
    () =>
      activeBooking && !alreadySeated
        ? suggestTables(freeTables, partySize, ownTablenums)
        : { single: [], combos: [] },
    [activeBooking, alreadySeated, freeTables, partySize, ownTablenums],
  );

  /**
   * Re-reads everything the floor plan draws itself from: the day's bookings, the zone
   * counters, and the POS checks. Touches no selection and no loading flag, so it is safe to
   * fire under a hostess who is mid-pick — she must never watch her chosen tables vanish
   * because a timer went off.
   *
   * Failures are swallowed: a poll that can't reach the server leaves the last good picture
   * on screen, which beats an error toast every 30 seconds. The first load (below) is the one
   * that reports trouble.
   */
  const refreshFloorPlan = useCallback(async (): Promise<boolean> => {
    // Skipping is not failing: a sweep is already in flight and will write the same data, so
    // a caller waiting on this must not report an error.
    if (!linkInfo || refreshingRef.current) return true;
    refreshingRef.current = true;
    try {
      const date = activeBooking?.reservationDate?.slice(0, 10) || todayStr();
      const [todaysBookings, zoneSlots] = await Promise.all([
        // Walk every page: a table whose booking fell off the end of a single
        // page would render as free, which is exactly the failure this screen
        // must never have.
        fetchAllPages((pageIndex, pageSize) =>
          searchBookings({ ...linkInfo, reservationDate: date, pageIndex, pageSize }),
        ),
        fetchAvailableSlots(linkInfo, todayStr()),
      ]);
      setBookings(todaysBookings.items);
      setSlots(zoneSlots);
      // POS checks open and close constantly, so re-read them with the bookings
      // rather than only on mount.
      await reloadPosOpenTables();
      setLastUpdatedAt(new Date());
      return true;
    } catch {
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }, [linkInfo, activeBooking, reloadPosOpenTables]);

  // Land on the booking's own zone when arriving from check-in. Kept apart from the data
  // refresh: re-running it on every poll would yank the hostess back out of whatever zone
  // she had opened.
  useEffect(() => {
    if (activeBooking?.zoneID) setSelectedZoneID(activeBooking.zoneID);
  }, [activeBooking?.zoneID]);

  /**
   * The first zone that actually has tables — stores really do configure zones
   * with no sections linked to them, and opening onto one of those would answer
   * "show me the floor" with "Không có bàn trong khu vực này".
   */
  const firstZoneWithTables = useMemo(() => {
    const secNumsWithTables = new Set(allTables.map((tb) => tb.secnum));
    const zoneHasTables = (zoneID: number) =>
      zoneSectionLinks.some((l) => l.zoneID === zoneID && secNumsWithTables.has(l.secNum));
    return zones.find((z) => zoneHasTables(z.zoneID))?.zoneID ?? zones[0]?.zoneID ?? null;
  }, [zones, zoneSectionLinks, allTables]);

  // Opened from the nav rather than from a booking: show a real floor plan
  // instead of an empty "pick a zone" panel. Browsing the floor is the whole
  // reason for coming here, and the zone rail stays one tap from any other.
  useEffect(() => {
    if (activeBooking?.zoneID != null || firstZoneWithTables == null) return;
    setSelectedZoneID((prev) => prev ?? firstZoneWithTables);
  }, [activeBooking?.zoneID, firstZoneWithTables]);

  /**
   * The zone whose opening load has already run.
   *
   * Opening a zone blanks the floor plan to a spinner and rewrites the selection, which is
   * right the first time and wrong every time after: this callback is rebuilt whenever any
   * of its inputs changes identity, and the effect below re-runs with it. Without this
   * guard a re-run for the zone already on screen threw the grid away mid-pick and dropped
   * the tables the hostess had chosen. Data still refreshes on every run — silently,
   * underneath her — but only a genuine zone change resets the UI.
   */
  const loadedZoneRef = useRef<number | null>(null);

  const loadOccupiedTables = useCallback(
    async (zoneID: number) => {
      if (!linkInfo) return;
      const isNewZone = loadedZoneRef.current !== zoneID;
      loadedZoneRef.current = zoneID;

      if (isNewZone) {
        setLoading(true);
        // If this booking already has tables assigned (e.g. re-opened from
        // check-in), pre-select them instead of making the hostess re-pick —
        // regardless of time window, since we're continuing this same booking.
        // Nothing is being picked for a guest who is already at a table — pre-selecting
        // would only dress the grid up as a seating flow that this screen refuses to run.
        if (activeBooking?.zoneID === zoneID && !alreadySeated) {
          // …except a table the store has since taken out of service: re-selecting
          // it would put a `canreserve = 0` table straight back into the Seat
          // payload, past a grid that already renders it as unavailable. Same for a
          // held table outside this zone's sections: the grid draws only the zone, so
          // that pick would be sent without the hostess ever seeing it (SPEC-06 R-11).
          const zoneSecNums = new Set(zoneSectionLinks.filter((l) => l.zoneID === zoneID).map((l) => l.secNum));
          const activeTablenums = heldTablenums(activeBooking)
            .filter((n) => isTableReservable(tableByNum.get(n)))
            .filter((n) => {
              const table = tableByNum.get(n);
              return table != null && zoneSecNums.has(table.secnum);
            });
          setSelectedTablenums(new Set(activeTablenums));
          // Already sitting across several tables — keep merging on so the
          // pre-selection survives the first tap.
          if (activeTablenums.length > 1) setMergeMode(true);
        } else {
          setSelectedTablenums(new Set());
        }
      }

      const ok = await refreshFloorPlan();
      // Only the load the hostess asked for reports trouble. A re-run for the zone already
      // on screen is a background sweep like the 30-second poll, and those keep the last
      // good picture rather than throwing an alert over the floor plan.
      if (isNewZone && !ok) toast.error(t('common.error'));
      if (isNewZone) setLoading(false);
    },
    [linkInfo, toast, t, activeBooking, alreadySeated, refreshFloorPlan, tableByNum, zoneSectionLinks],
  );

  useEffect(() => {
    if (selectedZoneID != null) loadOccupiedTables(selectedZoneID);
  }, [selectedZoneID, loadOccupiedTables]);

  /**
   * Keep the plan honest while it sits open.
   *
   * Several hostesses work the same floor and the POS opens checks the app never hears
   * about, so a screen left open for ten minutes is describing a restaurant that no longer
   * exists — and seating decisions get made from it. Polls pause while the tab is hidden
   * (a tablet in someone's hand across the room is not worth the requests) and fire once
   * immediately on return, so coming back never means staring at a stale grid.
   */
  useEffect(() => {
    if (selectedZoneID == null) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refreshFloorPlan();
    };

    const timer = setInterval(refreshIfVisible, FLOOR_PLAN_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [selectedZoneID, refreshFloorPlan]);

  // A check can open on a table this booking already holds — pre-selected on
  // load — and Seat would then refuse it. Drop it from the selection as soon as
  // the POS says so, instead of leaving a picked table that can't be submitted.
  useEffect(() => {
    setSelectedTablenums((prev) => {
      const kept = Array.from(prev).filter((n) => !posOpenTablenums.has(n));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [posOpenTablenums]);

  // Same for a table the store retires (`canreserve = 0`) while the screen is
  // open — the store config reloads, the grid greys the table out, and a stale
  // pick must not survive that to be submitted.
  useEffect(() => {
    setSelectedTablenums((prev) => {
      const kept = Array.from(prev).filter((n) => isTableReservable(tableByNum.get(n)));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [tableByNum]);

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
      if (next.has(table.tablenum)) {
        next.delete(table.tablenum);
        return next;
      }
      if (!mergeMode) return new Set([table.tablenum]);
      next.add(table.tablenum);
      return next;
    });
  };

  // Turning merging off leaves the first table picked, so the hostess doesn't
  // silently submit a combination she just said she didn't want.
  const changeMergeMode = (on: boolean) => {
    setMergeMode(on);
    if (!on) setSelectedTablenums((prev) => (prev.size > 1 ? new Set([Array.from(prev)[0]]) : prev));
  };

  const viewBooking = (globalIds: number[]) => {
    if (globalIds.length <= 1) {
      setDetailBooking(bookingsByGlobalId.get(globalIds[0]) ?? null);
    } else {
      setPickerGlobalIds(globalIds);
    }
  };

  /**
   * Hand a guest's pre-ordered food to the kitchen (§5.10).
   *
   * Only ever called once the booking is Seated *with a table*: Release reads
   * ReserSeatTables to learn which POS bill the dishes join, and answers 409 until that row
   * exists. Calling it twice is harmless — an order that already left `scheduled` comes back
   * under `skipped` instead of being cooked again.
   *
   * `needs-review` means the outcome went into the result panel (warnings, skipped orders,
   * or nothing released) and the caller should stay put until it is dismissed.
   *
   * `expectOrders` is false when nobody could say whether the guest pre-ordered at all (the
   * list and the per-booking read both failed). Release then runs as a check, and an empty
   * answer — nothing sent, nothing skipped — is the quiet "there was no food" it exists to
   * confirm, not a "these were already released" panel.
   */
  const releasePreOrders = async (
    target: PreOrderTarget,
    expectOrders = true,
  ): Promise<'released' | 'needs-review' | 'failed'> => {
    setReleasing(true);
    try {
      const result = await releaseReservationOrders(target.reservationNo, target.scope);
      preOrdersChanged();
      setReleaseRetry(null);
      const nothingAtAll = result.released === 0 && result.skipped === 0 && result.warnings.length === 0;
      if (!expectOrders && nothingAtAll) return 'released';
      if (result.warnings.length > 0 || result.skipped > 0 || result.released === 0) {
        setReleaseResult(result);
        return 'needs-review';
      }
      toast.success(t('preorder.releaseSuccess', { count: result.released }));
      return 'released';
    } catch (err) {
      // The seating itself already went through — say what failed rather than implying it
      // all rolled back. The retry banner keeps the food from being forgotten, which is the
      // one outcome the guest actually feels. The server's own reason, not axios' "Request
      // failed with status code 409": "booking not Seated yet" and "no table" are both
      // things the hostess can act on.
      toast.error(apiErrorMessage(err, t('preorder.releaseError')));
      setReleaseRetry({ target, expectOrders });
      return 'failed';
    } finally {
      setReleasing(false);
    }
  };

  /**
   * Is there food waiting for this booking's Release — asked of the booking itself before
   * anything decides to skip it (SPEC-06 R-14).
   *
   * The station-wide list behind `activePreOrders` only ever proves "yes". An empty answer
   * from it can be a failed read, a list that hit its page ceiling, an order that changed
   * status mid-walk, or a pre-order filed under another station than the link (R-10) — and
   * treating any of those as "no pre-order" is how food silently never reaches the kitchen.
   * `unknown` is not `none`: the caller still releases, which is harmless on a booking that
   * has nothing.
   */
  const pendingPreOrdersOf = async (target: PreOrderTarget): Promise<'some' | 'none' | 'unknown'> => {
    if (activePreOrders.length > 0) return 'some';
    try {
      return (await hasPreOrdersForReservation(target.reservationNo, target.scope)) ? 'some' : 'none';
    } catch {
      return 'unknown';
    }
  };

  /**
   * The guest turned up but no longer wants what they ordered ahead (§5.10 Cancel).
   *
   * Only works while the food is still parked — the endpoint acts on `scheduled` /
   * `awaiting_payment` / `payment_failed`, exactly the orders this screen can see. Once
   * Release has run the dishes belong to the POS bill and calling them off is a POS/Ops job,
   * which is why the button disappears with the orders themselves.
   *
   * Cancels every pre-order of the booking at once (the endpoint has no per-order form) and
   * leaves the booking untouched — the guest still has their table, just no pre-ordered food.
   */
  const cancelPreOrders = async (target: PreOrderTarget) => {
    setCancelling(true);
    try {
      const result = await cancelReservationOrders(target.reservationNo, 'GUEST_CANCELLED_AT_CHECKIN', target.scope);
      preOrdersChanged();
      // Anything already released is out of reach here, so 0 is a real answer, not a no-op.
      if (result.cancelled > 0) toast.success(t('preorder.cancelSuccess', { count: result.cancelled }));
      else toast.info(t('preorder.cancelNothing'));
      // A pre-order left uncancelled because it belongs to another station (SPEC-06 R-10) —
      // surfaced the same way Release does, so it is never mistaken for "all of it is off".
      if (result.warnings.length > 0) toast.error(result.warnings.join(' '));
      setReleaseRetry(null);
    } catch (err) {
      // The server's reason rather than axios' status-code sentence (same as Release above).
      toast.error(apiErrorMessage(err, t('preorder.cancelError')));
    } finally {
      setCancelling(false);
    }
  };

  /** Second attempt after a failed Release; the guest is already seated, so only the food is at stake. */
  const retryRelease = async () => {
    if (!releaseRetry) return;
    const outcome = await releasePreOrders(releaseRetry.target, releaseRetry.expectOrders);
    if (outcome === 'released') navigate('../seating', { replace: true });
    else if (outcome === 'needs-review') setReturnAfterRelease(true);
  };

  /**
   * A seating the server refused. `TABLE_NOT_IN_RESTAURANT` is final (SPEC-06 §4.10): the
   * refused table is taken out of this screen for good — sending it again only earns the
   * same 403 — and the hostess is told why in words that point at the fix. Anything else
   * keeps the server's own sentence.
   */
  const reportSeatError = (err: unknown, pickedTablenums: number[]) => {
    const refusal = tableRefusalOf(err);
    if (!refusal) {
      toast.error(apiErrorMessage(err, t('seating.seatError')));
      return;
    }
    toast.error(tableRefusalMessage(refusal, t, pickedTablenums));
    // An unassigned station refuses every table alike; there is no one table to strike out.
    if (refusal.reason === 'STATION_UNASSIGNED') return;
    const refusedNum = refusal.tableNum;
    if (refusedNum != null) {
      setRefusedTablenums((prev) => new Set([...prev, refusedNum]));
    } else {
      // The server did not say which of the picked tables it refused — clear the pick
      // rather than strike out a table that may have been fine.
      setSelectedTablenums(new Set());
    }
  };

  /** The seating already succeeded — the panel was only holding the screen so its notes get read. */
  const closeReleaseResult = () => {
    setReleaseResult(null);
    if (returnAfterRelease) {
      setReturnAfterRelease(false);
      navigate('../seating', { replace: true });
    }
  };

  const seatToZone = async () => {
    if (!activeBooking || selectedZoneID == null || !linkInfo || alreadySeated) return;
    try {
      await updateBooking({
        globalId: activeBooking.globalId,
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        status: BookingStatus.Seated,
        zoneID: selectedZoneID,
        actualQty,
        userSeat: user?.userId,
      });
      setJustSeatedTables([]);
      toast.success(t('seating.seatSuccess'));
      // Seating to a zone assigns no table, and without one the kitchen has no bill to send
      // the food to. Say so instead of letting the pre-order sit there unnoticed — including
      // when nobody could tell whether there is one (R-14).
      const target = targetOf(activeBooking);
      const pending = target ? await pendingPreOrdersOf(target) : 'none';
      if (pending === 'some') toast.info(t('preorder.needsTableToRelease'));
      else if (pending === 'unknown') toast.info(t('preorder.unknownNeedsTable'));
      navigate('../seating', { replace: true });
    } catch (err) {
      // The backend refuses for reasons the hostess can act on — zone full, booking
      // already closed elsewhere — so show what it said, not "Đã xảy ra lỗi".
      toast.error(apiErrorMessage(err, t('seating.seatError')));
    }
  };

  const seatToTables = async () => {
    if (!activeBooking || selectedZoneID == null || selectedTablenums.size === 0 || !linkInfo) return;
    // The guest is already at a table; re-running this would lay a second set of seat
    // rows over the first. The buttons are gone in this state — this is the backstop.
    if (alreadySeated) return;
    // Only this zone's tables are on the grid, so only they may be in the payload. Every way
    // of picking (the grid, the suggestions, the pre-selection) already keeps to the zone;
    // this is the backstop for a pick that slipped past them (SPEC-06 R-11).
    const zoneTablenums = new Set(tables.map((tb) => tb.tablenum));
    const outsideZone = Array.from(selectedTablenums).filter((n) => !zoneTablenums.has(n));
    if (outsideZone.length > 0) {
      toast.error(t('seating.outsideZoneBlocked', { tables: outsideZone.map((n) => `#${n}`).join(', ') }));
      setSelectedTablenums((prev) => new Set(Array.from(prev).filter((n) => zoneTablenums.has(n))));
      return;
    }
    // Last gate on the store's own "this table takes no reservations" flag. The
    // grid already refuses to select such a table, so reaching here means the
    // setup changed under an open screen or the pick came in pre-selected —
    // either way the payload must not carry it.
    const notReservable = Array.from(selectedTablenums).filter((n) => !isTableReservable(tableByNum.get(n)));
    if (notReservable.length > 0) {
      toast.error(t('seating.unavailableBlocked', { tables: notReservable.map((n) => `#${n}`).join(', ') }));
      setSelectedTablenums((prev) => new Set(Array.from(prev).filter((n) => isTableReservable(tableByNum.get(n)))));
      return;
    }
    // Re-read the POS right before writing: a check can be opened on the chosen
    // table between loading the floor plan and tapping Seat, and the grid's
    // colours would still say the table is free. Falls back to what was already
    // loaded if the POS can't be reached. Always checked: seating is immediate, so
    // an open check is a hard conflict no matter what time the booking is for.
    const posNow = (await reloadPosOpenTables()) ?? posOpenTablenums;
    const conflicts = Array.from(selectedTablenums).filter((n) => posNow.has(n));
    if (conflicts.length > 0) {
      toast.error(t('seating.posOpenBlocked', { tables: conflicts.map((n) => `#${n}`).join(', ') }));
      setSelectedTablenums((prev) => new Set(Array.from(prev).filter((n) => !posNow.has(n))));
      return;
    }
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
        actualQty,
        userSeat: user?.userId,
        seatTables,
      });
      // Before the Release branch below, which can keep the hostess on this screen.
      setJustSeatedTables(seatTables.map((st) => st.tableNum));
      toast.success(t('seating.seatSuccess'));
    } catch (err) {
      reportSeatError(err, Array.from(selectedTablenums));
      return;
    }

    // Now — and only now — the food this guest ordered days ago has a real table and bill
    // to flow into. Nobody else calls Release, so a skip here means it never gets cooked:
    // skipped only on a definite "no pre-order", never on a list that could not answer (R-14).
    const target = targetOf(activeBooking);
    const pending = target ? await pendingPreOrdersOf(target) : 'none';
    if (target && pending !== 'none') {
      const outcome = await releasePreOrders(target, pending === 'some');
      // Either the result panel owns what happens next, or Release failed and the hostess
      // stays here to retry it from the action bar.
      if (outcome === 'needs-review') {
        setReturnAfterRelease(true);
        return;
      }
      if (outcome === 'failed') return;
    }
    navigate('../seating', { replace: true });
  };

  /**
   * What the pinned action bar has to carry. Kept as flags rather than inline conditions
   * so the bar itself is never rendered as an empty strip across the foot of the screen
   * (browsing the floor plan with no booking, or looking at a guest already seated).
   */
  const showCapacityWarning = !!activeBooking && selectedTablenums.size > 0 && selectedCapacity < actualQty;
  const showExcessWarning = !!activeBooking && isExcessCapacity(selectedCapacity, actualQty);
  const canSeatNow = !!activeBooking && !alreadySeated;
  const showActionBar = canSeatNow || !!releaseRetry || showCapacityWarning || showExcessWarning;

  // A guest already at a table can still be sitting on un-released food: the guide's known
  // gap is exactly the hostess who seats someone and never calls Release. Offer the button
  // from the booking card whenever Release's own preconditions are already satisfied.
  // Nothing about the orders themselves is checked here: the panel draws no buttons when it
  // has no orders, and it now reads them per booking, so gating on this screen's store-wide
  // list would hide Release for exactly the order that list happened to miss.
  const detailReleasable =
    !!detailBooking &&
    detailBooking.status === BookingStatus.Seated &&
    (detailBooking.seatTables ?? []).some((st) => (st.reserTable ?? st.tableNum) != null);
  const detailTarget = targetOf(detailBooking);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col lg:h-full lg:min-h-0">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <button
          onClick={() => navigate('../checkin')}
          aria-label={t('common.back')}
          className="chip-btn btn-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <ArrowLeftIcon size={17} />
        </button>
        <h1 className="text-lg font-bold text-ink">{t('seating.title')}</h1>
        {/* Auto-refresh is worthless if nobody can tell whether it is still running — say
            out loud how old the picture is, and let a tap force a sweep now. */}
        <button
          onClick={() => void refreshFloorPlan()}
          title={t('seating.refreshNow')}
          className="chip-btn btn-secondary ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted"
        >
          <RefreshIcon size={14} />
          {lastUpdatedAt
            ? t('seating.updatedAt', { time: formatVnHHmm(lastUpdatedAt) })
            : t('seating.refreshNow')}
        </button>
      </div>

      <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-3 lg:overflow-visible">
        {/* A horizontal strip on narrow screens and a rail on wide ones: stacked
            full-width zone buttons used to push the floor plan itself off a
            tablet held in portrait. */}
        <div className="glass-card shrink-0 p-2 lg:w-52 lg:overflow-y-auto lg:p-3">
          <h2 className="mb-1.5 hidden text-[11px] font-semibold uppercase tracking-wide text-faint lg:block">
            {t('seating.zones')}
          </h2>
          <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {zones.map((z) => {
              const slot = resolveZoneSlot(z, slots);
              const active = selectedZoneID === z.zoneID;
              return (
                <button
                  key={z.zoneID}
                  onClick={() => setSelectedZoneID(z.zoneID)}
                  className={`chip-btn min-w-0 flex-1 rounded-lg px-3 py-1.5 text-left transition lg:w-full lg:flex-none ${
                    active ? 'pill-on' : 'pill'
                  }`}
                >
                  <p className="whitespace-nowrap text-sm font-semibold">{z.zoneName}</p>
                  <p className={`text-[11px] ${active ? 'text-white/80' : 'opacity-75'}`}>
                    {t('seating.free')}: {slot.free}/{slot.total}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card flex flex-col p-3 lg:min-h-0 lg:flex-1">
          {activeBooking && (
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <span className="font-semibold">{activeBooking.bookingName}</span>
                <span className="text-muted">
                  {activeBooking.bookingPhone} · {partySize}p
                </span>
                <PreOrderBadge count={activePreOrders.length} />
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {/* Head count is what gets written with the seat rows — meaningless once
                    the guest is already sitting, and this screen writes nothing then. */}
                {!alreadySeated && (
                  <>
                    <label htmlFor="actual-qty" className="text-xs text-muted">
                      {t('seating.actualQty')}
                    </label>
                    <input
                      id="actual-qty"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={actualQtyInput}
                      onChange={(e) => setActualQtyInput(e.target.value)}
                      onBlur={() => setActualQtyInput(String(actualQty))}
                      title={t('seating.actualQtyHint')}
                      className="field w-14 px-1.5 py-1 text-center text-sm font-semibold"
                    />
                  </>
                )}
                <button
                  onClick={() => setDetailBooking(activeBooking)}
                  className="chip-btn btn-secondary shrink-0 rounded-lg px-3 py-1 text-xs font-semibold"
                >
                  {t('seating.viewBooking')}
                </button>
              </div>
            </div>
          )}
          {/* Only reachable when the store has no zones configured at all — with
              any zone present the effect above opens one. */}
          {selectedZoneID == null && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="icon-tile h-12 w-12">
                <LayoutIcon size={22} />
              </span>
              <p className="text-sm text-muted">{t('seating.selectZone')}</p>
            </div>
          )}

          {selectedZoneID != null && (
            <>
              {(() => {
                const zone = zones.find((z) => z.zoneID === selectedZoneID);
                if (!zone) return null;
                const slot = resolveZoneSlot(zone, slots);
                return (
                  <div className="mb-2 grid shrink-0 grid-cols-4 gap-1.5 text-center">
                    <div className="stat-tile">
                      <p className="text-[10px] uppercase tracking-wide text-muted">{t('seating.total')}</p>
                      <p className="text-base font-bold text-ink">{slot.total}</p>
                    </div>
                    <div className="stat-tile">
                      <p className="text-[10px] uppercase tracking-wide text-muted">{t('seating.used')}</p>
                      <p className="text-base font-bold text-bad">{slot.used}</p>
                    </div>
                    <div className="stat-tile">
                      <p className="text-[10px] uppercase tracking-wide text-muted">{t('seating.free')}</p>
                      <p className="text-base font-bold text-ok">{slot.free}</p>
                    </div>
                    <div className="stat-tile">
                      <p className="text-[10px] uppercase tracking-wide text-muted">{t('seating.seated')}</p>
                      <p className="text-base font-bold text-ink">{seatedPartySize}</p>
                    </div>
                  </div>
                );
              })()}

              {loading ? (
                <Spinner label={t('common.loading')} />
              ) : (
                <>
                  {/* Replaces the "pick a table" hint outright: nothing here is pickable
                      for this guest, so the screen has to say what it is showing instead. */}
                  {alreadySeated ? (
                    <p className="note note-ok mb-2 flex shrink-0 items-center gap-1.5 font-medium">
                      <ArmchairIcon size={15} className="shrink-0" />
                      {seatedTablenums.length > 0
                        ? t('seating.alreadySeatedAt', { tables: seatedTablenums.map((n) => `#${n}`).join(', ') })
                        : t('seating.alreadySeatedNoTable')}
                    </p>
                  ) : (
                    <p className="mb-1.5 shrink-0 text-xs text-muted">{t('seating.selectTableHint')}</p>
                  )}
                  {posOpenFailed && (
                    <p className="note note-warn mb-2 flex shrink-0 items-start gap-1.5">
                      <AlertIcon size={14} className="mt-px shrink-0" />
                      {t('seating.posUnavailable')}
                    </p>
                  )}
                  {/* The station's pre-order list could not be read, so a missing badge here
                      proves nothing. Said out loud; seating still asks the booking itself
                      before it decides there is no food to release (R-14). */}
                  {activeBooking && preOrdersFailed && (
                    <p className="note note-warn mb-2 flex shrink-0 items-start gap-1.5">
                      <AlertIcon size={14} className="mt-px shrink-0" />
                      {t('preorder.listFailed')}
                    </p>
                  )}
                  {/* Her guest's own table is greyed out and was dropped from the
                      pre-selection — say why, or it reads as the app losing the pick. */}
                  {activeBooking && ownUnavailableTablenums.length > 0 && (
                    <p className="note note-warn mb-2 flex shrink-0 items-start gap-1.5">
                      <AlertIcon size={14} className="mt-px shrink-0" />
                      {t('seating.ownTableUnavailable', {
                        tables: ownUnavailableTablenums.map((n) => `#${n}`).join(', '),
                      })}
                    </p>
                  )}
                  {/* Same for a held table that is not in this zone at all — it cannot be
                      shown on this grid, so it is not picked for her either. */}
                  {ownOutsideZoneTablenums.length > 0 && (
                    <p className="note note-warn mb-2 flex shrink-0 items-start gap-1.5">
                      <AlertIcon size={14} className="mt-px shrink-0" />
                      {t('seating.ownTableOutsideZone', {
                        tables: ownOutsideZoneTablenums.map((n) => `#${n}`).join(', '),
                      })}
                    </p>
                  )}
                  {/* Above the grid, not below it. A zone here runs to hundreds of
                      tables, so a legend after them is only reachable by scrolling
                      past the entire floor — i.e. never read by the person who
                      needs it while looking at the colours. */}
                  <div className="mb-2 shrink-0 border-b border-line-soft pb-2">
                    <TableLegend />
                  </div>
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
                      mergeMode={mergeMode}
                      onMergeModeChange={changeMergeMode}
                      readOnly={!activeBooking || alreadySeated}
                      filterBarExtra={
                        activeBooking && (suggestion.single.length > 0 || suggestion.combos.length > 0) ? (
                          <button
                            onClick={() => setSuggestionsOpen(true)}
                            className="chip-btn flex items-center gap-1.5 rounded-full border border-[var(--ok-line)] bg-[var(--ok-bg)] px-3 text-xs font-semibold text-ok hover:brightness-105"
                          >
                            <StarIcon size={13} />
                            {t('seating.suggestions')}
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-current/20 px-1 text-[10px]">
                              {suggestion.single.length || suggestion.combos.length}
                            </span>
                          </button>
                        ) : undefined
                      }
                    />
                  </div>

                  {/* Pinned to the foot of the viewport, not left at the end of the
                      document. Below `lg` the page itself is what scrolls, so in a zone
                      of two hundred tables "Xếp vào bàn" sat an entire floor plan below
                      the fold and every single guest cost a scroll to the bottom of the
                      page and back. The warnings ride along with it: the reason a
                      seating is a bad idea has to be readable from the button that
                      commits it, not several screens above. */}
                  {showActionBar && (
                    <div className="action-bar sticky bottom-2 z-20 mt-2 shrink-0 space-y-2 p-2">
                      {showCapacityWarning && (
                        <p className="note note-warn flex items-start gap-1.5">
                          <AlertIcon size={14} className="mt-px shrink-0" />
                          {t('seating.capacityWarning', { selected: selectedCapacity, party: actualQty })}
                        </p>
                      )}

                      {releaseRetry && (
                        <div className="note note-bad flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <AlertIcon size={14} className="shrink-0" />
                            {/* Not "their food has not reached the kitchen" when nobody knows
                                whether there is any food — that sends the floor hunting. */}
                            {releaseRetry.expectOrders
                              ? t('preorder.releaseRetryHint')
                              : t('preorder.releaseRetryUnknownHint')}
                          </span>
                          <button
                            onClick={retryRelease}
                            disabled={releasing}
                            className="chip-btn btn-secondary shrink-0 rounded-lg px-3 text-xs font-semibold"
                          >
                            {releasing ? t('preorder.releasing') : t('preorder.retryRelease')}
                          </button>
                        </div>
                      )}

                      {showExcessWarning && (
                        <p className="note note-warn flex items-start gap-1.5">
                          <AlertIcon size={14} className="mt-px shrink-0" />
                          {t('seating.excessCapacityWarning', {
                            tables: selectedTablenums.size,
                            selected: selectedCapacity,
                            party: actualQty,
                            excess: selectedCapacity - actualQty,
                          })}
                        </p>
                      )}

                      {/* Gone entirely, not disabled: a greyed-out "Xếp vào bàn" reads as
                          "try again later" on a guest who is already seated. */}
                      {canSeatNow && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={seatToZone}
                            disabled={selectedTablenums.size > 0}
                            className="touch-btn btn-primary flex-1 rounded-xl px-4 text-sm font-semibold"
                          >
                            {t('seating.seatToZone')}
                          </button>
                          <button
                            onClick={seatToTables}
                            disabled={selectedTablenums.size === 0}
                            className="touch-btn btn-success flex-[2] rounded-xl px-4 text-sm font-semibold"
                          >
                            {t('seating.seatToTable')}
                            {selectedTablenums.size > 0 &&
                              ` ${Array.from(selectedTablenums)
                                .map((n) => `#${n}`)
                                .join(' + ')}`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {suggestionsOpen && (
        <div
          className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center p-4"
          onClick={() => setSuggestionsOpen(false)}
        >
          <div
            className="glass-card modal-panel flex max-h-[85vh] w-full max-w-sm flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 shrink-0 text-center text-lg font-semibold text-ink">{t('seating.suggestions')}</h3>
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
                      className={`chip-btn inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isSelected
                          ? 'pill-on'
                          : isOwn
                            ? 'bg-[var(--own-bg)] text-own hover:brightness-105'
                            : 'bg-[var(--ok-bg)] text-ok hover:brightness-105'
                      }`}
                    >
                      {isOwn && <StarIcon size={12} />}#{tb.tablenum} ({tb.maxnumcust ?? 0} {t('seating.seats')})
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
                        // A combo *is* a merge — switch the mode on with it, or
                        // the next tap on a table would collapse it to one.
                        if (nums.length > 1) setMergeMode(true);
                        setSelectedTablenums(new Set(nums));
                        setSuggestionsOpen(false);
                        scrollToTable(nums[0]);
                      }}
                      className={`chip-btn flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1 text-xs font-semibold ${
                        isSelected
                          ? 'pill-on'
                          : 'bg-[var(--ok-bg)] text-ok hover:brightness-105'
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
          className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center p-4"
          onClick={() => setPickerGlobalIds(null)}
        >
          <div className="glass-card modal-panel w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-ink">{t('seating.multipleBookings')}</h3>
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
                    className="touch-btn w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-left transition hover:border-brand/40 hover:bg-surface-hover"
                  >
                    <p className="font-semibold text-ink">
                      {b.bookingName} · {b.partySize}p
                    </p>
                    <p className="text-xs text-muted">
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

      {releaseResult && (
        <div
          className="modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center p-4"
          onClick={closeReleaseResult}
        >
          <div className="glass-card modal-panel w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ink">{t('preorder.releaseResultTitle')}</h3>
            <p className="mt-2 text-sm text-muted">
              {t('preorder.releaseResultSummary', {
                released: releaseResult.released,
                skipped: releaseResult.skipped,
              })}
              {releaseResult.tableNum != null && ` · #${releaseResult.tableNum}`}
            </p>
            {releaseResult.released === 0 && releaseResult.skipped === 0 && (
              <p className="mt-2 text-sm text-muted">{t('preorder.releaseNothing')}</p>
            )}
            {releaseResult.warnings.length > 0 && (
              <ul className="note note-warn mt-3 space-y-1.5 p-3">
                {releaseResult.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-1.5">
                    <AlertIcon size={13} className="mt-px shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={closeReleaseResult}
              className="chip-btn btn-secondary mx-auto mt-4 w-32 rounded-xl text-sm font-medium"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title={t('preorder.confirmCancelTitle')}
        message={t('preorder.confirmCancelMsg')}
        confirmLabel={t('preorder.cancel')}
        cancelLabel={t('common.close')}
        danger
        onConfirm={() => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (target) void cancelPreOrders(target);
        }}
        onCancel={() => setCancelTarget(null)}
      />

      <BookingDetailModal
        booking={detailBooking}
        preOrders={preOrdersFor(detailBooking?.reservationNo)}
        preOrdersRefreshTick={preOrderTick}
        onPreOrdersChanged={preOrdersChanged}
        onRelease={detailReleasable && detailTarget ? () => void releasePreOrders(detailTarget) : undefined}
        releasing={releasing}
        // No extra gate: the panel only ever lists orders that are still callable off, so if
        // the hostess can see them she can cancel them.
        onCancelPreOrders={detailTarget ? () => setCancelTarget(detailTarget) : undefined}
        cancellingPreOrders={cancelling}
        onClose={() => setDetailBooking(null)}
      />
    </div>
  );
}
