import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStoreData } from '../store/StoreDataContext';
import type { ReservationBooking } from '../api/types';
import {
  CheckoutConflictError,
  RESERVATION_CHANNEL,
  UNAVAILABLE_ISSUE_TYPES,
  addCartItem,
  checkout,
  fetchCart,
  fetchMenu,
  fetchSessionOrders,
  openSession,
  removeCartItem,
  updateCartItem,
  type AddCartItemRequest,
  type CartItem,
  type CheckoutConflictPayload,
  type CheckoutResult,
  type OrderHubCart,
  type OrderHubMenu,
  type OrderHubMenuProduct,
  type OrderHubSession,
  type SessionOrders,
} from '../api/orderHub';
import { loadPreOrderSession, savePreOrderSession } from '../lib/preorderSession';
import { formatDateHeadingWithYear, formatMoney, formatTime } from '../lib/i18nFormat';
import { menuItemPhoto } from '../lib/menuImages';
import PreOrderProductModal from '../components/PreOrderProductModal';

/**
 * Pre-ordering for a reservation (ORDERHUB_API_GUIDE §8.4).
 *
 * Two phases sit days apart. Here we only do the first: no table is known, no stock is held,
 * and nothing reaches the POS. Checkout parks the order in `scheduled`; the kitchen only
 * hears about it when the hostess seats the booking and Release runs against the table she
 * assigned. So everything on this screen is deliberately reversible-looking to the guest —
 * "we'll cook it when you arrive", not "your food is being made".
 */

/** What a line looked like before Checkout, so a 409 can be replayed into a fresh cart. */
interface CartSnapshotLine {
  lineNo: number;
  prodNum: number;
  qty: number;
  note?: string;
  modifiers: { optionIndex: number; choice: number }[];
}

function snapshotOf(cart: OrderHubCart | null): CartSnapshotLine[] {
  return (cart?.items ?? []).map((item) => ({
    lineNo: item.lineNo,
    prodNum: item.prodNum,
    qty: item.qty,
    note: item.note ?? undefined,
    modifiers: (item.modifiers ?? []).map((m) => ({ optionIndex: m.optionIndex, choice: m.choice })),
  }));
}

