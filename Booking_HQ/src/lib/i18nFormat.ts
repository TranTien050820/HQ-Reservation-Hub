/** Locale-aware date/time formatters shared across pages — keyed off the active i18n language. */

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  vi: 'vi-VN',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zh: 'zh-CN',
};

/** Languages that conventionally show a 24-hour clock rather than 12-hour AM/PM. */
const HOUR24_LANGUAGES = new Set(['vi', 'ko', 'ja', 'zh']);

export function resolveLocale(language: string): string {
  return LOCALE_MAP[language] ?? LOCALE_MAP.en;
}

/** e.g. "Tuesday, June 16" / "Thứ Ba, 16 tháng 6" */
export function formatDateHeading(date: string, language: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(resolveLocale(language), { weekday: 'long', month: 'long', day: 'numeric' });
}

/** e.g. "Tuesday, June 16, 2026" / "Thứ Ba, 16 tháng 6, 2026" */
export function formatDateHeadingWithYear(date: string, language: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(resolveLocale(language), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** e.g. "Tue, Jun 16, 2026" / "Th 3, 16 thg 6, 2026" */
export function formatDateShort(date: string, language: string): string {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(resolveLocale(language), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** e.g. "7:00 PM" / "19:00" */
export function formatTime(value: string | undefined, language: string): string {
  if (!value) return '—';
  const [h, m] = value.split(':').map(Number);
  if (HOUR24_LANGUAGES.has(language)) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
