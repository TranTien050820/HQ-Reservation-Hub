import axios from 'axios';
import { http } from './http';
import {
  ReservationStatus,
  type MenuCategory,
  type MenuItem,
  type ReservationBooking,
  type ReservationBookingCreatePayload,
  type ReservationBookingUpdatePayload,
  type ReservationDateOverride,
  type ReservationPeriod,
  type ReservationPeriodRule,
  type ReservationZone,
  type SlotPoolAvailability,
  type StoreInfo,
} from './types';
import {
  MOCK_DATE_OVERRIDES,
  MOCK_MENU_CATEGORIES,
  MOCK_MENU_ITEMS,
  MOCK_PERIOD_RULES,
  MOCK_PERIODS,
  MOCK_STORES,
  MOCK_ZONES,
  SITE_ID,
} from './mockData';

interface ApiEnvelope<T> {
  status: number;
  statusText: string;
  message: string;
  /** Stable code of a refusal (e.g. PERIOD_NOT_CONFIGURED) — branch on this, never on `message`. */
  errorCode?: string | null;
  data: T;
}

interface PaginatedResult<T> {
  items: T[];
  totalRecords: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
}

export { SITE_ID };

/** Small artificial delay so loading states are visible, like a real API call. */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Mock of GET /api/StoreInfo — list of stores ("restaurants") under the configured site. */
export async function fetchStores(siteId: number = SITE_ID): Promise<StoreInfo[]> {
  return delay(MOCK_STORES.filter((s) => s.siteId === siteId));
}

export async function fetchStore(siteId: number, storeNum: number): Promise<StoreInfo | null> {
  const store = MOCK_STORES.find((s) => s.siteId === siteId && s.storenum === storeNum) ?? null;
  return delay(store);
}

/** Mock of GET /api/ReservationZones — seating areas for the site. */
export async function fetchZones(siteId: number): Promise<ReservationZone[]> {
  return delay(MOCK_ZONES.filter((z) => z.siteId === siteId));
}

/** Mock of GET /api/ReservationPeriods — service periods (Lunch, Dinner…) for a given store. */
export async function fetchPeriods(siteId: number, sNum: number): Promise<ReservationPeriod[]> {
  return delay(MOCK_PERIODS.filter((p) => p.siteId === siteId && p.sNum === sNum));
}

/** Mock of GET /api/ReservationPeriodRules — which periods run on which days of week, per store. */
export async function fetchPeriodRules(siteId: number, sNum: number): Promise<ReservationPeriodRule[]> {
  return delay(MOCK_PERIOD_RULES.filter((r) => r.siteId === siteId && r.sNum === sNum));
}

/** Mock of GET /api/ReservationDateOverrides — per-date overrides of which period runs. */
export async function fetchDateOverrides(siteId: number, sNum: number): Promise<ReservationDateOverride[]> {
  return delay(MOCK_DATE_OVERRIDES.filter((o) => o.siteId === siteId && o.sNum === sNum));
}

/** Mock of GET /api/MenuCategories — menu categories for a given store. */
export async function fetchMenuCategories(siteId: number, sNum: number): Promise<MenuCategory[]> {
  return delay(
    MOCK_MENU_CATEGORIES.filter((c) => c.siteId === siteId && c.sNum === sNum).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
  );
}

/** Mock of GET /api/MenuItems — menu items for a given store. */
export async function fetchMenuItems(siteId: number, sNum: number): Promise<MenuItem[]> {
  return delay(MOCK_MENU_ITEMS.filter((i) => i.siteId === siteId && i.sNum === sNum));
}

/**
 * GET /api/ReservationBookings?BookingPhone=... — a phone's reservations, on the real HQ-WebOffice-API.
 *
 * Scoped to the link's own station (`StatNum`), not just its Sub (SPEC-06 R-13). One Sub runs
 * several restaurants, and a Sub-wide lookup listed the guest's bookings at every one of them
 * — each with this page's Pre-order and Cancel buttons, so a guest could order food against
 * another restaurant's booking through this restaurant's menu. `StatNum` is an exact filter
 * the API already honours; the check below repeats it so a server that ever stops filtering
 * this anonymous lookup cannot bring those rows back.
 */
