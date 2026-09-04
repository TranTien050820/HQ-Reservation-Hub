import { useTranslation } from 'react-i18next';
import { promoPriceAt, type ProductPromo, type Promotion } from '../api/orderHub';
import { formatMoney } from '../lib/i18nFormat';

type T = ReturnType<typeof useTranslation>['t'];

/**
 * Nhãn ngắn của một khuyến mãi: `−10%` · `Mua 2 tính 1` · `Cả đơn −50.000` · `Tặng ×1`.
 *
 * Backend cố ý KHÔNG gửi câu chữ (§22) — nó gửi `kind` + con số, client dựng nhãn theo ngôn
 * ngữ của mình. Repo này có 5 ngôn ngữ nên điều đó càng quan trọng.
 */
export function promoLabel(p: Promotion, t: T, lang: string, currency: string): string {
  if (p.kind === 'X_FOR_Y' && p.xValue > 0) {
    return `${t('preorder.promoBuy')} ${p.xValue} ${t('preorder.promoPay')} ${p.yValue}`;
  }
  if (p.giftQty > 0) return `${t('preorder.couponGift')} ×${p.giftQty}`;

  switch (p.kind) {
    case 'PERCENT_OFF':
      return `−${p.value}%`;
    // 🔴 "Giảm 50.000" là tiền của CẢ ĐƠN, không phải của món này.
    case 'AMOUNT_OFF':
      return `${t('preorder.promoWholeBill')} −${formatMoney(p.value, lang, currency)}`;
    case 'FIXED_PRICE':
      return `${t('preorder.promoOnly')} ${formatMoney(p.value, lang, currency)}`;
    default:
      return p.title;
  }
}

/** Điều kiện phải đạt thì ưu đãi mới đúng. Chuỗi rỗng = không điều kiện. */
export function promoCondition(p: Promotion, t: T, lang: string, currency: string): string {
  const parts: string[] = [];
  if (p.minCost) parts.push(`${t('preorder.promoMinCost')} ${formatMoney(p.minCost, lang, currency)}`);
  if (p.minQuan) parts.push(`${t('preorder.promoMinQuan')} ${p.minQuan}`);
  if (p.requiresMember) parts.push(t('preorder.promoMemberOnly'));
  return parts.join(' · ');
}

interface PriceProps {
  /** Giá thẻ món ĐANG HIỆN — ở kênh đặt trước là giá theo GIỜ ĂN, không phải giá hiện tại. */
  base: number;
  promo: ProductPromo | null;
  currency: string;
  lang: string;
}

/**
 * Giá của một món, có hoặc không có khuyến mãi.
 *
 * 🔴 Thẻ món CHỈ nhận mã `autoApply` — backend không gửi mã gõ tay xuống đây. Đó là điều làm
 *    con số này trung thực: hệ thống tự áp mã ngay khi giỏ đủ điều kiện, nên khách thấy 90.000
 *    ở menu thì cũng thấy 90.000 ở giỏ. Không có gì để bấm.
 *
 * 🔴 Tính lại giá sau giảm trên `base` chứ KHÔNG dùng `promo.priceAfter`: backend tính con số
 *    đó trên giá HIỆN TẠI, còn thẻ món ở đây hiện giá theo GIỜ ĂN. Hai nền khác nhau.
 */
export function ProductPrice({ base, promo, currency, lang }: PriceProps) {
  const { t } = useTranslation();

  if (!promo) {
    return <span className="font-semibold">{formatMoney(base, lang, currency)}</span>;
  }

  const after = promoPriceAt(promo, base);
  const condition = promoCondition(promo, t, lang, currency);

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        {after != null ? (
          <>
            <span className="font-semibold">{formatMoney(after, lang, currency)}</span>
            <span className="text-xs text-neutral-400 line-through">
              {formatMoney(base, lang, currency)}
            </span>
          </>
        ) : (
          <span className="font-semibold">{formatMoney(base, lang, currency)}</span>
        )}
      </div>

      <span className="mt-1 flex max-w-full items-center gap-1 rounded-md bg-emerald-600/10 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-emerald-700">
        <span className="truncate">
          ✨ {t('preorder.promoAuto')} · {promoLabel(promo, t, lang, currency)}
        </span>
      </span>

      {condition && (
        <p className="mt-0.5 truncate text-[11px] leading-tight text-neutral-400">{condition}</p>
      )}
    </div>
  );
}

/**
 * Dải ưu đãi ở ĐẦU MENU — thứ khách nhìn thấy trước khi có giỏ hàng.
 *
 * 🔴 Trước đây coupon chỉ nằm trong khối giỏ bên phải, tức là khách phải thêm món rồi mới biết
 *    cửa hàng đang giảm giá.
 *
 * 🔴 Đây là nơi DUY NHẤT mã phải gõ tay được hiện; thẻ món chỉ nhận mã tự áp.
 *
 * 🔴 Kênh đặt trước: backend kiểm lịch giờ coupon theo **giờ ăn**, không phải giờ hiện tại.
 *    Danh sách này đã lọc sẵn — FE tuyệt đối không tự lọc lại theo giờ đang xem.
 */
export function PromoStrip({
  promotions, currency, lang, pinnedCode, onPin,
}: {
  promotions: Promotion[];
  currency: string;
  lang: string;
  pinnedCode: string | null;
  onPin: (code: string | null) => void;
}) {
  const { t } = useTranslation();

  if (promotions.length === 0) return null;

  // Mã TỰ ÁP lên trước: khách được hưởng mà không phải làm gì.
  const sorted = [...promotions].sort((a, b) => Number(b.autoApply) - Number(a.autoApply));

  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {sorted.map((p) => {
        const pinned = pinnedCode === p.code;
        const condition = promoCondition(p, t, lang, currency);

        const body = (
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-bold">
                {promoLabel(p, t, lang, currency)}
              </span>
              {/* Mã tự áp KHÔNG hiện code: khách không bao giờ phải gõ nó. */}
              {!p.autoApply && (
                <span className="shrink-0 font-mono text-[11px] font-semibold text-resy-red">
                  {p.code}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{p.title}</p>
            {condition && (
              <p className="mt-0.5 truncate text-[11px] text-neutral-400">{condition}</p>
            )}
            <p className="mt-1 truncate text-[11px] font-medium text-emerald-700">
              {p.autoApply ? t('preorder.promoAutoHint') : pinned ? t('preorder.promoPinnedHint') : ''}
            </p>
          </div>
        );

        // Tự áp: không có hành động nào để bấm — dựng <div>, không dựng <button>.
        if (p.autoApply) {
          return (
            <div
              key={p.promoNum}
              className="flex w-60 shrink-0 items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-2.5 text-left"
            >
              <span className="mt-0.5 shrink-0">✨</span>
              {body}
            </div>
          );
        }

        return (
          <button
            key={p.promoNum}
            type="button"
            onClick={() => onPin(pinned ? null : p.code)}
            className={
              'flex w-60 shrink-0 items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ' +
              (pinned
                ? 'border-resy-red/60 bg-resy-red/10'
                : 'border-resy-red/30 bg-resy-red/5 hover:bg-resy-red/10')
            }
          >
            <span className="mt-0.5 shrink-0">🎟</span>
            {body}
          </button>
        );
      })}
    </div>
  );
}
