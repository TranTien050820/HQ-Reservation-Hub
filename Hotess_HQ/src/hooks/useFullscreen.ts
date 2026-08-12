import { useCallback, useEffect, useState } from 'react';

/**
 * Full-screen for the whole app.
 *
 * A hostess tablet spends all service on one screen, so the browser chrome is
 * pure loss — this hands those ~90px back to the floor plan and stops a stray
 * swipe landing on the address bar.
 *
 * Safari still only ships the `webkit`-prefixed half of the API, so both are
 * probed. Where neither exists (iOS Safari on a phone, some kiosk shells)
 * `isSupported` is false and the caller hides the control rather than offering
 * a button that quietly does nothing.
 */
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function activeElement(): Element | null {
  return document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => activeElement() != null);
  const [isSupported] = useState(() => {
    const root = document.documentElement as WebkitElement;
    return typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function';
  });

  // Esc and the browser's own chrome can leave full screen without going through
  // `toggle`, so the button's state is driven by the event, never by the click.
  useEffect(() => {
    const sync = () => setIsFullscreen(activeElement() != null);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  /**
   * Resolves `true` when the mode actually changed.
   *
   * A browser can advertise the API and still refuse the call — an embedded
   * webview, an iframe without `allow="fullscreen"`, or a kiosk policy all fail
   * with "Permissions check failed". `fullscreenchange` never fires in that
   * case, so without a return value the tap would look like a dead button.
   */
  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    const doc = document as WebkitDocument;
    const root = document.documentElement as WebkitElement;
    try {
      if (activeElement()) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else {
        await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  return { isFullscreen, toggleFullscreen, isSupported };
}
