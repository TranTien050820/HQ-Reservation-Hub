import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchProduct,
  type AddCartItemRequest,
  type ModifierSelection,
  type OrderHubMenuProduct,
  type OrderHubProduct,
} from '../api/orderHub';
import { formatMoney } from '../lib/i18nFormat';
import { menuItemPhoto } from '../lib/menuImages';

interface PreOrderProductModalProps {
  token: string;
  product: OrderHubMenuProduct;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onAdd: (item: AddCartItemRequest) => void;
}

/**
 * Dish detail + option picker. Opened for products flagged `hasModifiers`, because those
 * carry required choices the cart endpoint won't fill in for us: the guide (§3.5) puts the
 * "force a valid selection" duty on the client, so Add stays disabled until every required
 * group has at least `minSelect` choices.
 */
export default function PreOrderProductModal({
  token,
  product,
  currency,
  busy,
  onClose,
  onAdd,
}: PreOrderProductModalProps) {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<OrderHubProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  /** optionIndex -> chosen `choice` codes. */
  const [selections, setSelections] = useState<Record<number, number[]>>({});

  // No loading/error reset here: the parent keys this modal by product, so a different dish
  // mounts a fresh component that already starts in the loading state.
  useEffect(() => {
    let cancelled = false;
    fetchProduct(token, product.prodNum)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        // Pre-tick the defaults the store configured, so a required single-choice group
        // usually opens already satisfied.
        const initial: Record<number, number[]> = {};
        for (const group of data.modifierGroups ?? []) {
          const defaults = (group.choices ?? []).filter((c) => c.isDefault).map((c) => c.choice);
          if (defaults.length > 0) {
            initial[group.optionIndex] = group.selectionType === 'single' ? defaults.slice(0, 1) : defaults;
          }
        }
        setSelections(initial);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('preorder.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, product.prodNum, t]);

  const toggleChoice = (optionIndex: number, choice: number, single: boolean, maxSelect: number) => {
    setSelections((prev) => {
      const current = prev[optionIndex] ?? [];
      if (single) return { ...prev, [optionIndex]: current.includes(choice) ? [] : [choice] };
      if (current.includes(choice)) {
        return { ...prev, [optionIndex]: current.filter((c) => c !== choice) };
      }
      if (maxSelect > 0 && current.length >= maxSelect) return prev;
      return { ...prev, [optionIndex]: [...current, choice] };
    });
  };

  const missingRequired = useMemo(() => {
    for (const group of detail?.modifierGroups ?? []) {
      const min = group.isRequired ? Math.max(1, group.minSelect ?? 1) : (group.minSelect ?? 0);
      if ((selections[group.optionIndex]?.length ?? 0) < min) return true;
    }
    return false;
  }, [detail, selections]);

  const unitPrice = useMemo(() => {
    const base = detail?.price ?? product.price ?? 0;
    let extra = 0;
    for (const group of detail?.modifierGroups ?? []) {
      for (const choice of group.choices ?? []) {
        if (selections[group.optionIndex]?.includes(choice.choice)) extra += choice.priceDelta ?? 0;
      }
    }
    return base + extra;
  }, [detail, product.price, selections]);

  const submit = () => {
    const modifiers: ModifierSelection[] = Object.entries(selections).flatMap(([optionIndex, choices]) =>
      choices.map((choice) => ({ optionIndex: Number(optionIndex), choice })),
    );
    onAdd({
      prodNum: product.prodNum,
      qty,
      note: note.trim() || undefined,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={detail?.images?.[0] || product.imageUrl || menuItemPhoto(product.id)}
          alt={product.title}
          className="h-40 w-full shrink-0 object-cover"
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <h2 className="text-xl font-bold">{detail?.title ?? product.title}</h2>
          {(detail?.description ?? product.description) && (
            <p className="mt-1 text-sm text-neutral-500">{detail?.description ?? product.description}</p>
          )}

          {loading && <p className="mt-4 text-sm text-neutral-500">{t('preorder.loading')}</p>}
          {error && <p className="mt-4 text-sm text-resy-red">{error}</p>}

          {(detail?.modifierGroups ?? []).map((group) => {
            const single = group.selectionType === 'single';
            const maxSelect = single ? 1 : (group.maxSelect ?? 0);
            const chosen = selections[group.optionIndex] ?? [];
            return (
              <section key={group.optionIndex} className="mt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">
                    {group.title}
                    {group.isRequired && <span className="text-resy-red"> *</span>}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {single
                      ? t('preorder.chooseOne')
                      : t('preorder.chooseUpTo', { count: maxSelect || (group.choices?.length ?? 0) })}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {(group.choices ?? []).map((choice) => {
                    const active = chosen.includes(choice.choice);
                    const atLimit = !single && maxSelect > 0 && chosen.length >= maxSelect && !active;
                    return (
                      <label
                        key={choice.choice}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                          active ? 'border-resy-red bg-red-50' : 'border-neutral-200 hover:border-neutral-300'
                        } ${atLimit ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <input
                            type={single ? 'radio' : 'checkbox'}
                            name={`group-${group.optionIndex}`}
                            checked={active}
                            disabled={atLimit}
                            onChange={() => toggleChoice(group.optionIndex, choice.choice, single, maxSelect)}
                            className="accent-resy-red"
                          />
                          {choice.label}
                        </span>
                        {choice.priceDelta > 0 && (
                          <span className="text-neutral-500">+{formatMoney(choice.priceDelta, i18n.language, currency)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <label className="mt-6 flex flex-col gap-1">
            <span className="text-sm font-medium">{t('preorder.itemNote')}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('preorder.itemNotePlaceholder')}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
            />
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-neutral-100 p-4">
          <div className="flex items-center gap-3 rounded-full border border-neutral-200 px-3 py-1.5">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label={t('preorder.decrease')}
              className="text-lg leading-none text-neutral-500 hover:text-resy-red"
            >
              −
            </button>
            <span className="min-w-5 text-center text-sm font-semibold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              aria-label={t('preorder.increase')}
              className="text-lg leading-none text-neutral-500 hover:text-resy-red"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={loading || busy || missingRequired}
            className="flex flex-1 items-center justify-between rounded-xl bg-resy-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
          >
            <span>{busy ? t('preorder.adding') : t('preorder.addToCart')}</span>
            <span>{formatMoney(unitPrice * qty, i18n.language, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
