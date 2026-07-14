import { useTranslation } from 'react-i18next';
import { WAITLIST_STATUS_CONFIG, WaitlistStatus, type ReservationWaitlist } from '../types';

const EXPIRE_WARNING_MINUTES = 45;

interface WaitlistCardProps {
  entry: ReservationWaitlist;
  onCall: (entry: ReservationWaitlist) => void;
  onQuickSeat: (entry: ReservationWaitlist) => void;
  onCancel: (entry: ReservationWaitlist) => void;
}

export function WaitlistCard({ entry, onCall, onQuickSeat, onCancel }: WaitlistCardProps) {
  const { t } = useTranslation();
  const waitedMinutes = Math.max(0, Math.round((Date.now() - new Date(entry.createdDate).getTime()) / 60000));
  const cfg = WAITLIST_STATUS_CONFIG[entry.status];
  const isActive = entry.status === WaitlistStatus.Waiting || entry.status === WaitlistStatus.Confirmed;
  const isExpiredWarning = isActive && waitedMinutes >= EXPIRE_WARNING_MINUTES;

  return (
    <div
      className={`glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
        isExpiredWarning ? 'ring-1 ring-red-500/50' : entry.isVip ? 'ring-1 ring-[#ffd700]/50' : ''
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white">{entry.name}</p>
          {entry.isVip && <span className="chip bg-[#ffd700] text-black">VIP</span>}
          <span
            className="chip text-white"
            style={{ backgroundColor: cfg?.color ?? '#64748b' }}
          >
            {t(cfg?.label ?? '')}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          {entry.phone} · {entry.numOfGuest}p · {entry.zoneName ?? '-'}
        </p>
        <p className="text-xs text-slate-500">
          {waitedMinutes} {t('waitlist.minutes')}
        </p>
        {isExpiredWarning && <p className="text-xs font-medium text-red-400">{t('waitlist.expired')}</p>}
        {entry.notes && <p className="text-xs text-slate-500">{entry.notes}</p>}
      </div>
      {isActive && (
        <div className="flex flex-wrap gap-2">
          {entry.status === WaitlistStatus.Waiting && (
            <button
              onClick={() => onCall(entry)}
              className="touch-btn btn-primary rounded-xl px-3 text-sm font-semibold"
            >
              {t('waitlist.call')}
            </button>
          )}
          <button
            onClick={() => onQuickSeat(entry)}
            className="touch-btn btn-success rounded-xl px-3 text-sm font-semibold"
          >
            {t('waitlist.quickSeat')}
          </button>
          <button
            onClick={() => onCancel(entry)}
            className="touch-btn btn-danger rounded-xl px-3 text-sm font-semibold"
          >
            {t('waitlist.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
