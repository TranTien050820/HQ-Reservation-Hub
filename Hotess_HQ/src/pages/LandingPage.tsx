import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-card max-w-md p-8 text-center">
        <h1 className="mb-3 text-2xl font-bold text-white">{t('landing.title')}</h1>
        <p className="mb-6 text-slate-300">{t('landing.message')}</p>
        <Link
          to="/demo-key"
          className="touch-btn btn-primary inline-flex items-center justify-center rounded-xl px-6 font-semibold"
        >
          {t('landing.demoLink')}
        </Link>
      </div>
    </div>
  );
}
