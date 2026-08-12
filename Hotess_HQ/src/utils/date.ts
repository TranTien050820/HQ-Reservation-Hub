const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The store's clock is Vietnam's; the tablet's is not necessarily. A device left
 * on another timezone (or simply set wrong) would otherwise ask the backend for
 * yesterday's bookings, stamp a walk-in with a time that falls in no serving
 * period, and count a party as having sat down hours ago. So every "what time is
 * it" in this app is answered here, in Vietnam time, never from the device's own
 * zone.
 *
 * A fixed +07:00 rather than an Intl lookup: Vietnam has had no DST since 1975,
 * so the offset is exact, and plain arithmetic can't be broken by a device with a
 * stale timezone database. `VN_TIME_ZONE` is only for locale-aware *display*.
 */
export const VN_UTC_OFFSET_MINUTES = 7 * 60;
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const VN_OFFSET_MS = VN_UTC_OFFSET_MINUTES * 60_000;

const toMs = (at: Date | number) => (typeof at === 'number' ? at : at.getTime());

/**
 * Vietnam wall-clock parts of an instant. Read through the *UTC* getters of a
 * shifted Date so the device's own zone never enters the arithmetic — using the
 * local getters here would silently reintroduce it.
 */
export function vnParts(at: Date | number = Date.now()) {
  const shifted = new Date(toMs(at) + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
  };
}

/** Today in Vietnam as "yyyy-MM-dd" — the day whose bookings the store is working. */
export const todayStr = (at: Date | number = Date.now()) => {
  const { year, month, day } = vnParts(at);
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Vietnam time as "HH:mm:ss" — the backend matches this against the period windows to resolve a booking's PeriodID. */
export const nowTimeStr = (at: Date | number = Date.now()) => {
  const { hours, minutes, seconds } = vnParts(at);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

/** Vietnam time as "HH:mm" — for `<input type="time">` and for display. */
export const formatVnHHmm = (at: Date | number = Date.now()) => {
  const { hours, minutes } = vnParts(at);
  return `${pad(hours)}:${pad(minutes)}`;
};

/** Minutes since midnight in Vietnam — the axis every seat-window comparison runs on. */
export const vnMinutesOfDay = (at: Date | number = Date.now()) => {
  const { hours, minutes } = vnParts(at);
  return hours * 60 + minutes;
};

/**
 * Epoch ms of a Vietnam wall-clock moment: `date` ("yyyy-MM-dd", or any ISO
 * string starting with one) at `minutesOfDay` past midnight. Minutes beyond 1440
 * roll into the next day, which is what a cross-midnight seat window needs.
 * Null when the date can't be read.
 */
export function vnEpochMs(date: string | null | undefined, minutesOfDay = 0): number | null {
  if (!date) return null;
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day, 0, minutesOfDay) - VN_OFFSET_MS;
}

const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Epoch ms of a timestamp the backend sent (DateSeat, DateCreated, …).
 *
 * Those come back without an offset — "2026-08-12T19:04:31" — which `new Date`
 * would read in the *device's* zone, making a guest who sat down 5 minutes ago
 * look 7 hours late on a UTC tablet. They are the server's Vietnam wall-clock, so
 * that is how they are read. A value that does carry a zone is honoured as sent.
 */
export function parseServerTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (!HAS_TIMEZONE.test(raw)) {
    const parts = DATE_TIME.exec(raw);
    if (parts) {
      const [, year, month, day, hours, minutes, seconds] = parts;
      return Date.UTC(+year, +month - 1, +day, +hours, +minutes, +(seconds ?? 0)) - VN_OFFSET_MS;
    }
    // Date only ("2026-08-12") — midnight in Vietnam, not in UTC.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return vnEpochMs(raw);
  }
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Locale-formatted calendar date of an instant, in Vietnam. */
export function formatVnDate(locale: string, at: Date | number = Date.now()): string {
  return new Date(toMs(at)).toLocaleDateString(locale, {
    timeZone: VN_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
