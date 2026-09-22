import axios from 'axios';

/**
 * The sentence to put in front of a hostess when a call fails.
 *
 * This backend answers HTTP 200 even for refusals and puts the real reason in the
 * envelope (`{ status, message }`) — "Bàn đã có khách", "Booking đã bị huỷ", a
 * validation complaint. `http.ts`'s response interceptor turns that into a rejected
 * AxiosError carrying the message, so the one thing that actually explains the
 * failure is right there; showing a blanket "Đã xảy ra lỗi" instead throws it away
 * and leaves the floor guessing.
 *
 * Transport failures (500 page, timeout, offline) carry no such message. Rather
 * than surfacing axios' English boilerplate, those fall back to the caller's own
 * localized line with a short technical tag appended, so two different failures
 * never read as the same one.
 */

/** Axios' own wording — true, and useless to someone standing at the door. */
const GENERIC_AXIOS_MESSAGES = [
  /^Request failed$/i,
  /^Request failed with status code \d+$/i,
  /^Network Error$/i,
  /^timeout of \d+ms exceeded$/i,
];

function textFrom(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // A response body that starts a tag is an error *page* (IIS, a proxy), not a message.
  if (!trimmed || trimmed.startsWith('<')) return null;
  return trimmed;
}

function messageFromBody(data: unknown): string | null {
  const direct = textFrom(data);
  if (direct) return direct;
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  const named =
    textFrom(body.message) ?? textFrom(body.Message) ?? textFrom(body.detail) ?? textFrom(body.title);
  if (named) return named;
  // ASP.NET ValidationProblemDetails: { errors: { FieldName: ["..."] } }.
  if (body.errors && typeof body.errors === 'object') {
    const lines = Object.values(body.errors as Record<string, unknown>)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .map(textFrom)
      .filter((v): v is string => v != null);
    if (lines.length > 0) return lines.join(' ');
  }
  return null;
}

/**
 * The stable machine code behind a refusal, when the backend attached one.
 *
 * `APIResultExtensions` puts it in two places at once: `errorCode` at the top level for new
 * integrators, and `data.code` for the OrderHub V2 endpoints whose contract froze that shape
 * (SPEC-00 §5). Both are read here so a caller never has to know which endpoint it is talking
 * to — and branching on the code is the only safe way to branch, since `message` is prose
 * that gets reworded.
 */
export function apiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as
    | { errorCode?: unknown; data?: { code?: unknown } | null }
    | undefined;
  return textFrom(body?.errorCode) ?? textFrom(body?.data?.code);
}

/**
 * The `data` object of a refusal, when it came with one — `CodedException` flattens its extra
 * fields beside `code` (`{ code, tableNum, reason, … }`), which is where the specifics live.
 */
export function apiErrorData(error: unknown): Record<string, unknown> | null {
  if (!axios.isAxiosError(error)) return null;
  const data = (error.response?.data as { data?: unknown } | undefined)?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

/**
 * SPEC-06 §4.10 — HTTP 403 when a seating names a table the station's restaurant may not use
 * (`PUT ReservationBookings` with seat rows, `PUT ReservationWaitlists` → Reserved,
 * `ReserSeatTables`). A FINAL answer: the same table will be refused every time, so it is
 * never retried. Only sent once the API runs restaurant isolation in Enforce mode — in
 * Off/Warn the same seating simply goes through.
 */
export const TABLE_NOT_IN_RESTAURANT = 'TABLE_NOT_IN_RESTAURANT';

export interface TableRefusal {
  /** The table the server refused, when it named one. */
  tableNum: number | null;
  /** `OTHER_RESTAURANT` | `TABLE_UNASSIGNED` | `STATION_UNASSIGNED` | `TABLE_UNKNOWN`, or null. */
  reason: string | null;
}

/** The refusal behind `error` when it is a `TABLE_NOT_IN_RESTAURANT`, null for anything else. */
export function tableRefusalOf(error: unknown): TableRefusal | null {
  if (apiErrorCode(error) !== TABLE_NOT_IN_RESTAURANT) return null;
  const data = apiErrorData(error);
  const tableNum = Number(data?.tableNum);
  return {
    tableNum: Number.isFinite(tableNum) && tableNum > 0 ? tableNum : null,
    reason: textFrom(data?.reason),
  };
}

/** Minimal shape of i18next's `t`, so this stays a plain function callers can use anywhere. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

const TABLE_REFUSAL_KEYS: Record<string, string> = {
  OTHER_RESTAURANT: 'seating.refusedOtherRestaurant',
  TABLE_UNASSIGNED: 'seating.refusedTableUnassigned',
  TABLE_UNKNOWN: 'seating.refusedTableUnknown',
};

/**
 * What the hostess can do about a refused table, in her language.
 *
 * Localized rather than the server's sentence because the reason decides the next step:
 * another restaurant's table means "pick one of ours", an unassigned section or station means
 * "this is fixed on the POS, not here". `pickedTablenums` names the tables when the server did
 * not say which one it refused.
 */
export function tableRefusalMessage(refusal: TableRefusal, t: Translate, pickedTablenums: number[]): string {
  // The station itself belongs to no restaurant, so every table is refused — naming one
  // would send the hostess hunting for a better table that does not exist.
  if (refusal.reason === 'STATION_UNASSIGNED') return t('seating.refusedStationUnassigned');
  const nums = refusal.tableNum != null ? [refusal.tableNum] : pickedTablenums;
  const key = TABLE_REFUSAL_KEYS[refusal.reason ?? ''] ?? 'seating.refusedTable';
  return t(key, { tables: nums.map((n) => `#${n}`).join(', ') });
}

/** `fallback` is the caller's localized "something went wrong" line, used only when the failure says nothing. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const fromBody = messageFromBody(error.response?.data);
    if (fromBody) return fromBody;
    // The interceptor puts the envelope's message on the error itself, which is the
    // path most business refusals take.
    const own = textFrom(error.message);
    if (own && !GENERIC_AXIOS_MESSAGES.some((re) => re.test(own))) return own;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return `${fallback} (timeout)`;
    const status = error.response?.status;
    return status ? `${fallback} (HTTP ${status})` : `${fallback} (${error.code ?? 'network'})`;
  }
  if (error instanceof Error) return textFrom(error.message) ?? fallback;
  return fallback;
}
