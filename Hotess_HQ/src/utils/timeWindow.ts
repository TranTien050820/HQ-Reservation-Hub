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
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return isWithinWindow(nowMinutes, start, end);
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
  const now = new Date();
  const startMinutes = toMinutes(startHHMM) ?? now.getHours() * 60 + now.getMinutes();
  const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_SEAT_DURATION_MINUTES;
  return {
    reserStartTime: minutesToHHMMSS(startMinutes),
    reserEndTime: minutesToHHMMSS(startMinutes + duration),
  };
}
