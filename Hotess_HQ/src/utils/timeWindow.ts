import { vnEpochMs, vnMinutesOfDay } from './date';

/**
 * ReserSeatTables rows are time-slot holds (reserStartTime/reserEndTime on a
 * given reserDate), not "occupied for the rest of the day" markers. A table
 * held 23:30–01:30 must not block seating a different party at 12:00 lunch
 * the same day — only rows whose window actually contains "now" should count
 * as blocking. Missing start/end (older/incomplete data) is treated as
 * always-blocking, matching HQ_FE_V2's FloorPlanTab.tsx conflict logic.
 */

export function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

/** True when `nowMinutes` falls inside [startMinutes, endMinutes), handling windows that cross midnight (e.g. 23:30–01:30). */
export function isWithinWindow(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  // Crosses midnight.
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function isSeatWindowActiveNow(reserStartTime?: string | null, reserEndTime?: string | null): boolean {
  const start = toMinutes(reserStartTime);
  const end = toMinutes(reserEndTime);
  if (start == null || end == null) return true; // no time info -> treat as always blocking
  // The hold's times are the store's wall-clock, so "now" has to be too.
  return isWithinWindow(vnMinutesOfDay(), start, end);
}

/** Normalises a window to [start, end) on a linear axis, unwrapping midnight crossings. */
function normalizeRange(startMinutes: number, endMinutes: number): [number, number] {
  return endMinutes <= startMinutes ? [startMinutes, endMinutes + 1440] : [startMinutes, endMinutes];
}

/**
 * True when an existing seat hold collides with the window we are about to
 * book. `isSeatWindowActiveNow` answers "is this table busy right this second",
 * which is the right question on the live floor plan but the wrong one when
 * seating a waitlist guest for their expected time — there we must compare
 * against the requested window instead.
 *
 * Both ranges live on a 24h circle, so a hold that runs 23:30–01:30 and a
 * window of 00:30–02:30 do overlap; the ±1440 shifts cover that.
 */
export function seatWindowOverlaps(
  reserStartTime: string | null | undefined,
  reserEndTime: string | null | undefined,
  windowStartMinutes: number,
  windowEndMinutes: number,
): boolean {
  const start = toMinutes(reserStartTime);
  const end = toMinutes(reserEndTime);
  if (start == null || end == null) return true; // no time info -> treat as always blocking
  const [rowStart, rowEnd] = normalizeRange(start, end);
  const [winStart, winEnd] = normalizeRange(windowStartMinutes, windowEndMinutes);
  return (
    (rowStart < winEnd && rowEnd > winStart) ||
    (rowStart + 1440 < winEnd && rowEnd + 1440 > winStart) ||
    (rowStart - 1440 < winEnd && rowEnd - 1440 > winStart)
  );
}

/**
 * How far ahead a seat window has to start before a table that is busy *right
 * now* stops counting as busy: a party sitting down (or with an open POS check)
 * at 14:00 has left long before a 21:00 booking arrives, so refusing that table
 * for tonight would strand a bookable table all afternoon.
 */
export const CURRENT_USE_LOOKAHEAD_MINUTES = 180;

/**
 * Minutes from now until `date` ("yyyy-MM-dd", or any ISO string starting with
 * one) at `time` ("HH:mm" / "HH:mm:ss"). Null when either part is missing or
 * unparsable. Negative for a moment already past.
 */
export function minutesUntil(date: string | null | undefined, time: string | null | undefined): number | null {
  const minutes = toMinutes(time);
  if (minutes == null) return null;
  // A booking's date+time is Vietnam wall-clock; anchoring it to the device's
  // zone instead would put a 19:00 booking hours off on a mis-set tablet.
  const target = vnEpochMs(date, minutes);
  if (target == null) return null;
  return Math.round((target - Date.now()) / 60000);
}

/**
 * True when `date`+`time` (store clock) is already behind us. Input that can't be
 * read answers false — a field still being filled in is not "in the past".
 */
export function isPastDateTime(date: string | null | undefined, time: string | null | undefined): boolean {
  const minutes = minutesUntil(date, time);
  return minutes != null && minutes < 0;
}

/**
 * True when the window starting at `date`+`time` is at least
 * CURRENT_USE_LOOKAHEAD_MINUTES away, i.e. tables in use at this moment will
 * have turned over by then. A missing/unparsable time answers false — "busy now
 * blocks" is the safe default.
 */
export function isBeyondCurrentUse(date: string | null | undefined, time: string | null | undefined): boolean {
  const minutes = minutesUntil(date, time);
  return minutes != null && minutes >= CURRENT_USE_LOOKAHEAD_MINUTES;
}

/** Fallback seat-hold length when the zone has no configured duration. */
const DEFAULT_SEAT_DURATION_MINUTES = 120;

function minutesToHHMMSS(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * ReserSeatTables inserts always need both reserStartTime and reserEndTime —
 * the backend SQL does `'00:00:00'::timetz + @ReserStartTime`, and passing a
 * null/untyped parameter there fails with "operator is not unique: time with
 * time zone + unknown". Always compute a window rather than omitting it.
 */
export function computeSeatWindow(
  startHHMM: string | null | undefined,
  durationMinutes: number | null | undefined,
): { reserStartTime: string; reserEndTime: string } {
  const startMinutes = toMinutes(startHHMM) ?? vnMinutesOfDay();
  const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_SEAT_DURATION_MINUTES;
  return {
    reserStartTime: minutesToHHMMSS(startMinutes),
    reserEndTime: minutesToHHMMSS(startMinutes + duration),
  };
}
