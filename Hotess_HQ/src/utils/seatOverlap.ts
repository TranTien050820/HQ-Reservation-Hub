import { apiErrorCode, apiErrorData } from './apiError';

/**
 * HQ refused a seating because another booking already holds the table in an overlapping
 * window, or a party is sitting there (R16, 409 `SEAT_TABLE_OVERLAP`). Only refused when the
 * store runs the check in Enforce mode; in Warn mode HQ just logs it.
 *
 * Unlike `TABLE_NOT_IN_RESTAURANT` this is not final: the clash is time-bound, so the table
 * leaves the current pick but stays pickable, and the floor is re-read so it shows why.
 */
export const SEAT_TABLE_OVERLAP = 'SEAT_TABLE_OVERLAP';

export interface SeatOverlap {
  tables: number[];
  /** The first clashing hold. Staff sessions get who holds it; partner calls only get the window. */
  holder?: { name?: string; from?: string; to?: string };
}

/** Minimal shape of i18next's `t`. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

export function seatOverlapOf(error: unknown): SeatOverlap | null {
  if (apiErrorCode(error) !== SEAT_TABLE_OVERLAP) return null;
  const data = apiErrorData(error) ?? {};
  const tables = Array.isArray(data.tables) ? data.tables.filter((n): n is number => typeof n === 'number') : [];
  const first = Array.isArray(data.conflicts) ? (data.conflicts[0] as Record<string, unknown> | undefined) : undefined;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  return {
    tables,
    holder: first
      ? {
          name: text(first.bookingName) ?? text(first.reservationNo),
          from: text(first.from),
          to: text(first.to),
        }
      : undefined,
  };
}

/** "21:38" out of HQ's "2026-10-15T21:38:00+07:00" — already the store's local time. */
const hhmm = (iso: string) => iso.slice(11, 16);

export function seatOverlapMessage(overlap: SeatOverlap, t: Translate, pickedTablenums: number[]): string {
  const nums = overlap.tables.length > 0 ? overlap.tables : pickedTablenums;
  const tables = nums.map((n) => `#${n}`).join(', ');
  const holder = overlap.holder;
  if (holder?.name && holder.from && holder.to)
    return t('seating.overlapBlockedBy', { tables, name: holder.name, from: hhmm(holder.from), to: hhmm(holder.to) });
  return t('seating.overlapBlocked', { tables });
}
