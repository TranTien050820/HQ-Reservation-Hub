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

/** ReservationBookingStatus: 1=New 2=Confirm 3=Cancel 4=Reserved 5=Overdue 6=Seated 7=NoShow 8=Close 9=AutoClose 10=AutoCancel */
export const BookingStatus = {
  New: 1,
  Confirm: 2,
  Cancel: 3,
  Reserved: 4,
  Overdue: 5,
  Seated: 6,
  NoShow: 7,
  Close: 8,
  /**
   * Written by the backend's own housekeeping rather than by anything a hostess
   * did: a table it closed out on a schedule (9) and a hold it released when
   * nobody claimed it (10).
   *
   * Both are closed business by the time this app sees them, so they are
   * deliberately absent from BOOKING_STATUS_CONFIG below and are counted as
   * terminal by `isTerminalBooking` — the app never draws a chip for them and
   * never lets one hold a table or a search result.
   */
  AutoClose: 9,
  AutoCancel: 10,
} as const;
export type BookingStatusValue = (typeof BookingStatus)[keyof typeof BookingStatus];

/**
 * Chip label + colour per status. AutoClose(9) and AutoCancel(10) are absent on
 * purpose: they must not be surfaced in this app, and every call site already
 * guards on a missing entry (`{cfg && <chip/>}`), so leaving them out is what
 * makes "don't show these" hold everywhere rather than at each render site.
 */
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

/**
 * One open POS tab (GET /api/PosLocal/TabInfo). A row exists only while the POS
 * has a live check on that table, so the mere presence of `tablenum` means the
 * table is physically in use right now — regardless of `status`/`inUse`, which
 * describe the check itself (course, held items, cashier lock), not whether the
 * table is free.
 */
export interface PosTabInfo {
  transact: number;
  empnum?: number;
  timestart?: string | null;
  status?: number;
  tablenum: number;
  label?: string | null;
  inUse?: number;
  numCust?: number;
  hasHoldFire?: number;
  lastModified?: string | null;
  course?: number;
  lastHold?: string | null;
  ccInfo?: string | null;
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

/** Payload item for a booking's custom-field answers (ReservationExtraValueItemDTO) — `fieldID` is numeric here, unlike ExtraFieldConfig's. */
export interface ExtraValueItem {
  fieldID: number;
  fieldValue: string;
}

/** ExtraFieldConfig.fieldType — decides which input the form renders. */
export const ExtraFieldType = {
  Text: 0,
  Number: 1,
  Date: 2,
  /** Value is an ExtraFieldOption.optionValue; the label comes from its optionText. */
  Option: 3,
} as const;

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
  /** Guests who actually turned up, entered by the hostess when seating — may differ from the booked partySize. */
  actualQty?: number | null;
  channelID?: number | null;
  zoneID?: number | null;
  status: number;
  customerNote?: string | null;
  internalNote?: string | null;
  userCreated?: number | null;
  /** The hostess account that seated the guest. */
  userSeat?: number | null;
  /**
   * Stamped by the backend when the booking moved to Seated — when the guests
   * actually sat down, which is not their booked `reservationTime`. Sent without
   * a timezone offset, in the server's Vietnam wall-clock (see `parseServerTime`).
   */
  dateSeat?: string | null;
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
  /** Guests who actually showed up — sent when seating, alongside `userSeat`. */
  actualQty?: number;
  channelID?: number;
  zoneID?: number;
  status: number;
  customerNote?: string;
  internalNote?: string;
  userCreated?: number;
  /** userId of the logged-in hostess doing the seating. */
  userSeat?: number;
  seatTables?: SeatTableItem[];
  /** Answers to the store's ExtraFieldConfigs — one item per visible field. */
  extraValues?: ExtraValueItem[];
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

// ---- OrderHub pre-orders (OrderQueryDTO subset — api/OrderHub) ----

/**
 * The statuses a reservation's food sits in before check-in, and the only ones this app
 * fetches. `scheduled` is the normal case; `awaiting_payment` and `payment_failed` mean the
 * store asked for a deposit or full prepayment the guest hasn't settled, so Release leaves
 * those behind. Anything past these has already gone to the kitchen.
 *
 * Deliberately the same three states the Cancel endpoint accepts: an order visible in this
 * app is exactly an order the hostess can still call off.
 */
export const PRE_RELEASE_ORDER_STATUSES = ['scheduled', 'awaiting_payment', 'payment_failed'] as const;

export interface PreOrderItem {
  lineNo: number;
  prodNum: number;
  /** Dish name as it was when ordered — prices and names can drift before the guest arrives. */
  nameSnapshot?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** `active` | `sold_out` | `removed` | `refunded`. */
  lineStatus?: string | null;
  note?: string | null;
}

/** One pre-ordered food order attached to a booking via `reservationNo`. */
export interface PreOrder {
  orderUid: string;
  orderNumber?: string | null;
  orderStatus: string;
  /** `unpaid` | `paid` | `not_required` … — a deposit order shows here before it is settled. */
  paymentStatus?: string | null;
  channel?: string | null;
  subtotal?: number;
  grandTotal: number;
  paidAmount?: number;
  reservationNo?: string | null;
  /** The booked date+time the guest chose at order time. */
  scheduledFor?: string | null;
  createdAt?: string | null;
  items?: PreOrderItem[] | null;
}

/** Result of POST api/OrderHub/Reservation/{no}/Release (ReservationReleaseQueryDTO). */
export interface ReservationReleaseResult {
  reservationNo: string;
  /** Orders sent to the kitchen. 0 with no warnings simply means there was nothing to send. */
  released: number;
  /** Orders that failed or had already been released — the rest still went through. */
  skipped: number;
  tableNum?: number | null;
  orderUids: string[];
  /** Human-readable notes, e.g. dishes whose price changed since the guest ordered. */
  warnings: string[];
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
