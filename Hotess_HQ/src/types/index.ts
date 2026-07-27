// Domain types — field names mirror the real HQ-WebOffice-API entities/DTOs
// exactly (verified against HQ-WebOffice-API source + HQ_FE_V2's working
// reference frontend). Do not rename fields to "nicer" camelCase variants —
// the mismatched casing (zoneID vs zoneId, tablenum vs tableNum, etc.) is
// real backend inconsistency, not a bug to "fix" here.

export interface ApiEnvelope<T> {
  status: number;
  statusText?: string | null;
  message?: string | null;
  data: T;
}

export interface PagedResult<T> {
  items: T[];
  totalRecords: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
}

/** siteId/sNum/statNum identify the store context — every store-scoped call sends all three. */
export interface SiteScope {
  siteId: number;
  sNum: number;
  statNum: number;
}

/** ReservationBookingStatus: 1=New 2=Confirm 3=Cancel 4=Reserved 5=Overdue 6=Seated 7=NoShow 8=Close */
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

/** ReservationWaitlistStatus: 0=Waiting 1=Confirmed 2=Reserved(seated) 3=Cancelled 4=Expired */
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

// ---- Zones (ReservationZones entity / BookingZoneDTO) ----

export interface ReserZoneSectionLink {
  zoneID: number;
  secNum: number;
}

export interface ReservationZone {
  globalId?: number;
  siteId?: number;
  sNum?: number;
  zoneID: number;
  zoneName: string;
  isNoTable?: number;
  availableSlots?: number;
  isUseDurationMinutes?: number;
  durationMinutes?: number;
  isPauseBooking?: number;
  isActive?: number;
}

// ---- Serving periods (BookingPeriodDTO / BookingPeriodRuleDTO / BookingDateOverrideDTO) ----

/**
 * A serving window ("Ca trưa", "Ca tối"). The backend resolves a booking's
 * PeriodID by matching its time against these, so a time outside every period
 * produces a booking with no period attached.
 */
export interface ReservationPeriod {
  periodID: number;
  periodName?: string | null;
  /** "HH:mm:ss". */
  startTime?: string | null;
  endTime?: string | null;
  /** 1 when the window runs past midnight (endTime < startTime). */
  crossDay?: number | null;
  isLimitAvailable?: number | null;
  qtyLimit?: number | null;
}

/** Which weekday a period runs on. `dayOfWeek`: 0 = Sunday … 6 = Saturday. */
export interface ReservationPeriodRule {
  ruleID?: number | null;
  periodID: number;
  dayOfWeek: number;
}

/** Opens a period on one specific date, on top of the weekly rules. */
export interface ReservationDateOverride {
  dateOverrideID?: number | null;
  periodID: number;
  /** "yyyy-MM-dd". */
  overrideDate?: string | null;
}

// ---- Table setup (TableSetup entity, ALL-CAPS DB columns -> fully lowercase camelCase) ----

export interface TableSetup {
  globalId: number;
  siteId?: number;
  tablenum: number;
  secnum: number;
  minnumcust?: number;
  maxnumcust?: number;
  canreserve?: number;
  descr?: string | null;
  snum?: number;
}

export interface Section {
  globalId: number;
  secnum: number;
  descript?: string | null;
}

// ---- Reservation bookings (ReservationBookings entity) ----

/** Nested seat-table row as returned inside a booking's `seatTables[]` (ReserSeatTablesQueryDTO shape). */
export interface ReserSeatTableItem {
  globalId?: number;
  reservationNo?: number | string | null;
  tableNum?: number | null;
  reserStartTime?: string | null; // "HH:mm"
  reserEndTime?: string | null; // "HH:mm"
  reserTable?: number | null;
  reserDate?: string | null;
  isActive?: number | null;
}

/** Payload item for creating/replacing a booking's seat tables (ReserSeatTableItemDTO). */
export interface SeatTableItem {
  tableNum: number;
  reserTable: number;
  reserStartTime?: string; // "HH:mm:ss"
  reserEndTime?: string; // "HH:mm:ss"
  reserDate: string; // ISO date/datetime
}

