import type { BookingMenu, ReserMultiMenu } from '../api/booking';
import { resolveLocale } from './i18nFormat';

export interface MenuGroup {
  key: string;
  label: string;
  menu: BookingMenu;
}

/** 2023-01-01 was a Sunday, so this reference week maps 0=Sun..6=Sat to a real date for formatting. */
function weekdayLabel(dayOfWeek: number, language: string): string {
  const ref = new Date(2023, 0, 1 + dayOfWeek);
  return ref.toLocaleDateString(resolveLocale(language), { weekday: 'long' });
}

function specialDateLabel(dateStr: string, language: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(resolveLocale(language), { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeRangeLabel(entry: ReserMultiMenu): string | null {
  const from = entry.timeFrom?.slice(0, 5);
  const to = entry.timeTo?.slice(0, 5);
  if (!from || !to || (from === '00:00' && to === '23:59')) return null;
  return `${from}–${to}`;
}

function entryLabel(entry: ReserMultiMenu, language: string): string {
  const dayLabel =
    entry.dayType === 1 && entry.specialDate
      ? specialDateLabel(entry.specialDate, language)
      : weekdayLabel(entry.dayOfWeek ?? 0, language);
  const timeLabel = timeRangeLabel(entry);
  return timeLabel ? `${dayLabel} (${timeLabel})` : dayLabel;
}

/**
 * For multi-menu stores, groups every scheduled menu entry by its underlying menu so the
 * page can show all of them at once, each clearly labeled with the day(s)/date it applies to
 * (instead of picking just the one menu that happens to be active right now).
 */
export function groupMultiMenus(reserMultiMenus: ReserMultiMenu[], language: string): MenuGroup[] {
  const order: number[] = [];
  const byMenuId = new Map<number, { menu: BookingMenu; labels: string[] }>();

  for (const entry of reserMultiMenus) {
    if (!entry.menu) continue;
    const key = entry.menu.menuId;
    if (!byMenuId.has(key)) {
      byMenuId.set(key, { menu: entry.menu, labels: [] });
      order.push(key);
    }
    byMenuId.get(key)!.labels.push(entryLabel(entry, language));
  }

  return order.map((key) => {
    const { menu, labels } = byMenuId.get(key)!;
    return { key: String(key), label: labels.join(', '), menu };
  });
}
