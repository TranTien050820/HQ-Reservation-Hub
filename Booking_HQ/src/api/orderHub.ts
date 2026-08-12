import { AxiosError } from 'axios';
import { http } from './http';

// Client for the guest-facing half of OrderHub — `api/OrderHub/Public`, documented in
// HQ-WebOffice-API/docs/ORDERHUB_API_GUIDE.md §3 and §8.4.
//
// This storefront only ever uses the `reservation` channel: the guest picks dishes days
// before arriving, so opening a session must NOT open a bill on the POS. The order sits in
// `scheduled` until the hostess seats the booking and calls Release (§5.10), which is what
// finally pushes the food to the kitchen against the table she assigned.

const BASE = '/api/OrderHub/Public';

/** The one channel this app speaks — see §3.1: no POS bill until check-in. */
export const RESERVATION_CHANNEL = 'reservation';

interface ApiEnvelope<T> {
  status: number;
  statusText?: string;
  message?: string;
  data: T;
}

export class OrderHubError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OrderHubError';
    this.status = status;
  }
}

/**
 * Checkout answered 409: prices/stock moved while the guest was choosing (§3.7).
 * Not a system failure — `payload.issues` names the lines to show them.
 */
export class CheckoutConflictError extends OrderHubError {
  readonly payload: CheckoutConflictPayload;
  constructor(message: string, payload: CheckoutConflictPayload) {
    super(message, 409);
    this.name = 'CheckoutConflictError';
    this.payload = payload;
  }
}

// ---- Session (§3.1) ----

export interface OpenSessionRequest {
  siteId: number;
  storeId: number;
  statNum: number;
  tableNum: number;
  lang?: string;
}

export interface OrderHubSiteInfo {
  siteId: number;
  name: string;
  logoUrl?: string | null;
  serviceFeePercent: number;
  vatValue: number;
  showTax: number;
  currency: string;
}

export interface OrderHubSession {
  sessionToken: string;
  site: OrderHubSiteInfo;
  table: { tableId: number; tableNum: number; storeId: number; name: string };
  /** `transactionId` is null on this channel — no POS bill exists yet. */
  session: { sessionId: number; status: string; transactionId: number | null };
  menuVersion: string;
}

// ---- Menu (§3.4) / product (§3.5) ----

export interface OrderHubMenuProduct {
  id: number;
  prodNum: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  hasModifiers?: boolean;
  badges?: string[] | null;
}

export interface OrderHubMenuCategory {
  id: number;
  title: string;
  imageUrl?: string | null;
  sortOrder?: number | null;
  products: OrderHubMenuProduct[];
}

export interface OrderHubMenu {
  /** false = the store has no menu configured for this time slot; show a notice, not an empty cart. */
  configured: boolean;
  categories: OrderHubMenuCategory[];
}

export interface ModifierChoice {
  choice: number;
  label: string;
  priceDelta: number;
  imageUrl?: string | null;
  isDefault?: boolean;
}

export interface ModifierGroup {
  optionIndex: number;
  title: string;
  /** `single` = pick one · `multi` = pick up to `maxSelect`. */
  selectionType: string;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  choices: ModifierChoice[];
}

export interface OrderHubProduct {
  id: number;
  prodNum: number;
  title: string;
  description?: string | null;
  images?: string[] | null;
  price: number;
  modifierGroups: ModifierGroup[];
}

// ---- Cart (§3.6) — a cart *is* an order in `draft`; lines are addressed by `lineNo` ----

export interface ModifierSelection {
  optionIndex: number;
  choice: number;
}

export interface CartItemModifier extends ModifierSelection {
  label: string;
  priceDelta: number;
}

export interface CartItem {
  lineNo: number;
  prodNum: number;
  name: string;
  imageUrl?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note?: string | null;
  modifiers: CartItemModifier[];
}

export interface OrderHubCart {
  orderUid: string;
  orderStatus: string;
  items: CartItem[];
  /** Always 0 in the cart — tax is computed for real at Checkout (§3.6). */
  subtotal: number;
  serviceFee: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  promoCode?: string | null;
  itemCount: number;
}

