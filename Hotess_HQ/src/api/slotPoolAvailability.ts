import { http } from './http';
import type { ApiEnvelope, SiteScope, SlotPoolAvailability } from '../types';

/**
 * 400 from `/availability` — and from POST ReservationBookings — when `time` falls inside no
 * serving period: the store sells nothing at that hour, which is a different answer from "full".
 */
export const PERIOD_NOT_CONFIGURED = 'PERIOD_NOT_CONFIGURED';

export interface SlotPoolAvailabilityQuery {
  /** "yyyy-MM-dd". */
  date: string;
  zoneId?: number;
  channelId?: number;
  /** "HH:mm" — the server resolves the serving period from it exactly as POST ReservationBookings does. */
  time?: string;
}

/**
 * GET /api/ReservationSlotPools/availability — one row per slot pool that can serve the query.
 *
 * An empty array is an answer, not a failure: no active pool allocates anything to that zone, so
 * a booking there would be refused. A `time` outside every serving period comes back as a
 * rejected 400 `PERIOD_NOT_CONFIGURED` (read it with `apiErrorCode`).
 */
export async function fetchSlotPoolAvailability(
  scope: SiteScope,
  query: SlotPoolAvailabilityQuery,
): Promise<SlotPoolAvailability[]> {
  const res = await http.get<ApiEnvelope<SlotPoolAvailability[]>>('/api/ReservationSlotPools/availability', {
    params: {
      SiteId: scope.siteId,
      SNum: scope.sNum,
      StatNum: scope.statNum,
      date: query.date,
      ZoneID: query.zoneId,
      ChannelID: query.channelId,
      time: query.time,
    },
  });
  const rows = res.data.data;
  if (!Array.isArray(rows)) throw new Error('Unexpected response shape: expected an array');
  return rows;
}

/**
 * The largest party one booking can still get: MAX of `bookable` over the pools, never the sum —
 * a booking takes all its seats from exactly one pool. 0 when no pool serves the query.
 */
export function maxBookable(rows: SlotPoolAvailability[]): number {
  return rows.reduce((max, row) => Math.max(max, row.bookable), 0);
}
