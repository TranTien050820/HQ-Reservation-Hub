import type { TableSetup } from '../types';

/**
 * Table suggestion/merge algorithm for the hostess "seat this guest now" flow:
 * given the tables free right now and a party size, propose either a single
 * table or a small set to merge.
 *
 * Rules:
 * 1. Any single free table big enough for the party wins outright — merging is
 *    only attempted when no single table fits.
 * 2. Merge combos are built per section (you can't merge tables across the
 *    room) by choosing *capacities*, not adjacent table numbers. The earlier
 *    version slid a window over consecutive tablenums, which — because a
 *    restaurant numbers its same-size tables in blocks — could only ever
 *    surface combos of identical-capacity tables and never a mix like one
 *    6-top + one 2-top. Here every capacity mix that reaches the party is
 *    considered, then realised with the physically closest real tables.
 * 3. Combos are ranked by: fewer tables, then least wasted capacity, then
 *    tighter tablenum spread (physically closer). Waste sits above spread so an
 *    efficient mixed combo is surfaced, not buried under many same-size ones.
 */

const MAX_COMBO_SIZE = 5;
const MAX_RESULTS = 10;
/** A "suggestion" should stay a short, glanceable shortlist — not every free table in the zone. */
const MAX_SINGLE_RESULTS = 12;
/** Safety bound on the capacity-mix search; far more than any real section produces. */
const MAX_MULTISETS = 200;

function capacityOf(table: TableSetup): number {
  return table.maxnumcust ?? 0;
}

function totalCapacity(tables: TableSetup[]): number {
  return tables.reduce((sum, t) => sum + capacityOf(t), 0);
}

function tablenumSpread(tables: TableSetup[]): number {
  const nums = tables.map((t) => t.tablenum);
  return Math.max(...nums) - Math.min(...nums);
}

function rankCombos(combos: TableSetup[][], partySize: number): TableSetup[][] {
  return combos
    .slice()
    .sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      const wasteA = totalCapacity(a) - partySize;
      const wasteB = totalCapacity(b) - partySize;
      if (wasteA !== wasteB) return wasteA - wasteB;
      return tablenumSpread(a) - tablenumSpread(b);
    })
    .slice(0, MAX_RESULTS);
}

/**
 * Distinct capacity multisets (as cap -> count) that, using only capacities
 * actually available in this section, reach the party in 2..MAX_COMBO_SIZE
 * tables. Stops extending a multiset the moment it is sufficient — adding more
 * tables only worsens the count/waste this feeds into the ranking.
 */
function enumerateCapacityMultisets(
  caps: number[],
  available: number[],
  partySize: number,
): Map<number, number>[] {
  const result: Map<number, number>[] = [];
  const counts = new Array(caps.length).fill(0);

  const snapshot = (): Map<number, number> => {
    const m = new Map<number, number>();
    for (let i = 0; i < caps.length; i++) if (counts[i] > 0) m.set(caps[i], counts[i]);
    return m;
  };

  const dfs = (startIdx: number, totalCount: number, totalCap: number) => {
    if (result.length >= MAX_MULTISETS) return;
    if (totalCount >= 2 && totalCap >= partySize) {
      result.push(snapshot());
      return;
    }
    if (totalCount >= MAX_COMBO_SIZE) return;
    // startIdx (not 0) keeps each multiset generated once, not every ordering.
    for (let i = startIdx; i < caps.length; i++) {
      if (counts[i] >= available[i]) continue;
      counts[i]++;
      dfs(i, totalCount + 1, totalCap + caps[i]);
      counts[i]--;
    }
  };

  dfs(0, 0, 0);
  return result;
}

/**
 * Picks the physically tightest set of real tables satisfying a capacity
 * multiset: a min-tablenum-spread window (two pointers over the section sorted
 * by tablenum) that contains the required count of each needed capacity, then
 * the exact tables from inside it. Returns null if the section can't satisfy it.
 */
function realizeTightest(sorted: TableSetup[], need: Map<number, number>): TableSetup[] | null {
  const neededCaps = [...need.keys()];
  const have = new Map<number, number>(neededCaps.map((c) => [c, 0]));
  let satisfied = 0;
  let best: { l: number; r: number; spread: number } | null = null;
  let l = 0;

  for (let r = 0; r < sorted.length; r++) {
    const capR = capacityOf(sorted[r]);
    if (need.has(capR)) {
      const h = have.get(capR)! + 1;
      have.set(capR, h);
      if (h === need.get(capR)) satisfied++;
    }
    while (satisfied === neededCaps.length) {
      const spread = sorted[r].tablenum - sorted[l].tablenum;
      if (best === null || spread < best.spread) best = { l, r, spread };
      const capL = capacityOf(sorted[l]);
      if (need.has(capL)) {
        const h = have.get(capL)!;
        if (h === need.get(capL)) satisfied--;
        have.set(capL, h - 1);
      }
      l++;
    }
  }

  if (!best) return null;

  const taken = new Map<number, number>(neededCaps.map((c) => [c, 0]));
  const chosen: TableSetup[] = [];
  for (let i = best.l; i <= best.r; i++) {
    const cap = capacityOf(sorted[i]);
    if (need.has(cap) && taken.get(cap)! < need.get(cap)!) {
      chosen.push(sorted[i]);
      taken.set(cap, taken.get(cap)! + 1);
    }
  }
  return chosen;
}

function findCombosInSection(sectionTables: TableSetup[], partySize: number): TableSetup[][] {
  const sorted = sectionTables.slice().sort((a, b) => a.tablenum - b.tablenum);

  const availableByCap = new Map<number, number>();
  for (const t of sorted) {
    const cap = capacityOf(t);
    if (cap <= 0) continue;
    availableByCap.set(cap, (availableByCap.get(cap) ?? 0) + 1);
  }
  const caps = [...availableByCap.keys()];
  const available = caps.map((c) => availableByCap.get(c)!);

  const combos: TableSetup[][] = [];
  for (const need of enumerateCapacityMultisets(caps, available, partySize)) {
    const combo = realizeTightest(sorted, need);
    if (combo && combo.length >= 2 && totalCapacity(combo) >= partySize) combos.push(combo);
  }
  return combos;
}

export function suggestTables(
  freeTables: TableSetup[],
  partySize: number,
  /** Tables already held for the booking being seated — always kept in the shortlist even past the display cap. */
  pinnedTablenums?: Set<number>,
): { single: TableSetup[]; combos: TableSetup[][] } {
  const single = freeTables
    .filter((t) => (t.maxnumcust ?? 0) >= partySize)
    .sort((a, b) => {
      const aPinned = pinnedTablenums?.has(a.tablenum) ? 0 : 1;
      const bPinned = pinnedTablenums?.has(b.tablenum) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return (a.maxnumcust ?? 0) - (b.maxnumcust ?? 0) || a.tablenum - b.tablenum;
    })
    .slice(0, MAX_SINGLE_RESULTS);

  if (single.length > 0) return { single, combos: [] };

  const bySection = new Map<number, TableSetup[]>();
  for (const t of freeTables) {
    if (!bySection.has(t.secnum)) bySection.set(t.secnum, []);
    bySection.get(t.secnum)!.push(t);
  }

  let combos: TableSetup[][] = [];
  for (const sectionTables of bySection.values()) {
    combos = combos.concat(findCombosInSection(sectionTables, partySize));
  }

  return { single: [], combos: rankCombos(combos, partySize) };
}
