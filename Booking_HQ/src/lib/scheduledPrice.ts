import type { PriceSchedule } from '../api/orderHub';

/**
 * Giá của một món tại GIỜ ĂN, không phải giờ đang xem.
 *
 * 🔴 Vì sao chỉ repo này cần: server resolve `Product.MENUSCHED` theo `DateTime.Now` lúc gọi
 *    API rồi mới trả `price`. Với QR/Tablet thì đúng — khách ăn ngay. Với đặt trước thì sai:
 *    khách xem lúc 10:00 sáng cho bữa tối 19:00 sẽ thấy **giá bậc của 10:00**. Checkout cũng
 *    không bắt được (vẫn 10:00); lệch chỉ lộ ra ở bước Release lúc 19:00 dưới dạng
 *    `warnings[]` — tức là khi khách đã ngồi vào bàn và cầm thực đơn trong tay.
 *
 * `priceSchedule` là bảng 7 ngày × 24 giờ do server trả kèm món:
 *   `{ "SUN": [ { "12 AM": 25000 }, { "1 AM": 25000 }, … ] }`
 *
 * Ô không có giá ("Not Present" / null) ⇒ rơi về `fallbackPrice`, tức `product.price`.
 * Không đoán sang ô bên cạnh: một ô trống nghĩa là bậc giá đó không được khai, và bịa ra một
 * con số ở đây sẽ khác con số POS tính khi bill vào máy.
 */

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** '12 AM' · '1 AM' … '11 PM' — đúng nhãn mà server sinh ra. */
function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function priceAt(
  schedule: PriceSchedule | null | undefined,
  scheduledFor: Date | string | null | undefined,
  fallbackPrice: number,
): number {
  if (!schedule || !scheduledFor) return fallbackPrice;

  const when = scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor);
  if (Number.isNaN(when.getTime())) return fallbackPrice;

  const day = schedule[DAY_KEYS[when.getDay()]];
  if (!Array.isArray(day)) return fallbackPrice;

  const label = hourLabel(when.getHours());

  // Mảng theo giờ nhưng KHÔNG chắc đủ 24 phần tử và không chắc đúng thứ tự — tra theo NHÃN
  // thay vì theo chỉ số, để một bảng thiếu giờ không làm lệch cả ngày.
  for (const cell of day) {
    if (cell && Object.prototype.hasOwnProperty.call(cell, label)) {
      const value = cell[label];
      return typeof value === 'number' && value > 0 ? value : fallbackPrice;
    }
  }

  return fallbackPrice;
}

/** Giá theo lịch có KHÁC giá đang hiển thị không — để cảnh báo khách trước khi họ chốt. */
export function priceDiffersAtMealtime(
  schedule: PriceSchedule | null | undefined,
  scheduledFor: Date | string | null | undefined,
  currentPrice: number,
): boolean {
  return priceAt(schedule, scheduledFor, currentPrice) !== currentPrice;
}
