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
        <div className="glass-card max-w-sm p-8 text-center">
          <p className="mb-4 text-slate-300">{t('login.storeError')}</p>
          <p className="mb-4 text-xs text-slate-500">publicKey: {publicKey || '(none)'}</p>
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
      <div className="mx-auto w-full max-w-[1200px] shrink-0 px-4 pt-8 sm:px-8">
        <AppHeader />
      </div>
      <main className="mx-auto flex w-full min-h-0 max-w-[1200px] flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-8">
        <Outlet />
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
