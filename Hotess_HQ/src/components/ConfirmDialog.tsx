interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="modal-panel w-full max-w-md rounded-2xl border border-line p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="touch-btn min-h-[44px] rounded-xl px-5 py-3 text-sm font-medium text-muted hover:bg-surface-hover"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`touch-btn min-h-[44px] rounded-xl px-5 py-3 text-sm font-semibold ${
              danger ? 'btn-danger' : 'btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface DialogChoice {
  key: string;
  label: string;
  /** One line under the label saying what the choice does — the labels alone can read alike. */
  hint?: string;
  onSelect: () => void;
}

interface ChoiceDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Several ways to go ahead, best first — the first is drawn as the primary button. */
  choices: DialogChoice[];
  cancelLabel: string;
  onCancel: () => void;
}

/**
 * `ConfirmDialog` with more than one way forward — e.g. confirming a New booking that holds
 * tables the guest picked: keep them, pick others, or let them go. Stacked full width rather
 * than in a row, so three long Vietnamese labels never squeeze onto one line of a tablet.
 */
export function ChoiceDialog({ open, title, message, choices, cancelLabel, onCancel }: ChoiceDialogProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="modal-panel w-full max-w-md rounded-2xl border border-line p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-4 space-y-2">
          {choices.map((choice, index) => (
            <button
              key={choice.key}
              onClick={choice.onSelect}
              className={`touch-btn flex min-h-[44px] w-full flex-col items-start justify-center rounded-xl px-4 py-2.5 text-left ${
                index === 0 ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              <span className="text-sm font-semibold">{choice.label}</span>
              {choice.hint && <span className="mt-0.5 text-xs font-normal opacity-80">{choice.hint}</span>}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={onCancel}
            className="touch-btn min-h-[44px] rounded-xl px-5 py-3 text-sm font-medium text-muted hover:bg-surface-hover"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
