import axios from 'axios';

/**
 * Empty baseURL in dev lets requests go out as relative "/api/..." paths, which
 * the Vite dev server proxies to the real API (see vite.config.ts). Set
 * VITE_API_BASE_URL in .env for builds that aren't served behind that proxy.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
});