export async function fetchBookingsByPhone(
  phone: string,
  siteId?: number,
  sNum?: number,
  statNum?: number,
): Promise<ReservationBooking[]> {
  const { data } = await http.get<ApiEnvelope<PaginatedResult<ReservationBooking>>>('/api/ReservationBookings', {
    params: { BookingPhone: phone, SiteId: siteId, SNum: sNum, StatNum: statNum, pageIndex: 1, pageSize: 100 },
  });
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to load reservations');
  }
  return data.data.items
    .filter((booking) => statNum == null || booking.statNum == null || booking.statNum === statNum)
    .sort((a, b) => (b.reservationDate ?? '').localeCompare(a.reservationDate ?? ''));
}

/**
 * 400 from GET /api/ReservationSlotPools/availability (and POST /api/ReservationBookings) when the
 * time falls inside no serving period: the restaurant takes no bookings at that hour at all.
 */
export const PERIOD_NOT_CONFIGURED = 'PERIOD_NOT_CONFIGURED';

/** The code behind a refused call, when the API attached one — refusals come back as a real 4xx carrying the envelope. */
export function apiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const code = (error.response?.data as { errorCode?: unknown } | undefined)?.errorCode;
  return typeof code === 'string' && code ? code : null;
}

export interface SlotPoolAvailabilityQuery {
  siteId: number;
  sNum: number;
  statNum: number;
  date: string; // "yyyy-MM-dd"
  zoneId?: number;
  channelId?: number;
  /** The link's channel partner: seats are checked against that partner's share of the channel. */
  channelPartnerId?: number;
  /** "HH:mm" — the server resolves the serving period from it the same way POST /api/ReservationBookings does. */
  time?: string;
}

/**
 * GET /api/ReservationSlotPools/availability — live seats on the real HQ-WebOffice-API, one row
 * per slot pool that can serve the query.
 *
 * An empty array is an answer: no pool allocates anything to that seating area, so it can't be
 * booked. Without `time`, each row still lists `availablePeriods` — the periods it has room in.
 * A `time` outside every serving period is refused with 400 PERIOD_NOT_CONFIGURED.
 */
export async function fetchSlotPoolAvailability(query: SlotPoolAvailabilityQuery): Promise<SlotPoolAvailability[]> {
  const { data } = await http.get<ApiEnvelope<SlotPoolAvailability[]>>('/api/ReservationSlotPools/availability', {
    params: {
      SiteId: query.siteId,
      SNum: query.sNum,
      StatNum: query.statNum,
      date: query.date,
      ZoneID: query.zoneId,
      ChannelID: query.channelId,
      ChannelPartnerID: query.channelPartnerId,
      time: query.time,
    },
  });
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to load availability');
  }
  return data.data ?? [];
}

/** POST /api/ReservationBookings — creates a reservation on the real HQ-WebOffice-API. */
export async function createBooking(
  payload: ReservationBookingCreatePayload,
): Promise<ReservationBooking> {
  const { data } = await http.post<ApiEnvelope<ReservationBooking>>('/api/ReservationBookings', payload);
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to create booking');
  }
  return data.data;
}

/** The reservation a guest calls off, and the station it belongs to — the PUT requires all of it. */
export interface CancelBookingInput {
  globalId: number;
  siteId: number;
  sNum: number;
  statNum: number;
}

/**
 * PUT /api/ReservationBookings — the guest cancels their own reservation on the real HQ-WebOffice-API.
 * Only ever called for a still-pending (status 1) booking (`canCancelBooking`).
 *
 * Sent as Cancel (3). It used to go out as No-show (7) for want of a "cancelled by guest" code,
 * which booked every guest who cancelled ahead as one who never turned up — and, sent without
 * SiteId / SNum / StatNum, was refused by the API with a 400 anyway. The seats come back the
 * same either way (the API releases Cancel and No-show alike); what changes is the record.
 * The station sent is the booking's own: the API refuses to move a booking to another one.
 */
export async function cancelBooking({ globalId, siteId, sNum, statNum }: CancelBookingInput): Promise<ReservationBooking> {
  const payload: ReservationBookingUpdatePayload = { globalId, siteId, sNum, statNum, status: ReservationStatus.Cancel };
  const { data } = await http.put<ApiEnvelope<ReservationBooking>>('/api/ReservationBookings', payload);
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to cancel reservation');
  }
  return data.data;
}
