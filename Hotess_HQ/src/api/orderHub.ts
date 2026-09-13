import { http } from './http';
import { fetchAllPages } from './paginate';
import {
  PRE_RELEASE_ORDER_STATUSES,
  type ApiEnvelope,
  type EditPreOrderResult,
  type PagedResult,
  type PreOrder,
  type PreOrderLineChange,
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
 * One page of orders. `Status` is an exact match server-side, so covering several statuses
 * means one call each. `From`/`To` are deliberately not sent: they filter on `CreatedAt`, and
 * a pre-order for tonight may well have been placed last week.
 */
async function fetchOrdersPage(
  scope: Pick<SiteScope, 'siteId' | 'sNum'>,
  filter: { status?: string; search?: string },
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<PreOrder>> {
  const res = await http.get<ApiEnvelope<OrderHubOrdersPage>>('/api/OrderHub/Orders', {
    params: {
      SiteId: scope.siteId,
      StoreId: scope.sNum,
      Status: filter.status,
      Search: filter.search,
      Page: pageIndex,
      PageSize: pageSize,
    },
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
      fetchAllPages((pageIndex, pageSize) => fetchOrdersPage(scope, { status }, pageIndex, pageSize)),
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

/** Raw shape of GET api/OrderHub/Reservation/{no}/Orders (`A-30`). */
interface ReservationOrdersResponse {
  reservationNo: string;
  orders: PreOrder[];
}

/** Enough page for every order one booking could carry; nobody pre-orders 200 times. */
const RESERVATION_ORDERS_PAGE = 200;

/**
 * Every pre-order of ONE booking — `GET api/OrderHub/Reservation/{no}/Orders` (`A-30`).
 *
 * The list path above walks each pre-release status through `fetchAllPages`, and an order
 * that changes status between two pages is an order that vanishes from the result. Asking
 * the server for one booking removes both the page walk and that hole, so **this is the
 * call to use whenever a single booking is on screen**.
 *
 * Deliberately NOT used for lists: one call per row turns a screen showing twenty bookings
 * into twenty calls, which is worse than the four the list path costs however busy the day.
 *
 * The result is narrowed to the pre-release statuses so the panel keeps its meaning — every
 * order it shows is one the hostess can still release, edit, or call off. `A-30` also
 * returns already-released and cancelled orders, which belong to the POS bill, not here.
 */
export async function fetchPreOrdersForReservation(
  reservationNo: string,
  scope: Pick<SiteScope, 'siteId' | 'sNum'>,
): Promise<PreOrder[]> {
  const res = await http.get<ApiEnvelope<ReservationOrdersResponse>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Orders`,
  );
  const orders = (res.data.data?.orders ?? []).filter((order) =>
    (PRE_RELEASE_ORDER_STATUSES as readonly string[]).includes(order.orderStatus),
  );
  return orders.length > 0 ? hydrateItems(orders, reservationNo, scope) : orders;
}

/**
 * Put the dish lines back on orders that came without them.
 *
 * `A-30` as deployed returns the order rows only — no `items` — while the panel exists to
 * show what the guest ordered and the edit modal works line by line. One extra call keyed
 * on the booking code fills them in, and the moment the endpoint starts carrying `items`
 * this returns untouched after zero calls.
 *
 * `Search` is a fuzzy multi-field match, so it is used ONLY as a line source: which orders
 * belong to the booking is decided by `A-30` alone. An order the search fails to bring back
 * simply keeps no lines rather than borrowing another booking's.
 */
async function hydrateItems(
  orders: PreOrder[],
  reservationNo: string,
  scope: Pick<SiteScope, 'siteId' | 'sNum'>,
): Promise<PreOrder[]> {
  if (orders.every((order) => Array.isArray(order.items))) return orders;

  try {
    const page = await fetchOrdersPage(scope, { search: reservationNo }, 1, RESERVATION_ORDERS_PAGE);
    const itemsByUid = new Map(page.items.map((order) => [order.orderUid, order.items]));
    return orders.map((order) =>
      Array.isArray(order.items) ? order : { ...order, items: itemsByUid.get(order.orderUid) ?? null },
    );
  } catch {
    // The totals and the actions are all still correct without lines; a panel that lists no
    // dishes beats a panel that fails to open.
    return orders;
  }
}

/**
 * POST api/OrderHub/Reservation/{no}/Orders/{uid}/Lines — the hostess drops a dish or
 * lowers a quantity before the guest arrives (`A-29`, STT 13).
 *
 * Three server rules the UI has to have honoured before it ever gets here:
 * `scheduled` orders only, no additions and no increases, and `refundDue` is a number to
 * act on by hand — nothing about this call moves money back to the guest.
 *
 * `empNum` stamps the order's event log with who did it. It carries the app's `userId`,
 * the same actor `userSeat` records when the guest is seated, so one booking's audit trail
 * names the same person throughout.
 */
export async function editPreOrderLines(
  reservationNo: string,
  orderUid: string,
  changes: PreOrderLineChange[],
  options: { empNum?: number | null; note?: string } = {},
): Promise<EditPreOrderResult> {
  const res = await http.post<ApiEnvelope<EditPreOrderResult>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Orders/${encodeURIComponent(orderUid)}/Lines`,
    {
      empNum: options.empNum ?? undefined,
      changes,
      note: options.note?.trim() || undefined,
    },
  );
  const data = res.data.data;
  return {
    orderUid: data?.orderUid ?? orderUid,
    reservationNo: data?.reservationNo ?? reservationNo,
    grandTotal: data?.grandTotal ?? 0,
    refundDue: data?.refundDue ?? 0,
    couponWarnings: data?.couponWarnings ?? [],
  };
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
