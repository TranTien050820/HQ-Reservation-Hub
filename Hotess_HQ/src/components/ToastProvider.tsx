import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * How long each kind holds the screen.
 *
 * A hostess reads these across a counter while doing something else with her hands, so
 * "done" only has to register, whereas an error is the one she has to read and act on —
 * it stays long enough to be finished reading, and any of them can be tapped away sooner.
 */
const DISMISS_MS: Record<ToastKind, number> = {
  success: 2600,
  info: 3200,
  error: 6000,
};

const TONE: Record<ToastKind, { icon: typeof AlertIcon; note: string; text: string; title: string }> = {
  success: { icon: CheckCircleIcon, note: 'note-ok', text: 'text-ok', title: 'toast.successTitle' },
  error: { icon: AlertIcon, note: 'note-bad', text: 'text-bad', title: 'toast.errorTitle' },
  info: { icon: InfoIcon, note: 'note-info', text: 'text-info', title: 'toast.infoTitle' },
};

let idSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idSeq;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), DISMISS_MS[kind]);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);
  const dismissAll = useCallback(() => setToasts([]), []);

  // Escape clears the alert the same way tapping the scrim does — on a tablet with a
  // keyboard dock the hostess should never have to hunt for the button.
  useEffect(() => {
    if (toasts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toasts.length, dismissAll]);

  /**
   * Built once and never rebuilt.
   *
   * This object is a dependency of half the data-loading callbacks in the app
   * (`useCallback([... toast ...])`). Handing out a fresh one on every render — which is
   * what a plain object literal here does, twice per toast: once when it appears and again
   * when it expires — invalidated those callbacks, re-ran their effects, and made the
   * seating floor plan blank itself to a spinner and drop the hostess's selection every
   * time any message was shown. Showing a message must never reload the screen behind it.
   */
  const value = useMemo<ToastContextValue>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Centre of the screen, not a corner chip: these are read from arm's length while
          the hostess is looking at the guest, and a 12px strip in the top corner of a
          tablet is exactly the thing nobody notices. The scrim both makes the message
          legible over whatever is behind it and gives a tap-anywhere way out. */}
      {toasts.length > 0 && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="alert-scrim absolute inset-0" onClick={dismissAll} />
          <div className="relative flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto">
            {toasts.map((toast) => {
              const tone = TONE[toast.kind];
              const Icon = tone.icon;
              return (
                <div
                  key={toast.id}
                  role={toast.kind === 'error' ? 'alert' : 'status'}
                  aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
                  className="alert-panel flex flex-col items-center gap-2.5 p-6 text-center"
                >
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full border ${tone.note}`}>
                    <Icon size={34} />
                  </span>
                  <p className={`text-lg font-bold uppercase tracking-wide ${tone.text}`}>{t(tone.title)}</p>
                  <p className="text-lg font-semibold leading-snug text-ink">{toast.message}</p>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="touch-btn btn-secondary mt-1 w-36 rounded-xl text-sm font-semibold"
                  >
                    {t('common.close')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
