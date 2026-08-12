import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useTheme } from '../store/ThemeContext';
import { useFullscreen } from '../hooks/useFullscreen';
import { useToast } from './ToastProvider';
import { VN_TIME_ZONE, formatVnDate } from '../utils/date';
import {
  CalendarPlusIcon,
  ClockIcon,
  CollapseIcon,
  ExpandIcon,
  LayoutIcon,
  LogOutIcon,
  MoonIcon,
  ScanIcon,
  SunIcon,
} from './icons';

/**
 * The four screens, always one tap away.
 *
 * Paths are relative to the /:publicKey layout route this header renders in.
 */
const NAV = [
  { to: 'checkin', label: 'nav.checkin', Icon: ScanIcon },
  { to: 'booking', label: 'nav.booking', Icon: CalendarPlusIcon },
  { to: 'seating', label: 'nav.seating', Icon: LayoutIcon },
  { to: 'waitlist', label: 'nav.waitlist', Icon: ClockIcon },
] as const;

/** "TH 4" / "WED" — the weekday, which a date alone doesn't give at a glance. */
function weekdayLabel(locale: string): string {
  return new Date()
    .toLocaleDateString(locale, { timeZone: VN_TIME_ZONE, weekday: 'short' })
    .replace('.', '')
    .toUpperCase();
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const last = parts[parts.length - 1];
  return (parts.length > 1 ? parts[0][0] + last[0] : last.slice(0, 2)).toUpperCase();
}

export function AppHeader() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isFullscreen, toggleFullscreen, isSupported: canFullscreen } = useFullscreen();
  const toast = useToast();
  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
  // The store's day, not the tablet's — this is the date the screens below are working.
  const today = formatVnDate(locale);
  const isDark = theme === 'dark';

  const navLinks = (grow: boolean) =>
    NAV.map(({ to, label, Icon }) => (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          `nav-item ${grow ? 'flex-1 justify-center' : ''} ${isActive ? 'nav-item-on' : ''}`
        }
      >
        <Icon size={17} />
        {t(label)}
      </NavLink>
    ));

  return (
    <header className="app-bar sticky top-0 z-40">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-5 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <span className="brand-mark" role="img" aria-label="SpeedUP" />
          <span className="hidden text-[17px] font-bold leading-none tracking-tight text-ink sm:block">
            Hotess<span className="text-brand">Reservation</span>
          </span>
        </div>

        <nav className="nav-seg hidden lg:flex">{navLinks(false)}</nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <div className="hidden text-right leading-tight md:block">
            <p className="text-[11px] font-semibold tracking-wide text-faint">{weekdayLabel(locale)}</p>
            <p className="text-sm font-semibold text-ink">{today}</p>
          </div>

          {user && (
            <>
              <span className="hidden h-8 w-px bg-line md:block" />
              <span
                title={user.fullName ?? undefined}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-wash)] text-xs font-bold text-brand-ink"
              >
                {initials(user.fullName)}
              </span>
              <span className="hidden text-sm font-medium text-ink xl:inline">{user.fullName}</span>
            </>
          )}

          <select
            aria-label={t('header.language')}
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="field select h-9 w-[68px] px-2 text-xs font-semibold"
          >
            <option value="en">EN</option>
            <option value="vi">VI</option>
          </select>

          {canFullscreen && (
            <button
              onClick={async () => {
                if (!(await toggleFullscreen())) toast.info(t('header.fullscreenBlocked'));
              }}
              aria-label={t(isFullscreen ? 'header.fullscreenExit' : 'header.fullscreenEnter')}
              title={t(isFullscreen ? 'header.fullscreenExit' : 'header.fullscreenEnter')}
              aria-pressed={isFullscreen}
              className="icon-tile h-9 w-9 hover:bg-surface-hover hover:text-ink"
            >
              {isFullscreen ? <CollapseIcon size={17} /> : <ExpandIcon size={17} />}
            </button>
          )}

          <button
            onClick={toggleTheme}
            aria-label={t(isDark ? 'header.themeLight' : 'header.themeDark')}
            title={t(isDark ? 'header.themeLight' : 'header.themeDark')}
            className="icon-tile h-9 w-9 hover:bg-surface-hover hover:text-ink"
          >
            {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>

          {user && (
            <button
              onClick={logout}
              aria-label={t('header.logout')}
              title={t('header.logout')}
              className="icon-tile h-9 w-9 hover:border-transparent hover:bg-[var(--violet)] hover:text-white"
            >
              <LogOutIcon size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Below lg the nav gets its own full-width row rather than being squeezed
          beside the logo — on a tablet in portrait that squeeze is what pushed
          the labels into each other. */}
      <div className="border-t border-[var(--bar-line)] px-3 py-2 lg:hidden">
        <nav className="nav-seg w-full">{navLinks(true)}</nav>
      </div>
    </header>
  );
}
