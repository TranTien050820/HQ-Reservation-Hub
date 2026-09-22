import { useCallback, useEffect, useState } from 'react';
import { fetchPreOrdersByReservation, fetchPreOrdersForReservation } from '../api/orderHub';
import type { PreOrder, SiteScope } from '../types';

const EMPTY: PreOrder[] = [];

/**
 * The store's open pre-orders, indexed by reservation, shared by check-in and seating.
 *
 * Fails open on purpose: a store that never turned OrderHub on — or an OrderHub that is
 * momentarily down — must not stop the hostess from seating guests. When the read fails the
 * map is empty and `failed` is set, so screens can say "pre-orders unknown" instead of
 * implying nobody ordered ahead — and so nothing treats "unknown" as "none" and skips a
 * Release on the strength of it (SPEC-06 R-14).
 *
 * `scope` is the link's full station scope: one Sub serves several restaurants, and a list
 * scoped only to `sNum` carries every one of them (SPEC-06 R-10).
 */
export function usePreOrders(scope: SiteScope | null | undefined) {
  const { siteId, sNum, statNum } = scope ?? {};
  const [byReservation, setByReservation] = useState<Map<string, PreOrder[]>>(() => new Map());
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const reload = useCallback(async () => {
    if (siteId == null || sNum == null || statNum == null) return;
    try {
      const result = await fetchPreOrdersByReservation({ siteId, sNum, statNum });
      setByReservation(result.byReservation);
      setTruncated(result.truncated);
      setFailed(false);
    } catch {
      setByReservation(new Map());
      setTruncated(false);
      setFailed(true);
    }
  }, [siteId, sNum, statNum]);

  useEffect(() => {
    reload();
  }, [reload]);

  const preOrdersFor = useCallback(
    (reservationNo: string | null | undefined): PreOrder[] =>
      reservationNo ? (byReservation.get(String(reservationNo).trim()) ?? EMPTY) : EMPTY,
    [byReservation],
  );

  return {
    preOrdersFor,
    preOrdersFailed: failed,
    preOrdersTruncated: truncated,
    reloadPreOrders: reload,
  };
}

/**
 * One booking's pre-orders, read from the endpoint built for exactly that (`H-04`).
 *
 * `usePreOrders` above pulls the whole store's pre-release orders and matches them client
 * side — right for a list of bookings, and the wrong shape for a detail panel: it walks
 * pages per status, so an order that changes status mid-walk falls out of the result
 * entirely. `GET Reservation/{no}/Orders` answers for one booking in one call with no such
 * hole, which is why the detail view asks it directly.
 *
 * `fallback` is the list-derived set the caller already had. It stays on screen while the
 * fresh read is in flight and if that read fails, so opening a booking card never blanks a
 * panel that was showing the guest's food a moment ago.
 *
 * `scope` is the BOOKING's (`bookingScope` in `api/orderHub.ts`), not the link's.
 */
export function useReservationPreOrders(
  reservationNo: string | null | undefined,
  scope: SiteScope | null | undefined,
  fallback: PreOrder[],
  /** Bumped by the caller after Release/Cancel so this re-reads instead of showing the old set. */
  refreshTick = 0,
) {
  const { siteId, sNum, statNum } = scope ?? {};
  /**
   * The result is stored WITH the booking it belongs to.
   *
   * Keeping bare orders here is how one guest's food ends up under another guest's name:
   * the hostess closes one card and opens the next, and until the new read lands the old
   * array is still the freshest thing this hook has. Pairing the two means a result is
   * only ever shown against the booking it was fetched for.
   */
  const [fetched, setFetched] = useState<{ reservationNo: string; orders: PreOrder[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const key = reservationNo ? String(reservationNo) : null;

  useEffect(() => {
    if (!key || siteId == null || sNum == null || statNum == null) return;
    let cancelled = false;
    setLoading(true);
    fetchPreOrdersForReservation(key, { siteId, sNum, statNum })
      .then((orders) => {
        if (!cancelled) setFetched({ reservationNo: key, orders });
      })
      .catch(() => {
        // Fall back to what the list already knew rather than claiming the guest ordered
        // nothing — an empty panel would hide food that is genuinely waiting.
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, siteId, sNum, statNum, refreshTick, tick]);

  const current = fetched?.reservationNo === key ? fetched.orders : null;

  return {
    preOrders: current ?? fallback,
    /** True only while the first read for THIS booking is still out. */
    preOrdersLoading: loading && current == null,
    reloadPreOrders: useCallback(() => setTick((n) => n + 1), []),
  };
}
