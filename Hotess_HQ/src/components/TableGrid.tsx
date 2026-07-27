import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Section, TableSetup } from '../types';
import type { TableOccupancy } from '../utils/tableOccupancy';

export type TableState = 'available' | 'reserved' | 'occupied' | 'overdue' | 'unavailable';

/** Built by `buildTableOccupancy` — re-exported under the grid's own name for callers. */
export type TableExtraInfo = TableOccupancy;

interface TableGridProps {
  tables: TableSetup[];
  /** Section metadata (from linkInfo.sections) used to resolve a human-readable section name by secnum. */
  sections: Section[];
  /** tablenum -> booking-derived info; absent means the table is plain available (or unavailable, per canreserve). */
  tableInfo: Map<number, TableExtraInfo>;
  selectedTablenums: Set<number>;
  /** Tables already assigned to the booking currently being seated — shown as "held for this guest" instead of plain available/reserved, so staff don't mistake their own pre-assigned table for a free one. */
  ownTablenums?: Set<number>;
  partySize: number;
  onToggle: (table: TableSetup) => void;
  onViewBooking: (globalIds: number[]) => void;
  /** View-only mode (no active booking to seat) — tables aren't selectable, only viewable. */
  readOnly?: boolean;
  /** Extra control (e.g. a "Suggested tables" trigger) rendered on the same row as the Filters button, to save vertical space. */
  filterBarExtra?: ReactNode;
}

const CAPACITY_ALL = 'all';
type StatusFilter = TableState | 'merged' | 'all';

const STATE_STYLES: Record<TableState, { card: string; label: string; dot: string; chip: string }> = {
  available: {
    card: 'border-emerald-400/30 bg-emerald-950/10 text-white hover:border-emerald-400/60 hover:bg-emerald-950/20',
    label: 'seating.legendAvailable',
    dot: 'bg-emerald-400',
    chip: 'text-emerald-300',
  },
  reserved: {
    card: 'cursor-not-allowed border-sky-400/40 bg-sky-950/20 text-sky-300/80',
    label: 'seating.legendReserved',
    dot: 'bg-sky-400',
    chip: 'text-sky-300',
  },
  occupied: {
    card: 'cursor-not-allowed border-red-500/30 bg-red-950/20 text-red-300/70',
    label: 'seating.legendOccupied',
    dot: 'bg-red-400',
    chip: 'text-red-300',
  },
  overdue: {
    card: 'cursor-not-allowed border-amber-400/40 bg-amber-950/20 text-amber-300/80',
    label: 'seating.legendOverdue',
    dot: 'bg-amber-400',
    chip: 'text-amber-300',
  },
  unavailable: {
    card: 'cursor-not-allowed border-white/5 bg-slate-800/30 text-slate-500',
    label: 'seating.legendUnavailable',
    dot: 'bg-slate-500',
    chip: 'text-slate-400',
  },
};

