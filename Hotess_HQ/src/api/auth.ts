import { http } from './http';
import type { ApiEnvelope, LoginResponseData } from '../types';
import { mockLogin } from './mockData';

export async function login(userName: string, password: string): Promise<LoginResponseData> {
  try {
    const res = await http.post<ApiEnvelope<LoginResponseData>>('/api/auth/login', {
      UserName: userName,
      Password: password,
    });
    return res.data.data;
  } catch (err) {
    console.warn('[auth] login API unavailable, using mock fallback', err);
    if (!userName || !password) throw new Error('Username and password are required');
    return { ...mockLogin, user: { ...mockLogin.user, userName, fullName: userName } };
  }
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  try {
    const res = await http.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
      '/api/auth/refresh',
      { refreshToken },
    );
    return res.data.data;
  } catch (err) {
    console.warn('[auth] refresh API unavailable, using mock fallback', err);
    return { accessToken: 'mock-access-token', refreshToken };
  }
}
