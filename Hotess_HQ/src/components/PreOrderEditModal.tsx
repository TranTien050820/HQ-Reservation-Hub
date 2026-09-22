import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { editPreOrderLines } from '../api/orderHub';
import { apiErrorCode, apiErrorMessage } from '../utils/apiError';
import { formatVnd } from '../utils/money';
import type { EditPreOrderResult, PreOrder, PreOrderItem, PreOrderLineChange, SiteScope } from '../types';
import { AlertIcon, CheckCircleIcon, MinusIcon, PlusIcon, RefundIcon, TrashIcon } from './icons';

/** 409 from `A-29`: the order left `scheduled` — usually released from another terminal. */
const ALREADY_RELEASED = 'ORDER_ALREADY_RELEASED';

interface PreOrderEditModalProps {
  /** Non-null opens the modal. Only ever a `scheduled` order — the caller gates on that. */
  order: PreOrder | null;
  reservationNo: string;
  /** The booking's station scope (`bookingScope`) — the edit is refused outside it (SPEC-06 R-10). */
  scope: SiteScope;
  /** Stamped into the order's event log as who made the change. */
  empNum?: number | null;
  /**
   * Fired once the server has accepted the change, before the hostess dismisses the result.
   * The panel behind is already wrong by then, so it reloads immediately rather than waiting
   * for a close that may never come.
   */
  onEdited: () => void;
  onClose: () => void;
}

/** What the hostess has done to one line so far. */
interface LineDraft {
  /** 0 .. original qty. `0` is "bỏ món"; the server treats it as a removal too. */
  qty: number;
  reason: string;
}

/** Lines the server will accept a change on — `removed`/`refunded` ones are already gone. */
function editableLines(order: PreOrder): PreOrderItem[] {
  return (order.items ?? []).filter((item) => !item.lineStatus || item.lineStatus === 'active');
}

/**
 * What one portion really costs, topping included.
 *
 * Derived from `lineTotal / qty` rather than read from `unitPrice`, exactly as the server
 * does it: a line carrying toppings has a `lineTotal` above `unitPrice × qty`, and pricing
 * the reduction off `unitPrice` would quietly under-refund every such line.
 */
function perUnit(item: PreOrderItem): number {
  const qty = item.qty || 0;
  return qty === 0 ? 0 : (item.lineTotal ?? 0) / qty;
}