/** Custom field answer attached to a booking (store-configured ExtraFieldConfigs), embedded in the booking DTO. */
export interface ReservationExtraValueItem {
  globalId?: number | null;
  fieldID?: number | null;
  fieldName?: string | null;
  fieldValue?: string | null;
  reservationNo?: string | null;
}

/** Store-configured custom booking field (BookingExtraFieldConfigDTO — `fieldID` is a string here), from the ReservationLinks/Booking config payload. Used to resolve a booking's extraValues[].fieldID to a label. */
export interface ExtraFieldConfig {
  fieldID?: string | null;
  fieldName?: string | null;
  fieldType?: number | null; // 3 = select — value is an option code, display text comes from ExtraFieldOptions
  displayOrder?: number | null;
  isRequired?: number | null;
  isVisible?: number | null;
}

/** Option label for a select-type ExtraFieldConfig (BookingExtraFieldOptionDTO — `fieldID` is numeric here, unlike ExtraFieldConfig's). */
export interface ExtraFieldOption {
  fieldID?: number | null;
  optionValue?: string | null;
  optionText?: string | null;
  displayOrder?: number | null;
}

export interface ReservationBooking {
  globalId: number;
  siteId?: number;
  sNum?: number;
  statNum?: number;
  bookingName: string;
  bookingPhone: string;
  bookingEmail?: string | null;
  /** The person who made the reservation on the guest's behalf (e.g. a concierge), when different from the guest. */
  bookerName?: string | null;
  bookerPhone?: string | null;
  bookerEmail?: string | null;
  reservationNo: string;
  reservationDate: string;
  reservationTime?: string | null;
  partySize: number;
  channelID?: number | null;
  zoneID?: number | null;
  status: number;
  customerNote?: string | null;
  internalNote?: string | null;
  userCreated?: number | null;
  dateCreated?: string | null;
  seatTables?: ReserSeatTableItem[] | null;
  extraValues?: ReservationExtraValueItem[] | null;
}

export interface CreateReservationBookingRequest {
  siteId: number;
  sNum: number;
  statNum: number;
  bookingName: string;
  bookingPhone: string;
  bookingEmail?: string;
  reservationDate: string;
  reservationTime?: string;
  partySize: number;
  channelID?: number;
  zoneID?: number;
  status: number;
  customerNote?: string;
  internalNote?: string;
  userCreated?: number;
  seatTables?: SeatTableItem[];
}

export type UpdateReservationBookingRequest = Partial<Omit<CreateReservationBookingRequest, 'userCreated'>> & {
  globalId: number;
};

export interface ReservationBookingFilters extends Partial<SiteScope> {
  reservationNo?: string;
  bookingPhone?: string;
  bookingName?: string;
  reservationDate?: string;
  status?: number;
  zoneID?: number;
  pageIndex?: number;
  pageSize?: number;
}

// ---- Available slots (AvailableSlots entity) ----

export interface AvailableSlot {
  zoneID: number;
  availableSlots?: number;
  numberOfUsed?: number;
  numberOfUnused?: number;
  arrivalDate?: string;
}

// ---- Waitlists (ReservationWaitlists entity) ----

/**
 * Seat-table payload item required on PUT ReservationWaitlists when status=Reserved(2).
 * The backend rejects the request unless *all four* of reserTable/reserDate/
 * reserStartTime/reserEndTime are present (WriteReservationWaitlistsUseCase
 * validates each item), so none of them are optional here.
 */
export interface WaitlistSeatTableItem {
  tableNum: number;
  reserTable: number;
  /** ISO date/datetime, e.g. "2026-07-24T00:00:00". */
  reserDate: string;
  /** TimeSpan string, e.g. "19:00:00". */
  reserStartTime: string;
  reserEndTime: string;
}

