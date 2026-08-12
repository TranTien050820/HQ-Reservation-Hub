import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StoreProvider, useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { Spinner } from '../components/Spinner';
import { LoginPage } from './LoginPage';

function StoreLayoutInner() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { isLoading, error, linkInfo, publicKey, refetch } = useStore();

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
        <div className="glass-card max-w-sm p-6 text-center">
          <p className="mb-3 text-muted">{t('login.storeError')}</p>
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
