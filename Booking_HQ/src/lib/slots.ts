import type { ReservationDateOverride, ReservationPeriod, ReservationPeriodRule } from '../api/types';

/** Returns "yyyy-MM-dd" for today, in local time. */
export function todayDateString(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/**
 * Default booking time: now + 30 minutes (the minimum lead time we allow), rounded
 * up to the nearest 5 minutes so the prefilled value looks intentional, e.g. 14:07 → 14:40.
 */
export function defaultBookingTime(): string {
  const d = new Date();
  let minutes = d.getHours() * 60 + d.getMinutes() + 30;
  minutes = Math.ceil(minutes / 5) * 5;
  return minutesToTimeSpan(minutes % (24 * 60)).slice(0, 5);
}

/** Parses "HH:mm:ss" / "HH:mm" into minutes since midnight. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function minutesToTimeSpan(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export interface TimeSlot {
  minutes: number;
  label: string;
  timeSpan: string;
  period: ReservationPeriod | null;
}

/**
 * Resolves which periods actually run on the given date.
 *
 * Priority: ReservationDateOverrides for that exact date win outright (used for
 * holidays/special hours and replace the normal weekly schedule). Otherwise,
 * ReservationPeriodRules decide which periods run on that day of week. If neither
 * is configured for the store, every period is kept (treated as "always on") so
 * search still returns useful results.
 */
export function periodsForDate(
  periods: ReservationPeriod[],
  rules: ReservationPeriodRule[],
  date: string,
  overrides: ReservationDateOverride[] = [],
): ReservationPeriod[] {
  const overridesForDate = overrides.filter((o) => o.overrideDate?.slice(0, 10) === date);
  if (overridesForDate.length > 0) {
    const overriddenIds = new Set(overridesForDate.map((o) => o.periodID));
    return periods.filter((p) => overriddenIds.has(p.periodID));
  }

  if (rules.length === 0) return periods;
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const allowedPeriodIds = new Set(
    rules.filter((r) => r.dayOfWeek === dayOfWeek).map((r) => r.periodID),
  );
  return periods.filter((p) => allowedPeriodIds.has(p.periodID));
}

export interface PeriodAvailability {
  period: ReservationPeriod;
  slots: TimeSlot[];
}

/**
 * Builds every bookable time across each active period's own serving window (every
 * 30 minutes — the full window inclusive of both ends, e.g. a 05:00–09:00 "Morning"
 * period lists 05:00 through 09:00). Times that have already passed are dropped — and when the date is
 * today, anything within the next 30 minutes is dropped too, since that's the minimum
 * lead time we allow. A period that ends up with zero bookable slots is dropped
 * entirely: that's the signal the restaurant simply isn't bookable for it today.
 */
export function buildPeriodAvailability(periods: ReservationPeriod[], date: string): PeriodAvailability[] {
  const isToday = date === todayDateString();
  const earliestBookable = isToday ? new Date().getHours() * 60 + new Date().getMinutes() + 30 : 0;

  return periods
    .map((period) => {
      const start = timeToMinutes(period.startTime);
      const rawEnd = timeToMinutes(period.endTime);
      const end = period.crossDay && rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;

      const slots: TimeSlot[] = [];
      for (let m = start; m <= end; m += 30) {
        const minutes = m % (24 * 60);
        if (minutes < earliestBookable) continue;
        slots.push({ minutes, label: minutesToLabel(minutes), timeSpan: minutesToTimeSpan(minutes), period });
      }
      slots.sort((a, b) => a.minutes - b.minutes);
      return { period, slots };
    })
    .filter((entry) => entry.slots.length > 0);
}
