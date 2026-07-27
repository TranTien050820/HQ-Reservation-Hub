import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getTokens, setTokens, clearTokens } from '../store/tokenStorage';
import { refreshAccessToken } from './auth';

/**
 * Empty baseURL lets requests go out as relative "/api/..." paths, proxied by
 * the Vite dev server (see vite.config.ts) or by whatever reverse proxy sits
 * in front of the built app in production.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 15000,
});

const PARTNER_KEY = import.meta.env.VITE_PARTNER_KEY as string | undefined;
const SECRET_KEY = import.meta.env.VITE_SECRET_KEY as string | undefined;

/**
 * HQ-WebOffice-API's PartnerTokenMiddleware signs every request with an
 * HMAC-SHA256 "Token" header (hex, lowercase): HMAC(path+query) for GET,
 * HMAC(path+query+"."+rawBody) for POST/PUT. Only enforced when the backend
 * has CheckToken=true, so this is a no-op unless VITE_SECRET_KEY is set.
 */
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
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `${url}?${qs}` : url;
}

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { accessToken } = getTokens();
  config.headers = config.headers ?? {};
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (PARTNER_KEY) config.headers.PartnerKey = PARTNER_KEY;

  if (SECRET_KEY) {
    const method = (config.method ?? 'get').toLowerCase();
    const uri = buildRequestUri(config);
    if (method === 'get') {
      config.headers.Token = await hmacSha256Hex(SECRET_KEY, uri);
    } else if (method === 'post' || method === 'put') {
      config.headers.Token = await hmacSha256Hex(SECRET_KEY, `${uri}.${JSON.stringify(config.data ?? {})}`);
    }
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

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
    if (error.response?.status === 401 && original && !original._retry) {
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
