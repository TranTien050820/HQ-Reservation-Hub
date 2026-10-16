import { useTranslation } from 'react-i18next';
import { WAIVE_REASON_MAX_LENGTH } from '../utils/charges';
import { formatVnd } from '../utils/money';

interface SurchargeWaiveFieldProps {
  /** The waiver as it should be written. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  /**
   * The waiver as the booking already stores it. The reason box only asks when the waiver is
   * being turned ON now — an existing one keeps its reason, shown in `storedSummary`.
   */
  storedWaived?: boolean;
  /** "Đã miễn phụ thu · bởi … · lý do …" for a waiver the booking already carries. */
  storedSummary?: string | null;
  /** Why the reason as typed would be refused, to show under the box. */
  reasonProblem?: 'required' | 'tooLong' | null;
  /** The surcharge the waiver would give away, when it is known — struck through while waived. */
  surcharge?: number;
  disabled?: boolean;
}

/**
 * "Miễn phụ thu (VIP)" — the switch and its reason (YC3).
 *
 * Callers draw it only for an account that `canWaiveSurcharge`; the server is still the gate,
 * and refuses a change from anyone else with 403 SURCHARGE_WAIVE_FORBIDDEN.
 */
export function SurchargeWaiveField({
  checked,
  onCheckedChange,
  reason,
  onReasonChange,
  storedWaived = false,
  storedSummary,
  reasonProblem,
  surcharge,
  disabled,
}: SurchargeWaiveFieldProps) {
  const { t } = useTranslation();
  const askReason = checked && !storedWaived;

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2">
      <label className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span>{t('surcharge.waiveToggle')}</span>
        {surcharge != null && surcharge > 0 && (
          <span className={`ml-auto text-xs font-normal text-muted ${checked ? 'line-through' : ''}`}>
            {t('charges.surcharge', { amount: formatVnd(surcharge) })}
          </span>
        )}
      </label>
      {checked && storedWaived && storedSummary && <p className="mt-1 text-xs text-muted">{storedSummary}</p>}
      {askReason && (
        <div className="mt-2">
          <input
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            maxLength={WAIVE_REASON_MAX_LENGTH}
            disabled={disabled}
            placeholder={t('surcharge.reasonPlaceholder')}
            aria-label={t('surcharge.reason')}
            aria-invalid={reasonProblem ? true : undefined}
            className="field px-3 py-1.5 text-sm"
          />
          {reasonProblem && (
            <p className="mt-1 text-xs text-bad">
              {t(reasonProblem === 'required' ? 'surcharge.reasonRequired' : 'surcharge.reasonTooLong')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
