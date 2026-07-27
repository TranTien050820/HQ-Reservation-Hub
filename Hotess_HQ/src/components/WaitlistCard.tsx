import { useTranslation } from 'react-i18next';
import { WAITLIST_STATUS_CONFIG, WaitlistStatus, type ReservationWaitlist } from '../types';
import {
  STALE_WAIT_MINUTES,
  avatarColor,
  elapsedMinutes,
  formatHHmm,
  initialsOf,
  waitTone,
} from '../utils/waitlist';

const TONE_STYLES = {
  calm: 'bg-slate-800/60 text-slate-300',
  warn: 'bg-amber-500/15 text-amber-300',
  urgent: 'bg-red-500/20 text-red-300',
} as const;

interface WaitlistCardProps {
  entry: ReservationWaitlist;
  /** Position in the waiting queue (1-based); omitted once the guest is past Waiting. */
  queuePosition?: number;
  /** Re-render trigger from the screen's ticker so the wait timer stays live. */
  now: number;
  busy?: boolean;
  onConfirm: (entry: ReservationWaitlist) => void;
  onSeat: (entry: ReservationWaitlist) => void;
  onEdit: (entry: ReservationWaitlist) => void;
  onNoShow: (entry: ReservationWaitlist) => void;
  onCancel: (entry: ReservationWaitlist) => void;
  /** Opens the booking the backend created, where the guest is marked as seated. */
  onOpenBooking: (entry: ReservationWaitlist) => void;
}

/**
 * One guest in the queue. Reserved(2) means a table is held but nobody has
 * marked the guest as seated yet, so they stay here — with a shortcut into the
 * booking — until the booking reaches Seated.
 */
export function WaitlistCard({
  entry,
  queuePosition,
  now,
  busy = false,
  onConfirm,
  onSeat,
  onEdit,
  onNoShow,
  onCancel,
  onOpenBooking,
}: WaitlistCardProps) {
  const { t } = useTranslation();
  const cfg = WAITLIST_STATUS_CONFIG[entry.status];
  const isVip = (entry.priority ?? 0) > 0;
  const isWaiting = entry.status === WaitlistStatus.Waiting;
  const isConfirmed = entry.status === WaitlistStatus.Confirmed;
  const isReserved = entry.status === WaitlistStatus.Reserved;
  const isOpen = isWaiting || isConfirmed;

  // Waiting counts from when the guest joined; once called, what matters is how
  // long they've been left standing since the call.
  const minutes = elapsedMinutes(isConfirmed ? (entry.dateConfirmed ?? entry.dateCreated) : entry.dateCreated, now);
  const tone = waitTone(minutes);
  const isStale = isOpen && minutes >= STALE_WAIT_MINUTES;

  return (
    <div
      className={`glass-card p-4 ${
        isStale ? 'ring-1 ring-red-500/50' : isVip && isOpen ? 'ring-1 ring-[#ffd700]/50' : ''
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        {queuePosition != null && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/30 text-sm font-bold text-slate-300">
            {queuePosition}
          </span>
        )}
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: avatarColor(entry.globalId) }}
          aria-hidden
        >
          {initialsOf(entry.guestName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{entry.guestName}</p>
            {isVip && <span className="chip bg-[#ffd700] text-black">{t('waitlist.vipBadge')}</span>}
            <span className="chip text-white" style={{ backgroundColor: cfg?.color ?? '#64748b' }}>
              {t(cfg?.label ?? '')}
            </span>
            {isOpen && (
              <span className={`chip ${TONE_STYLES[tone]}`}>
                {isConfirmed ? t('waitlist.calledAgo', { count: minutes }) : `${minutes} ${t('waitlist.minutes')}`}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-slate-400">
            {entry.phoneNumber} · {entry.partySize} {t('waitlist.guests')}
            {entry.zoneName ? ` · ${entry.zoneName}` : ''}
            {entry.expectedTime ? ` · ${formatHHmm(entry.expectedTime)}` : ''}
          </p>

          {entry.notes && <p className="mt-1 text-xs text-slate-500">📝 {entry.notes}</p>}

          {isStale && <p className="mt-1 text-xs font-medium text-red-400">{t('waitlist.staleHint')}</p>}

          {isReserved && entry.reservationNo && (
            <p className="mt-1 font-mono text-xs text-emerald-300">
              {t('seating.reservationCode')} #{entry.reservationNo}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
        {isWaiting && (
          <button
            onClick={() => onConfirm(entry)}
            disabled={busy}
            className="chip-btn btn-primary rounded-xl px-4 text-sm font-semibold"
          >
            {t('waitlist.confirm')}
          </button>
        )}
        {isOpen && (
          <button
            onClick={() => onSeat(entry)}
            disabled={busy}
            className="chip-btn btn-success rounded-xl px-4 text-sm font-semibold"
          >
            {t('waitlist.seat')}
          </button>
        )}
        {/* The only way off this screen: mark the guest seated on the booking. */}
        {isReserved && (
          <button
            onClick={() => onOpenBooking(entry)}
            disabled={busy}
            className="chip-btn btn-primary rounded-xl px-4 text-sm font-semibold"
          >
            {t('waitlist.openBooking')}
          </button>
        )}
        {isOpen && (
          <button
            onClick={() => onEdit(entry)}
            disabled={busy}
            className="chip-btn btn-secondary rounded-xl px-4 text-sm font-medium"
          >
            {t('waitlist.edit')}
          </button>
        )}
        <button
          onClick={() => onNoShow(entry)}
          disabled={busy}
          className="chip-btn btn-secondary rounded-xl px-4 text-sm font-medium text-amber-300"
        >
          {t('waitlist.noShow')}
        </button>
        <button
          onClick={() => onCancel(entry)}
          disabled={busy}
          className="chip-btn btn-secondary rounded-xl px-4 text-sm font-medium text-red-300"
        >
          {t('waitlist.cancel')}
        </button>
      </div>
    </div>
  );
}
