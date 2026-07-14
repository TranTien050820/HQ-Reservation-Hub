// Mirrors the shapes returned by the HQ-WebOffice-API reservation endpoints.
// Currently served from in-memory mock data — see ./mockData.ts.

export const ReservationStatus = {
  New: 1,
  Confirm: 2,
  Cancel: 3,
  Reserved: 4,
  Overdue: 5,
  Seated: 6,
  NoShow: 7,
  Close: 8,
} as const;

export interface StoreInfo {
  globalId: number;
  siteId: number;
  storenum: number;
  description?: string;
  contact?: string;
  phone?: string;
  snum: number;
  address1?: string;
  address2?: string;
  city?: string;
  country?: string;
  postal?: string;
  prov?: string;
  email?: string;
  website?: string;
}

export interface ReservationPeriodRule {
  globalId: number;
  siteId: number;
  sNum: number;
  ruleID: number;
  periodID: number;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  isActive?: number;
}

export interface ReservationZone {
  globalId: number;
  siteId: number;
  sNum: number;
  sName?: string;
  zoneID: number;
  zoneName: string;
  isNoTable?: number;
  availableSlots?: number;
  isUseDurationMinutes?: number;
  durationMinutes?: number;
  isPauseBooking?: number;
  isActive?: number;
}

export interface ReservationPeriod {
  globalId: number;
  siteId: number;
  sNum: number;
  periodID: number;
  periodName: string;
  startTime: string; // "HH:mm:ss"
  endTime: string;
  crossDay?: number;
  isLimitAvailable?: number;
  qtyLimit?: number;
  isActive?: number;
}

export interface ReservationDateOverride {
  globalId: number;
  siteId: number;
  sNum: number;
  dateOverrideID: number;
  periodID: number;
  overrideDate: string; // "yyyy-MM-dd"
  isActive?: number;
}

/** One extra-field answer — ReservationExtraValueItemDTO on HQ-WebOffice-API. fieldID matches ExtraFieldConfig.fieldID. */
export interface ReservationExtraValueItem {
  fieldID: number;
  fieldValue: string;
}

/** Table pre-assignment — ReserSeatTableItemDTO on HQ-WebOffice-API. Not used by online booking today. */
export interface ReserSeatTableItem {
  tableNum: number;
  reserStartTime: string; // "HH:mm:ss"
  reserEndTime: string; // "HH:mm:ss"
  reserTable: number;
  reserDate: string; // ISO date-time
}

/** Mirrors the record shape returned by GET/POST /api/ReservationBookings. */
export interface ReservationBooking {
  globalId: number;
  siteId?: number;
  sNum?: number;
  customerId?: number;
  bookingName?: string;
  bookingPhone?: string;
  bookingEmail?: string;
  bookerName?: string | null;
  bookerPhone?: string | null;
  bookerEmail?: string | null;
  reservationNo?: string;
  reservationDate?: string; // "yyyy-MM-dd"
  reservationTime?: string; // "HH:mm:ss"
  arrivalDateTime?: string | null;
  partySize?: number;
  actualQty?: number | null;
  channelID?: number | null;
  zoneID?: number;
  zoneSeatID?: number | null;
  status?: number;
  periodID?: number | null;
  depositAmount?: number;
  customerNote?: string;
  internalNote?: string;
  userCreated?: number;
  dateCreated?: string;
  userConfirm?: number | null;
  dateConfirm?: string | null;
  userCancel?: number | null;
  dateCancel?: string | null;
  userSeat?: number | null;
  dateSeat?: string | null;
  userReserve?: number | null;
  dateReserve?: string | null;
  userModified?: number | null;
  dateModified?: string | null;
  isActive?: number;
  statNum?: number | null;
  userCreatedName?: string | null;
  userConfirmName?: string | null;
  userCancelName?: string | null;
  userSeatName?: string | null;
  userModifiedName?: string | null;
  extraValues?: ReservationExtraValueItem[];
  seatTables?: ReserSeatTableItem[];
}

/** Mirrors ReservationBookingsCreateDTO on HQ-WebOffice-API — POST /api/ReservationBookings body. */
export interface ReservationBookingCreatePayload {
  siteId?: number;
  sNum?: number;
  statNum?: number;
  bookingName?: string;
  bookingPhone?: string;
  bookingEmail?: string;
  bookerName?: string;
  bookerPhone?: string;
  bookerEmail?: string;
  reservationDate?: string; // "yyyy-MM-dd"
  reservationTime?: string; // "HH:mm:ss"
  arrivalDateTime?: string;
  partySize?: number;
  channelID?: number;
  zoneID?: number;
  zoneSeatID?: number;
  status?: number;
  periodID?: number;
  depositAmount?: number;
  customerNote?: string;
  internalNote?: string;
  userCreated?: number;
  extraValues?: ReservationExtraValueItem[];
  seatTables?: ReserSeatTableItem[];
}

export interface ReservationBookingUpdatePayload {
  globalId: number;
  status?: number;
}

export interface MenuCategory {
  globalId: number;
  siteId: number;
  sNum: number;
  categoryID: number;
  nameEn: string;
  nameVi: string;
  sortOrder: number;
}

export interface MenuItem {
  globalId: number;
  siteId: number;
  sNum: number;
  itemID: number;
  categoryID: number;
  nameEn: string;
  nameVi: string;
  descriptionEn?: string;
  descriptionVi?: string;
  price: number;
  photoUrl?: string;
  isVegetarian?: boolean;
  isSpicy?: boolean;
  isSignature?: boolean;
  isActive?: number;
}