export interface AddCartItemRequest {
  prodNum: number;
  qty: number;
  note?: string;
  modifiers?: ModifierSelection[];
}

export interface UpdateCartItemRequest {
  /** `qty <= 0` deletes the line. `null`/omitted keeps the current value. */
  qty?: number;
  note?: string;
  modifiers?: ModifierSelection[];
}

// ---- Checkout (§3.7) ----

export interface CheckoutRequest {
  channel: string;
  serviceMode: string;
  /**
   * Compared for **exact** equality against the server's tax-inclusive grand total. Only send
   * it if the client genuinely knows that number — the cart's `subtotal` is not it.
   */
  expectedTotal?: number;
  customer?: { name?: string; phone?: string; note?: string };
  /** Required on this channel — without it Checkout answers 409 RESERVATION_REQUIRED. */
  reservationNo: string;
  /** The booked date+time, e.g. "2026-07-31T19:00:00". */
  scheduledFor?: string;
}

export interface CheckoutResult {
  orderUid: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  posPushStatus: string;
  channel: string;
  serviceMode: string;
  paymentMode: string;
  pushMode: string;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  grandTotal: number;
  paymentDueAt?: string | null;
  requiresPayment: boolean;
  /** Server-authored guest-facing sentence — display this rather than mapping statuses here. */
  messageForCustomer: string;
  step: number;
  totalSteps: number;
}

export type CheckoutIssueType =
  | 'PRICE_CHANGED'
  | 'SOLD_OUT'
  | 'PRODUCT_UNAVAILABLE'
  | 'TOTAL_MISMATCH'
  | 'ADDRESS_REQUIRED'
  | 'PROVIDER_REQUIRED'
  | 'RESERVATION_REQUIRED'
  | 'STORE_INACTIVE';

export interface CheckoutIssue {
  lineNo?: number;
  prodNum?: number;
  name?: string;
  type: CheckoutIssueType | string;
  oldPrice?: number;
  newPrice?: number;
  available?: number;
}

export interface CheckoutConflictPayload {
  orderUid?: string;
  orderStatus?: string;
  messageForCustomer?: string;
  issues: CheckoutIssue[];
}

/** Lines the guest can't simply re-confirm — the dish is gone, so drop it when rebuilding. */
export const UNAVAILABLE_ISSUE_TYPES = new Set<string>(['SOLD_OUT', 'PRODUCT_UNAVAILABLE']);

// ---- Orders (§3.9, §3.10) ----

export interface OrderSummary {
  orderUid: string;
  orderNumber?: string | null;
  orderStatus: string;
  paymentStatus?: string;
  channel?: string;
  grandTotal: number;
  subtotal?: number;
  scheduledFor?: string | null;
  reservationNo?: string | null;
  messageForCustomer?: string;
  createdAt?: string;
  items?: Array<{
    lineNo: number;
    prodNum: number;
    nameSnapshot?: string;
    name?: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    lineStatus?: string;
  }>;
}

export interface SessionOrders {
  active: OrderSummary[];
  history: OrderSummary[];
}

// ---- Transport ----

function authHeaders(token: string) {
  return { 'X-Order-Token': token };
}

/**
 * Both failure channels land here: a non-2xx HTTP response (axios rejects) and a 200 whose
 * envelope carries a business error. Callers see one `OrderHubError` either way.
 */
async function request<T>(run: () => Promise<{ data: ApiEnvelope<T>; status: number }>): Promise<T> {
  let body: ApiEnvelope<T>;
  let httpStatus: number;
  try {
    const res = await run();
    body = res.data;
    httpStatus = res.status;
  } catch (err) {
    const axiosErr = err as AxiosError<ApiEnvelope<unknown>>;
    const envelope = axiosErr.response?.data;
    throw new OrderHubError(
      envelope?.message || axiosErr.message || 'Request failed',
      envelope?.status ?? axiosErr.response?.status ?? 0,
    );
  }
  if (body?.status !== 200) {
    throw new OrderHubError(body?.message || 'Request failed', body?.status ?? httpStatus);
  }
  return body.data;
}

