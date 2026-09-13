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
