import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from './Header';
import { StoreDataProvider, useStoreData } from '../store/StoreDataContext';

function StoreLayoutContent() {
  const { t } = useTranslation();
  const { isLoading, error } = useStoreData();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {isLoading && <p className="px-6 py-16 text-center text-neutral-500">{t('common.loading')}</p>}
        {!isLoading && !!error && (
          <p className="px-6 py-16 text-center text-resy-red">
            {error instanceof Error ? error.message : 'Failed to load store data'}
          </p>
        )}
        {!isLoading && !error && <Outlet />}
      </main>
      <footer className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-500">
        {t('footer.text', { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}

/** Loads the store identified by :publicKey once, then shares it with every nested page. */
export default function StoreLayout() {
  return (
    <StoreDataProvider>
      <StoreLayoutContent />
    </StoreDataProvider>
  );
}
