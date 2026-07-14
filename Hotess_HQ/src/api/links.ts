import { http } from './http';
import type { ApiEnvelope, LinkInfo, ReservationZone, TableSetup } from '../types';
import { mockLinkInfo } from './mockData';

/** Raw shapes as returned by GET /api/ReservationLinks/Booking?publicKey=... */
interface RawZone {
  zoneID: number;
  zoneName: string;
  isNoTable: number;
  availableSlots: number;
  isPauseBooking: number;
}

interface RawZoneSectionLink {
  zoneID: number;
  secNum: number;
}

interface RawSection {
  secnum: number;
  descript: string;
}

interface RawTableSetup {
  globalId: number;
  siteId: number;
  tablenum: number;
  secnum: number;
  minnumcust: number;
  maxnumcust: number;
  canreserve: number;
}

interface RawLinkInfoPayload {
  linkInfo: { siteId: number; sNum: number; statNum: number; channelId?: number };
  zones?: RawZone[];
  zoneSectionLinks?: RawZoneSectionLink[];
  sections?: RawSection[];
  tableSetups?: RawTableSetup[];
}

function mapZones(payload: RawLinkInfoPayload): ReservationZone[] {
  const { siteId } = payload.linkInfo;
  return (payload.zones ?? []).map((z): ReservationZone => ({
    zoneId: z.zoneID,
    zoneName: z.zoneName,
    siteId,
    isActive: !z.isPauseBooking,
    secNum: payload.zoneSectionLinks?.find((l) => l.zoneID === z.zoneID)?.secNum.toString(),
    capacity: z.availableSlots,
  }));
}

function mapTables(payload: RawLinkInfoPayload): TableSetup[] {
  const zoneBySecNum = new Map<number, number>();
  for (const link of payload.zoneSectionLinks ?? []) {
    zoneBySecNum.set(link.secNum, link.zoneID);
  }
  const sectionNameBySecNum = new Map<number, string>();
  for (const section of payload.sections ?? []) {
    sectionNameBySecNum.set(section.secnum, section.descript);
  }
  return (payload.tableSetups ?? [])
    .map((t): TableSetup | null => {
      const zoneId = zoneBySecNum.get(t.secnum);
      if (zoneId == null) return null; // table's section isn't linked to any zone
      return {
        tableId: t.globalId,
        tableNumber: String(t.tablenum),
        secNum: String(t.secnum),
        sectionName: sectionNameBySecNum.get(t.secnum),
        zoneId,
        minNumCust: t.minnumcust,
        maxNumCust: t.maxnumcust,
        canReserve: !!t.canreserve,
        siteId: t.siteId,
      };
    })
    .filter((t): t is TableSetup => t !== null);
}

export async function fetchLinkInfoByPublicKey(publicKey: string): Promise<LinkInfo> {
  try {
    const res = await http.get<ApiEnvelope<RawLinkInfoPayload>>('/api/ReservationLinks/Booking', {
      params: { publicKey },
    });
    const payload = res.data.data;
    return { ...payload.linkInfo, zones: mapZones(payload), tableSetups: mapTables(payload) };
  } catch (err) {
    console.warn('[links] ReservationLinks API unavailable, using mock fallback', err);
    if (!publicKey) throw new Error('Missing publicKey');
    return mockLinkInfo;
  }
}
