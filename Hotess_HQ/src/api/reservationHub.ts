import type { HubConnection } from '@microsoft/signalr';
import { getTokens } from '../store/tokenStorage';
import type { FloorStatusPush } from '../floorplan/types';

/**
 * Live table status — HQ-WebOffice-API hub `/reservationHub` (docs/RESERVATION_FLOOR_PLAN_DESIGN.md §7.5).
 *
 * HQ recomputes a store's table status the moment something changes it — a booking seated or
 * cancelled, a bill opened or closed through HQ, a plan published — and on a 20-second sweep
 * for bills the cashier opens straight on the POS. Every change goes out as `floorplan.status`
 * to the stores a screen joined. One connection per tab, shared by every screen that listens.
 *
 * - The hostess's JWT rides in the `access_token` query: a browser WebSocket cannot carry an
 *   Authorization header. Each (re)connect reads the token afresh, so a token the HTTP layer
 *   refreshed in the meantime is picked up on the next attempt.
 * - WebSockets only, no negotiate round trip: behind two API pods without sticky sessions the
 *   negotiate call and the socket could land on different pods.
 * - Fails quietly. No hub (an API without it, a proxy that drops WebSockets) just means the
 *   screens keep polling at their usual pace; a retry runs every 30 s.
 * - The SignalR client (~65 KB) loads on first use, not with the app's entry bundle.
 */

type Listener = (push: FloorStatusPush) => void;

interface Subscription {
  siteId: number;
  sNum: number;
  listeners: Set<Listener>;
}

const HUB_URL = `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')}/reservationHub`;
const RETRY_MS = 30_000;
/** Unmount + remount (route change, StrictMode) must not tear the socket down in between. */
const STOP_GRACE_MS = 5_000;

// HubConnectionState is a string enum; compared by value so the library stays out of the entry bundle.
const CONNECTED = 'Connected' as HubConnection['state'];
const DISCONNECTED = 'Disconnected' as HubConnection['state'];

const subs = new Map<string, Subscription>();
const liveListeners = new Set<() => void>();
let connection: HubConnection | null = null;
let building: Promise<HubConnection> | null = null;
let live = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

const subKey = (siteId: number, sNum: number) => `${siteId}:${sNum}`;

function setLive(next: boolean) {
  if (live === next) return;
  live = next;
  for (const listener of liveListeners) listener();
}

/** Tell every listener it may have missed pushes (fresh connection): re-read, do not patch. */
function resyncAll() {
  for (const sub of subs.values()) {
    const push: FloorStatusPush = {
      siteId: sub.siteId,
      sNum: sub.sNum,
      seq: 0,
      prevSeq: 0,
      asOf: '',
      posStale: false,
      full: true,
      reasons: ['resync'],
      changes: [],
    };
    for (const listener of sub.listeners) listener(push);
  }
}

async function joinAll(conn: HubConnection) {
  for (const sub of subs.values()) {
    try {
      await conn.invoke('JoinSub', sub.siteId, sub.sNum);
    } catch {
      // A store the hub refuses stays on polling; the others still join.
    }
  }
}

async function build(): Promise<HubConnection> {
  const { HttpTransportType, HubConnectionBuilder, LogLevel } = await import('@microsoft/signalr');
  const conn = new HubConnectionBuilder()
    .withUrl(HUB_URL, {
      skipNegotiation: true,
      transport: HttpTransportType.WebSockets,
      accessTokenFactory: () => getTokens().accessToken ?? '',
    })
    .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
    .configureLogging(LogLevel.None)
    .build();

  conn.on('floorplan.status', (push: FloorStatusPush) => {
    const sub = subs.get(subKey(push.siteId, push.sNum));
    if (!sub) return;
    for (const listener of sub.listeners) listener(push);
  });
  conn.onreconnecting(() => setLive(false));
  conn.onreconnected(async () => {
    // Groups do not survive a new connection id.
    await joinAll(conn);
    setLive(true);
    resyncAll();
  });
  conn.onclose(() => {
    setLive(false);
    scheduleRetry();
  });
  return conn;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (subs.size === 0) return;
  retryTimer = setTimeout(() => void ensureStarted(), RETRY_MS);
}

async function ensureStarted() {
  if (subs.size === 0 || !getTokens().accessToken) return;
  try {
    if (!connection) {
      building ??= build();
      connection = await building;
    }
  } catch {
    // The chunk could not load (offline, new deploy): try again later like any failed connect.
    building = null;
    scheduleRetry();
    return;
  }
  const conn = connection;
  if (conn.state !== DISCONNECTED) return;
  try {
    await conn.start();
    await joinAll(conn);
    setLive(true);
    // Pushes sent before the join are lost: everyone re-reads once.
    resyncAll();
  } catch {
    setLive(false);
    scheduleRetry();
  }
}

/**
 * Listen to one store's table status. Returns the unsubscribe function. The first listener
 * opens the connection; the last one closes it a few seconds later.
 */
export function subscribeFloorStatus(siteId: number, sNum: number, listener: Listener): () => void {
  clearTimeout(stopTimer);
  const key = subKey(siteId, sNum);
  let sub = subs.get(key);
  const isNew = !sub;
  if (!sub) {
    sub = { siteId, sNum, listeners: new Set() };
    subs.set(key, sub);
  }
  sub.listeners.add(listener);

  if (connection?.state === CONNECTED) {
    if (isNew) void connection.invoke('JoinSub', siteId, sNum).catch(() => undefined);
  } else {
    void ensureStarted();
  }

  const entry = sub;
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0 || subs.get(key) !== entry) return;
    subs.delete(key);
    if (connection?.state === CONNECTED)
      void connection.invoke('LeaveSub', siteId, sNum).catch(() => undefined);
    if (subs.size === 0) {
      clearTimeout(retryTimer);
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        if (subs.size === 0) void connection?.stop();
      }, STOP_GRACE_MS);
    }
  };
}

/** Is the hub connected right now — screens poll slower while it is. */
export function isFloorStatusLive(): boolean {
  return live;
}

/** `useSyncExternalStore` subscription for {@link isFloorStatusLive}. */
export function onFloorStatusLiveChange(listener: () => void): () => void {
  liveListeners.add(listener);
  return () => {
    liveListeners.delete(listener);
  };
}