export function TableGrid({
  tables,
  sections: sectionList,
  tableInfo,
  selectedTablenums,
  ownTablenums,
  partySize,
  onToggle,
  onViewBooking,
  readOnly = false,
  filterBarExtra,
}: TableGridProps) {
  const { t } = useTranslation();
  const [capacityFilter, setCapacityFilter] = useState<string>(CAPACITY_ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Lets tables smaller than the party be picked, so several can be combined. */
  const [mergeMode, setMergeMode] = useState(false);

  const capacityOptions = useMemo(
    () => Array.from(new Set(tables.map((tb) => tb.maxnumcust ?? 0))).sort((a, b) => a - b),
    [tables],
  );

  const resolveState = (table: TableSetup): TableState => {
    if (!table.canreserve) return 'unavailable';
    return tableInfo.get(table.tablenum)?.state ?? 'available';
  };

  const filteredTables = useMemo(() => {
    return tables.filter((tb) => {
      if (capacityFilter !== CAPACITY_ALL && (tb.maxnumcust ?? 0) !== Number(capacityFilter)) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'merged') return tableInfo.get(tb.tablenum)?.merged === true;
      return resolveState(tb) === statusFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, capacityFilter, statusFilter, tableInfo]);

  const sectionNameBySecnum = useMemo(
    () => new Map(sectionList.map((s) => [s.secnum, s.descript])),
    [sectionList],
  );

  const sections = useMemo(() => {
    const groups = new Map<number, { label: string; tables: TableSetup[] }>();
    for (const tb of filteredTables) {
      const key = tb.secnum;
      const label = tb.descr || sectionNameBySecnum.get(tb.secnum) || String(tb.secnum);
      if (!groups.has(key)) groups.set(key, { label, tables: [] });
      groups.get(key)!.tables.push(tb);
    }
    for (const group of groups.values()) {
      group.tables.sort((a, b) => a.tablenum - b.tablenum);
    }
    return Array.from(groups.values());
  }, [filteredTables, sectionNameBySecnum]);

  // With no free table big enough on its own, merging is the only way to seat
  // the party — turn it on rather than leaving every table greyed out. It stays
  // a normal toggle afterwards, so staff can switch back.
  const anyTableFitsAlone = useMemo(
    () => tables.some((tb) => resolveState(tb) === 'available' && (tb.maxnumcust ?? 0) >= partySize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables, tableInfo, partySize],
  );

  useEffect(() => {
    if (!anyTableFitsAlone) setMergeMode(true);
  }, [anyTableFitsAlone]);

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('seating.statusAll') },
    { value: 'available', label: t('seating.legendAvailable') },
    { value: 'reserved', label: t('seating.legendReserved') },
    { value: 'occupied', label: t('seating.legendOccupied') },
    { value: 'overdue', label: t('seating.legendOverdue') },
    { value: 'merged', label: t('seating.legendMerged') },
    { value: 'unavailable', label: t('seating.legendUnavailable') },
  ];

  const activeFilterCount = (capacityFilter !== CAPACITY_ALL ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
  const activeStatusLabel = statusFilters.find((sf) => sf.value === statusFilter)?.label;

  if (tables.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('seating.noTables')}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className={`chip-btn flex items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            activeFilterCount > 0
              ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
              : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          {t('seating.filters')}
          {activeFilterCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px]">
              {activeFilterCount}
            </span>
          )}
          <span className="text-[10px]">{filtersOpen ? '▲' : '▼'}</span>
        </button>
        {!readOnly && (
          <button
            onClick={() => setMergeMode((v) => !v)}
            aria-pressed={mergeMode}
            title={t('seating.mergeModeHint')}
            className={`chip-btn flex items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
              mergeMode
                ? 'border border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            ⇔ {t('seating.mergeMode')}
          </button>
        )}
        {filterBarExtra}
        {!filtersOpen && activeFilterCount > 0 && (
          <span className="text-xs text-slate-400">
            {capacityFilter !== CAPACITY_ALL && t('seating.filterSeats', { count: Number(capacityFilter) })}
            {capacityFilter !== CAPACITY_ALL && statusFilter !== 'all' && ' · '}
            {statusFilter !== 'all' && activeStatusLabel}
          </span>
        )}
      </div>

      {filtersOpen && (
        <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-3">
          {capacityOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCapacityFilter(CAPACITY_ALL)}
                className={`chip-btn rounded-full px-3 text-xs font-medium ${
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
                  className={`chip-btn rounded-full px-3 text-xs font-medium ${
                    capacityFilter === String(cap)
                      ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                      : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  {t('seating.filterSeats', { count: cap })}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {statusFilters.map((sf) => (
              <button
                key={sf.value}
                onClick={() => setStatusFilter(sf.value)}
                className={`chip-btn rounded-full px-3 text-xs font-medium ${
                  statusFilter === sf.value
                    ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredTables.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{t('seating.noTablesMatchFilter')}</p>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {section.label}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {section.tables.map((table) => {
                  const info = tableInfo.get(table.tablenum);
                  const state = resolveState(table);
                  const selected = selectedTablenums.has(table.tablenum);
                  // Only surface the "own table" badge when the table isn't already
                  // flagged as blocked by some OTHER booking (state undefined here
                  // just means nothing else claims it right now).
                  const isOwn = ownTablenums?.has(table.tablenum) && !state;
                  // In merge mode a table that can't hold the party alone is
                  // still a valid piece of a combined set.
                  const tooSmall = !mergeMode && (table.maxnumcust ?? 0) < partySize;
                  const isUnavailableState = state === 'reserved' || state === 'occupied' || state === 'overdue' || state === 'unavailable';
                  const disabledByFilter = !selected && (isUnavailableState || tooSmall);
                  const disabled = readOnly || disabledByFilter;
                  const style = STATE_STYLES[state];

                  return (
                    <div key={table.globalId} id={`seat-table-${table.tablenum}`} className="relative">
                      <button
                        disabled={disabled}
                        onClick={() => onToggle(table)}
                        title={info?.merged && info.mergedWith?.length ? `${t('seating.legendMerged')} #${info.mergedWith.join(', #')}` : undefined}
                        className={`touch-btn flex w-full flex-col items-start gap-1.5 rounded-xl border-2 p-3 text-left transition ${
                          selected
                            ? 'border-white bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_0_20px_rgba(239,68,68,0.45)]'
                            : isOwn
                              ? 'border-violet-400/50 bg-violet-950/20 text-violet-200'
                              : disabledByFilter && !isUnavailableState
                                ? 'cursor-not-allowed border-white/5 bg-slate-800/30 text-slate-500'
                                : `${style.card} ${readOnly ? 'cursor-default' : ''}`
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="flex items-center gap-1 text-base font-semibold">
                            {info?.merged && <span className="text-indigo-300">⇔</span>}
                            #{table.tablenum}
                          </span>
                          <span className="text-xs opacity-80">
                            👥 {table.maxnumcust ?? table.minnumcust ?? 0} {t('seating.seats')}
                          </span>
                        </div>
                        <span
                          className={`flex items-center gap-1.5 text-xs font-medium ${
                            selected ? 'text-white' : isOwn ? 'text-violet-300' : style.chip
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : isOwn ? 'bg-violet-400' : style.dot}`} />
                          {isOwn && !selected ? t('seating.ownTable') : t(style.label)}
                        </span>
                      </button>
                      {info != null && info.globalIds.length > 0 && (
                        <button
                          onClick={() => onViewBooking(info.globalIds)}
                          aria-label={t('seating.viewBooking')}
                          title={t('seating.viewBooking')}
                          className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-1 text-xs text-white shadow ring-1 ring-white/20 hover:bg-slate-700"
                        >
                          {info.globalIds.length > 1 ? info.globalIds.length : 'i'}
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
