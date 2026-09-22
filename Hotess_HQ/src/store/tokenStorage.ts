const ACCESS_KEY = 'hotess.accessToken';
const REFRESH_KEY = 'hotess.refreshToken';

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
