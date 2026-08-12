import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Section, TableSetup } from '../types';
import { isTableBlocked, isTableReservable, type TableOccupancy } from '../utils/tableOccupancy';
import { ChevronDownIcon, MergeIcon, UsersIcon } from './icons';

export type TableState = 'available' | 'upcoming' | 'reserved' | 'occupied' | 'overdue' | 'posOpen' | 'unavailable';

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
  /** Merging on: several tables can be combined for one party, so multi-select and under-sized tables are allowed. Owned by the parent because it also governs how selection behaves. */
  mergeMode: boolean;
  onMergeModeChange: (mergeMode: boolean) => void;
  /** View-only mode (no active booking to seat) — tables aren't selectable, only viewable. */
  readOnly?: boolean;
  /** Extra control (e.g. a "Suggested tables" trigger) rendered on the same row as the Filters button, to save vertical space. */
  filterBarExtra?: ReactNode;
}

const CAPACITY_ALL = 'all';
type StatusFilter = TableState | 'merged' | 'all';

/**
 * The wash/ink for each state lives in index.css (`.tbl-*`) rather than in
 * Tailwind classes here: the tints that read as "a tinted table" on the dark
 * indigo turn into grey smudges on the light background, so each state needs a
 * different pair per theme — something a single class string can't express.
 * `.tbl-ink` inside the card picks up the matching text/dot colour.
 */
