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
  /**
   * Phần `data` của vỏ lỗi.
   *
   * Trước đây bị vứt đi, và với coupon thì đó là mất luôn thứ quan trọng nhất: mã máy đọc
   * được nằm ở `data.code`. Không có nó thì client chỉ còn một câu tiếng Việt để dò chuỗi —
   * và không thể phân biệt "cần đăng nhập" với "hết lượt" để chọn hành vi khác nhau.
   */
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.name = 'OrderHubError';
    this.status = status;
    this.data = data;
  }

  /** `COUPON_*` khi lỗi đến từ việc áp mã; null với mọi lỗi khác. */
  get couponCode(): CouponErrorCode | null {
    const code = (this.data as { code?: string } | null | undefined)?.code;
    return code && code.startsWith('COUPON_') ? (code as CouponErrorCode) : null;
  }

  /** Số tiền còn thiếu khi `COUPON_MIN_NOT_MET`. */
  get couponShortfall(): number | null {
    const extra = (this.data as { extra?: { shortfall?: number } } | null | undefined)?.extra;
    return extra?.shortfall ?? null;
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
  /** Cửa hàng có mở mã giảm giá cho KÊNH này không — false ⇒ ẩn hẳn ô nhập mã. */
  couponEnabled?: boolean;
  memberEnabled?: boolean;
  /**
   * `LOCK_AT_ORDER` = ưu đãi và giá được GIỮ từ lúc đặt.
   * `REPRICE_AT_RELEASE` = tính lại khi khách đến quán.
   *
   * 🔴 Phải nói ra với khách. Bỏ câu này là khiếu nại: đặt thấy giảm 200.000, đến nơi
   *    bill không giảm.
   */
  priceLockMode?: string;
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

/**
 * Bảng giá 7 ngày × 24 giờ: `{ "SUN": [ { "12 AM": 25000 }, … ] }`.
 *
 * 🔴 Đây là repo DUY NHẤT thực sự cần nó. Server resolve `MENUSCHED` theo `DateTime.Now`
 *    lúc gọi API, nên khách đặt lúc 10:00 sáng cho bữa tối 19:00 đang nhìn thấy **giá bậc
 *    của 10:00**. Checkout cũng không bắt được (vẫn 10:00); lệch chỉ lộ ra ở bước Release
 *    lúc 19:00 dưới dạng `warnings[]` — tức là khi khách đã ngồi vào bàn.
 */
export type PriceSchedule = Record<string, Array<Record<string, number | null>>>;

export interface OrderHubMenuProduct {
  id: number;
  prodNum: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  /** Giá tại THỜI ĐIỂM GỌI API — với đơn đặt trước, xem `priceSchedule`. */
  price: number;
  priceSchedule?: PriceSchedule | null;
  refCode?: string | null;
  hasModifiers?: boolean;
  badges?: string[] | null;
  /**
   * Khuyến mãi tốt nhất đang áp được cho món này. Vắng mặt = không mã nào phủ món.
   *
   * 🔴 Luôn vẽ `promo.code` cạnh giá: `promo.AutoApply` chưa xây ở backend, nên khách lướt
   *    menu rồi thêm món sẽ thấy giỏ tính NGUYÊN GIÁ.
   *
   * 🔴 Kênh đặt trước KHÔNG dùng thẳng `promo.priceAfter`: thẻ món hiện giá theo GIỜ ĂN
   *    (`priceAt(priceSchedule, mealTime, price)`), còn backend tính `priceAfter` trên giá
   *    HIỆN TẠI. Dùng `promoPriceAt()` để tính lại trên đúng con số đang hiện.
   */
  promo?: ProductPromo | null;
}

/**
 * Một khuyến mãi đang chạy tại trạm — cho MENU, tức là TRƯỚC khi khách có giỏ.
 *
 * Không có `eligible`/`estimatedDiscount`: hai trường đó chỉ có nghĩa khi đã biết giỏ có gì.
 */
export interface Promotion {
  code: string;
  promoNum: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  kind: 'PERCENT_OFF' | 'AMOUNT_OFF' | 'FIXED_PRICE' | 'X_FOR_Y' | 'UNSUPPORTED';
  /** 20 (%) · 50000 (đ) · giá cố định. 0 khi `kind = 'X_FOR_Y'`. */
  value: number;
  xValue: number;
  yValue: number;
  giftQty: number;
  scope: 'ALL_CATEGORIES' | 'CERTAIN_CATEGORIES' | 'ONE_PRODUCT' | 'CERTAIN_PRODUCTS' | 'UNSUPPORTED';
  /**
   * Hệ thống TỰ áp — khách không phải gõ gì và không gỡ được.
   *
   * 🔴 Quyết định mã được vẽ ở đâu:
   *    - `true`  ⇒ hiện trên **thẻ món** với giá gạch. Con số đó là lời hứa GIỮ ĐƯỢC.
   *    - `false` ⇒ CHỈ nằm ở **dải ưu đãi**, luôn kèm `code` để khách biết phải gõ gì.
   */
  autoApply: boolean;
  minCost?: number | null;
  minQuan?: number | null;
  maxAmount?: number | null;
  requiresMember: boolean;
  endsAt?: string | null;
}

/** Khuyến mãi trên thẻ món. **Luôn có `autoApply: true`** — backend không gửi mã gõ tay xuống đây. */
export interface ProductPromo extends Promotion {
  /** Giá một đơn vị sau giảm, tính trên giá HIỆN TẠI. null = không quy được về giá đơn vị. */
  priceAfter?: number | null;
}

/**
 * Giá một đơn vị sau giảm, tính trên `base` mà thẻ món ĐANG HIỆN.
 *
 * 🔴 Kênh đặt trước hiện giá theo GIỜ ĂN, không phải giá hiện tại — dùng thẳng
 *    `promo.priceAfter` là gạch một con số tính trên nền khác. Công thức ở đây là bản sao
 *    của `MenuPromoService.UnitPriceAfter` phía backend.
 *
 * `null` = loại mã không quy được về giá đơn vị: `AMOUNT_OFF` là tiền của CẢ ĐƠN, `X_FOR_Y`
 * và mã tặng món có giá trị là SỐ MÓN.
 */
export function promoPriceAt(promo: Promotion, base: number): number | null {
  if (base <= 0) return null;
  if (promo.kind === 'X_FOR_Y' || promo.giftQty > 0) return null;

  const after =
    promo.kind === 'PERCENT_OFF' ? Math.round((base * (100 - promo.value)) / 100)
    : promo.kind === 'FIXED_PRICE' ? promo.value
    : null;

  return after != null && after >= 0 && after < base ? after : null;
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
  /**
   * Mọi mã đang chạy tại trạm — dải ưu đãi đầu menu. Đây là thứ khách thấy TRƯỚC khi có giỏ;
   * trước đó coupon chỉ nằm trong khối giỏ hàng bên phải.
   */
  promotions?: Promotion[];
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
  priceSchedule?: PriceSchedule | null;
  refCode?: string | null;
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
  /** TỔNG tiền giảm của CẢ CHỒNG MÃ, luôn DƯƠNG. */
  discountAmount: number;
  total: number;
  /** Mã có tiền giảm lớn nhất — nhãn gọn. Danh sách đầy đủ ở `coupons`. */
  promoCode?: string | null;
  /**
   * Các coupon đang áp, theo thứ tự khách gõ. Mảng rỗng = giỏ không có mã nào.
   *
   * 🔴 **V2**: trước đây là `coupon` (một object). Một đơn nay mang được nhiều mã và
   *    `discountAmount` ở trên là TỔNG của cả chồng (ORDERHUB_COUPON.md §10.8).
   */
  coupons: AppliedCoupon[];
  /**
   * Hệ thống vừa TỰ GỠ mã vì giỏ đã đổi — **một phần tử cho MỖI mã đã rụng**.
   * **KHÔNG phải lỗi**, response vẫn HTTP 200.
   * Chặn thao tác ở đây là giỏ kẹt: khách không xoá được món, cũng không bỏ được mã.
   */
  couponWarnings: CouponWarning[];
  itemCount: number;
}

// ---- Coupon ----

export interface AppliedCoupon {
  code: string;
  promoNum: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  kind: 'PERCENT_OFF' | 'AMOUNT_OFF' | 'FIXED_PRICE' | 'X_FOR_Y' | 'UNSUPPORTED';
  value: number;
  /** Số món được TẶNG khi `kind = 'X_FOR_Y'`. 0 với mọi loại khác. */
  freeUnits?: number;
  tier: string;
  scope: string;
  discountAmount: number;
  cappedByMax: boolean;
  source: string;
}

export type CouponErrorCode =
  | 'COUPON_DISABLED' | 'COUPON_NOT_FOUND' | 'COUPON_EXPIRED'
  | 'COUPON_NOT_IN_SCHEDULE' | 'COUPON_CHANNEL_NOT_ALLOWED'
  | 'COUPON_MIN_NOT_MET' | 'COUPON_NO_ELIGIBLE_ITEM' | 'COUPON_REQUIRES_ITEM'
  | 'COUPON_LIMIT_REACHED' | 'COUPON_ALREADY_USED'
  | 'COUPON_CONFLICT' | 'COUPON_INVALID'
  // V2 — chồng nhiều mã: MAX_REACHED = chạm trần số mã của cửa hàng;
  //      EXCEEDS_TOTAL = tổng tiền giảm sẽ vượt giá trị đơn.
  | 'COUPON_MAX_REACHED' | 'COUPON_EXCEEDS_TOTAL'
  | 'COUPON_MEMBER_REQUIRED' | 'COUPON_TOO_MANY_ATTEMPTS';

export interface CouponWarning {
  code: string;
  reason: CouponErrorCode;
  message: string;
}

export interface AvailableCoupon {
  code: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  estimatedDiscount: number;
  eligible: boolean;
  /**
   * Mã này ÁP THÊM được vào chồng đang có không. `false` ⇒ khách phải BỎ một mã đang áp
   * để dùng nó.
   *
   * 🔴 Tách hẳn khỏi `eligible`: `eligible` trả lời *"mã này cho bạn được bao nhiêu"* và
   *    KHÔNG xét chồng mã — trộn hai câu hỏi thì với cửa hàng để trần mặc định (1 mã/đơn)
   *    cả danh sách gợi ý sẽ thành "không dùng được" ngay khi giỏ có một mã.
   */
  stackable?: boolean;
  reason?: CouponErrorCode | null;
  message?: string | null;
  shortfall?: number | null;
}

export interface CartCoupons {
  /** Các mã đang áp, theo thứ tự khách gõ. 🔴 **V2**: trước đây là một object. */
  applied: AppliedCoupon[];
  available: AvailableCoupon[];
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
  /** TỔNG tiền giảm của cả chồng mã, luôn DƯƠNG. Đã trừ khỏi `grandTotal`. */
  discountAmount?: number;
  /** Các coupon đã chốt vào đơn (snapshot). 🔴 **V2**: trước đây là một object. */
  coupons?: AppliedCoupon[];
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
      envelope?.data ?? null,
    );
  }
  if (body?.status !== 200) {
    throw new OrderHubError(body?.message || 'Request failed', body?.status ?? httpStatus, body?.data ?? null);
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
    // `channel` để backend giải đúng ChannelPolicy khi dựng khối khuyến mãi — cùng kênh với
    // lúc áp mã ở giỏ, nếu không menu khoe một mã mà giỏ từ chối.
    http.get<ApiEnvelope<OrderHubMenu>>(`${BASE}/Menu`, {
      headers: authHeaders(token),
      params: { lang, channel: RESERVATION_CHANNEL },
    }),
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
 * THÊM một mã giảm giá — hoặc gỡ HẾT mã bằng chuỗi rỗng. Trả về NGUYÊN GIỎ đã tính lại.
 *
 * 🔴 **V2**: endpoint này KHÔNG thay mã cũ bằng mã mới nữa, nó CỘNG THÊM. Muốn đổi mã thì
 *    gọi `removePromo(mãCũ)` trước.
 *
 * 🔴 Kênh `reservation`: backend kiểm lịch giờ của coupon theo **`ScheduledFor`** (giờ ăn),
 *    không phải giờ hiện tại. Khách đặt 9 giờ sáng cho bữa tối thì coupon "Happy Hour
 *    15:00–17:00" KHÔNG áp được — FE tuyệt đối không tự lọc theo giờ đang xem, cứ hiển thị
 *    đúng thông báo server trả về.
 *
 * Ném `OrderHubError` khi không đủ điều kiện; mã máy đọc được nằm ở `error.code`.
 */
export function applyPromo(token: string, code: string): Promise<OrderHubCart> {
  return request(() =>
    http.post<ApiEnvelope<OrderHubCart>>(
      `${BASE}/Cart/promo`,
      { code },
      { headers: authHeaders(token), params: { channel: RESERVATION_CHANNEL } },
    ),
  );
}

/**
 * Gỡ ĐÚNG MỘT mã, giữ nguyên những mã còn lại. Trả về NGUYÊN GIỎ.
 *
 * Luôn 200, kể cả khi giỏ không có mã đó — client retry hoặc một thiết bị khác vừa gỡ trước
 * không phải là lỗi, và ném lỗi ở đây chỉ làm giỏ kẹt.
 */
export function removePromo(token: string, code: string): Promise<OrderHubCart> {
  return request(() =>
    http.delete<ApiEnvelope<OrderHubCart>>(
      `${BASE}/Cart/promo/${encodeURIComponent(code)}`,
      { headers: authHeaders(token), params: { channel: RESERVATION_CHANNEL } },
    ),
  );
}

/** Mã khả dụng cho giỏ này, gồm cả mã chưa đủ điều kiện kèm lý do. */
export function fetchCoupons(token: string): Promise<CartCoupons> {
  return request(() =>
    http.get<ApiEnvelope<CartCoupons>>(`${BASE}/Cart/coupons`, {
      headers: authHeaders(token),
      params: { channel: RESERVATION_CHANNEL },
    }),
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
