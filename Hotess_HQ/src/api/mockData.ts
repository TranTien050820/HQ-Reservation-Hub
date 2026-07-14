// Mock fallback data used by every api/* module when the real backend is
// unreachable, so the UI stays fully clickable in dev with no backend.
import type {
  ReservationZone,
  ReservationBooking,
  TableSetup,
  ReserSeatTable,
  AvailableSlot,
  ReservationWaitlist,
  LinkInfo,
  LoginResponseData,
} from '../types';
import { BookingStatus, WaitlistStatus } from '../types';

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const mockZones: ReservationZone[] = [
  { zoneId: 1, zoneName: 'Main Hall', siteId: 1, isActive: true, secNum: 'A', capacity: 12 },
  { zoneId: 2, zoneName: 'Terrace', siteId: 1, isActive: true, secNum: 'B', capacity: 6 },
  { zoneId: 3, zoneName: 'VIP Room', siteId: 1, isActive: true, secNum: 'C', capacity: 4 },
  // No AvailableSlots row is ever generated for this zone below — exercises the
  // "no data means 100% free" fallback in SeatingScreen.
  { zoneId: 4, zoneName: 'Rooftop', siteId: 1, isActive: true, capacity: 8 },
];

export const mockTables: TableSetup[] = [
  ...Array.from({ length: 4 }, (_, i) => ({
    tableId: 100 + i,
    tableNumber: `A${i + 1}`,
    secNum: 'A',
    sectionName: 'Indoor',
    zoneId: 1,
    minNumCust: 2,
    maxNumCust: i % 2 === 0 ? 8 : 4,
    canReserve: true,
    siteId: 1,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    tableId: 110 + i,
    tableNumber: `A${5 + i}`,
    secNum: 'A2',
    sectionName: 'Window Side',
    zoneId: 1,
    minNumCust: 2,
    maxNumCust: 2,
    canReserve: true,
    siteId: 1,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    tableId: 200 + i,
    tableNumber: `B${i + 1}`,
    secNum: 'B',
    sectionName: 'Terrace',
    zoneId: 2,
    minNumCust: 2,
    maxNumCust: 6,
    canReserve: true,
    siteId: 1,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    tableId: 300 + i,
    tableNumber: `C${i + 1}`,
    secNum: 'C',
    sectionName: 'VIP Suites',
    zoneId: 3,
    minNumCust: 4,
    maxNumCust: 10,
    canReserve: true,
    siteId: 1,
  })),
];

export const mockLinkInfo: LinkInfo = {
  siteId: 1,
  sNum: 1,
  statNum: 1,
  channelId: 1,
  zones: mockZones,
  tableSetups: mockTables,
};

export const mockBookings: ReservationBooking[] = [
  {
    reservationId: 1001,
    reservationNo: 'RS10001',
    bookingName: 'Nguyen Van A',
    bookingPhone: '0901234567',
    reservationDate: todayStr(),
    numOfGuest: 4,
    zoneId: 1,
    zoneName: 'Main Hall',
    status: BookingStatus.Confirm,
    siteId: 1,
    notes: 'Window seat preferred',
  },
  {
    reservationId: 1002,
    reservationNo: 'RS10002',
    bookingName: 'Tran Thi B',
    bookingPhone: '0912345678',
    reservationDate: todayStr(),
    numOfGuest: 2,
    zoneId: 2,
    zoneName: 'Terrace',
    status: BookingStatus.Reserved,
    siteId: 1,
  },
  {
    reservationId: 1003,
    reservationNo: 'RS10003',
    bookingName: 'Le Van C',
    bookingPhone: '0901234567',
    reservationDate: todayStr(),
    numOfGuest: 6,
    zoneId: 3,
    zoneName: 'VIP Room',
    status: BookingStatus.Confirm,
    siteId: 1,
  },
  {
    reservationId: 1004,
    reservationNo: 'RS10004',
    bookingName: 'Pham Van D',
    bookingPhone: '0933445566',
    reservationDate: todayStr(),
    numOfGuest: 3,
    zoneId: 3,
    zoneName: 'VIP Room',
    status: BookingStatus.Seated,
    siteId: 1,
  },
];

// Table A2 (RS10001, Confirm) and B2 (RS10002, Reserved) belong to bookings
// whose guest hasn't arrived yet -> those tables should render as "reserved".
// Table C2 (RS10004, Seated) -> renders as "occupied".
export const mockSeatTables: ReserSeatTable[] = [
  { reservationNo: 'RS10001', tableNumber: 'A2', reserDate: todayStr() },
  { reservationNo: 'RS10002', tableNumber: 'B2', reserDate: todayStr() },
  { reservationNo: 'RS10004', tableNumber: 'C2', reserDate: todayStr() },
];

export const mockAvailableSlots: AvailableSlot[] = mockZones
  .filter((z) => z.zoneId !== 4) // zone 4 intentionally has no AvailableSlots row (see mockZones)
  .map((z) => {
    const zoneTables = mockTables.filter((t) => t.zoneId === z.zoneId);
    const used = mockSeatTables.filter((s) => zoneTables.some((t) => t.tableNumber === s.tableNumber)).length;
    return {
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      total: zoneTables.length,
      used,
      free: zoneTables.length - used,
      seated: used,
    };
  });

export const mockWaitlists: ReservationWaitlist[] = [
  {
    waitlistId: 1,
    name: 'Pham Thi D',
    phone: '0987654321',
    numOfGuest: 3,
    zoneId: 1,
    zoneName: 'Main Hall',
    isVip: false,
    status: WaitlistStatus.Waiting,
    createdDate: new Date(Date.now() - 12 * 60_000).toISOString(),
    siteId: 1,
  },
  {
    waitlistId: 2,
    name: 'Hoang Van E',
    phone: '0977123456',
    numOfGuest: 5,
    zoneId: 3,
    zoneName: 'VIP Room',
    isVip: true,
    status: WaitlistStatus.Waiting,
    createdDate: new Date(Date.now() - 35 * 60_000).toISOString(),
    siteId: 1,
    notes: 'Regular VIP guest',
  },
];

export const mockLogin: LoginResponseData = {
  user: { userId: 'u1', userName: 'hostess', fullName: 'Hostess Demo' },
  group: { groupId: 'g1', groupName: 'Reception' },
  roles: ['hostess'],
  sites: [{ siteId: 1, siteName: 'Demo Restaurant' }],
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

let idCounter = 5000;
export const nextMockId = () => ++idCounter;
