/**
 * Tokens are kept per API host. A session is only good on the API that issued it: a deployment
 * verifies with its own `Jwt:Key`, and `refresh-token` answers a token it cannot verify with a
 * 500 — which the HTTP layer rightly reads as a bad minute, not a dead session. So a build
 * re-pointed at another host (hq-api-bo → api-dev-hq) kept the hostess "logged in" while every
 * JWT call — the booking's pre-orders, Release, Cancel — failed for good. Keyed by host, that
 * build starts at the login screen instead.
 */
const API_HOST = (import.meta.env.VITE_API_BASE_URL || 'same-origin').replace(/\/+$/, '');
const ACCESS_KEY = `hotess.accessToken@${API_HOST}`;
const REFRESH_KEY = `hotess.refreshToken@${API_HOST}`;

// The unscoped keys of earlier builds are never read again — drop the 7-day refresh token
// rather than leave it lying in storage.
localStorage.removeItem('hotess.accessToken');
localStorage.removeItem('hotess.refreshToken');

export function getTokens() {
  return {
    accessToken: localStorage.getItem(ACCESS_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/**
 * Subscribe to "the session is gone for good" — returns the unsubscribe function.
 *
 * The HTTP layer is the only place that learns a refresh token was refused, and the auth
 * state lives in React. Clearing storage alone (the old behaviour) left the app drawing a
 * logged-in hostess over a session that no longer existed: every call after that 401'd with
 * no token while the screens stayed up.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

/** The tokens can no longer be renewed: drop them and tell whoever holds the logged-in state. */
export function expireSession() {
  clearTokens();
  for (const listener of sessionExpiredListeners) listener();
}
