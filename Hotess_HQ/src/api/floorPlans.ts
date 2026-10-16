import { http } from './http';
import type { ApiEnvelope } from '../types';
import type { FloorPublishedLayout, FloorPublishedZone } from '../floorplan/types';

/**
 * Published floor plans — HQ-WebOffice-API `api/ReservationFloorPlans` (docs/RESERVATION_FLOOR_PLAN_DESIGN.md §7).
 * One plan per booking zone (SiteId + SNum + StatNum + ZoneID), drawn in HQ_FE_V2 (Reservations → Floor plans) from the
 * tables of the sections the zone is linked to; this app only reads them.
 *
 * The hostess's JWT makes this an internal caller: every zone of the station, not only the
 * ones the restaurant allocated to a partner. Both calls answer with an ETag and
 * `Cache-Control: private, no-cache`, so the browser revalidates on its own and a plan that
 * has not changed comes back as an empty 304 — nothing to manage here.
 */
export interface FloorPlanScope {
  siteId: number;
  sNum: number;
  statNum: number;
}

interface FloorPlanZonesData {
  siteId: number;
  sNum: number;
  zones: FloorPublishedZone[];
}

/** GET …/zones — the station's zones that have a published plan, with its version. */
export async function fetchFloorPlanZones(scope: FloorPlanScope): Promise<FloorPublishedZone[]> {
  const res = await http.get<ApiEnvelope<FloorPlanZonesData>>('/api/ReservationFloorPlans/zones', {
    params: { siteId: scope.siteId, sNum: scope.sNum, statNum: scope.statNum },
  });
  return res.data.data?.zones ?? [];
}

/** GET …/layout — one zone's published plan, plus each table's seats as the POS has them today. */
export async function fetchFloorPlanLayout(scope: FloorPlanScope, zoneID: number): Promise<FloorPublishedLayout> {
  const res = await http.get<ApiEnvelope<FloorPublishedLayout>>('/api/ReservationFloorPlans/layout', {
    params: { siteId: scope.siteId, sNum: scope.sNum, statNum: scope.statNum, zoneID },
  });
  return res.data.data;
}
