import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { login as loginApi } from '../api/auth';
import { getTokens, setTokens, clearTokens, onSessionExpired } from './tokenStorage';
import { canEditPreOrders, type AuthRole, type AuthUser } from '../types';

const USER_KEY = 'hotess.user';
const ROLES_KEY = 'hotess.roles';

interface AuthContextValue {
  user: AuthUser | null;
  /** `UserRole` rows from the login response — what the account is allowed to do. */
  roles: AuthRole[];
  /**
   * May this account change a pre-order? Money the guest already handed over is at stake,
   * so it is its own permission rather than part of "can use the hostess app".
   */
  canEditPreOrders: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  /**
   * True once the session ended under the hostess — the refresh token was refused — rather
   * than by her tapping "Đăng xuất". The login screen says so, so being thrown back to it
   * mid-service reads as "log in again", not as the app crashing. Cleared by the next login.
   */
  sessionExpired: boolean;
  login: (userName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasToken = () => !!getTokens().accessToken;
  const [user, setUser] = useState<AuthUser | null>(() =>
    hasToken() ? loadStored<AuthUser>(USER_KEY) : null,
  );
  /**
   * Stored beside the user because only `login` returns them — `refresh-token` answers with
   * the same shape but an empty `roles`, so re-reading them on every request would quietly
   * strip an account of its permissions the first time a token aged out.
   */
  const [roles, setRoles] = useState<AuthRole[]>(
    () => (hasToken() ? loadStored<AuthRole[]>(ROLES_KEY) : null) ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /**
   * The HTTP layer gave up on the session (refresh refused, or tokens gone): log out for real
   * (SPEC-06 R-14). Before this, storage was wiped but `user` stayed set, so the app kept
   * drawing a logged-in hostess whose every request went out without a token.
   *
   * The stored user record is what tells a session that ended from a 401 on the login form
   * itself — only the former gets the "session expired" line under the password box.
   */
  useEffect(
    () =>
      onSessionExpired(() => {
        const hadSession = localStorage.getItem(USER_KEY) != null;
        clearTokens();
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(ROLES_KEY);
        setUser(null);
        setRoles([]);
        if (hadSession) setSessionExpired(true);
      }),
    [],
  );

  const login = async (userName: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await loginApi(userName, password);
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      localStorage.setItem(ROLES_KEY, JSON.stringify(data.roles ?? []));
      setUser(data.user);
      setRoles(data.roles ?? []);
      setSessionExpired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearTokens();
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLES_KEY);
    setUser(null);
    setRoles([]);
    // Her own tap — nothing expired.
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        canEditPreOrders: canEditPreOrders(roles),
        isAuthenticated: !!user,
        isLoading,
        error,
        sessionExpired,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
