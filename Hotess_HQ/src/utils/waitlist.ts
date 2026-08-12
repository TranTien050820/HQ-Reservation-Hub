import { WaitlistStatus, type ReservationWaitlist } from '../types';
import { formatVnHHmm, parseServerTime } from './date';

/** Entries the hostess can still act on — everything else is history. */
export const OPEN_WAITLIST_STATUSES: number[] = [WaitlistStatus.Waiting, WaitlistStatus.Confirmed];

/** `priority` is a number on the wire but only ever means "jumps the queue" here. */
export function isVip(entry: Pick<ReservationWaitlist, 'priority'>): boolean {
  return (entry.priority ?? 0) > 0;
}

/** Minutes elapsed since a backend timestamp, floored at 0 (clock skew shouldn't show "-3 phút"). */
export function elapsedMinutes(iso: string | null | undefined, now: number = Date.now()): number {
  // Read as Vietnam time — see `parseServerTime`, without which a tablet on
  // another zone reports every wait as hours long.
  const ms = parseServerTime(iso);
  if (ms == null) return 0;
  return Math.max(0, Math.floor((now - ms) / 60000));
}

/**
 * Escalation thresholds mirror HQ_FE_V2's `getWaitColor` so a guest that reads
 * as "urgent" on the admin dashboard reads the same way on the hostess tablet.
 */
export type WaitTone = 'calm' | 'warn' | 'urgent';

export function waitTone(minutes: number): WaitTone {
  if (minutes > 20) return 'urgent';
  if (minutes > 10) return 'warn';
  return 'calm';
}

/** Past this the entry is almost certainly a no-show — surfaced as a hint, never auto-updated. */
export const STALE_WAIT_MINUTES = 45;

/**
 * Queue order for display. The API already returns FIFO (sortField=GlobalId,
 * sortDesc=false); this only lifts VIPs to the front of their status group,
 * which the backend can't express with its single sort field.
 */
export function compareQueue(a: ReservationWaitlist, b: ReservationWaitlist): number {
  const vip = (b.priority ?? 0) - (a.priority ?? 0);
  if (vip !== 0) return vip;
  return (parseServerTime(a.dateCreated) ?? 0) - (parseServerTime(b.dateCreated) ?? 0);
}

/** "19:00:00" -> "19:00"; anything missing renders as an em dash. */
export function formatHHmm(time: string | null | undefined): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

/** "HH:mm" for an <input type="time">, defaulting to the current clock in Vietnam. */
export function nowHHmm(): string {
  return formatVnHHmm();
}

/** The backend expects a TimeSpan ("HH:mm:ss"); an <input type="time"> gives "HH:mm". */
export function toTimeSpan(hhmm: string): string {
  const value = hhmm || nowHHmm();
  return value.length === 5 ? `${value}:00` : value;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
}

const AVATAR_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export function avatarColor(id: number | null | undefined): string {
  return AVATAR_COLORS[Math.abs(id ?? 0) % AVATAR_COLORS.length];
}