/** `crypto.randomUUID` is missing on plain-HTTP origins; any string ≤ 80 chars is accepted. */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `pre-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** "2026-07-31" + "19:00:00" -> "2026-07-31T19:00:00", the `scheduledFor` Checkout wants. */
function toScheduledFor(booking: ReservationBooking | undefined): string | undefined {
  const date = booking?.reservationDate?.slice(0, 10);
  if (!date) return undefined;
  const time = (booking?.reservationTime ?? '00:00:00').slice(0, 8);
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

export default function PreOrderPage() {
  const { reservationNo = '' } = useParams();
  const { publicKey, data } = useStoreData();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const booking = (location.state as { booking?: ReservationBooking } | null)?.booking;

  const [session, setSession] = useState<OrderHubSession | null>(null);
  const [menu, setMenu] = useState<OrderHubMenu | null>(null);
  const [cart, setCart] = useState<OrderHubCart | null>(null);
  const [orders, setOrders] = useState<SessionOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<CheckoutConflictPayload | null>(null);
  const [placed, setPlaced] = useState<CheckoutResult | null>(null);
  const [modalProduct, setModalProduct] = useState<OrderHubMenuProduct | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  /**
   * One key per "confirm" tap, reused across every retry of that tap and thrown away once
   * the cart changes — regenerating it per retry is precisely how a guest ends up with two
   * orders (§3.7).
   */
  const idempotencyKeyRef = useRef<string | null>(null);
  /** The cart as it stood when Checkout was called, used to rebuild after a 409 (§8.5.3). */
  const snapshotRef = useRef<CartSnapshotLine[]>([]);
  /** Language the menu on screen was fetched in, so the language effect skips its first run. */
  const menuLangRef = useRef<string | null>(null);

  const token = session?.sessionToken ?? '';
  const currency = session?.site.currency || 'VND';

  /**
   * The reservation channel never opens a bill, but `POST Session` still insists on a table
   * and only resumes a session when the same one comes back. Pin the store's lowest
   * configured table number so every visit lands on the same session key.
   */
  const placeholderTableNum = useMemo(() => {
    const nums = (data?.tableSetups ?? []).map((tb) => tb.tablenum).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length > 0 ? Math.min(...nums) : 1;
  }, [data]);

  const refreshOrders = useCallback(async (activeToken: string) => {
    try {
      setOrders(await fetchSessionOrders(activeToken));
    } catch {
      // The order list is context, not the point of the screen — a failure here must not
      // block ordering.
    }
  }, []);

  useEffect(() => {
    const linkInfo = data?.linkInfo;
    if (!linkInfo || !reservationNo) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setBootError(null);
      try {
        const stored = loadPreOrderSession(reservationNo);
        const tableNum = stored?.tableNum ?? placeholderTableNum;
        const opened = await openSession(
          {
            siteId: linkInfo.siteId,
            storeId: linkInfo.sNum,
            statNum: linkInfo.statNum,
            tableNum,
            lang: i18n.language,
          },
          stored?.token,
        );
        if (cancelled) return;
        setSession(opened);
        savePreOrderSession(reservationNo, {
          token: opened.sessionToken,
          tableNum,
          siteId: linkInfo.siteId,
          storeId: linkInfo.sNum,
        });

        const [menuData, cartData] = await Promise.all([
          fetchMenu(opened.sessionToken, i18n.language),
          fetchCart(opened.sessionToken),
        ]);
        if (cancelled) return;
        setMenu(menuData);
        setCart(cartData);
        setActiveCategory(menuData.categories?.[0]?.id ?? null);
        menuLangRef.current = i18n.language;
        void refreshOrders(opened.sessionToken);
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : t('preorder.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Neither `i18n.language` nor `t` belongs here — `t`'s identity changes with the
    // language, and re-running this effect would re-open the session and lose the cart
    // mid-order. The menu, the only language-dependent part, is reloaded below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.linkInfo, reservationNo, placeholderTableNum, refreshOrders]);

  // A language switch reloads only the menu: the cart lives server-side keyed on the
  // session, so re-opening that session would be a far bigger hammer than the job needs.
  useEffect(() => {
    if (!token || menuLangRef.current === i18n.language) return;
    let cancelled = false;
    fetchMenu(token, i18n.language)
      .then((next) => {
        if (cancelled) return;
        setMenu(next);
        menuLangRef.current = i18n.language;
      })
      .catch(() => {
        // Keep the menu already on screen rather than blanking it over a translation fetch.
      });
    return () => {
      cancelled = true;
    };
  }, [token, i18n.language]);

  /**
   * A 409 killed the order behind the lines currently on screen, so every cart endpoint
   * would answer 404 for them. Freeze editing until the guest accepts the changes and the
   * cart is rebuilt.
   */
  const cartLocked = conflict !== null;

  /** Any cart edit invalidates the pending confirm — next tap must be a new attempt. */
  const applyCart = (next: OrderHubCart) => {
    setCart(next);
    idempotencyKeyRef.current = null;
  };

  const runCartAction = async (action: () => Promise<OrderHubCart>) => {
    setBusy(true);
    setActionError(null);
    try {
      applyCart(await action());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('preorder.cartError'));
    } finally {
      setBusy(false);
    }
  };

  const addProduct = (product: OrderHubMenuProduct) => {
    if (product.hasModifiers) {
      setModalProduct(product);
      return;
    }
    void runCartAction(() => addCartItem(token, { prodNum: product.prodNum, qty: 1 }));
  };

  const addFromModal = async (item: AddCartItemRequest) => {
    await runCartAction(() => addCartItem(token, item));
    setModalProduct(null);
  };

  const changeQty = (item: CartItem, qty: number) =>
    // The endpoint treats qty <= 0 as "delete the line", which is exactly what the minus
    // button should do at 1.
    runCartAction(() => updateCartItem(token, item.lineNo, { qty }));

  const removeLine = (item: CartItem) => runCartAction(() => removeCartItem(token, item.lineNo));

  const confirmOrder = async () => {
    if (!cart || cart.items.length === 0) return;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
    snapshotRef.current = snapshotOf(cart);
    setBusy(true);
    setActionError(null);
    try {
      const result = await checkout(
        token,
        {
          channel: RESERVATION_CHANNEL,
          serviceMode: 'dine_in',
          // Deliberately no `expectedTotal`. The server compares it for exact equality
          // against a tax-inclusive grand total the cart never exposes (cart tax is always
          // 0, §3.6), so sending the subtotal would hand every guest in a VAT store a
          // TOTAL_MISMATCH — and that kills the order outright. Per-line drift is still
          // caught: PRICE_CHANGED / SOLD_OUT are raised by validation before totals are
          // computed at all.
          reservationNo,
          scheduledFor: toScheduledFor(booking),
          customer: booking
            ? {
                name: booking.bookingName ?? undefined,
                phone: booking.bookingPhone ?? undefined,
                note: booking.customerNote ?? undefined,
              }
            : undefined,
        },
        idempotencyKeyRef.current,
      );
      setPlaced(result);
      setConflict(null);
      idempotencyKeyRef.current = null;
      // Checkout consumed the draft, so this returns a fresh empty cart the guest can add
      // a second round of dishes to — a second Checkout on the same reservationNo merges
      // into the same bill at check-in (§8.4).
      setCart(await fetchCart(token));
      void refreshOrders(token);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof CheckoutConflictError) {
        // `validation_failed` is terminal: that order is dead and so is its key. The guest
        // has to confirm the changes, which rebuilds the cart from the snapshot.
        setConflict(err.payload);
        idempotencyKeyRef.current = null;
      } else {
        // Network/server trouble — keep the key so a retry is still the same attempt.
        setActionError(err instanceof Error ? err.message : t('preorder.checkoutError'));
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Rebuild the cart after a 409: `GET Cart` opens a brand-new draft, then the snapshot is
   * replayed into it minus whatever the store can no longer serve. The dead order's `lineNo`
   * values only make sense against that snapshot, never as API arguments.
   */
  const acceptChangesAndRebuild = async () => {
    const issues = conflict?.issues ?? [];
    const droppedLineNos = new Set(
      issues.filter((i) => UNAVAILABLE_ISSUE_TYPES.has(i.type) && i.lineNo != null).map((i) => i.lineNo),
    );
    const droppedProdNums = new Set(
      issues.filter((i) => UNAVAILABLE_ISSUE_TYPES.has(i.type) && i.lineNo == null && i.prodNum != null).map(
        (i) => i.prodNum,
      ),
    );
    const keep = snapshotRef.current.filter(
      (line) => !droppedLineNos.has(line.lineNo) && !droppedProdNums.has(line.prodNum),
    );

    setBusy(true);
    setActionError(null);
    try {
      let next = await fetchCart(token);
      for (const line of keep) {
        next = await addCartItem(token, {
          prodNum: line.prodNum,
          qty: line.qty,
          note: line.note,
          modifiers: line.modifiers.length > 0 ? line.modifiers : undefined,
        });
      }
      setCart(next);
      setConflict(null);
      idempotencyKeyRef.current = null;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('preorder.cartError'));
    } finally {
      setBusy(false);
    }
  };

  const categories = useMemo(
    () => (menu?.categories ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [menu],
  );
  const shownCategory = categories.find((c) => c.id === activeCategory) ?? categories[0] ?? null;
  const placedOrders = useMemo(() => [...(orders?.active ?? []), ...(orders?.history ?? [])], [orders]);
  const itemCount = cart?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  if (!reservationNo) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-neutral-600">{t('preorder.missingReservation')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 pb-32 lg:pb-8">
      <button onClick={() => navigate(-1)} className="text-sm text-neutral-500 hover:text-resy-red">
        ← {t('preorder.back')}
      </button>

      <header className="mt-4">
        <h1 className="text-2xl font-bold">{t('preorder.title')}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t('preorder.subtitle')}</p>
        <p className="mt-2 text-sm text-neutral-500">
          <span className="font-mono font-semibold text-neutral-700">{reservationNo}</span>
          {booking?.reservationDate && (
            <>
              <span className="text-neutral-300"> · </span>
              {formatDateHeadingWithYear(booking.reservationDate.slice(0, 10), i18n.language)}
            </>
          )}
          {booking?.reservationTime && (
            <>
              <span className="text-neutral-300"> · </span>
              {formatTime(booking.reservationTime, i18n.language)}
            </>
          )}
        </p>
      </header>

      {placed && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-800">
            {t('preorder.placedTitle', { number: placed.orderNumber || placed.orderUid })}
          </p>
          {/* Server-authored copy: business rules can change without redeploying this app. */}
          <p className="mt-1 text-sm text-green-700">{placed.messageForCustomer}</p>
          <p className="mt-2 text-sm text-green-800">
            {t('preorder.total')}: <strong>{formatMoney(placed.grandTotal, i18n.language, currency)}</strong>
          </p>
          {placed.requiresPayment && (
            <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800">
              {t('preorder.paymentPending')}
            </p>
          )}
        </div>
      )}

      {conflict && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">{t('preorder.conflictTitle')}</p>
          <p className="mt-1 text-sm text-amber-800">
            {conflict.messageForCustomer || t('preorder.conflictSubtitle')}
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-amber-900">
            {conflict.issues.map((issue, index) => (
              <li key={`${issue.type}-${issue.lineNo ?? issue.prodNum ?? index}`}>
                {issue.type === 'PRICE_CHANGED' ? (
                  <>
                    {issue.name}: {formatMoney(issue.oldPrice, i18n.language, currency)} →{' '}
                    <strong>{formatMoney(issue.newPrice, i18n.language, currency)}</strong>
                  </>
                ) : UNAVAILABLE_ISSUE_TYPES.has(issue.type) ? (
                  <>{t('preorder.issueSoldOut', { name: issue.name })}</>
                ) : (
                  <>
                    {issue.name ? `${issue.name}: ` : ''}
                    {issue.type}
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={acceptChangesAndRebuild}
            disabled={busy}
            className="mt-4 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? t('preorder.rebuilding') : t('preorder.acceptChanges')}
          </button>
        </div>
      )}

      {bootError && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-700">{bootError}</p>
        </div>
      )}

      {loading && <p className="mt-8 text-neutral-500">{t('preorder.loading')}</p>}

      {!loading && !bootError && menu && !menu.configured && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-sm text-neutral-600">{t('preorder.menuNotConfigured')}</p>
        </div>
      )}

      {!loading && !bootError && menu?.configured && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            {categories.length > 1 && (
              <nav className="mb-6 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      shownCategory?.id === category.id
                        ? 'border-resy-red bg-resy-red text-white'
                        : 'border-neutral-200 text-neutral-700 hover:border-resy-red hover:text-resy-red'
                    }`}
                  >
                    {category.title}
                  </button>
                ))}
              </nav>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {(shownCategory?.products ?? []).map((product) => (
                <article
                  key={product.id}
                  className="flex gap-4 rounded-2xl border border-neutral-200 p-4 transition-shadow hover:shadow-md"
                >
                  <img
                    src={product.imageUrl || menuItemPhoto(product.id)}
                    alt={product.title}
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <h4 className="font-semibold">{product.title}</h4>
                    {product.description && (
                      <p className="line-clamp-2 text-sm text-neutral-500">{product.description}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="font-semibold">{formatMoney(product.price, i18n.language, currency)}</span>
                      <button
                        onClick={() => addProduct(product)}
                        disabled={busy || cartLocked}
                        className="rounded-lg bg-resy-red px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                      >
                        {product.hasModifiers ? t('preorder.choose') : t('preorder.add')}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {(shownCategory?.products ?? []).length === 0 && (
                <p className="text-sm text-neutral-500">{t('preorder.emptyCategory')}</p>
              )}
            </div>
          </div>

          <aside className="h-fit lg:sticky lg:top-6">
            <div className="rounded-2xl border border-neutral-200 p-5">
              <h2 className="text-lg font-bold">{t('preorder.cartTitle')}</h2>

              {(cart?.items.length ?? 0) === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">{t('preorder.cartEmpty')}</p>
              ) : (
                <ul className="mt-3 flex flex-col divide-y divide-neutral-100">
                  {cart?.items.map((item) => (
                    <li key={item.lineNo} className="flex flex-col gap-1.5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="shrink-0 text-sm font-semibold">
                          {formatMoney(item.lineTotal, i18n.language, currency)}
                        </span>
                      </div>
                      {item.modifiers.length > 0 && (
                        <p className="text-xs text-neutral-500">
                          {item.modifiers.map((m) => m.label).join(', ')}
                        </p>
                      )}
                      {item.note && <p className="text-xs italic text-neutral-500">“{item.note}”</p>}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 rounded-full border border-neutral-200 px-2.5 py-1">
                          <button
                            onClick={() => changeQty(item, item.qty - 1)}
                            disabled={busy || cartLocked}
                            aria-label={t('preorder.decrease')}
                            className="leading-none text-neutral-500 hover:text-resy-red disabled:opacity-50"
                          >
                            −
                          </button>
                          <span className="min-w-4 text-center text-xs font-semibold">{item.qty}</span>
                          <button
                            onClick={() => changeQty(item, item.qty + 1)}
                            disabled={busy || cartLocked}
                            aria-label={t('preorder.increase')}
                            className="leading-none text-neutral-500 hover:text-resy-red disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => removeLine(item)}
                          disabled={busy || cartLocked}
                          className="text-xs text-neutral-400 hover:text-resy-red disabled:opacity-50"
                        >
                          {t('preorder.remove')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-neutral-100 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">{t('preorder.subtotal')}</span>
                  <span className="font-semibold">{formatMoney(cart?.subtotal, i18n.language, currency)}</span>
                </div>
                {/* Tax and service fee are computed at Checkout, never in the cart (§3.6). */}
                <p className="mt-1 text-xs text-neutral-400">{t('preorder.taxNote')}</p>
              </div>

              {actionError && <p className="mt-3 text-sm text-resy-red">{actionError}</p>}

              <button
                onClick={confirmOrder}
                disabled={busy || cartLocked || (cart?.items.length ?? 0) === 0}
                className="mt-4 w-full rounded-xl bg-resy-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {busy ? t('preorder.submitting') : t('preorder.confirm')}
              </button>
              <p className="mt-2 text-center text-xs text-neutral-400">{t('preorder.confirmHint')}</p>
            </div>

            {placedOrders.length > 0 && (
              <div className="mt-6 rounded-2xl border border-neutral-200 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {t('preorder.placedTitleShort')}
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {placedOrders.map((order) => (
                    <li key={order.orderUid} className="rounded-xl bg-neutral-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">
                          {order.orderNumber || order.orderUid}
                        </span>
                        <span className="text-sm font-semibold">
                          {formatMoney(order.grandTotal, i18n.language, currency)}
                        </span>
                      </div>
                      {order.messageForCustomer && (
                        <p className="mt-1 text-xs text-neutral-500">{order.messageForCustomer}</p>
                      )}
                      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-neutral-600">
                        {(order.items ?? []).map((item) => (
                          <li key={item.lineNo}>
                            {item.qty}× {item.nameSnapshot || item.name}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link
              to={`/${publicKey}/bookings`}
              className="mt-4 block rounded-xl border border-neutral-200 px-5 py-3 text-center text-sm font-semibold text-neutral-700 transition-colors hover:border-resy-red hover:text-resy-red"
            >
              {t('preorder.backToBookings')}
            </Link>
          </aside>
        </div>
      )}

      {/* Mobile: the sidebar sits below the menu, so keep the total and CTA reachable. */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur lg:hidden">
          <button
            onClick={confirmOrder}
            disabled={busy || cartLocked}
            className="flex w-full items-center justify-between rounded-xl bg-resy-red px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <span>{t('preorder.confirmWithCount', { count: itemCount })}</span>
            <span>{formatMoney(cart?.subtotal, i18n.language, currency)}</span>
          </button>
        </div>
      )}

      {modalProduct && (
        <PreOrderProductModal
          key={modalProduct.prodNum}
          token={token}
          product={modalProduct}
          currency={currency}
          busy={busy}
          onClose={() => setModalProduct(null)}
          onAdd={addFromModal}
        />
      )}
    </div>
  );
}
