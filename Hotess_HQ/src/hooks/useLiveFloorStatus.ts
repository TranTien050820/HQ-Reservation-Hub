import { useEffect, useRef, useSyncExternalStore } from 'react';
import { isFloorStatusLive, onFloorStatusLiveChange, subscribeFloorStatus } from '../api/reservationHub';

/** A burst of pushes (seat = booking + bill + waitlist) becomes one re-read now and at most one trailing re-read. */
const MIN_GAP_MS = 3_000;
/** The screen has just loaded everything itself — the "resync" every new connection sends is not news. */
const FRESH_LOAD_MS = 10_000;

export interface LiveFloorRefreshOptions {
  scope: { siteId: number; sNum: number; statNum: number } | null | undefined;
  /** The zone on screen, or null when it has no published plan (HQ only reports tables placed on a plan). */
  zoneID: number | null | undefined;
  onRefresh: () => unknown;
}

/**
 * Re-reads the seating floor the moment HQ reports a change on the open zone — another hostess
 * seated a party, the cashier closed a bill, a booking was cancelled — instead of waiting for
 * the next poll. Returns true while those reports are flowing for this zone, so the caller can
 * poll less often; false (hub down, zone without a plan) means poll as before.
 */
export function useLiveFloorRefresh({ scope, zoneID, onRefresh }: LiveFloorRefreshOptions): boolean {
  const live = useSyncExternalStore(onFloorStatusLiveChange, isFloorStatusLive);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  const siteId = scope?.siteId;
  const sNum = scope?.sNum;
  const statNum = scope?.statNum;

  useEffect(() => {
    if (siteId == null || sNum == null || statNum == null || zoneID == null) return;

    const subscribedAt = Date.now();
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      timer = undefined;
      last = Date.now();
      void refreshRef.current();
    };
    const request = () => {
      if (timer) return;
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    };

    const unsubscribe = subscribeFloorStatus(siteId, sNum, (push) => {
      if (push.reasons.includes('resync') && Date.now() - subscribedAt < FRESH_LOAD_MS) return;
      if (push.full || push.changes.some((c) => c.statNum === statNum && c.zoneID === zoneID)) request();
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [siteId, sNum, statNum, zoneID]);

  return live && zoneID != null;
}
