import type { TableSetup } from '../types';
import type { TableState } from '../components/TableGrid';
import { isTableBlocked, isTableReservable, type TableOccupancy } from './tableOccupancy';

/** i18n key of each table state — shared by the card grid, its legend and the floor map. */
export const TABLE_STATE_LABEL: Record<TableState, string> = {
  available: 'seating.legendAvailable',
  upcoming: 'seating.legendUpcoming',
  reserved: 'seating.legendReserved',
  occupied: 'seating.legendOccupied',
  overdue: 'seating.legendOverdue',
  posOpen: 'seating.legendPosOpen',
  unavailable: 'seating.legendUnavailable',
};

/**
 * Out of service wins over whatever the bookings say about the table: the store has
 * taken it out, so it is never seatable, however free the window looks.
 */
export function tableStateOf(table: TableSetup, tableInfo: ReadonlyMap<number, TableOccupancy>): TableState {
  if (!isTableReservable(table)) return 'unavailable';
  return tableInfo.get(table.tablenum)?.state ?? 'available';
}

export interface TablePickContext {
  tableInfo: ReadonlyMap<number, TableOccupancy>;
  selectedTablenums: ReadonlySet<number>;
  ownTablenums?: ReadonlySet<number>;
  partySize: number;
  mergeMode: boolean;
  readOnly: boolean;
}

/** How one table reads in the seat picker right now. */
export interface TableDescriptor {
  table: TableSetup;
  info: TableOccupancy | undefined;
  state: TableState;
  selected: boolean;
  /** Held for the booking being seated, and no OTHER booking blocks it. */
  isOwn: boolean;
  /** Blocked by another booking for this window, or out of service. */
  isUnavailableState: boolean;
  /**
   * Not pickable: `isUnavailableState`, or too small for the party outside merge mode. Never set
   * on a table already picked — it has to stay tappable so it can be un-picked.
   */
  disabledByFilter: boolean;
  /** Tapping it does nothing — `disabledByFilter`, or the screen is view-only. */
  disabled: boolean;
}

/**
 * The card grid and the floor map both decide through this, so the two views of one
 * zone can never disagree about which table may be picked.
 */
export function describeTable(table: TableSetup, ctx: TablePickContext): TableDescriptor {
  const info = ctx.tableInfo.get(table.tablenum);
  const state = tableStateOf(table, ctx.tableInfo);
  const selected = ctx.selectedTablenums.has(table.tablenum);
  // Only surface the "own table" badge when no OTHER booking blocks the table —
  // an `upcoming` hold elsewhere in the day doesn't stop this guest sitting here now.
  const isOwn = !!ctx.ownTablenums?.has(table.tablenum) && !isTableBlocked(info) && state !== 'unavailable';
  // In merge mode a table that can't hold the party alone is still a valid piece
  // of a combined set.
  const tooSmall = !ctx.mergeMode && (table.maxnumcust ?? 0) < ctx.partySize;
  const isUnavailableState = isTableBlocked(info) || state === 'unavailable';
  const disabledByFilter = !selected && (isUnavailableState || tooSmall);
  return {
    table,
    info,
    state,
    selected,
    isOwn,
    isUnavailableState,
    disabledByFilter,
    disabled: ctx.readOnly || disabledByFilter,
  };
}
