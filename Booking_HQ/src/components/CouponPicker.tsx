import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchCoupons,
  type AppliedCoupon,
  type AvailableCoupon,
  type CartCoupons,
} from '../api/orderHub';
import { formatMoney } from '../lib/i18nFormat';

interface Props {
  token: string;
  currency: string;
  /** Đổi khi giỏ đổi — tiền giảm ước tính phụ thuộc giỏ nên phải hỏi lại. */
  cartSignature: string;
  /** Áp THÊM mã này vào chồng đang có. */
  onPick: (code: string) => void;
  /** Gỡ `remove` rồi áp `add` — dùng khi mã không cộng thêm được (`stackable = false`). */
  onReplace: (remove: string, add: string) => void;
  /** Các mã ĐANG áp trên giỏ. */
  applied: AppliedCoupon[];
  onClose: () => void;
}

/**
 * Chọn mã từ danh sách. Repo này không có `Sheet` dùng chung nên dựng theo đúng mẫu overlay
 * của `PreOrderProductModal`.
 *
 * 🔴 Hiện CẢ mã chưa đủ điều kiện kèm lý do — cố ý. Với đặt trước, lý do hay gặp nhất là
 *    `COUPON_NOT_IN_SCHEDULE`: coupon chỉ chạy khung giờ nào đó, và backend kiểm theo **giờ
 *    ăn** chứ không phải giờ khách đang xem. Giấu mã đó đi thì khách không hiểu vì sao mã
 *    bạn bè đưa lại không dùng được. FE tuyệt đối KHÔNG tự lọc theo giờ hiện tại.
 */
export function CouponPicker({
  token, currency, cartSignature, onPick, onReplace, applied, onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<CartCoupons | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCoupons(token)
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData({ applied: [], available: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, cartSignature]);

  const list: AvailableCoupon[] = [...(data?.available ?? [])]
    // Mã dùng được lên trước — khách không phải cuộn qua một loạt mã đang bị khoá.
    .sort((a, b) => Number(b.eligible) - Number(a.eligible));

  const appliedCodes = new Set(applied.map((c) => c.code));

  // Mã nào sẽ bị thay khi khách chọn một mã không cộng thêm được. Chồng chỉ có MỘT mã thì thay
  // chính nó, không phải hỏi. Nhiều mã thì KHÔNG tự đoán — thà để khách tự gỡ mã họ muốn bỏ
  // còn hơn hệ thống bỏ nhầm mã to nhất.
  const replaceTarget = applied.length === 1 ? applied[0].code : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h3 className="text-base font-semibold">{t('preorder.couponTitle')}</h3>
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">
            {t('preorder.close')}
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2.5 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-neutral-400">{t('preorder.loading')}</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">{t('preorder.couponNone')}</p>
          ) : (
            list.map((c) => (
              <div
                key={c.code}
                className={
                  'rounded-xl border px-3.5 py-3 ' +
                  (c.eligible ? 'border-neutral-200 bg-white' : 'border-dashed border-neutral-200 bg-neutral-50')
                }
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-bold">{c.code}</span>
                      {c.eligible && c.estimatedDiscount > 0 && (
                        <span className="text-sm font-semibold text-emerald-600">
                          −{formatMoney(c.estimatedDiscount, i18n.language, currency)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-neutral-800">{c.title}</p>
                    {c.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">{c.description}</p>
                    )}
                    {!c.eligible && (
                      <p className="mt-1 text-xs text-amber-600">
                        {c.reason ? t(`preorder.${c.reason}`) : c.message}
                        {c.reason === 'COUPON_MIN_NOT_MET' && c.shortfall
                          ? ` ${t('preorder.couponShortfall')} ${formatMoney(c.shortfall, i18n.language, currency)}.`
                          : ''}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {appliedCodes.has(c.code) ? (
                      <span className="text-xs font-medium text-emerald-600">{t('preorder.couponApplied')}</span>
                    ) : c.eligible && c.stackable === false ? (
                      // Dùng được nhưng KHÔNG cộng thêm được ⇒ nút phải nói "thay", không phải "thêm".
                      replaceTarget ? (
                        <button
                          onClick={() => onReplace(replaceTarget, c.code)}
                          className="rounded-lg border border-resy-red px-3 py-1.5 text-xs font-semibold text-resy-red"
                        >
                          {t('preorder.couponReplace')}
                        </button>
                      ) : (
                        <span className="block max-w-[9rem] text-right text-xs text-amber-600">
                          {t('preorder.couponRemoveOneFirst')}
                        </span>
                      )
                    ) : c.eligible ? (
                      <button
                        onClick={() => onPick(c.code)}
                        className="rounded-lg bg-resy-red px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        {t('preorder.couponUse')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
