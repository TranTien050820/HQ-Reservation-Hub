import { http } from './http';
import { fetchAllPages } from './paginate';
import {
  PRE_RELEASE_ORDER_STATUSES,
  type ApiEnvelope,
  type PagedResult,
  type PreOrder,
  type ReservationReleaseResult,
  type SiteScope,
} from '../types';

/**
 * OrderHub, from the hostess side — the food a guest ordered days before arriving.
 *
 * Two halves of one story (HQ-WebOffice-API/docs/ORDERHUB_API_GUIDE.md §5.10, §8.4):
 * reading which bookings arrive with food already chosen, and releasing that food to the
 * kitchen once the guest is seated at a real table. Nothing reaches the POS until Release
 * runs, which is why a pre-order that nobody releases simply never gets cooked.
 */

/** Raw page shape of GET api/OrderHub/Orders — `total`, not the `totalRecords` used elsewhere. */
interface OrderHubOrdersPage {
  items: PreOrder[];
  total: number;
}

/**
 * One page of orders in a single status. `Status` is an exact match server-side, so covering
 * several statuses means one call each. `From`/`To` are deliberately not sent: they filter on
 * `CreatedAt`, and a pre-order for tonight may well have been placed last week.
 */
async function fetchOrdersPage(
  scope: Pick<SiteScope, 'siteId' | 'sNum'>,
  status: string,
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<PreOrder>> {
  const res = await http.get<ApiEnvelope<OrderHubOrdersPage>>('/api/OrderHub/Orders', {
    params: { SiteId: scope.siteId, StoreId: scope.sNum, Status: status, Page: pageIndex, PageSize: pageSize },
  });
  const data = res.data.data;
  const items = data?.items ?? [];
  const totalRecords = data?.total ?? items.length;
  return {
    items,
    totalRecords,
    pageIndex,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(totalRecords / pageSize) : 1,
  };
}

export interface PreOrdersByReservation {
  /** reservationNo -> that booking's orders, newest first. */
  byReservation: Map<string, PreOrder[]>;
  /** True when a status hit the page walker's ceiling — some pre-orders may be missing. */
  truncated: boolean;
}

/**
 * Every pre-order still waiting for its guest, keyed by reservation.
 *
 * Only the pre-release statuses are fetched: once a booking is checked in and released, its
 * orders move on to the kitchen states and stop being the hostess's business. There is no
 * "orders of reservation X" endpoint, so the store's open pre-orders are pulled once and
 * matched client-side — the set is bounded by upcoming reservations, not by history.
 */
export async function fetchPreOrdersByReservation(
  scope: Pick<SiteScope, 'siteId' | 'sNum'>,
): Promise<PreOrdersByReservation> {
  const pages = await Promise.all(
    PRE_RELEASE_ORDER_STATUSES.map((status) =>
      fetchAllPages((pageIndex, pageSize) => fetchOrdersPage(scope, status, pageIndex, pageSize)),
    ),
  );

  const byReservation = new Map<string, PreOrder[]>();
  for (const page of pages) {
    for (const order of page.items) {
      const key = order.reservationNo?.trim();
      if (!key) continue;
      const list = byReservation.get(key);
      if (list) list.push(order);
      else byReservation.set(key, [order]);
    }
  }
  for (const list of byReservation.values()) {
    list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }

  return { byReservation, truncated: pages.some((p) => p.truncated) };
}

/**
 * POST api/OrderHub/Reservation/{reservationNo}/Release — check-in.
 *
 * Call it only once the booking is Seated **and** has a table in ReserSeatTables: the backend
 * needs that table to know which POS bill the food joins, and answers 409 otherwise. Safe to
 * call twice — an order that already left `scheduled` lands in `skipped` rather than being
 * cooked a second time.
 */
export async function releaseReservationOrders(reservationNo: string): Promise<ReservationReleaseResult> {
  const res = await http.post<ApiEnvelope<ReservationReleaseResult>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Release`,
  );
  return res.data.data;
}

/**
 * POST api/OrderHub/Reservation/{reservationNo}/Cancel — the guest is not coming.
 *
 * Cancels the food only; the booking itself is untouched. Money already taken is NOT refunded
 * automatically — deposit policy is the store's call, so the system just files the order for
 * Ops to settle.
 */
export async function cancelReservationOrders(reservationNo: string, note: string): Promise<number> {
  const res = await http.post<ApiEnvelope<{ reservationNo: string; cancelled: number }>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Cancel`,
    { note },
  );
  return res.data.data?.cancelled ?? 0;
}
