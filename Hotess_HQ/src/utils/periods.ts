import type { LinkInfo, ReservationPeriod } from '../types';
import { toMinutes } from './timeWindow';

const DAY_MINUTES = 1440;

/**
 * Which periods the backend will actually match on a given date.
 *
 * Mirrors the SQL in `ReservationWaitlistsRepository.FindPeriodByDateTimeAsync`:
 * a period runs on a date when a ReservationDateOverrides row targets that exact
 * date **OR** a ReservationPeriodRules row targets that day of week.
 *
 * Deliberately stricter than Booking_HQ's `periodsForDate`, which treats an
 * override as *replacing* the weekly schedule and — more importantly — falls
 * back to "every period" when a store has configured no rules at all. That
 * fallback is what lets a screen offer a time the backend cannot map to any
 * period, producing a booking with PeriodID = null. Here, no rule and no
 * override means the period genuinely isn't bookable, and the UI says so.
 */
export function periodsForDate(
  { periods, periodRules, dateOverrides }: Pick<LinkInfo, 'periods' | 'periodRules' | 'dateOverrides'>,
  date: string,
): ReservationPeriod[] {
  const day = date.slice(0, 10);
  const overriddenIds = new Set(
    dateOverrides.filter((o) => o.overrideDate?.slice(0, 10) === day).map((o) => o.periodID),
  );
  // `new Date("yyyy-MM-dd")` parses as UTC and can shift the weekday across the
  // dateline; appending a time forces local-time parsing.
  const dayOfWeek = new Date(`${day}T00:00:00`).getDay();
  const ruledIds = new Set(periodRules.filter((r) => r.dayOfWeek === dayOfWeek).map((r) => r.periodID));

  return periods.filter((p) => overriddenIds.has(p.periodID) || ruledIds.has(p.periodID));
}

/** Start/end of a period in minutes, with the end unwrapped past midnight for cross-day windows. */
export function periodRange(period: ReservationPeriod): { start: number; end: number } | null {
  const start = toMinutes(period.startTime);
  const rawEnd = toMinutes(period.endTime);
  if (start == null || rawEnd == null) return null;
  const crossesMidnight = rawEnd < start;
  return { start, end: crossesMidnight ? rawEnd + DAY_MINUTES : rawEnd };
}

/** "17:00 – 22:00", or an em dash when the period has no window configured. */
export function periodLabel(period: ReservationPeriod): string {
  const range = periodRange(period);
  if (!range) return '—';
  return `${period.startTime?.slice(0, 5)} – ${period.endTime?.slice(0, 5)}`;
}

/**
 * The period a time falls into, matching the backend's bounds exactly:
 * inclusive at both ends, and a cross-day period covers `time >= start` OR
 * `time <= end`. Periods with no start/end match anything, as in the SQL.
 */
export function findPeriodForTime(periods: ReservationPeriod[], hhmm: string): ReservationPeriod | null {
  const time = toMinutes(hhmm);
  if (time == null) return null;
  for (const period of periods) {
    const start = toMinutes(period.startTime);
    const end = toMinutes(period.endTime);
    if (start == null || end == null) return period;
    const crossesMidnight = (period.crossDay ?? 0) === 1 && end < start;
    if (crossesMidnight ? time >= start || time <= end : time >= start && time <= end) return period;
  }
  return null;
}

const SLOT_STEP_MINUTES = 30;

function minutesToHHmm(minutes: number): string {
  const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Every half-hour inside a period, both ends inclusive (a 17:00–22:00 period
 * offers 17:00 through 22:00). Slots that have already passed are still listed;
 * `PeriodTimePicker` locks them when the chosen date is today, which keeps an
 * already-stored past time visible while it is being edited.
 */
export function periodSlots(period: ReservationPeriod): string[] {
  const range = periodRange(period);
  if (!range) return [];
  const slots: string[] = [];
  for (let m = range.start; m <= range.end; m += SLOT_STEP_MINUTES) slots.push(minutesToHHmm(m));
  return slots;
}

/** Minutes since midnight, right now. */
export function currentMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** True once a period's whole window is behind `nowMin`. Cross-day windows never are. */
export function isPeriodOver(period: ReservationPeriod, nowMin: number): boolean {
  const range = periodRange(period);
  return range != null && range.end < nowMin;
}

/** First slot of a period that hasn't passed yet, falling back to its start time. */
export function firstOpenSlot(period: ReservationPeriod, nowMin: number | null): string {
  const slots = periodSlots(period);
  const fallback = period.startTime?.slice(0, 5) ?? '';
  if (nowMin == null) return slots[0] ?? fallback;
  return slots.find((s) => (toMinutes(s) ?? 0) >= nowMin) ?? slots[slots.length - 1] ?? fallback;
}
