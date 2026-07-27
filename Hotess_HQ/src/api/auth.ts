import { http } from './http';
import type { ApiEnvelope, LoginResponseData } from '../types';

/** POST /api/auth/login — body { userName, password }. */
export async function login(userName: string, password: string): Promise<LoginResponseData> {
  const res = await http.post<ApiEnvelope<LoginResponseData>>('/api/auth/login', { userName, password });
  return res.data.data;
}

/**
 * POST /api/auth/refresh-token — body { accessToken, refreshToken }, response
 * is the same LoginResponseDTO shape as login (roles/sites empty on refresh).
 * Note: this is NOT "/auth/refresh" and does NOT use snake_case
 * access_token/refresh_token — those belong to an unrelated, outdated helper
 * once copied from HQ_FE_V2's apiClient.ts; the real AuthController route and
 * payload are as implemented here.
 */
export async function refreshAccessToken(
  accessToken: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await http.post<ApiEnvelope<LoginResponseData>>('/api/auth/refresh-token', {
    accessToken,
    refreshToken,
  });
  return { accessToken: res.data.data.accessToken, refreshToken: res.data.data.refreshToken };
}
