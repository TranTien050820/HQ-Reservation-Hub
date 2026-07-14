import { http } from './http';
import type { ApiEnvelope, TableSetup, ReserSeatTable, SiteScope } from '../types';
import { mockSeatTables } from './mockData';

/** Raw shape as returned by GET /api/ReserSeatTables — references the table
 * by number (`reserTable`/`tableNum`) and the booking by `reservationNo`,
 * wrapped in a paged `{items}` envelope. */
interface RawReserSeatTable {
  reservationNo?: number | string | null;
  tableNum?: number | string | null;
  reserTable?: number | string | null;
  reserStartTime?: string | null;
  reserEndTime?: string | null;
  reserDate?: string | null;
  isActive?: number | null;
}

interface RawSeatTablesResponse {
  items: RawReserSeatTable[];
  totalRecords: number;
}

function mapRawSeat(raw: RawReserSeatTable): ReserSeatTable | null {
  const reservationNo = raw.reservationNo != null ? String(raw.reservationNo) : '';
  const tableNumber = raw.reserTable ?? raw.tableNum;
  if (!reservationNo || tableNumber == null) return null;
  return {
    reservationNo,
    tableNumber: String(tableNumber),
    reserDate: raw.reserDate ?? '',
    reserStartTime: raw.reserStartTime ?? undefined,
    reserEndTime: raw.reserEndTime ?? undefined,
  };
}

export async function fetchSeatTables(scope: SiteScope, reserDate: string): Promise<ReserSeatTable[]> {
  try {
    const res = await http.get<ApiEnvelope<RawSeatTablesResponse | RawReserSeatTable[]>>('/api/ReserSeatTables', {
      params: {
        SiteId: scope.siteId,
        SNum: scope.sNum,
        StatNum: scope.statNum,
        ReserDate: reserDate,
        IsActive: 1,
        pageSize: 1000,
        pageIndex: 1,
      },
    });
    const data = res.data.data;
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('Unexpected response shape: expected an array or {items}');
    return items
      .filter((r) => r.isActive !== 0)
      .map(mapRawSeat)
      .filter((s): s is ReserSeatTable => s !== null);
  } catch (err) {
    console.warn('[tables] ReserSeatTables API unavailable, using mock fallback', err);
    return mockSeatTables.filter((s) => s.reserDate === reserDate);
  }
}

export async function assignSeatTables(
  reservationNo: string,
  tables: TableSetup[],
  reserDate: string,
  scope: SiteScope,
): Promise<ReserSeatTable[]> {
  try {
    const res = await http.post<ApiEnvelope<RawReserSeatTable[]>>('/api/ReserSeatTables', {
      reservationNo,
      seatTables: tables.map((t) => ({ reserTable: Number(t.tableNumber), reserDate })),
      reserDate,
      siteId: scope.siteId,
      sNum: scope.sNum,
      statNum: scope.statNum,
    });
    return res.data.data.map(mapRawSeat).filter((s): s is ReserSeatTable => s !== null);
  } catch (err) {
    console.warn('[tables] assign ReserSeatTables API unavailable, using mock fallback', err);
    const created = tables.map((t) => ({
      reservationNo,
      tableNumber: t.tableNumber,
      reserDate,
    }));
    mockSeatTables.push(...created);
    return created;
  }
}

export async function releaseSeatTables(reservationNo: string): Promise<void> {
  try {
    await http.put('/api/ReserSeatTables', { reservationNo, isActive: 0 });
  } catch (err) {
    console.warn('[tables] release ReserSeatTables API unavailable, using mock fallback', err);
    for (let i = mockSeatTables.length - 1; i >= 0; i--) {
      if (mockSeatTables[i].reservationNo === reservationNo) mockSeatTables.splice(i, 1);
    }
  }
}
