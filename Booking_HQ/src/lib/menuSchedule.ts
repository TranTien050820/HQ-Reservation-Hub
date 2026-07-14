import type { BookingMenu, ReserMultiMenu } from '../api/booking';

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function isWithinTimeRange(nowMinutes: number, timeFrom: string, timeTo: string, crossDay?: number): boolean {
  const from = timeToMinutes(timeFrom);
  const to = timeToMinutes(timeTo);
  return crossDay ? nowMinutes >= from || nowMinutes <= to : nowMinutes >= from && nowMinutes <= to;
}

/**
 * Multi-menu stores schedule a different menu per day-of-week/time-window or specific
 * calendar date. Picks whichever entry applies right now, falling back to the
 * store's single default menu when nothing matches (or multi-menu isn't in use).
 */
export function resolveActiveMenu(
  reserMultiMenus: ReserMultiMenu[],
  fallbackMenu: BookingMenu | null,
  now: Date = new Date(),
): BookingMenu | null {
  if (reserMultiMenus.length === 0) return fallbackMenu;

  const dateStr = now.toISOString().slice(0, 10);
  const dayOfWeek = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const bySpecialDate = reserMultiMenus.find(
    (entry) => entry.dayType === 1 && entry.specialDate?.slice(0, 10) === dateStr,
  );
  if (bySpecialDate?.menu) return bySpecialDate.menu;

  const byWeekday = reserMultiMenus.find(
    (entry) =>
      entry.dayType !== 1 &&
      entry.dayOfWeek === dayOfWeek &&
      isWithinTimeRange(nowMinutes, entry.timeFrom ?? '00:00:00', entry.timeTo ?? '23:59:00', entry.crossDay),
  );

  return byWeekday?.menu ?? fallbackMenu ?? reserMultiMenus[0]?.menu ?? null;
}
