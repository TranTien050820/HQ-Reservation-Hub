import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, isLoading } = useAuth();
  const toast = useToast();
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(userName, password);
    } catch {
      toast.error(t('login.error'));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="glass-card w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center text-center">
          {/* Bigger than the app bar's copy — the crop is percentage-based, so
              overriding the box size rescales the artwork with it. */}
          <span className="brand-mark mb-4 h-[54px] w-[118px]" role="img" aria-label="SpeedUP" />
          <h1 className="text-xl font-bold text-ink">{t('login.title')}</h1>
        </div>
        <label className="field-label">{t('login.username')}</label>
        <input
          className="field touch-btn mb-4 px-4"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          autoComplete="username"
          required
        />
        <label className="field-label">{t('login.password')}</label>
        <input
          type="password"
          className="field touch-btn mb-6 px-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          className="touch-btn btn-primary w-full rounded-xl font-semibold"
        >
          {isLoading ? t('login.loading') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
