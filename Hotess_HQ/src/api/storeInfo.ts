import { http } from './http';
import type { ApiEnvelope } from '../types';

/**
 * One row of `GET /api/StoreInfo` (the POS `StoreInfo` table, ALL-CAPS columns lowercased).
 *
 * The outlet's name lives in `description` — there is no `storeName` column here; that one
 * belongs to the reservation branding table, which is what `ReservationLinks/Booking`
 * already carries.
 */
interface StoreInfoRow {
  globalId?: number;
  siteId?: number;
  storenum?: number;
  snum?: number;
  description?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  isActive?: number | null;
}

/** What the booking slip needs from an outlet, and nothing else. */
export interface StoreInfoSummary {
  storeName: string | null;
  address: string | null;
}

function joinAddress(row: StoreInfoRow): string | null {
  const parts = [row.address1, row.address2, row.city]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * `GET api/StoreInfo?SiteId=&StoreNum=` — the outlet's name, for `H-03`.
 *
 * Only worth calling when the link config came back without `settings.storeName`; the
 * config request already carries it for stores that filled the field in, and asking twice
 * for the same string is a request nobody gets back.
 *
 * The endpoint answers with an ARRAY even for a single store, and filters loosely: passing
 * only `SiteId` returns every store of the site. Both parameters are therefore always sent,
 * and the row is matched on `storenum`/`snum` rather than trusted to be the only one.
 */
export async function fetchStoreInfo(siteId: number, storeNum: number): Promise<StoreInfoSummary | null> {
  const res = await http.get<ApiEnvelope<StoreInfoRow[] | StoreInfoRow>>('/api/StoreInfo', {
    params: { SiteId: siteId, StoreNum: storeNum },
  });
  const data = res.data.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = rows.find((r) => r.storenum === storeNum || r.snum === storeNum);
  if (!row) return null;

  return {
    storeName: row.description?.trim() || null,
    address: joinAddress(row),
  };
}
