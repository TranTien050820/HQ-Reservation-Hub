import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { apiErrorMessage } from '../utils/apiError';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, isLoading, sessionExpired } = useAuth();
  const toast = useToast();
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(userName, password);
    } catch (err) {
      // The reason matters more here than anywhere else in the app. A signing failure
      // answers with the middleware's own wording — "client clock is off by 7 minute(s)" —
      // and that sentence is the whole diagnosis. Replacing it with "Đăng nhập thất bại"
      // sends the floor looking for a password problem that does not exist.
      toast.error(apiErrorMessage(err, t('login.error')));
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
        {/* Thrown back here by a refused refresh, not by her own "Đăng xuất" — say which. */}
        {sessionExpired && <p className="note note-warn mb-4 text-sm">{t('login.sessionExpired')}</p>}
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
