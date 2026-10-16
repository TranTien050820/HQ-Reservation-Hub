import { useCallback, useEffect, useState } from 'react';
import { fetchFloorPlanZones, type FloorPlanScope } from '../api/floorPlans';
import { subscribeFloorStatus } from '../api/reservationHub';
import type { FloorPublishedZone } from '../floorplan/types';

const FRESH_MS = 60_000;
const RECHECK_MS = 5 * 60_000;
const zonesCache = new Map<string, { at: number; zones: FloorPublishedZone[] }>();

/**
 * The station's booking zones that have a published floor plan (one plan per zone).
 *
 * Fails closed and quietly: no plan yet, a server that has not run the floor-plan migration
 * (409 FLOOR_PLAN_NOT_ENABLED) or a dropped request all mean the same thing on the floor —
 * no map, the card grid as always. Re-checked when the tablet wakes and every few minutes,
 * so a plan published while the screen sat open turns up without a reload (the call is a
 * 304 when nothing changed).
 */
export function usePublishedFloorPlans(scope: FloorPlanScope | null | undefined): FloorPublishedZone[] {
  const siteId = scope?.siteId;
  const sNum = scope?.sNum;
  const statNum = scope?.statNum;
  const key = siteId != null && sNum != null && statNum != null ? `${siteId}:${sNum}:${statNum}` : null;
  const [zones, setZones] = useState<FloorPublishedZone[]>(() => (key ? zonesCache.get(key)?.zones : null) ?? []);

  useEffect(() => {
    if (key == null || siteId == null || sNum == null || statNum == null) {
      setZones([]);
      return;
    }
    let cancelled = false;
    const load = async (force: boolean) => {
      const hit = zonesCache.get(key);
      if (hit && !force && Date.now() - hit.at < FRESH_MS) {
        setZones(hit.zones);
        return;
      }
      try {
        const fresh = await fetchFloorPlanZones({ siteId, sNum, statNum });
        zonesCache.set(key, { at: Date.now(), zones: fresh });
        if (!cancelled) setZones(fresh);
      } catch {
        if (!cancelled) setZones(hit?.zones ?? []);
      }
    };
    void load(false);
    // A plan published (or switched off) in HQ_FE_V2 shows up at once instead of at the next recheck.
    const unsubscribe = subscribeFloorStatus(siteId, sNum, (push) => {
      if (push.reasons.includes('layout')) void load(true);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, RECHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, siteId, sNum, statNum]);

  return zones;
}

export type SeatingView = 'grid' | 'map';

const SEATING_VIEW_KEY = 'hotess.seatingView';

function readSeatingView(): SeatingView {
  try {
    return localStorage.getItem(SEATING_VIEW_KEY) === 'map' ? 'map' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Cards or floor map — remembered per tablet, since each floor settles on one. */
export function useSeatingView(): [SeatingView, (view: SeatingView) => void] {
  const [view, setView] = useState<SeatingView>(readSeatingView);
  const change = useCallback((next: SeatingView) => {
    setView(next);
    try {
      localStorage.setItem(SEATING_VIEW_KEY, next);
    } catch {
      // Private mode / storage blocked: the choice simply lasts until the screen closes.
    }
  }, []);
  return [view, change];
}
