import type { BookingData } from '../api/booking';

/**
 * Remembers the OrderHub session token of each reservation's pre-order.
 *
 * The reservation channel gives a session an internal key rather than a POS bill, and
 * `POST Session` reuses that key when the client presents its previous token for the same
 * site + table (see ORDERHUB_API_GUIDE §3.1). Persisting the token is therefore what lets a
 * guest close the tab, come back tomorrow, and still find the dishes they had chosen —
 * without it every visit opens an empty cart and loses sight of the orders already placed.
 */

const STORAGE_KEY = 'bookinghq.preorder.sessions';

export interface StoredPreOrderSession {
  token: string;
  /**
   * The placeholder table this session was opened against. The reservation channel never
   * touches the POS, and the real table is only known when the hostess seats the booking,
   * but `POST Session` still requires one — and only resumes a session when the table
   * matches, so it has to be replayed exactly.
   */
  tableNum: number;
  siteId: number;
  storeId: number;
}

type SessionMap = Record<string, StoredPreOrderSession>;

function readAll(): SessionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: SessionMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Private browsing / quota — the pre-order still works, it just can't be resumed later.
  }
}

export function loadPreOrderSession(reservationNo: string): StoredPreOrderSession | null {
  if (!reservationNo) return null;
  return readAll()[reservationNo] ?? null;
}

export function savePreOrderSession(reservationNo: string, session: StoredPreOrderSession) {
  if (!reservationNo) return;
  const map = readAll();
  map[reservationNo] = session;
  writeAll(map);
}

export function clearPreOrderSession(reservationNo: string) {
  if (!reservationNo) return;
  const map = readAll();
  delete map[reservationNo];
  writeAll(map);
}

/**
 * RevCenter 999, 0 and NULL on a section mean "not assigned to any restaurant" (SPEC-06 R9) —
 * the same rule as the API's `RevCenterCodes.IsAssigned`, never a restaurant of its own.
 */
function isAssignedRevCenter(revCenter: number | null | undefined): boolean {
  return revCenter != null && revCenter > 0 && revCenter !== 999;
}

type TableSource = Pick<BookingData, 'linkInfo' | 'zones' | 'zoneSectionLinks' | 'sections' | 'tableSetups'>;

/**
 * The tables a pre-order session may be parked on: this restaurant's own (SPEC-06 R-12).
 *
 * The session needs a table even though the reservation channel never opens a bill, and the
 * order keeps that table number until the hostess seats the guest. Parked on another
 * restaurant's table — or on one in a section the POS assigns to no restaurant, like table 1
 * of the Non-Smoking section (RevCenter 999) on SUBDEV — the pre-order shows up as that
 * table's order to whoever reads that table. So, in order of preference:
 *
 *  1. tables in a section linked to one of this link's zones (`zoneSectionLinks`) whose
 *     section belongs to a restaurant;
 *  2. failing that, any table in a linked section — what this page always used, kept for a
 *     store whose section data does not say (or whose zones link only unassigned sections),
 *     where there is no better table to choose.
 *
 * Rows of this link's own Sub (`snum`) are preferred when the store data has any: HQ's copy of
 * the POS tables keys sections by number across every Sub of the site, and some rows sit
 * under SNUM 2047 or under the wrong Sub, so an exact-Sub filter alone can leave nothing.
 * Sorted ascending — the lowest is the placeholder.
 */
export function preOrderTablePool(data: TableSource | undefined): number[] {
  if (!data) return [];
  const sNum = data.linkInfo?.sNum;
  const sameSubFirst = <T extends { snum?: number }>(rows: T[]): T[] => {
    const own = rows.filter((row) => row.snum === sNum);
    return own.length > 0 ? own : rows;
  };

  // Links of zones this link actually serves; a link row left behind by a retired zone is
  // not a section of the restaurant.
  const zoneIds = new Set((data.zones ?? []).map((zone) => zone.zoneID));
  const links = (data.zoneSectionLinks ?? []).filter((link) => zoneIds.size === 0 || zoneIds.has(link.zoneID));
  const linkedSecNums = new Set(links.map((link) => link.secNum));

  const assignedSecNums = new Set<number>();
  for (const secNum of linkedSecNums) {
    const rows = sameSubFirst((data.sections ?? []).filter((section) => section.secnum === secNum));
    if (rows.some((section) => isAssignedRevCenter(section.revCenter))) assignedSecNums.add(secNum);
  }

  const tableNums = (secNums: Set<number>) =>
    sameSubFirst((data.tableSetups ?? []).filter((table) => secNums.has(table.secnum)))
      .map((table) => table.tablenum)
      .filter((n) => Number.isFinite(n) && n > 0);

  const pool = tableNums(assignedSecNums);
  return Array.from(new Set(pool.length > 0 ? pool : tableNums(linkedSecNums))).sort((a, b) => a - b);
}

/**
 * Which table to open the pre-order session on, and whether the stored session may be resumed.
 *
 * The stored table wins while it is still one of this restaurant's — resuming it is what
 * keeps the guest's cart. One that falls outside (another restaurant's, an unassigned
 * section's, another store's) is dropped together with its token: the server only resumes
 * a session on the same table anyway, so replaying the token would buy nothing. With no
 * table data at all nothing can be judged, and the stored session is kept as it always was.
 */
export function choosePreOrderTable(
  pool: number[],
  stored: StoredPreOrderSession | null,
  link: { siteId: number; sNum: number },
): { tableNum: number; resume: StoredPreOrderSession | null } {
  const sameStore = stored != null && stored.siteId === link.siteId && stored.storeId === link.sNum;
  if (stored && sameStore && (pool.length === 0 || pool.includes(stored.tableNum))) {
    return { tableNum: stored.tableNum, resume: stored };
  }
  return { tableNum: pool[0] ?? 1, resume: null };
}
