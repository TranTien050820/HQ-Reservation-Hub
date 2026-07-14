import { http } from './http';
import type { ApiEnvelope, AvailableSlot, PagedResult, SiteScope } from '../types';
import { mockAvailableSlots } from './mockData';

/** Raw shape as returned by GET /api/AvailableSlots (paged, per zone per arrival date). */
interface RawAvailableSlot {
  zoneID: number;
  availableSlots: number;
  numberOfUsed: number;
  numberOfUnused: number;
}

function mapAvailableSlot(raw: RawAvailableSlot): AvailableSlot {
  return {
    zoneId: raw.zoneID,
    total: raw.availableSlots,
    used: raw.numberOfUsed,
    free: raw.numberOfUnused,
    seated: raw.numberOfUsed,
  };
}

export async function fetchAvailableSlots(scope: SiteScope, date: string): Promise<AvailableSlot[]> {
  try {
    const res = await http.get<ApiEnvelope<PagedResult<RawAvailableSlot> | RawAvailableSlot[]>>(
      '/api/AvailableSlots',
      { params: { SiteId: scope.siteId, SNum: scope.sNum, StatNum: scope.statNum, Date: date } },
    );
    const data = res.data.data;
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('Unexpected response shape: expected an array or PagedResult');
    return items.map(mapAvailableSlot);
  } catch (err) {
    console.warn('[availableSlots] API unavailable, using mock fallback', err);
    return mockAvailableSlots;
  }
}
