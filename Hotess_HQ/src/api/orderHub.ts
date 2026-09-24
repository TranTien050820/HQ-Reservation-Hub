import { http } from './http';
import { fetchAllPages } from './paginate';
import {
  PRE_RELEASE_ORDER_STATUSES,
  type ApiEnvelope,
  type EditPreOrderResult,
  type PagedResult,
  type PreOrder,
  type PreOrderLineChange,
  type ReservationBooking,
  type ReservationCancelResult,
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
 *
 * Every call here carries the full station scope `(siteId, sNum, statNum)` (SPEC-06 R-10).
 * One Sub runs several restaurants, and a scope that stops at `sNum` hands this hostess the
 * food — names, phones, totals — of every other restaurant sharing the POS database.
 */

/**
 * The scope a call about ONE booking runs under: the booking's own `(siteId, sNum, statNum)`.
 *
 * A pre-order belongs to the booking it was placed for, and the booking record is the source
 * of truth for which station that is — not whichever link this terminal happened to open. The
 * link only fills in a piece an older row came back without. In practice the two agree: every
 * booking this app lists was searched with the link's own StatNum.
 */
export function bookingScope(
  booking: Pick<ReservationBooking, 'siteId' | 'sNum' | 'statNum'> | null | undefined,
  link: SiteScope,
): SiteScope {
  return {
    siteId: booking?.siteId ?? link.siteId,
    sNum: booking?.sNum ?? link.sNum,
    statNum: booking?.statNum ?? link.statNum,
  };
}

/**
 * Query string of the per-booking endpoints (`Reservation/{no}/…`). An API that predates
 * SPEC-06 ignores unknown query parameters, so sending them is safe before it learns to
 * filter on them. They go in the query, never the body: the body of `Release` must stay
 * empty for the HMAC signature (see `http.ts`).
 */
function scopeParams(scope: SiteScope) {
  return { siteId: scope.siteId, sNum: scope.sNum, statNum: scope.statNum };
}

/** Raw page shape of GET api/OrderHub/Orders — `total`, not the `totalRecords` used elsewhere. */
interface OrderHubOrdersPage {
  items: PreOrder[];
  total: number;
}

/**
 * One page of orders. `Status` is an exact match server-side, so covering several statuses
 * means one call each. `From`/`To` are deliberately not sent: they filter on `CreatedAt`, and
 * a pre-order for tonight may well have been placed last week.
 *
 * `StatNum` is an exact match on the order's own station, already honoured by the API as
 * deployed. The station is the one the booking was made on: a pre-order is placed through
 * the guest's booking link, and that link is the booking's station.
 */
async function fetchOrdersPage(
  scope: SiteScope,
  filter: { status?: string; search?: string },
  pageIndex: number,
  pageSize: number,
): Promise<PagedResult<PreOrder>> {
  const res = await http.get<ApiEnvelope<OrderHubOrdersPage>>('/api/OrderHub/Orders', {
    params: {
      SiteId: scope.siteId,
      StoreId: scope.sNum,
      StatNum: scope.statNum,
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
 * orders move on to the kitchen states and stop being the hostess's business. The station's
 * open pre-orders are pulled once and matched client-side — the set is bounded by upcoming
 * reservations, not by history — which is why this is the call for LISTS of bookings.
 *
 * `scope` is the link's: every booking the list is matched against was searched with that
 * same StatNum. A pre-order filed under another station than its booking (placed through a
 * different restaurant's link before SPEC-06 R-13 closed that door) is not in this set —
 * anything that decides about ONE booking asks `fetchPreOrdersForReservation` instead.
 */
export async function fetchPreOrdersByReservation(scope: SiteScope): Promise<PreOrdersByReservation> {
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
 *
 * `scope` is the BOOKING's (`bookingScope`), sent as `siteId`/`sNum`/`statNum` query params.
 */
export async function fetchPreOrdersForReservation(reservationNo: string, scope: SiteScope): Promise<PreOrder[]> {
  const orders = await readReservationOrders(reservationNo, scope);
  return orders.length > 0 ? hydrateItems(orders, reservationNo, scope) : orders;
}

/**
 * Does this ONE booking still have food waiting for Release? One `A-30` call, no line fill-in.
 *
 * What the seating screen asks before it decides to skip Release. The station-wide list can
 * come back without a booking's orders — it failed, it hit the page ceiling, an order changed
 * status mid-walk, or the order sits under another station than the link — and skipping on
 * that answer is how food silently never reaches the kitchen (SPEC-06 R-14).
 */
export async function hasPreOrdersForReservation(reservationNo: string, scope: SiteScope): Promise<boolean> {
  return (await readReservationOrders(reservationNo, scope)).length > 0;
}

/** `A-30` narrowed to the pre-release statuses, exactly as the orders came back. */
async function readReservationOrders(reservationNo: string, scope: SiteScope): Promise<PreOrder[]> {
  const res = await http.get<ApiEnvelope<ReservationOrdersResponse>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Orders`,
    { params: scopeParams(scope) },
  );
  return (res.data.data?.orders ?? []).filter((order) =>
    (PRE_RELEASE_ORDER_STATUSES as readonly string[]).includes(order.orderStatus),
  );
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
async function hydrateItems(orders: PreOrder[], reservationNo: string, scope: SiteScope): Promise<PreOrder[]> {
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
 *
 * `scope` is the booking's (`bookingScope`), sent as query params — the body is unchanged.
 */
export async function editPreOrderLines(
  reservationNo: string,
  orderUid: string,
  changes: PreOrderLineChange[],
  scope: SiteScope,
  options: { empNum?: number | null; note?: string } = {},
): Promise<EditPreOrderResult> {
  const res = await http.post<ApiEnvelope<EditPreOrderResult>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Orders/${encodeURIComponent(orderUid)}/Lines`,
    {
      empNum: options.empNum ?? undefined,
      changes,
      note: options.note?.trim() || undefined,
    },
    { params: scopeParams(scope) },
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
 * cooked a second time. Just as safe on a booking with no pre-order at all: it answers
 * `released: 0, skipped: 0` and touches nothing.
 *
 * `scope` is the booking's (`bookingScope`), in the query string. No body — the signature
 * of an empty POST is `"." + ""`, which is what `http.ts` signs.
 */
export async function releaseReservationOrders(
  reservationNo: string,
  scope: SiteScope,
): Promise<ReservationReleaseResult> {
  const res = await http.post<ApiEnvelope<ReservationReleaseResult>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Release`,
    undefined,
    { params: scopeParams(scope) },
  );
  return res.data.data;
}

/**
 * POST api/OrderHub/Reservation/{reservationNo}/Cancel — the guest is not coming.
 *
 * Cancels the food only; the booking itself is untouched. Money already taken is NOT refunded
 * automatically — deposit policy is the store's call, so the system just files the order for
 * Ops to settle. `scope` is the booking's, in the query string.
 *
 * Like Release, a pre-order outside `scope` is skipped rather than failing the whole call —
 * reported back in `warnings`, which the caller has to surface: it is the only sign that
 * "cancelled" is smaller than every pre-order the hostess could see on screen.
 */
export async function cancelReservationOrders(
  reservationNo: string,
  note: string,
  scope: SiteScope,
): Promise<ReservationCancelResult> {
  const res = await http.post<ApiEnvelope<{ reservationNo: string; cancelled: number; warnings?: string[] }>>(
    `/api/OrderHub/Reservation/${encodeURIComponent(reservationNo)}/Cancel`,
    { note },
    { params: scopeParams(scope) },
  );
  return {
    reservationNo: res.data.data?.reservationNo ?? reservationNo,
    cancelled: res.data.data?.cancelled ?? 0,
    warnings: res.data.data?.warnings ?? [],
  };
}
