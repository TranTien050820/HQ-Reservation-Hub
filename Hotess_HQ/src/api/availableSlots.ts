import { http } from './http';
import type { ApiEnvelope, AvailableSlot, PagedResult, SiteScope } from '../types';

/** GET /api/AvailableSlots — SiteId/SNum/StatNum + ArrivalDateFrom/ArrivalDateTo (both = `date` for a single day). */
export async function fetchAvailableSlots(scope: SiteScope, date: string): Promise<AvailableSlot[]> {
  const res = await http.get<ApiEnvelope<PagedResult<AvailableSlot> | AvailableSlot[]>>('/api/AvailableSlots', {
    params: {
      SiteId: scope.siteId,
      SNum: scope.sNum,
      StatNum: scope.statNum,
      ArrivalDateFrom: date,
      ArrivalDateTo: date,
      IsActive: true,
      pageSize: 1000,
      pageIndex: 1,
    },
  });
  const data = res.data.data;
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items)) throw new Error('Unexpected response shape: expected an array or PagedResult');
  return items;
}
