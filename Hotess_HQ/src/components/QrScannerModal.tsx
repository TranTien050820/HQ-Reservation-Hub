import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}

const REGION_ID = 'hotess-qr-region';

export function QrScannerModal({ open, onClose, onScan }: QrScannerModalProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(REGION_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            onScan(decodedText);
          },
          () => {
            /* ignore per-frame decode failures */
          },
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('qr.error'));
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            /* camera already stopped */
          });
        scannerRef.current = null;
      }
    };
  }, [open, onScan, t]);

  if (!open) return null;

  return (
    <div className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center p-4">
      <div className="glass-card modal-panel w-full max-w-sm p-6">
        <h3 className="mb-1 text-lg font-semibold text-ink">{t('qr.title')}</h3>
        <p className="mb-4 text-sm text-muted">{t('qr.hint')}</p>
        <div id={REGION_ID} className="overflow-hidden rounded-xl border-2 border-brand/40 bg-black" />
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <button
          onClick={onClose}
          className="touch-btn btn-secondary mt-4 w-full rounded-xl font-medium"
        >
          {t('qr.stop')}
        </button>
      </div>
    </div>
  );
}
