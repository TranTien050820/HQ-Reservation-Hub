import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TableSetup } from '../types';

export type TableState = 'available' | 'reserved' | 'occupied' | 'overdue' | 'unavailable';

export interface TableExtraInfo {
  state: 'reserved' | 'occupied' | 'overdue';
  /** Absent when the seat record couldn't be matched to a booking we fetched. */
  reservationId?: number;
  merged: boolean;
}

interface TableGridProps {
  tables: TableSetup[];
  /** tableId -> booking-derived info; absent means the table is plain available (or unavailable, per canReserve). */
  tableInfo: Map<number, TableExtraInfo>;
  selectedTableIds: Set<number>;
  partySize: number;
  onToggle: (table: TableSetup) => void;
  onViewBooking: (reservationId: number) => void;
}

const CAPACITY_ALL = 'all';
type StatusFilter = TableState | 'merged' | 'all';

const STATE_STYLES: Record<TableState, { card: string; label: string }> = {
  available: { card: 'border-emerald-400/30 bg-emerald-950/10 text-white hover:border-emerald-400/60 hover:bg-emerald-950/20', label: 'seating.legendAvailable' },
  reserved: { card: 'cursor-not-allowed border-sky-400/40 bg-sky-950/20 text-sky-300/80', label: 'seating.legendReserved' },
  occupied: { card: 'cursor-not-allowed border-red-500/30 bg-red-950/20 text-red-300/70', label: 'seating.legendOccupied' },
  overdue: { card: 'cursor-not-allowed border-amber-400/40 bg-amber-950/20 text-amber-300/80', label: 'seating.legendOverdue' },
  unavailable: { card: 'cursor-not-allowed border-white/5 bg-slate-800/30 text-slate-500', label: 'seating.legendUnavailable' },
};

export function TableGrid({
  tables,
  tableInfo,
  selectedTableIds,
  partySize,
  onToggle,
  onViewBooking,
}: TableGridProps) {
  const { t } = useTranslation();
  const [capacityFilter, setCapacityFilter] = useState<string>(CAPACITY_ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const capacityOptions = useMemo(
    () => Array.from(new Set(tables.map((tb) => tb.maxNumCust))).sort((a, b) => a - b),
    [tables],
  );

  const resolveState = (table: TableSetup): TableState => {
    if (!table.canReserve) return 'unavailable';
    return tableInfo.get(table.tableId)?.state ?? 'available';
  };

  const filteredTables = useMemo(() => {
    return tables.filter((tb) => {
      if (capacityFilter !== CAPACITY_ALL && tb.maxNumCust !== Number(capacityFilter)) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'merged') return tableInfo.get(tb.tableId)?.merged === true;
      return resolveState(tb) === statusFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, capacityFilter, statusFilter, tableInfo]);

  const sections = useMemo(() => {
    const groups = new Map<string, { label: string; tables: TableSetup[] }>();
    for (const tb of filteredTables) {
      const key = tb.secNum;
      const label = tb.sectionName ?? tb.secNum;
      if (!groups.has(key)) groups.set(key, { label, tables: [] });
      groups.get(key)!.tables.push(tb);
    }
    return Array.from(groups.values());
  }, [filteredTables]);

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('seating.statusAll') },
    { value: 'available', label: t('seating.legendAvailable') },
    { value: 'reserved', label: t('seating.legendReserved') },
    { value: 'occupied', label: t('seating.legendOccupied') },
    { value: 'overdue', label: t('seating.legendOverdue') },
    { value: 'merged', label: t('seating.legendMerged') },
    { value: 'unavailable', label: t('seating.legendUnavailable') },
  ];

  if (tables.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('seating.noTables')}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {capacityOptions.length > 1 && (
          <>
            <button
              onClick={() => setCapacityFilter(CAPACITY_ALL)}
              className={`touch-btn rounded-full px-3 text-xs font-medium ${
                capacityFilter === CAPACITY_ALL
                  ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              {t('seating.filterAll')}
            </button>
            {capacityOptions.map((cap) => (
              <button
                key={cap}
                onClick={() => setCapacityFilter(String(cap))}
                className={`touch-btn rounded-full px-3 text-xs font-medium ${
                  capacityFilter === String(cap)
                    ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {t('seating.filterSeats', { count: cap })}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setStatusFilter(sf.value)}
            className={`touch-btn rounded-full px-3 text-xs font-medium ${
              statusFilter === sf.value
                ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {filteredTables.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{t('seating.noTablesMatchFilter')}</p>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {section.label}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {section.tables.map((table) => {
                  const info = tableInfo.get(table.tableId);
                  const state = resolveState(table);
                  const selected = selectedTableIds.has(table.tableId);
                  const tooSmall = table.maxNumCust < partySize;
                  const isUnavailableState = state === 'reserved' || state === 'occupied' || state === 'overdue' || state === 'unavailable';
                  const disabled = !selected && (isUnavailableState || tooSmall);
                  const style = STATE_STYLES[state];

                  return (
                    <div key={table.tableId} className="relative">
                      <button
                        disabled={disabled}
                        onClick={() => onToggle(table)}
                        className={`touch-btn flex w-full flex-col items-center justify-center rounded-xl border p-4 font-semibold transition ${
                          selected
                            ? 'scale-105 border-white bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_0_20px_rgba(239,68,68,0.45)]'
                            : disabled && !isUnavailableState
                              ? 'cursor-not-allowed border-white/5 bg-slate-800/30 text-slate-500'
                              : style.card
                        }`}
                      >
                        {info?.merged && (
                          <span className="absolute left-1 top-1 rounded bg-indigo-500/20 px-1 py-0.5 text-[9px] font-bold leading-none text-indigo-300">
                            {t('seating.legendMerged')}
                          </span>
                        )}
                        <span className="text-lg">{table.tableNumber}</span>
                        <span className="text-xs opacity-80">
                          {t('seating.capacity')}: {table.minNumCust}-{table.maxNumCust}
                        </span>
                      </button>
                      {info?.reservationId != null && (
                        <button
                          onClick={() => onViewBooking(info.reservationId!)}
                          aria-label={t('seating.viewBooking')}
                          title={t('seating.viewBooking')}
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white shadow ring-1 ring-white/20 hover:bg-slate-700"
                        >
                          i
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
