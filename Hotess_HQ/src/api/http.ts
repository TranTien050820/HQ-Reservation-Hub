import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getTokens, setTokens, clearTokens } from '../store/tokenStorage';
import { refreshAccessToken } from './auth';

/**
 * One query-string serializer for both the wire and the signature.
 *
 * The HMAC below signs `path + query`, so the string we sign has to be the string axios
 * actually sends — byte for byte. Letting axios use its own serializer and rebuilding the
 * query here separately is how the two drift apart the first time a filter carries a space
 * or a Vietnamese name, and the symptom is a 401 on *some* searches only.
 *
 * Empty strings are dropped on purpose: an empty filter field means "no filter", and the
 * previous code already omitted them from the signed string while axios kept them on the
 * wire — the exact mismatch this function exists to make impossible.
 */
function serializeParams(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  return usp.toString();
}

/**
 * Empty baseURL lets requests go out as relative "/api/..." paths, proxied by
 * the Vite dev server (see vite.config.ts) or by whatever reverse proxy sits
 * in front of the built app in production.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000,
  paramsSerializer: { serialize: serializeParams },
});

const PARTNER_KEY = import.meta.env.VITE_PARTNER_KEY as string | undefined;
const SECRET_KEY = import.meta.env.VITE_SECRET_KEY as string | undefined;

/**
 * `crypto.subtle` exists only in a secure context — HTTPS or localhost. A hostess terminal
 * opened over plain HTTP on a LAN IP (http://192.168.1.50/) has `crypto.subtle === undefined`
 * and every signed request would go out unsigned. Fail loudly instead: unsigned requests come
 * back as a blanket 401 that reads like "wrong password" and sends the floor hunting.
 */
export const CRYPTO_UNAVAILABLE = !!SECRET_KEY && typeof crypto?.subtle?.importKey !== 'function';

export const CRYPTO_UNAVAILABLE_MESSAGE =
  'Trình duyệt không ký được request: crypto.subtle chỉ hoạt động trên HTTPS hoặc localhost. ' +
  'Mở app bằng https:// hoặc http://localhost thay vì địa chỉ IP.';

/**
 * The UTC stamp inside the signed string — precise to the MINUTE, never to the second.
 *
 * The server rebuilds it from its own clock and scans +1 .. -TokenToleranceMinutes (default
 * 5), so the two machines need not be exactly in sync.
 */
function utcStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

async function hmacSha256Hex(secretKey: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => ('0' + (b & 0xff).toString(16)).slice(-2))
    .join('');
}

function buildRequestUri(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? '';
  const params = config.params as Record<string, unknown> | undefined;
  if (!params) return url;
  const qs = serializeParams(params);
  return qs ? `${url}?${qs}` : url;
}

/**
 * The body exactly as axios will put it on the wire.
 *
 * axios sends nothing at all for `undefined`/`null` data, so the signed suffix has to be
 * empty too. Anything else is serialized with the same JSON.stringify axios uses, from the
 * same object, so the two strings cannot disagree.
 */
function rawBody(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
}

/**
 * The PartnerTokenMiddleware signature (HQ-WebOffice-API/API/Middleware/PartnerSignature.cs).
 *
 *   Token = HMAC_SHA256(path + query + "." + utcStamp + suffix, SECRET_KEY) -> lowercase hex
 *   suffix = ""                 for GET
 *          = "." + rawBody      for POST/PUT   ("" when there is no body at all)
 *
 * 🔴 The version of this file before 2026-09 was wrong in two places. Do not restore it:
 *    1. The utcStamp was missing entirely — every request 401s the moment the backend runs
 *       with TokenTimestamp = true, which is its default.
 *    2. A POST with no body signed `"." + "{}"` while axios sent no body at all, so the
 *       server read rawBody = "" and signed `"." + ""`. Sign the string that actually went
 *       on the wire, empty included. `Reservation/{no}/Release` is exactly that call.
 */
http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { accessToken } = getTokens();
  config.headers = config.headers ?? {};
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (PARTNER_KEY) config.headers.PartnerKey = PARTNER_KEY;

  if (SECRET_KEY) {
    if (CRYPTO_UNAVAILABLE) throw new Error(CRYPTO_UNAVAILABLE_MESSAGE);

    const method = (config.method ?? 'get').toLowerCase();
    const prefix = buildRequestUri(config);
    const stamp = utcStamp();
    const suffix = method === 'post' || method === 'put' ? '.' + rawBody(config.data) : '';

    // Optional server-side, but sending it turns "Incorrect token" into a refusal that
    // names the clock skew in minutes — the most common cause, and the one nobody guesses
    // from the generic message.
    config.headers.Timestamp = stamp;
    config.headers.Token = await hmacSha256Hex(SECRET_KEY, `${prefix}.${stamp}${suffix}`);
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

/**
 * A 401 from PartnerTokenMiddleware is not an expired session.
 *
 * Refreshing on it would burn the refresh token, fail again, clear storage and drop the
 * hostess on the login screen — where logging in fails too, because the signature is what
 * is wrong. Detect it by the middleware's own wording and let its message through instead;
 * that message is what names the clock skew.
 */
function isPartnerTokenFailure(error: AxiosError): boolean {
  const message = (error.response?.data as { message?: string } | undefined)?.message ?? '';
  return (
    /incorrect token/i.test(message) ||
    /token cannot be empty/i.test(message) ||
    /partnerkey cannot be empty/i.test(message)
  );
}

http.interceptors.response.use(
  (res) => {
    // The backend always answers HTTP 200; real failures are signalled inside
    // the envelope ({ status, message }). Surface those as rejected promises
    // so every caller's try/catch (not just `.then`) sees the failure.
    const body = res.data as { status?: unknown; message?: string } | undefined;
    if (body && typeof body === 'object' && typeof body.status === 'number' && body.status !== 200) {
      return Promise.reject(new AxiosError(body.message || 'Request failed', String(body.status), res.config, res.request, res));
    }
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isPartnerTokenFailure(error)
    ) {
      original._retry = true;
      const { accessToken, refreshToken } = getTokens();
      if (!accessToken || !refreshToken) {
        clearTokens();
        return Promise.reject(error);
      }
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken(accessToken, refreshToken)
            .then((data) => {
              setTokens(data.accessToken, data.refreshToken);
              return data.accessToken;
            })
            .catch(() => {
              clearTokens();
              return null;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newToken = await refreshPromise;
        if (!newToken) return Promise.reject(error);
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return http.request(original);
      } catch (e) {
        clearTokens();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);
