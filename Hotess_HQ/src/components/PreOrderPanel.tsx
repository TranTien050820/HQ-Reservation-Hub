import { useTranslation } from 'react-i18next';
import type { PreOrder } from '../types';
import { formatVnd } from '../utils/money';
import { AlertIcon, DishIcon } from './icons';

interface PreOrderPanelProps {
  preOrders: PreOrder[];
  /** Shown only when the booking is already seated with a table — Release needs both. */
  onRelease?: () => void;
  releasing?: boolean;
  /** Calls the food off entirely. Always available here: every order this panel can show is still cancellable. */
  onCancel?: () => void;
  cancelling?: boolean;
}

/** A deposit/prepaid order the guest hasn't settled yet — Release only sends `scheduled` ones. */
function isUnpaidPreOrder(order: PreOrder): boolean {
  return order.orderStatus === 'awaiting_payment' || order.orderStatus === 'payment_failed';
}

/**
 * The food a guest chose before arriving, as the hostess needs to see it: what was ordered,
 * how much it comes to, and whether anything is still unpaid. The dishes are not at the
 * kitchen yet — they go there when the booking is seated and Release runs (§8.4).
 */
export function PreOrderPanel({
  preOrders,
  onRelease,
  releasing,
  onCancel,
  cancelling,
}: PreOrderPanelProps) {
  const { t } = useTranslation();
  if (preOrders.length === 0) return null;

  const total = preOrders.reduce((sum, order) => sum + (order.grandTotal ?? 0), 0);
  const unpaid = preOrders.filter(isUnpaidPreOrder);
  /** Money already taken is never refunded automatically — the store's deposit policy decides. */
  const paidTotal = preOrders.reduce((sum, order) => sum + (order.paidAmount ?? 0), 0);

  return (
    <div className="note note-ok mt-4 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide">
          {t('preorder.title', { count: preOrders.length })}
        </p>
        <span className="text-sm font-semibold text-ink">{formatVnd(total)}</span>
      </div>

      <div className="space-y-2">
        {preOrders.map((order) => (
          <div key={order.orderUid} className="rounded-lg border border-line bg-surface p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted">{order.orderNumber || order.orderUid}</span>
              <span className="text-xs font-semibold text-ink">{formatVnd(order.grandTotal)}</span>
            </div>
            {isUnpaidPreOrder(order) && (
              <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warn">
                <AlertIcon size={13} className="mt-px shrink-0" />
                {t('preorder.unpaid')}
              </p>
            )}
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
              {(order.items ?? []).map((item) => (
                <li key={item.lineNo} className={item.lineStatus === 'removed' ? 'line-through opacity-60' : ''}>
                  {item.qty}× {item.nameSnapshot ?? `#${item.prodNum}`}
                  {item.note && <span className="text-faint"> — {item.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {onRelease && (
        <>
          <button
            onClick={onRelease}
            disabled={releasing || cancelling}
            className="chip-btn btn-success mt-3 w-full rounded-xl text-sm font-semibold"
          >
            {releasing ? t('preorder.releasing') : t('preorder.release')}
          </button>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">
            {unpaid.length > 0 ? t('preorder.releaseUnpaidHint') : t('preorder.releaseHint')}
          </p>
        </>
      )}

      {onCancel && (
        <>
          <button
            onClick={onCancel}
            disabled={releasing || cancelling}
            className="chip-btn btn-secondary mt-2 w-full rounded-xl text-sm font-semibold text-bad"
          >
            {cancelling ? t('preorder.cancelling') : t('preorder.cancel')}
          </button>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">
            {paidTotal > 0
              ? t('preorder.cancelPaidHint', { amount: formatVnd(paidTotal) })
              : t('preorder.cancelHint')}
          </p>
        </>
      )}
    </div>
  );
}

/** Compact marker for lists — "this guest has food waiting". */
export function PreOrderBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <span className="chip inline-flex items-center gap-1 border border-[var(--ok-line)] bg-[var(--ok-bg)] text-ok">
      <DishIcon size={12} />
      {t('preorder.badge')}
      {count > 1 && ` ×${count}`}
    </span>
  );
}
