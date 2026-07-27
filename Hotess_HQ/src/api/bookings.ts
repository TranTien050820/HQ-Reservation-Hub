import { http } from './http';
import { fetchAllPages } from './paginate';
import type {
  ApiEnvelope,
  PagedResult,
  ReservationBooking,
  CreateReservationBookingRequest,
  UpdateReservationBookingRequest,
  ReservationBookingFilters,
  SiteScope,
} from '../types';

/** GET /api/ReservationBookings — query params use the exact backend casing (BookingPhone, ZoneID, ...). */
export async function searchBookings(filters: ReservationBookingFilters): Promise<PagedResult<ReservationBooking>> {
  const res = await http.get<ApiEnvelope<PagedResult<ReservationBooking>>>('/api/ReservationBookings', {
    params: {
      SiteId: filters.siteId,
      SNum: filters.sNum,
      StatNum: filters.statNum,
      ReservationNo: filters.reservationNo,
      BookingPhone: filters.bookingPhone,
      BookingName: filters.bookingName,
      ReservationDate: filters.reservationDate,
      Status: filters.status,
      ZoneID: filters.zoneID,
      pageIndex: filters.pageIndex ?? 1,
      pageSize: filters.pageSize ?? 50,
    },
  });
  const data = res.data.data;
  if (!data || !Array.isArray(data.items)) throw new Error('Unexpected response shape: expected a PagedResult');
  return data;
}

/**
 * The reservationNos of a day's bookings that sit in any of `statuses`.
 *
 * Answers "has this guest already sat down / left?" without pulling the day's
 * entire booking list: the endpoint filters by status server-side, so only the
 * handful of rows we actually care about crosses the wire, however busy the
 * store is. Returns `truncated` if any status hit the page walker's ceiling —
 * the caller decides whether to warn rather than quietly under-reporting.
 */
export async function fetchReservationNosByStatus(
  scope: SiteScope,
  reservationDate: string,
  statuses: number[],
): Promise<{ reservationNos: Set<string>; truncated: boolean }> {
  const results = await Promise.all(
    statuses.map((status) =>
      fetchAllPages((pageIndex, pageSize) =>
        searchBookings({ ...scope, reservationDate, status, pageIndex, pageSize }),
      ),
    ),
  );
  const reservationNos = new Set<string>();
  for (const result of results) {
    for (const booking of result.items) {
      if (booking.reservationNo != null) reservationNos.add(String(booking.reservationNo));
    }
  }
  return { reservationNos, truncated: results.some((r) => r.truncated) };
}

/** POST /api/ReservationBookings */
export async function createBooking(payload: CreateReservationBookingRequest): Promise<ReservationBooking> {
  const res = await http.post<ApiEnvelope<ReservationBooking>>('/api/ReservationBookings', payload);
  return res.data.data;
}

/** PUT /api/ReservationBookings — `globalId` is required; everything else is a partial patch. */
export async function updateBooking(payload: UpdateReservationBookingRequest): Promise<ReservationBooking> {
  const res = await http.put<ApiEnvelope<ReservationBooking>>('/api/ReservationBookings', payload);
  return res.data.data;
}
