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
