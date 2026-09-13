import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StoreProvider, useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { Spinner } from '../components/Spinner';
import { AlertIcon } from '../components/icons';
import { CRYPTO_UNAVAILABLE, CRYPTO_UNAVAILABLE_MESSAGE } from '../api/http';
import { LoginPage } from './LoginPage';

function StoreLayoutInner() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { isLoading, error, linkInfo, publicKey, refetch } = useStore();

  /**
   * Checked before anything is fetched, because nothing CAN be fetched.
   *
   * `crypto.subtle` exists only in a secure context, so a terminal opened over plain HTTP on
   * a LAN address (http://192.168.1.50/) cannot sign a single request. Every call would come
   * back 401 and the screen would read "không tải được cấu hình cửa hàng" — which sends
   * whoever is on shift looking at the store setup instead of at the address bar. Say the
   * actual cause, and say what to type instead.
   */
  if (CRYPTO_UNAVAILABLE) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-card max-w-md p-6 text-center">
          <span className="icon-tile mx-auto mb-3 flex h-12 w-12 text-bad">
            <AlertIcon size={24} />
          </span>
          <h1 className="text-lg font-semibold text-ink">{t('login.insecureContextTitle')}</h1>
          <p className="mt-2 text-sm leading-snug text-muted">{CRYPTO_UNAVAILABLE_MESSAGE}</p>
          <p className="mt-3 break-all font-mono text-xs text-faint">{window.location.origin}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  if (error || !linkInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-card max-w-md p-6 text-center">
          <p className="mb-2 text-muted">{t('login.storeError')}</p>
          {/* The reason, not just the fact. A 401 from the signing gate and a store that
              genuinely has no such link look identical without it. */}
          {error && <p className="mb-3 break-words text-sm text-bad">{error}</p>}
          <p className="mb-4 text-xs text-faint">publicKey: {publicKey || '(none)'}</p>
          <button
            onClick={refetch}
            className="touch-btn btn-primary rounded-xl px-5 font-semibold"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* The bar spans the full width; only the content inside it is contained,
          so it reads as the app's chrome rather than a floating widget. */}
      <div className="shrink-0">
        <AppHeader />
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col px-4 py-4 sm:px-6 sm:py-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function StoreLayout() {
  return (
    <StoreProvider>
      <StoreLayoutInner />
    </StoreProvider>
  );
}

export function StoreIndexRedirect() {
  return <Navigate to="checkin" replace />;
}
