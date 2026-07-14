import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useToast } from '../components/ToastProvider';
import { Spinner } from '../components/Spinner';
import { TableGrid, type TableExtraInfo } from '../components/TableGrid';
import { TableLegend } from '../components/TableLegend';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { fetchAvailableSlots } from '../api/availableSlots';
import { fetchSeatTables, assignSeatTables, releaseSeatTables } from '../api/tables';
import { searchBookings, updateBooking } from '../api/bookings';
import { todayStr } from '../api/mockData';
import { getEffectiveStatus } from '../utils/bookingStatus';
import { BookingStatus, type AvailableSlot, type ReservationBooking, type ReservationZone, type TableSetup } from '../types';

/** When AvailableSlots has no row for a zone, treat it as fully free instead of hiding its stats. */
function resolveZoneSlot(zone: ReservationZone, slots: AvailableSlot[], allTables: TableSetup[]): AvailableSlot {
  const found = slots.find((s) => s.zoneId === zone.zoneId);
  if (found) return found;
  const total = zone.capacity ?? allTables.filter((tb) => tb.zoneId === zone.zoneId).length;
  return { zoneId: zone.zoneId, zoneName: zone.zoneName, total, used: 0, free: total, seated: 0 };
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

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [tableInfo, setTableInfo] = useState<Map<number, TableExtraInfo>>(new Map()); // tableId -> {state, reservationId, merged}
  const [bookingsByReservationId, setBookingsByReservationId] = useState<Map<number, ReservationBooking>>(new Map());
  const [detailBooking, setDetailBooking] = useState<ReservationBooking | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [closeTarget, setCloseTarget] = useState<number | null>(null);
  const partySize = activeBooking?.numOfGuest ?? 1;

  const tables = useMemo(
    () => (selectedZoneId == null ? [] : allTables.filter((tb) => tb.zoneId === selectedZoneId)),
    [allTables, selectedZoneId],
  );

  const refreshOverview = useCallback(async () => {
    if (!linkInfo) return;
    const s = await fetchAvailableSlots(linkInfo, todayStr());
    setSlots(s);
    if (activeBooking?.zoneId) setSelectedZoneId(activeBooking.zoneId);
  }, [linkInfo, activeBooking]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  const loadOccupiedTables = useCallback(
    async (zoneId: number) => {
      if (!linkInfo) return;
      setLoading(true);
      try {
        const [seats, todaysBookings] = await Promise.all([
          fetchSeatTables(linkInfo, todayStr()),
          searchBookings({ ...linkInfo, reservationDate: todayStr() }),
        ]);
        // ReserSeatTables references bookings by reservationNo and tables by
        // their number (tablenum) — not by our internal reservationId/tableId
        // primary keys — so both lookups below match on those business keys.
        const bookingByReservationNo = new Map(todaysBookings.items.map((b) => [b.reservationNo, b]));
        const tableByNumber = new Map(allTables.map((tb) => [tb.tableNumber, tb]));
        setBookingsByReservationId(new Map(todaysBookings.items.map((b) => [b.reservationId, b])));

        // A booking that's Cancel/NoShow/Close no longer occupies its table —
        // a lingering seat record for one shouldn't block the table.
        const TERMINAL = new Set<number>([BookingStatus.Cancel, BookingStatus.NoShow, BookingStatus.Close]);
        const activeSeats = seats.filter((seat) => {
          const booking = bookingByReservationNo.get(seat.reservationNo);
          return !booking || !TERMINAL.has(booking.status);
        });

        // Group seat records by reservation so tables sharing one booking can
        // be flagged as "merged" (matches HQ_FE_V2's floor plan behavior).
        const tableNumbersByReservation = new Map<string, string[]>();
        for (const seat of activeSeats) {
          if (!tableNumbersByReservation.has(seat.reservationNo)) tableNumbersByReservation.set(seat.reservationNo, []);
          tableNumbersByReservation.get(seat.reservationNo)!.push(seat.tableNumber);
        }

        const info = new Map<number, TableExtraInfo>();
        for (const seat of activeSeats) {
          const table = tableByNumber.get(seat.tableNumber);
          if (!table) continue; // seat row references a table outside this zone/site
          const booking = bookingByReservationNo.get(seat.reservationNo);
          const merged = (tableNumbersByReservation.get(seat.reservationNo)?.length ?? 0) > 1;
          let state: TableExtraInfo['state'];
          if (booking) {
            const effective = getEffectiveStatus(booking);
            if (effective === BookingStatus.Seated) state = 'occupied';
            else if (effective === BookingStatus.Overdue) state = 'overdue';
            else state = 'reserved';
          } else {
            state = 'reserved'; // seat record without a matching booking — assume reserved
          }
          info.set(table.tableId, { state, reservationId: booking?.reservationId, merged });
        }
        setTableInfo(info);

        // If this booking already has tables assigned (e.g. re-opened from
        // check-in), pre-select them instead of making the hostess re-pick.
        if (activeBooking?.tableNumbers?.length && activeBooking.zoneId === zoneId) {
          const zoneTables = allTables.filter((tb) => tb.zoneId === zoneId);
          const preselected = zoneTables.filter((tb) => activeBooking.tableNumbers!.includes(tb.tableNumber));
          setSelectedTableIds(new Set(preselected.map((tb) => tb.tableId)));
        } else {
          setSelectedTableIds(new Set());
        }
      } catch {
        toast.error(t('common.error'));
      } finally {
        setLoading(false);
      }
    },
    [linkInfo, toast, t, activeBooking, allTables],
  );

  useEffect(() => {
    if (selectedZoneId != null) loadOccupiedTables(selectedZoneId);
  }, [selectedZoneId, loadOccupiedTables]);

  const toggleTable = (table: TableSetup) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(table.tableId)) next.delete(table.tableId);
      else next.add(table.tableId);
      return next;
    });
  };

  const viewBooking = (reservationId: number) => {
    setDetailBooking(bookingsByReservationId.get(reservationId) ?? null);
  };

  const seatToZone = async () => {
    if (!activeBooking || selectedZoneId == null) return;
    try {
      await updateBooking(activeBooking.reservationId, { status: BookingStatus.Seated, zoneId: selectedZoneId });
      toast.success(t('seating.seatSuccess'));
      refreshOverview();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const seatToTables = async () => {
    if (!activeBooking || !linkInfo || selectedZoneId == null || selectedTableIds.size === 0) return;
    try {
      const chosen = tables.filter((tb) => selectedTableIds.has(tb.tableId));
      await updateBooking(activeBooking.reservationId, { status: BookingStatus.Seated, zoneId: selectedZoneId });
      await assignSeatTables(activeBooking.reservationNo, chosen, todayStr(), linkInfo);
      toast.success(t('seating.seatSuccess'));
      loadOccupiedTables(selectedZoneId);
      refreshOverview();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const confirmCloseTable = async () => {
    if (closeTarget == null) return;
    const booking = bookingsByReservationId.get(closeTarget);
    if (!booking) {
      setCloseTarget(null);
      return;
    }
    try {
      await updateBooking(booking.reservationId, { status: BookingStatus.Close });
      await releaseSeatTables(booking.reservationNo);
      toast.success(t('seating.closeSuccess'));
      if (selectedZoneId != null) loadOccupiedTables(selectedZoneId);
      refreshOverview();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setCloseTarget(null);
    }
  };

  const occupiedReservationHere = activeBooking
    ? undefined
    : Array.from(tableInfo.values()).find((i) => i.state === 'occupied')?.reservationId;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1200px] min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <button
          onClick={() => navigate('../checkin')}
          aria-label={t('common.back')}
          className="touch-btn btn-secondary flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-white">{t('seating.title')}</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-visible">
        <div className="glass-card shrink-0 p-4 lg:w-72 lg:overflow-y-auto">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t('seating.zones')}</h2>
          <div className="space-y-2">
            {zones.map((z) => {
              const slot = resolveZoneSlot(z, slots, allTables);
              return (
                <button
                  key={z.zoneId}
                  onClick={() => setSelectedZoneId(z.zoneId)}
                  className={`touch-btn w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedZoneId === z.zoneId
                      ? 'border-[#ef4444] bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_4px_16px_rgba(239,68,68,0.35)]'
                      : 'border-white/10 bg-slate-800/40 text-slate-200 hover:border-[#ef4444]/40 hover:bg-slate-700/50'
                  }`}
                >
                  <p className="font-semibold">{z.zoneName}</p>
                  <p className={`text-xs ${selectedZoneId === z.zoneId ? 'text-white/80' : 'text-slate-400'}`}>
                    {t('seating.free')}: {slot.free}/{slot.total}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-card flex min-h-0 flex-1 flex-col p-4">
          {activeBooking && (
            <p className="mb-3 shrink-0 text-sm text-slate-300">
              {activeBooking.bookingName} · {activeBooking.bookingPhone} · {partySize}p
            </p>
          )}
          {selectedZoneId == null && <p className="text-sm text-slate-400">{t('seating.selectZone')}</p>}

          {selectedZoneId != null && (
            <>
              {(() => {
                const zone = zones.find((z) => z.zoneId === selectedZoneId);
                if (!zone) return null;
                const slot = resolveZoneSlot(zone, slots, allTables);
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
                      <p className="text-lg font-bold text-white">{slot.seated}</p>
                    </div>
                  </div>
                );
              })()}

              {loading ? (
                <Spinner label={t('common.loading')} />
              ) : (
                <>
                  <p className="mb-2 shrink-0 text-xs text-slate-400">{t('seating.selectTableHint')}</p>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <TableGrid
                      tables={tables}
                      tableInfo={tableInfo}
                      selectedTableIds={selectedTableIds}
                      partySize={partySize}
                      onToggle={toggleTable}
                      onViewBooking={viewBooking}
                    />
                  </div>

                  <div className="mt-3 shrink-0">
                    <TableLegend />
                  </div>

                  <div className="mt-4 flex shrink-0 flex-wrap gap-3">
                    {activeBooking && (
                      <button
                        onClick={seatToZone}
                        className="touch-btn btn-primary rounded-xl px-5 font-semibold"
                      >
                        {t('seating.seatToZone')}
                      </button>
                    )}
                    {activeBooking && (
                      <button
                        onClick={seatToTables}
                        disabled={selectedTableIds.size === 0}
                        className="touch-btn btn-success rounded-xl px-5 font-semibold"
                      >
                        {t('seating.seatToTable')}
                      </button>
                    )}
                    {!activeBooking && occupiedReservationHere && (
                      <button
                        onClick={() => setCloseTarget(occupiedReservationHere)}
                        className="touch-btn btn-danger rounded-xl px-5 font-semibold"
                      >
                        {t('seating.closeTable')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={closeTarget != null}
        title={t('seating.closeTable')}
        message={t('seating.closeTable')}
        danger
        onConfirm={confirmCloseTable}
        onCancel={() => setCloseTarget(null)}
      />

      <BookingDetailModal booking={detailBooking} onClose={() => setDetailBooking(null)} />
    </div>
  );
}
