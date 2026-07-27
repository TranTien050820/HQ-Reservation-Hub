import { http } from './http';
import type {
  ApiEnvelope,
  ExtraFieldConfig,
  ExtraFieldOption,
  LinkInfo,
  ReservationDateOverride,
  ReservationPeriod,
  ReservationPeriodRule,
  ReservationZone,
  TableSetup,
  Section,
  ReserZoneSectionLink,
} from '../types';

/** Raw shape of GET /api/ReservationLinks/Booking?publicKey=... (ReservationConfigDTO). */
interface RawReservationConfig {
  linkInfo: { siteId: number; sNum: number; statNum: number; channelId?: number };
  zones?: ReservationZone[];
  zoneSectionLinks?: ReserZoneSectionLink[];
  sections?: Section[];
  tableSetups?: TableSetup[];
  extraFieldConfigs?: ExtraFieldConfig[];
  extraFieldOptions?: ExtraFieldOption[];
  periods?: ReservationPeriod[];
  periodRules?: ReservationPeriodRule[];
  dateOverrides?: ReservationDateOverride[];
}

/** GET /api/ReservationLinks/Booking?publicKey=... — everything the hostess app needs for one store. */
export async function fetchLinkInfoByPublicKey(publicKey: string): Promise<LinkInfo> {
  if (!publicKey) throw new Error('Missing publicKey');
  const res = await http.get<ApiEnvelope<RawReservationConfig>>('/api/ReservationLinks/Booking', {
    params: { publicKey },
  });
  const payload = res.data.data;
  if (!payload?.linkInfo) throw new Error('Store not found for this link');
  return {
    ...payload.linkInfo,
    zones: payload.zones ?? [],
    tableSetups: payload.tableSetups ?? [],
    sections: payload.sections ?? [],
    zoneSectionLinks: payload.zoneSectionLinks ?? [],
    extraFieldConfigs: payload.extraFieldConfigs ?? [],
    extraFieldOptions: payload.extraFieldOptions ?? [],
    periods: payload.periods ?? [],
    periodRules: payload.periodRules ?? [],
    dateOverrides: payload.dateOverrides ?? [],
  };
}
