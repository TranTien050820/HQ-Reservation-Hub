/**
 * OrderHub returns whole-dong amounts (ORDERHUB_API_GUIDE §1.2), so nothing after the
 * decimal point is ever meaningful — print "285.000 ₫", never "285.000,00 ₫".
 */
export function formatVnd(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** Scale words per language — "5tr" / "500k" is how the floor actually says prices. */
const SHORT_UNITS: Record<'vi' | 'en', { billion: string; million: string; thousand: string; dong: string }> = {
  vi: { billion: ' tỷ', million: 'tr', thousand: 'k', dong: 'đ' },
  en: { billion: 'B', million: 'M', thousand: 'k', dong: '₫' },
};

/**
 * A price squeezed onto a table card: 5.000.000 → "5tr", 1.250.000 → "1,25tr", 500.000 → "500k"
 * ("5M" / "1.25M" in English). Two decimals at most, so a card label can round; wherever the
 * guest is told what to pay, use `formatVnd`.
 */
export function formatVndShort(value: number | null | undefined, language: string): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  const lang = language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
  const units = SHORT_UNITS[lang];
  const number = (n: number) =>
    new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 }).format(n);
  const size = Math.abs(safe);
  if (size >= 1_000_000_000) return `${number(safe / 1_000_000_000)}${units.billion}`;
  if (size >= 1_000_000) return `${number(safe / 1_000_000)}${units.million}`;
  if (size >= 1_000) return `${number(safe / 1_000)}${units.thousand}`;
  return `${number(safe)}${units.dong}`;
}
