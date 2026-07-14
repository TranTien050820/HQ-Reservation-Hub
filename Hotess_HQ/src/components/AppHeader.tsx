import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';

export function AppHeader() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const today = new Date().toLocaleDateString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Hotess<span className="text-[#ef4444]">Reservation</span>
      </h1>
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
        <select
          aria-label={t('header.language')}
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="cursor-pointer rounded-md border border-white/20 bg-black/20 px-2 py-1 text-xs font-semibold text-white outline-none"
        >
          <option value="en">EN</option>
          <option value="vi">VI</option>
        </select>
        {user && (
          <span className="hidden sm:inline">
            {t('header.staff')}: {user.fullName}
          </span>
        )}
        {user && (
          <button
            onClick={logout}
            aria-label={t('header.logout')}
            title={t('header.logout')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#8e3aff]/10 text-[#8e3aff] transition hover:bg-[#8e3aff] hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        )}
        <span className="border-l border-white/10 pl-4 text-lg font-semibold text-white">{today}</span>
      </div>
    </header>
  );
}
