import { http } from './http';
import { fetchAllPages, type AllPagesResult } from './paginate';
import type {
  ApiEnvelope,
  PagedResult,
  ReservationWaitlist,
  ReservationWaitlistFilters,
  CreateReservationWaitlistRequest,
  UpdateReservationWaitlistRequest,
  SiteScope,
} from '../types';

/**
 * GET /api/ReservationWaitlists — param casing is the backend's own
 * (SiteId/SNum/StatNum/ExpectedDate/ZoneId/Status/...), see
 * ReservationWaitlistsController.Get. GuestName is a LIKE match, PhoneNumber
 * an exact one.
 *
 * `sortDesc` defaults to false on purpose: a waiting list is a FIFO queue, so
 * the oldest entry must come back first. The response's `zoneName` is joined
 * from ReservationZones server-side — no extra zones call needed.
 */
export async function fetchWaitlists(
  scope: SiteScope,
  filters: ReservationWaitlistFilters = {},
): Promise<PagedResult<ReservationWaitlist>> {
  const res = await http.get<ApiEnvelope<PagedResult<ReservationWaitlist>>>('/api/ReservationWaitlists', {
    params: {
      SiteId: scope.siteId,
      SNum: scope.sNum,
      StatNum: scope.statNum,
      GlobalId: filters.globalId,
      WaitlistNo: filters.waitlistNo,
      GuestName: filters.guestName,
      PhoneNumber: filters.phoneNumber,
      ExpectedDate: filters.expectedDate,
      ZoneId: filters.zoneId,
      Status: filters.status,
      IsActive: filters.isActive ?? 1,
      pageIndex: filters.pageIndex ?? 1,
      pageSize: filters.pageSize ?? 200,
      sortField: filters.sortField ?? 'GlobalId',
      sortDesc: filters.sortDesc ?? false,
    },
  });
  const data = res.data.data;
  if (!data || !Array.isArray(data.items)) throw new Error('Unexpected response shape: expected a PagedResult');
  return data;
}

/**
 * Every row matching `filters`, walking the pages so nothing is lost past the
 * first one. Use this whenever the screen counts or filters client-side; a busy
 * store can put well over a page of guests through a single day.
 */
export async function fetchAllWaitlists(
  scope: SiteScope,
  filters: ReservationWaitlistFilters = {},
): Promise<AllPagesResult<ReservationWaitlist>> {
  return fetchAllPages((pageIndex, pageSize) => fetchWaitlists(scope, { ...filters, pageIndex, pageSize }));
}

/** POST /api/ReservationWaitlists — status is always forced to Waiting(0) server-side. */
export async function createWaitlist(payload: CreateReservationWaitlistRequest): Promise<ReservationWaitlist> {
  const res = await http.post<ApiEnvelope<ReservationWaitlist>>('/api/ReservationWaitlists', payload);
  return res.data.data;
}

/**
 * PUT /api/ReservationWaitlists — `globalId` required.
 *
 * Status transitions are executed entirely by the backend; never mirror them
 * with a ReservationBookings call from here:
 *  - Confirmed(1) → creates a booking with status Confirm(2) and consumes the
 *    zone's AvailableSlots for `partySize`.
 *  - Reserved(2)  → `seatTables` is required (each item needs reserTable,
 *    reserDate, reserStartTime and reserEndTime). Coming from Confirmed it
 *    upgrades the existing booking to Reserved(4) and inserts the seat rows;
 *    coming straight from Waiting it creates the booking too.
 *  - Cancelled(3) → booking becomes Cancel(3), seat rows are deactivated and
 *    the slots are released.
 *  - Expired(4)   → same as Cancelled but the booking becomes NoShow(7).
 *
 * `userModified` is what the backend stamps into UserConfirmed / UserReserved /
 * UserCancel / UserModified, so always pass the logged-in staff id.
 */
export async function updateWaitlist(payload: UpdateReservationWaitlistRequest): Promise<ReservationWaitlist> {
  const res = await http.put<ApiEnvelope<ReservationWaitlist>>('/api/ReservationWaitlists', payload);
  return res.data.data;
}
