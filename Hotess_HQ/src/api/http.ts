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

/**
 * Dev proxies / unfinished endpoints can return a 200 with an HTML shell
 * instead of JSON. Guard array-shaped responses so callers fall back to mock
 * data instead of crashing the screen on `.find`/`.map` over a non-array.
 */
export function assertArray<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error('Unexpected response shape: expected an array');
  return data;
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = getTokens();
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const { refreshToken } = getTokens();
      if (!refreshToken) {
        clearTokens();
        return Promise.reject(error);
      }
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken(refreshToken)
            .then((tokens) => {
              setTokens(tokens.accessToken, tokens.refreshToken);
              return tokens.accessToken;
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
