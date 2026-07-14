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

/** GET /api/ReservationBookings?BookingPhone=... — a phone's reservations, on the real HQ-WebOffice-API. */
export async function fetchBookingsByPhone(
  phone: string,
  siteId?: number,
  sNum?: number,
): Promise<ReservationBooking[]> {
  const { data } = await http.get<ApiEnvelope<PaginatedResult<ReservationBooking>>>('/api/ReservationBookings', {
    params: { BookingPhone: phone, SiteId: siteId, SNum: sNum, pageIndex: 1, pageSize: 100 },
  });
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to load reservations');
  }
  return [...data.data.items].sort((a, b) => (b.reservationDate ?? '').localeCompare(a.reservationDate ?? ''));
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

/**
 * PUT /api/ReservationBookings — cancels a reservation on the real HQ-WebOffice-API.
 * Only ever called for a still-pending (status 1) booking; there's no dedicated
 * "cancelled by guest" code, so it reports back as status 7 (No-show).
 */
export async function cancelBooking(globalId: number): Promise<ReservationBooking> {
  const payload: ReservationBookingUpdatePayload = { globalId, status: ReservationStatus.NoShow };
  const { data } = await http.put<ApiEnvelope<ReservationBooking>>('/api/ReservationBookings', payload);
  if (data.status !== 200) {
    throw new Error(data.message || 'Failed to cancel reservation');
  }
  return data.data;
}