/**
 * POST Session. Passing the previous token resumes the same cart: the server reuses the
 * session key carried in it as long as siteId and tableNum match (§3.1), so a guest who
 * reloads the page — or comes back the next day — keeps what they already picked.
 */
export function openSession(req: OpenSessionRequest, resumeToken?: string): Promise<OrderHubSession> {
  return request(() =>
    http.post<ApiEnvelope<OrderHubSession>>(
      `${BASE}/Session`,
      { ...req, channel: RESERVATION_CHANNEL },
      resumeToken ? { headers: authHeaders(resumeToken) } : undefined,
    ),
  );
}

export function fetchMenu(token: string, lang?: string): Promise<OrderHubMenu> {
  return request(() =>
    http.get<ApiEnvelope<OrderHubMenu>>(`${BASE}/Menu`, { headers: authHeaders(token), params: { lang } }),
  );
}

export function fetchProduct(token: string, prodNum: number): Promise<OrderHubProduct> {
  return request(() =>
    http.get<ApiEnvelope<OrderHubProduct>>(`${BASE}/Product/${prodNum}`, { headers: authHeaders(token) }),
  );
}

export function fetchCart(token: string): Promise<OrderHubCart> {
  return request(() =>
    http.get<ApiEnvelope<OrderHubCart>>(`${BASE}/Cart`, {
      headers: authHeaders(token),
      params: { channel: RESERVATION_CHANNEL },
    }),
  );
}

/** Every cart call answers with the whole cart, so callers never need a follow-up GET. */
export function addCartItem(token: string, item: AddCartItemRequest): Promise<OrderHubCart> {
  return request(() =>
    http.post<ApiEnvelope<OrderHubCart>>(`${BASE}/Cart/items`, item, {
      headers: authHeaders(token),
      params: { channel: RESERVATION_CHANNEL },
    }),
  );
}

export function updateCartItem(
  token: string,
  lineNo: number,
  patch: UpdateCartItemRequest,
): Promise<OrderHubCart> {
  return request(() =>
    http.put<ApiEnvelope<OrderHubCart>>(`${BASE}/Cart/items/${lineNo}`, patch, { headers: authHeaders(token) }),
  );
}

export function removeCartItem(token: string, lineNo: number): Promise<OrderHubCart> {
  return request(() =>
    http.delete<ApiEnvelope<OrderHubCart>>(`${BASE}/Cart/items/${lineNo}`, { headers: authHeaders(token) }),
  );
}

/**
 * POST Checkout — turns the cart into a real `scheduled` order.
 *
 * `idempotencyKey` must stay identical across every retry of one "confirm" tap, and must be
 * regenerated once the guest goes back and edits the cart (§3.7): a fresh key per retry is
 * exactly how a guest ends up with two orders.
 *
 * A 409 here is the cart having drifted, not a failure — it surfaces as
 * `CheckoutConflictError` carrying the `issues[]` to show.
 */
export async function checkout(
  token: string,
  body: CheckoutRequest,
  idempotencyKey: string,
): Promise<CheckoutResult> {
  const res = await http.post<ApiEnvelope<CheckoutResult | CheckoutConflictPayload>>(`${BASE}/Checkout`, body, {
    headers: { ...authHeaders(token), 'Idempotency-Key': idempotencyKey },
    // 409 carries a payload we need, so let it through instead of letting axios reject it.
    validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
  });
  const envelope = res.data;
  if (envelope?.status === 409) {
    const payload = (envelope.data ?? { issues: [] }) as CheckoutConflictPayload;
    throw new CheckoutConflictError(envelope.message || 'PRICE_CHANGED', {
      ...payload,
      issues: payload.issues ?? [],
    });
  }
  if (envelope?.status !== 200) {
    throw new OrderHubError(envelope?.message || 'Checkout failed', envelope?.status ?? res.status);
  }
  return envelope.data as CheckoutResult;
}

/** GET Orders — every order of this session. Carts (`draft`) are deliberately absent. */
export function fetchSessionOrders(token: string): Promise<SessionOrders> {
  return request(() => http.get<ApiEnvelope<SessionOrders>>(`${BASE}/Orders`, { headers: authHeaders(token) }));
}