/** Mirrors ReservationWaitlistsQueryDTO — every field the GET returns. */
export interface ReservationWaitlist {
  globalId: number;
  siteId?: number | null;
  sNum?: number | null;
  statNum?: number | null;
  waitlistNo?: string | null;
  guestName: string;
  phoneNumber: string;
  email?: string | null;
  partySize: number;
  expectedDate: string;
  /** "HH:mm:ss" — feeds the created booking's ReservationTime and its PeriodID lookup. */
  expectedTime?: string | null;
  zoneId?: number | null;
  /** Joined from ReservationZones by the query repository — no separate zones call needed. */
  zoneName?: string | null;
  priority?: number | null;
  status: number;
  notes?: string | null;
  /** Set by the backend once status reaches Confirmed(1) or Reserved(2). */
  reservationNo?: string | null;
  isActive?: number | null;
  // Lifecycle stamps — the backend writes these on each status transition.
  userCreated?: number | null;
  dateCreated: string;
  userConfirmed?: number | null;
  dateConfirmed?: string | null;
  userReserved?: number | null;
  dateReserved?: string | null;
  /** Also stamped for Expired(4), not just Cancelled(3). */
  userCancel?: number | null;
  dateCancel?: string | null;
  userModified?: number | null;
  dateModified?: string | null;
  userCreatedName?: string | null;
  userModifiedName?: string | null;
}

export interface CreateReservationWaitlistRequest {
  siteId: number;
  sNum: number;
  statNum: number;
  guestName: string;
  phoneNumber: string;
  email?: string;
  partySize: number;
  expectedDate: string;
  /**
   * Required — ReservationWaitlistsDataHelper.CheckingDataCreate rejects a
   * missing ExpectedTime, and it is what the booking created on the
   * Confirmed/Reserved transition uses as its ReservationTime and PeriodID.
   */
  expectedTime: string;
  zoneId?: number;
  priority?: number;
  notes?: string;
  userCreated?: number;
}

export interface UpdateReservationWaitlistRequest {
  globalId: number;
  siteId?: number;
  sNum?: number;
  statNum?: number;
  guestName?: string;
  phoneNumber?: string;
  email?: string;
  partySize?: number;
  expectedDate?: string;
  expectedTime?: string;
  zoneId?: number;
  priority?: number;
  status?: number;
  notes?: string;
  isActive?: number;
  /** Stamped by the backend into UserConfirmed/UserReserved/UserCancel/UserModified — always send the logged-in staff id. */
  userModified?: number;
  /** Required when status = 2 (Reserved) — backend creates/updates the linked booking and inserts these rows. */
  seatTables?: WaitlistSeatTableItem[];
  // Carried onto the booking the backend creates on the Confirmed(1)/Reserved(2) transition.
  channelID?: number;
  depositAmount?: number;
  customerNote?: string;
  internalNote?: string;
}

/** Query params accepted by GET /api/ReservationWaitlists (see ReadReservationWaitlistsListUseCase). */
export interface ReservationWaitlistFilters {
  globalId?: number;
  waitlistNo?: string;
  /** LIKE match server-side. */
  guestName?: string;
  /** Exact match server-side. */
  phoneNumber?: string;
  expectedDate?: string;
  zoneId?: number;
  status?: number;
  isActive?: number;
  pageIndex?: number;
  pageSize?: number;
  sortField?: string;
  sortDesc?: boolean;
}

// ---- Auth (LoginResponseDTO / Users entity) ----

export interface AuthUser {
  userId: number;
  userName?: string | null;
  fullName?: string | null;
  email?: string | null;
}

export interface AuthGroup {
  userGroupId: number;
  groupName?: string | null;
}

export interface AuthRole {
  roleId: number;
  roleName: string;
  category: string;
  subCategory: string;
}

export interface AuthSite {
  siteId: number;
}

export interface LoginResponseData {
  user: AuthUser;
  group?: AuthGroup | null;
  roles: AuthRole[];
  sites: AuthSite[];
  accessToken: string;
  refreshToken: string;
}

// ---- Store/link context (ReservationConfigDTO, subset used by the hostess app) ----

export interface LinkInfo {
  siteId: number;
  sNum: number;
  statNum: number;
  channelId?: number;
  zones: ReservationZone[];
  tableSetups: TableSetup[];
  sections: Section[];
  zoneSectionLinks: ReserZoneSectionLink[];
  extraFieldConfigs: ExtraFieldConfig[];
  extraFieldOptions: ExtraFieldOption[];
  periods: ReservationPeriod[];
  periodRules: ReservationPeriodRule[];
  dateOverrides: ReservationDateOverride[];
}