export function PreOrderEditModal({
  order,
  reservationNo,
  scope,
  empNum,
  onEdited,
  onClose,
}: PreOrderEditModalProps) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Map<number, LineDraft>>(() => new Map());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** Set once the change went through — the modal then shows only the outcome. */
  const [result, setResult] = useState<EditPreOrderResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The order moved on under us (409). Editing is over; the panel has to be re-read. */
  const [staleError, setStaleError] = useState(false);

  const lines = useMemo(() => (order ? editableLines(order) : []), [order]);

  const qtyOf = (item: PreOrderItem) => drafts.get(item.lineNo)?.qty ?? item.qty;
  const reasonOf = (item: PreOrderItem) => drafts.get(item.lineNo)?.reason ?? '';
  const isChanged = (item: PreOrderItem) => qtyOf(item) !== item.qty;

  const setQty = (item: PreOrderItem, qty: number) => {
    const clamped = Math.max(0, Math.min(item.qty, Math.floor(qty)));
    setDrafts((prev) => {
      const next = new Map(prev);
      const reason = prev.get(item.lineNo)?.reason ?? '';
      // Back to the original quantity is not a change — drop the draft so its reason box
      // disappears with it and the line stops counting toward the summary.
      if (clamped === item.qty) next.delete(item.lineNo);
      else next.set(item.lineNo, { qty: clamped, reason });
      return next;
    });
  };

  const setReason = (item: PreOrderItem, reason: string) => {
    setDrafts((prev) => {
      const current = prev.get(item.lineNo);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(item.lineNo, { ...current, reason });
      return next;
    });
  };

  const changed = lines.filter(isChanged);
  const removedCount = changed.filter((item) => qtyOf(item) === 0).length;
  const reducedCount = changed.length - removedCount;
  const missingReason = changed.some((item) => !reasonOf(item).trim());

  /**
   * "Bỏ 2 món · Giảm 1 món", with the halves that are zero left out entirely.
   *
   * Printing "Giảm 0 món" beside a real count reads as a second thing that happened and
   * makes the hostess re-check a line she never touched.
   */
  const changeSummary = [
    removedCount > 0 ? t('preorderEdit.changeRemoved', { count: removedCount }) : null,
    reducedCount > 0 ? t('preorderEdit.changeReduced', { count: reducedCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /**
   * The total as it will read afterwards — the number in the confirmation box.
   *
   * An estimate, and labelled as one: the server recomputes coupons after the lines change,
   * so a discount that stops qualifying moves the real figure. That figure comes back in the
   * result panel, which is what the hostess reads out to the guest.
   */
  const newTotal = Math.max(
    0,
    (order?.grandTotal ?? 0) -
      changed.reduce(
        (sum, item) => sum + ((item.lineTotal ?? 0) - Math.round(perUnit(item) * qtyOf(item))),
        0,
      ),
  );

  if (!order) return null;

  const submit = async () => {
    setConfirming(false);
    setSubmitting(true);
    setError(null);
    try {
      const changes: PreOrderLineChange[] = changed.map((item) => {
        const qty = qtyOf(item);
        const reason = reasonOf(item).trim();
        return qty === 0
          ? { lineNo: item.lineNo, action: 'remove', reason }
          : { lineNo: item.lineNo, action: 'qty', qty, reason };
      });
      const edited = await editPreOrderLines(reservationNo, order.orderUid, changes, scope, { empNum, note });
      setResult(edited);
      // Immediately, not on close: everything behind this modal is now describing an order
      // that no longer exists in that shape.
      onEdited();
    } catch (err) {
      if (apiErrorCode(err) === ALREADY_RELEASED) {
        setStaleError(true);
        // The panel's own copy of this order is stale too — refresh it so the Sửa món
        // button disappears rather than inviting a second attempt at the same refusal.
        onEdited();
      } else {
        setError(apiErrorMessage(err, t('preorderEdit.error')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title = order.orderNumber || order.orderUid;

  return (
    // Swallows clicks rather than closing on them, twice over: a half-filled edit form is
    // not something to lose to a stray tap, and this panel sits inside the booking card's
    // own backdrop, which does close on click.
    <div
      className="modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="glass-card modal-panel flex max-h-[88vh] w-full max-w-md flex-col p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('preorderEdit.title')}
      >
        {result ? (
          <EditResult result={result} paidAmount={order.paidAmount ?? 0} onClose={onClose} />
        ) : staleError ? (
          <StaleNotice onClose={onClose} />
        ) : (
          <>
            <div className="mb-1 flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-ink">{t('preorderEdit.title')}</h3>
                <p className="truncate font-mono text-xs text-muted">{title}</p>
              </div>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-ink">{formatVnd(order.grandTotal)}</span>
                <span className="block text-[11px] text-faint">{t('preorderEdit.currentTotal')}</span>
              </span>
            </div>

            {/* Said once, up front. A hostess who reads it here does not go hunting for an
                "add dish" button that this endpoint would refuse anyway. */}
            <p className="note note-info mt-2 shrink-0 text-xs leading-snug">
              {t('preorderEdit.rulesHint')}
            </p>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {lines.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">{t('preorderEdit.noLines')}</p>
              )}
              {lines.map((item) => {
                const qty = qtyOf(item);
                const removed = qty === 0;
                const changedLine = isChanged(item);
                return (
                  <div
                    key={item.lineNo}
                    className={`rounded-xl border p-2.5 transition ${
                      changedLine ? 'border-[var(--warn-line)] bg-[var(--warn-bg)]' : 'border-line bg-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium text-ink ${removed ? 'line-through opacity-60' : ''}`}
                        >
                          {item.nameSnapshot ?? `#${item.prodNum}`}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatVnd(Math.round(perUnit(item)))} × {item.qty}
                          {item.note && <span className="text-faint"> — {item.note}</span>}
                        </p>
                      </div>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                        {changedLine ? (
                          <>
                            <s className="block text-[11px] font-normal text-faint">
                              {formatVnd(item.lineTotal)}
                            </s>
                            <span className="text-warn">{formatVnd(Math.round(perUnit(item) * qty))}</span>
                          </>
                        ) : (
                          <span className="text-ink">{formatVnd(item.lineTotal)}</span>
                        )}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {/* Stepper only goes down, and only to the original quantity coming
                          back up. Raising it past that is a bigger bill, which this screen
                          cannot collect — so there is no control for it. */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQty(item, qty - 1)}
                          disabled={qty === 0}
                          aria-label={t('preorderEdit.decrease')}
                          className="chip-btn btn-secondary flex h-8 w-8 items-center justify-center rounded-lg"
                        >
                          <MinusIcon size={15} />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums text-ink">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(item, qty + 1)}
                          disabled={qty >= item.qty}
                          aria-label={t('preorderEdit.increase')}
                          title={qty >= item.qty ? t('preorderEdit.noIncreaseHint') : undefined}
                          className="chip-btn btn-secondary flex h-8 w-8 items-center justify-center rounded-lg"
                        >
                          <PlusIcon size={15} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setQty(item, removed ? item.qty : 0)}
                        className={`chip-btn ml-auto flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
                          removed ? 'btn-secondary' : 'btn-secondary text-bad'
                        }`}
                      >
                        <TrashIcon size={13} />
                        {removed ? t('preorderEdit.undo') : t('preorderEdit.removeLine')}
                      </button>
                    </div>

                    {/* Only where something changed. An always-on reason box on every line
                        turns "why did this dish go?" into a form to be dismissed. */}
                    {changedLine && (
                      <div className="mt-2">
                        <input
                          value={reasonOf(item)}
                          onChange={(e) => setReason(item, e.target.value)}
                          placeholder={t('preorderEdit.reasonPlaceholder')}
                          aria-label={t('preorderEdit.reason')}
                          className={`field w-full px-3 py-1.5 text-sm ${
                            reasonOf(item).trim() ? '' : 'border-[var(--bad-line)]'
                          }`}
                        />
                        {!reasonOf(item).trim() && (
                          <p className="mt-1 text-[11px] text-bad">{t('preorderEdit.reasonRequired')}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {lines.length > 0 && (
                <div className="pt-1">
                  <label htmlFor="preorder-edit-note" className="field-label">
                    {t('preorderEdit.note')} <span className="text-faint">({t('common.optional')})</span>
                  </label>
                  <input
                    id="preorder-edit-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('preorderEdit.notePlaceholder')}
                    className="field w-full px-3 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="note note-bad mt-2 flex shrink-0 items-start gap-1.5 text-sm">
                <AlertIcon size={14} className="mt-px shrink-0" />
                {error}
              </p>
            )}

            {/* Pinned inside the panel, never at the end of the list: with a dozen dishes the
                submit button otherwise sits a full scroll below the last thing the hostess
                touched, and she has to hunt for it with a guest waiting. */}
            <div className="mt-3 shrink-0 space-y-2 border-t border-line-soft pt-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">
                  {changed.length === 0 ? t('preorderEdit.noChanges') : changeSummary}
                </span>
                {changed.length > 0 && (
                  <span className="font-semibold text-ink tabular-nums">{formatVnd(newTotal)}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-btn btn-secondary flex-1 rounded-xl text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={changed.length === 0 || missingReason || submitting}
                  className="touch-btn btn-primary flex-[2] rounded-xl text-sm font-semibold"
                >
                  {submitting ? t('preorderEdit.submitting') : t('preorderEdit.submit')}
                </button>
              </div>
              {missingReason && changed.length > 0 && (
                <p className="text-center text-[11px] text-bad">{t('preorderEdit.reasonRequiredAll')}</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Its own layer above the editor: the last thing between a paid order and a change
          to it should read as a stop, not as one more control on the form. */}
      {confirming && (
        <div className="modal-backdrop fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="modal-panel w-full max-w-sm rounded-2xl border border-line p-5">
            <h3 className="text-lg font-semibold text-ink">{t('preorderEdit.confirmTitle')}</h3>
            <p className="mt-2 text-sm text-muted">
              {t('preorderEdit.confirmSummary', { changes: changeSummary, total: formatVnd(newTotal) })}
            </p>
            <p className="mt-1 text-xs text-faint">{t('preorderEdit.confirmEstimateHint')}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="touch-btn min-h-[44px] rounded-xl px-5 py-3 text-sm font-medium text-muted hover:bg-surface-hover"
              >
                {t('common.no')}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                className="touch-btn btn-primary min-h-[44px] rounded-xl px-5 py-3 text-sm font-semibold"
              >
                {t('preorderEdit.confirmSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What the change actually did, in the middle of the screen.
 *
 * The refund line is the whole reason this panel exists rather than a toast: nothing in the
 * system moves that money, so if the hostess does not read it and tell the shift manager,
 * the guest is simply out of pocket.
 *
 * `refundDue` alone does not mean cash has to go back, though. The server computes it as the
 * drop in what the guest OWES, whether or not they have paid anything yet — so on an unpaid
 * pre-order it is just a smaller bill. Treating that as a refund would send the floor to the
 * shift manager over money nobody ever collected, so the two cases are drawn differently and
 * only the paid one is an alarm.
 */
function EditResult({
  result,
  paidAmount,
  onClose,
}: {
  result: EditPreOrderResult;
  paidAmount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const needsRefund = result.refundDue > 0 && paidAmount > 0;
  const reducedUnpaid = result.refundDue > 0 && paidAmount <= 0;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-center">
        <span
          className={`icon-tile mx-auto mt-1 flex h-14 w-14 ${needsRefund ? 'text-warn' : 'text-ok'}`}
        >
          {needsRefund ? <RefundIcon size={28} /> : <CheckCircleIcon size={28} />}
        </span>
        <h3 className="mt-3 text-lg font-semibold text-ink">{t('preorderEdit.doneTitle')}</h3>
        <p className="mt-1 text-sm text-muted">
          {t('preorderEdit.doneTotal')}{' '}
          <span className="font-semibold text-ink">{formatVnd(result.grandTotal)}</span>
        </p>

        {needsRefund && (
          <div className="note note-warn mt-4 p-4 text-left">
            <p className="text-base font-bold leading-tight">
              {t('preorderEdit.refundBanner', { amount: formatVnd(result.refundDue) })}
            </p>
            <p className="mt-1.5 text-sm leading-snug opacity-90">{t('preorderEdit.refundHint')}</p>
            <p className="mt-1.5 text-sm font-medium opacity-90">
              {t('preorderEdit.refundPaid', { paid: formatVnd(paidAmount) })}
            </p>
          </div>
        )}

        {reducedUnpaid && (
          <div className="note note-info mt-4 p-3 text-left">
            <p className="text-sm leading-snug">
              {t('preorderEdit.reducedUnpaid', { amount: formatVnd(result.refundDue) })}
            </p>
          </div>
        )}

        {result.couponWarnings.length > 0 && (
          <div className="note note-bad mt-3 p-3 text-left">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <AlertIcon size={14} className="shrink-0" />
              {t('preorderEdit.couponTitle')}
            </p>
            <ul className="space-y-1 text-sm">
              {result.couponWarnings.map((warning, index) => (
                <li key={`${warning.code ?? 'coupon'}-${index}`}>
                  <span className="font-mono font-semibold">{warning.code ?? '—'}</span>
                  {warning.reason && <span className="opacity-90"> — {warning.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`touch-btn mt-4 w-full shrink-0 rounded-xl text-sm font-semibold ${
          needsRefund ? 'btn-warning' : 'btn-primary'
        }`}
      >
        {needsRefund ? t('preorderEdit.refundAck') : t('common.close')}
      </button>
    </>
  );
}

/** The 409 case: someone released this order while the modal was open. */
function StaleNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-center">
        <span className="icon-tile mx-auto mt-1 flex h-14 w-14 text-warn">
          <AlertIcon size={28} />
        </span>
        <h3 className="mt-3 text-lg font-semibold text-ink">{t('preorderEdit.releasedTitle')}</h3>
        <p className="mt-2 text-sm leading-snug text-muted">{t('preorderEdit.releasedHint')}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="touch-btn btn-primary mt-4 w-full shrink-0 rounded-xl text-sm font-semibold"
      >
        {t('common.close')}
      </button>
    </>
  );
}
