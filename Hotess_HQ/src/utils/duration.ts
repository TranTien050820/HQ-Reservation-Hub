/** Minimal shape of i18next's `t`, so this stays a plain function callers can use anywhere. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * A stretch of minutes as staff say it: "45 phút" under the hour, "1 giờ 25
 * phút" past it. Kept out of the components because a table's sitting time is
 * read at a glance across a busy floor — the two forms have to look the same
 * everywhere they appear.
 */
export function formatDuration(minutes: number, t: Translate): string {
  // Floored, like `elapsedMinutes`: a party 44 minutes and 40 seconds in has not
  // been sitting for 45 minutes yet, and the two counters must not disagree.
  const total = Math.max(0, Math.floor(minutes));
  if (total < 60) return t('common.durationMinutes', { minutes: total });
  return t('common.durationHoursMinutes', { hours: Math.floor(total / 60), minutes: total % 60 });
}
