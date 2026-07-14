// Domain types for the standalone Hotess reception app.

export interface ApiEnvelope<T> {
  status: number;
  statusText: string;
  message?: string;
  data: T;
}

export interface PagedResult<T> {
  items: T[];
  totalRecords: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
}

/** siteId/sNum/statNum identify the store context — every GET filtered by store must send all three. */
export interface SiteScope {
  siteId: number;
  sNum: number;
  statNum: number;
}

/** Booking status: 1=New 2=Confirm 3=Cancel 4=Reserved 5=Overdue 6=Seated 7=NoShow 8=Close */
export const BookingStatus = {
  New: 1,
  Confirm: 2,
  Cancel: 3,
  Reserved: 4,
  Overdue: 5,
  Seated: 6,
  NoShow: 7,
  Close: 8,
} as const;
export type BookingStatusValue = (typeof BookingStatus)[keyof typeof BookingStatus];

export const BOOKING_STATUS_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'status.new', color: '#64748b' },
  2: { label: 'status.confirm', color: '#3b82f6' },
  3: { label: 'status.cancel', color: '#ef4444' },
  4: { label: 'status.reserved', color: '#8b5cf6' },
  5: { label: 'status.overdue', color: '#f59e0b' },
  6: { label: 'status.seated', color: '#22c55e' },
  7: { label: 'status.noshow', color: '#dc2626' },
  8: { label: 'status.close', color: '#475569' },
};

/** Waitlist status: 0=Waiting 1=Confirmed 2=Reserved(seated) 3=Cancelled 4=Expired */
export const WaitlistStatus = {
  Waiting: 0,
  Confirmed: 1,
  Reserved: 2,
  Cancelled: 3,
  Expired: 4,
} as const;
export type WaitlistStatusValue = (typeof WaitlistStatus)[keyof typeof WaitlistStatus];

export const WAITLIST_STATUS_CONFIG: Record<number, { label: string; color: string }> = {
  0: { label: 'waitlistStatus.waiting', color: '#f59e0b' },
  1: { label: 'waitlistStatus.confirmed', color: '#3b82f6' },
  2: { label: 'waitlistStatus.seated', color: '#22c55e' },
  3: { label: 'waitlistStatus.cancelled', color: '#ef4444' },
  4: { label: 'waitlistStatus.expired', color: '#64748b' },
};

export interface ReservationZone {
  zoneId: number;
  zoneName: string;
  siteId: number;
  isActive: boolean;
  secNum?: string;
  /** Configured slot capacity for the zone (used as a fallback when AvailableSlots has no row for it). */
  capacity?: number;
}

export interface ReservationBooking {
  reservationId: number;
  reservationNo: string;
  bookingName: string;
  bookingPhone: string;
  bookingEmail?: string;
  reservationDate: string;
  reservationTime?: string;
  numOfGuest: number;
  zoneId?: number;
  zoneName?: string;
  status: number;
  notes?: string;
  siteId: number;
  userCreated?: string;
  createdDate?: string;
  tableNumbers?: string[];
}

export interface CreateReservationBookingRequest {
  bookingName: string;
  bookingPhone: string;
  reservationDate: string;
  numOfGuest: number;
  zoneId?: number;
  status: number;
  notes?: string;
  siteId: number;
  sNum: number;
  statNum: number;
  channelId?: number;
  userCreated?: string;
}

export interface TableSetup {
  tableId: number;
  tableNumber: string;
  secNum: string;
  /** Human-readable section name (from `sections[].descript`), when known. */
  sectionName?: string;
  zoneId: number;
  minNumCust: number;
  maxNumCust: number;
  canReserve: boolean;
  siteId: number;
}

/**
 * The real /api/ReserSeatTables endpoint references the booking by
 * `reservationNo` (business key) and the table by its `tablenum` — not by our
 * internal `reservationId`/`tableId` primary keys — so this type mirrors that.
 */
export interface ReserSeatTable {
  reservationNo: string;
  tableNumber: string;
  reserDate: string;
  reserStartTime?: string;
  reserEndTime?: string;
}

export interface AvailableSlot {
  zoneId: number;
  zoneName?: string;
  total: number;
  used: number;
  free: number;
  seated: number;
}

export interface ReservationWaitlist {
  waitlistId: number;
  name: string;
  phone: string;
  numOfGuest: number;
  zoneId?: number;
  zoneName?: string;
  notes?: string;
  isVip: boolean;
  status: number;
  createdDate: string;
  siteId: number;
  reservationNo?: string;
}

export interface CreateWaitlistRequest {
  name: string;
  phone: string;
  numOfGuest: number;
  zoneId?: number;
  notes?: string;
  isVip: boolean;
  siteId: number;
  sNum: number;
  statNum: number;
}

export interface AuthUser {
  userId: string;
  userName: string;
  fullName: string;
}

export interface AuthGroup {
  groupId: string;
  groupName: string;
}

export interface AuthSite {
  siteId: number;
  siteName: string;
}

export interface LoginResponseData {
  user: AuthUser;
  group?: AuthGroup;
  roles: string[];
  sites: AuthSite[];
  accessToken: string;
  refreshToken: string;
}

export interface LinkInfo {
  siteId: number;
  sNum: number;
  statNum: number;
  channelId?: number;
  /** Zones already resolved by the ReservationLinks/Booking?publicKey call — reuse this, don't re-fetch ReservationZones. */
  zones?: ReservationZone[];
  /** Tables already resolved (from tableSetups + zoneSectionLinks) by the same call — reuse this, don't re-fetch TableSetup. */
  tableSetups?: TableSetup[];
}
