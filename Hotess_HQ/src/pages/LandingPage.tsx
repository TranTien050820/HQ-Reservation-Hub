import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-card max-w-md p-6 text-center">
        <h1 className="mb-3 text-xl font-bold text-ink">{t('landing.title')}</h1>
        <p className="mb-5 text-muted">{t('landing.message')}</p>
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
