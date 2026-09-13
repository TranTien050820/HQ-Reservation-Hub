import { createContext, useContext, useState, type ReactNode } from 'react';
import { login as loginApi } from '../api/auth';
import { getTokens, setTokens, clearTokens } from './tokenStorage';
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
