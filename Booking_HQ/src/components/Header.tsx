import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n';
import { useStoreData } from '../store/StoreDataContext';

const LANGUAGE_INFO: Record<SupportedLanguage, { flag: string; label: string; short: string }> = {
  en: { flag: '🇺🇸', label: 'English', short: 'EN' },
  vi: { flag: '🇻🇳', label: 'Tiếng Việt', short: 'VI' },
  ko: { flag: '🇰🇷', label: '한국어', short: 'KO' },
  ja: { flag: '🇯🇵', label: '日本語', short: 'JA' },
  zh: { flag: '🇨🇳', label: '中文', short: 'ZH' },
};

export default function Header() {
  const { t, i18n } = useTranslation();
  const { publicKey = '' } = useParams();
  const { data } = useStoreData();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = LANGUAGE_INFO[i18n.language as SupportedLanguage] ?? LANGUAGE_INFO.en;
  const logoUrl = data?.settings.logoUrl || '/logo.png';

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors hover:text-resy-red ${
      isActive ? 'text-resy-red' : 'text-neutral-600'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to={`/${publicKey}`} className="flex items-center">
          <img src={logoUrl} alt={data?.settings.storeName ?? 'SpeedUP'} className="h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          <NavLink to={`/${publicKey}`} end className={linkClass}>
            {t('header.findStore')}
          </NavLink>
          <NavLink to={`/${publicKey}/bookings`} className={linkClass}>
            {t('header.myReservations')}
          </NavLink>
          <div ref={rootRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={t('header.language')}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-resy-red/40 hover:text-resy-red"
            >
              <span className="text-base leading-none">{current.flag}</span>
              <span className="hidden sm:inline">{current.short}</span>
              <span aria-hidden className="text-[10px] text-neutral-400">▼</span>
            </button>

            {open && (
              <div
                role="listbox"
                aria-label={t('header.language')}
                className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-neutral-200 bg-white py-1 shadow-2xl"
              >
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const info = LANGUAGE_INFO[lang];
                  const active = i18n.language === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        void i18n.changeLanguage(lang);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors ${
                        active ? 'bg-resy-red/10 text-resy-red' : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span className="text-base leading-none">{info.flag}</span>
                      <span>{info.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