const STATE_STYLES: Record<TableState, { card: string; label: string }> = {
  available: { card: 'tbl-available', label: 'seating.legendAvailable' },
  // Free for the window being seated, but booked elsewhere in the day — still
  // pickable, just never shown as plain "Trống".
  upcoming: { card: 'tbl-upcoming', label: 'seating.legendUpcoming' },
  reserved: { card: 'tbl-reserved', label: 'seating.legendReserved' },
  occupied: { card: 'tbl-occupied', label: 'seating.legendOccupied' },
  overdue: { card: 'tbl-overdue', label: 'seating.legendOverdue' },
  // An open check on the POS — the table has guests on it that the reservation
  // data doesn't know about, so it can never be seated into.
  posOpen: { card: 'tbl-posOpen', label: 'seating.legendPosOpen' },
  unavailable: { card: 'tbl-unavailable', label: 'seating.legendUnavailable' },
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
  mergeMode,
  onMergeModeChange,
  readOnly = false,
  filterBarExtra,
}: TableGridProps) {
  const { t } = useTranslation();
  const [capacityFilter, setCapacityFilter] = useState<string>(CAPACITY_ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const capacityOptions = useMemo(
    () => Array.from(new Set(tables.map((tb) => tb.maxnumcust ?? 0))).sort((a, b) => a - b),
    [tables],
  );

  const resolveState = (table: TableSetup): TableState => {
    // Wins over whatever the bookings say about the table: the store has taken it
    // out of service, so it is never seatable, however free the window looks.
    if (!isTableReservable(table)) return 'unavailable';
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
    () =>
      tables.some(
        (tb) =>
          resolveState(tb) !== 'unavailable' &&
          !isTableBlocked(tableInfo.get(tb.tablenum)) &&
          (tb.maxnumcust ?? 0) >= partySize,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables, tableInfo, partySize],
  );

  useEffect(() => {
    if (!readOnly && !anyTableFitsAlone) onMergeModeChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyTableFitsAlone, readOnly]);

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('seating.statusAll') },
    { value: 'available', label: t('seating.legendAvailable') },
    { value: 'upcoming', label: t('seating.legendUpcoming') },
    { value: 'reserved', label: t('seating.legendReserved') },
    { value: 'occupied', label: t('seating.legendOccupied') },
    { value: 'overdue', label: t('seating.legendOverdue') },
    { value: 'posOpen', label: t('seating.legendPosOpen') },
    { value: 'merged', label: t('seating.legendMerged') },
    { value: 'unavailable', label: t('seating.legendUnavailable') },
  ];

  const activeFilterCount = (capacityFilter !== CAPACITY_ALL ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
  const activeStatusLabel = statusFilters.find((sf) => sf.value === statusFilter)?.label;

  if (tables.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{t('seating.noTables')}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className={`chip-btn flex items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            activeFilterCount > 0 ? 'pill-on' : 'pill'
          }`}
        >
          {t('seating.filters')}
          {activeFilterCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/25 px-1 text-[10px]">
              {activeFilterCount}
            </span>
          )}
          <ChevronDownIcon size={13} className={filtersOpen ? 'rotate-180' : ''} />
        </button>
        {!readOnly && (
          <label
            title={t('seating.mergeModeHint')}
            className={`chip-btn flex cursor-pointer select-none items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
              mergeMode
                ? 'border border-[var(--merge-line)] bg-[var(--merge-bg)] text-merge'
                : 'pill'
            }`}
          >
            <input
              type="checkbox"
              checked={mergeMode}
              onChange={(e) => onMergeModeChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--merge-ink)]"
            />
            <MergeIcon size={15} />
            {t('seating.mergeMode')}
          </label>
        )}
        {filterBarExtra}
        {!filtersOpen && activeFilterCount > 0 && (
          <span className="text-xs text-muted">
            {capacityFilter !== CAPACITY_ALL && t('seating.filterSeats', { count: Number(capacityFilter) })}
            {capacityFilter !== CAPACITY_ALL && statusFilter !== 'all' && ' · '}
            {statusFilter !== 'all' && activeStatusLabel}
          </span>
        )}
      </div>

      {filtersOpen && (
        <div className="mb-2 space-y-1.5 rounded-xl border border-line bg-surface p-2">
          {capacityOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCapacityFilter(CAPACITY_ALL)}
                className={`chip-btn rounded-full px-3 text-xs font-medium ${
                  capacityFilter === CAPACITY_ALL ? 'pill-on' : 'pill'
                }`}
              >
                {t('seating.filterAll')}
              </button>
              {capacityOptions.map((cap) => (
                <button
                  key={cap}
                  onClick={() => setCapacityFilter(String(cap))}
                  className={`chip-btn rounded-full px-3 text-xs font-medium ${
                    capacityFilter === String(cap) ? 'pill-on' : 'pill'
                  }`}
                >
                  {t('seating.filterSeats', { count: cap })}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((sf) => (
              <button
                key={sf.value}
                onClick={() => setStatusFilter(sf.value)}
                className={`chip-btn rounded-full px-3 text-xs font-medium ${
                  statusFilter === sf.value ? 'pill-on' : 'pill'
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredTables.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('seating.noTablesMatchFilter')}</p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.label}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {section.label}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {section.tables.map((table) => {
                  const info = tableInfo.get(table.tablenum);
                  const state = resolveState(table);
                  const selected = selectedTablenums.has(table.tablenum);
                  // Only surface the "own table" badge when no OTHER booking
                  // blocks the table — an `upcoming` hold elsewhere in the day
                  // doesn't stop this guest sitting here now.
                  const isOwn = ownTablenums?.has(table.tablenum) && !isTableBlocked(info) && state !== 'unavailable';
                  // In merge mode a table that can't hold the party alone is
                  // still a valid piece of a combined set.
                  const tooSmall = !mergeMode && (table.maxnumcust ?? 0) < partySize;
                  const isUnavailableState = isTableBlocked(info) || state === 'unavailable';
                  const disabledByFilter = !selected && (isUnavailableState || tooSmall);
                  const disabled = readOnly || disabledByFilter;
                  const style = STATE_STYLES[state];

                  return (
                    <div key={table.globalId} id={`seat-table-${table.tablenum}`} className="relative">
                      <button
                        disabled={disabled}
                        onClick={() => onToggle(table)}
                        title={info?.merged && info.mergedWith?.length ? `${t('seating.legendMerged')} #${info.mergedWith.join(', #')}` : undefined}
                        className={`touch-btn flex w-full flex-col items-start gap-1 rounded-xl border-2 p-2.5 text-left transition ${
                          selected
                            ? 'tbl-selected'
                            : isOwn
                              ? 'tbl-own'
                              : disabledByFilter && !isUnavailableState
                                ? 'tbl-unavailable cursor-not-allowed'
                                : `${style.card} ${readOnly ? 'cursor-default' : disabled ? 'cursor-not-allowed' : ''}`
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="flex items-center gap-1 text-base font-semibold">
                            {info?.merged && <MergeIcon size={15} className="text-merge" />}
                            #{table.tablenum}
                          </span>
                          <span className="flex items-center gap-1 text-xs opacity-75">
                            <UsersIcon size={13} />
                            {table.maxnumcust ?? table.minnumcust ?? 0} {t('seating.seats')}
                          </span>
                        </div>
                        <span className="tbl-ink flex items-center gap-1.5 text-xs font-medium">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                          {isOwn && !selected
                            ? t('seating.ownTable')
                            : state === 'upcoming' && info?.nextTime
                              ? t('seating.upcomingAt', { time: info.nextTime.slice(0, 5) })
                              : // Busy now, free for the window being held. The suffix is
                                // optional — an empty translation shows the state alone.
                                info?.advisory && t('seating.freeForThisSlot')
                                ? `${t(style.label)} ${t('seating.freeForThisSlot')}`
                                : t(style.label)}
                        </span>
                      </button>
                      {info != null && info.globalIds.length > 0 && (
                        <button
                          onClick={() => onViewBooking(info.globalIds)}
                          aria-label={t('seating.viewBooking')}
                          title={t('seating.viewBooking')}
                          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-semibold text-[var(--panel)] shadow ring-1 ring-line transition hover:opacity-85"
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
