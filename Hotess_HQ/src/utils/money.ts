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
