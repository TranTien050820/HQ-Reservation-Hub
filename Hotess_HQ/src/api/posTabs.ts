import { http } from './http';
import type { ApiEnvelope, PagedResult, PosTabInfo, SiteScope } from '../types';

/**
 * GET /api/PosLocal/TabInfo?siteId=&sNum=&statNum= — the checks the POS has open
 * right now. Every returned table is occupied by walk-in/POS activity the
 * reservation data knows nothing about, so seating a guest onto one would put
 * two parties on the same table.
 */
export async function fetchPosTabs(scope: SiteScope): Promise<PosTabInfo[]> {
  const res = await http.get<ApiEnvelope<PagedResult<PosTabInfo> | PosTabInfo[]>>('/api/PosLocal/TabInfo', {
    params: { siteId: scope.siteId, sNum: scope.sNum, statNum: scope.statNum },
  });
  const data = res.data.data;
  const items = Array.isArray(data) ? data : data?.items;
  return Array.isArray(items) ? items : [];
}

/** Table numbers with an open POS check — what the floor plan must refuse to seat into. */
export async function fetchPosOpenTablenums(scope: SiteScope): Promise<Set<number>> {
  const tabs = await fetchPosTabs(scope);
  return new Set(tabs.map((tab) => tab.tablenum).filter((n): n is number => n != null));
}
