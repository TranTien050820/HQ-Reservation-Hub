import { http } from './http';
import type { ApiEnvelope, PagedResult, ReservationBooking, CreateReservationBookingRequest, SiteScope } from '../types';
import { mockBookings, nextMockId, todayStr } from './mockData';

export interface BookingSearchFilters extends SiteScope {
  reservationNo?: string;
  bookingPhone?: string;
  bookingName?: string;
  reservationDate?: string;
  status?: number[];
  zoneId?: number;
  pageIndex?: number;
  pageSize?: number;
}

/** Raw shape as returned by GET/POST/PUT /api/ReservationBookings — the
 * primary key is `globalId` (not `reservationId`), party size is `partySize`
 * (not `numOfGuest`), zone is `zoneID`, and notes are `customerNote`. */
interface RawSeatTableRef {
  tableNumber?: string | number | null;
  tableNum?: string | number | null;
  tablenum?: string | number | null;
}

interface RawReservationBooking {
  globalId: number;
  siteId: number;
  bookingName: string;
  bookingPhone: string;
  bookingEmail?: string | null;
  reservationNo: string;
  reservationDate: string;
  reservationTime?: string | null;
  partySize: number;
  zoneID?: number | null;
  status: number;
  customerNote?: string | null;
  internalNote?: string | null;
  userCreated?: number | string | null;
  dateCreated?: string | null;
  seatTables?: RawSeatTableRef[] | null;
}

function mapRawBooking(raw: RawReservationBooking): ReservationBooking {
  return {
    reservationId: raw.globalId,
    reservationNo: raw.reservationNo,
    bookingName: raw.bookingName,
    bookingPhone: raw.bookingPhone,
    bookingEmail: raw.bookingEmail ?? undefined,
    reservationDate: raw.reservationDate,
    reservationTime: raw.reservationTime ?? undefined,
    numOfGuest: raw.partySize,
    zoneId: raw.zoneID ?? undefined,
    status: raw.status,
    notes: raw.customerNote || raw.internalNote || undefined,
    siteId: raw.siteId,
    userCreated: raw.userCreated != null ? String(raw.userCreated) : undefined,
    createdDate: raw.dateCreated ?? undefined,
    tableNumbers: (raw.seatTables ?? [])
      .map((st) => st.tableNumber ?? st.tableNum ?? st.tablenum)
      .filter((v): v is string | number => v != null)
      .map(String),
  };
}

function mockSearch(filters: BookingSearchFilters): PagedResult<ReservationBooking> {
  let items = mockBookings.filter((b) => b.siteId === filters.siteId);
  if (filters.reservationNo) {
    items = items.filter((b) => b.reservationNo.toLowerCase().includes(filters.reservationNo!.toLowerCase()));
  }
  if (filters.bookingPhone) {
    items = items.filter((b) => b.bookingPhone.includes(filters.bookingPhone!));
  }
  if (filters.bookingName) {
    items = items.filter((b) => b.bookingName.toLowerCase().includes(filters.bookingName!.toLowerCase()));
  }
  if (filters.reservationDate) {
    items = items.filter((b) => b.reservationDate === filters.reservationDate);
  }
  if (filters.status?.length) {
    items = items.filter((b) => filters.status!.includes(b.status));
  }
  if (filters.zoneId) {
    items = items.filter((b) => b.zoneId === filters.zoneId);
  }
  return { items, totalRecords: items.length, pageIndex: 1, pageSize: 50, totalPages: 1 };
}

export async function searchBookings(filters: BookingSearchFilters): Promise<PagedResult<ReservationBooking>> {
  try {
    const res = await http.get<ApiEnvelope<PagedResult<RawReservationBooking>>>('/api/ReservationBookings', {
      params: {
        ReservationNo: filters.reservationNo,
        BookingPhone: filters.bookingPhone,
        BookingName: filters.bookingName,
        ReservationDate: filters.reservationDate,
        Status: filters.status?.join(','),
        ZoneID: filters.zoneId,
        SiteId: filters.siteId,
        SNum: filters.sNum,
        StatNum: filters.statNum,
        PageIndex: filters.pageIndex ?? 1,
        PageSize: filters.pageSize ?? 50,
      },
    });
    const data = res.data.data;
    if (!data || !Array.isArray(data.items)) throw new Error('Unexpected response shape: expected a PagedResult');
    return { ...data, items: data.items.map(mapRawBooking) };
  } catch (err) {
    console.warn('[bookings] search API unavailable, using mock fallback', err);
    return mockSearch(filters);
  }
}

export async function createBooking(payload: CreateReservationBookingRequest): Promise<ReservationBooking> {
  try {
    const res = await http.post<ApiEnvelope<RawReservationBooking>>('/api/ReservationBookings', {
      bookingName: payload.bookingName,
      bookingPhone: payload.bookingPhone,
      reservationDate: payload.reservationDate,
      partySize: payload.numOfGuest,
      zoneID: payload.zoneId,
      status: payload.status,
      customerNote: payload.notes,
      siteId: payload.siteId,
      sNum: payload.sNum,
      statNum: payload.statNum,
      channelID: payload.channelId,
      userCreated: payload.userCreated,
    });
    return mapRawBooking(res.data.data);
  } catch (err) {
    console.warn('[bookings] create API unavailable, using mock fallback', err);
    const booking: ReservationBooking = {
      reservationId: nextMockId(),
      reservationNo: `RS${nextMockId()}`,
      bookingName: payload.bookingName,
      bookingPhone: payload.bookingPhone,
      reservationDate: payload.reservationDate || todayStr(),
      numOfGuest: payload.numOfGuest,
      zoneId: payload.zoneId,
      status: payload.status,
      notes: payload.notes,
      siteId: payload.siteId,
    };
    mockBookings.push(booking);
    return booking;
  }
}

export async function updateBooking(
  reservationId: number,
  patch: Partial<ReservationBooking>,
): Promise<ReservationBooking> {
  try {
    const res = await http.put<ApiEnvelope<RawReservationBooking>>('/api/ReservationBookings', {
      globalId: reservationId,
      status: patch.status,
      zoneID: patch.zoneId,
      partySize: patch.numOfGuest,
      customerNote: patch.notes,
    });
    return mapRawBooking(res.data.data);
  } catch (err) {
    console.warn('[bookings] update API unavailable, using mock fallback', err);
    const idx = mockBookings.findIndex((b) => b.reservationId === reservationId);
    if (idx === -1) throw new Error('Booking not found (mock)');
    mockBookings[idx] = { ...mockBookings[idx], ...patch };
    return mockBookings[idx];
  }
}
