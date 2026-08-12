import { useCallback, useEffect, useState } from 'react';
import { fetchPreOrdersByReservation } from '../api/orderHub';
import type { PreOrder, SiteScope } from '../types';

const EMPTY: PreOrder[] = [];

/**
 * The store's open pre-orders, indexed by reservation, shared by check-in and seating.
 *
 * Fails open on purpose: a store that never turned OrderHub on — or an OrderHub that is
 * momentarily down — must not stop the hostess from seating guests. When the read fails the
 * map is empty and `failed` is set, so screens can say "pre-orders unknown" instead of
 * implying nobody ordered ahead.
 */
export function usePreOrders(scope: Pick<SiteScope, 'siteId' | 'sNum'> | null | undefined) {
  const { siteId, sNum } = scope ?? {};
  const [byReservation, setByReservation] = useState<Map<string, PreOrder[]>>(() => new Map());
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const reload = useCallback(async () => {
    if (siteId == null || sNum == null) return;
    try {
      const result = await fetchPreOrdersByReservation({ siteId, sNum });
      setByReservation(result.byReservation);
      setTruncated(result.truncated);
      setFailed(false);
    } catch {
      setByReservation(new Map());
      setTruncated(false);
      setFailed(true);
    }
  }, [siteId, sNum]);

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
