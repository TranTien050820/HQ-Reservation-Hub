import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
import {
  currentMinutes,
  findPeriodForTime,
  firstOpenSlot,
  isPeriodOver,
  periodLabel,
  periodSlots,
  periodsForDate,
} from '../utils/periods';
import { toMinutes } from '../utils/timeWindow';
import { todayStr } from '../utils/date';

/** Slots go stale as the shift runs on, so the lock line moves on its own. */
const TICK_MS = 60_000;

interface PeriodTimePickerProps {
  /** "yyyy-MM-dd" — which day's serving periods apply. */
  date: string;
  /** "HH:mm". */
  value: string;
  onChange: (hhmm: string) => void;
  /** Drops the period/slot chips and keeps only the time field plus its status line. */
  compact?: boolean;
}

function pad(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Time input bound to the store's serving periods.
 *
 * The backend attaches a booking's PeriodID by matching its time against
 * ReservationPeriods; a time outside every period configured for that date
 * silently yields a booking with no period. So instead of a bare time field,
 * this shows the windows that are actually open, lets staff tap a slot inside
 * one, and says plainly when a hand-typed time falls outside them all.
 *
 * On today's date, times that have already passed are locked — a walk-in can't
 * be expected at a moment that is gone. The one exception is the value already
 * held by the field, which stays selectable so an entry created earlier in the
 * shift can still be edited.
 */
export function PeriodTimePicker({ date, value, onChange, compact = false }: PeriodTimePickerProps) {
  const { t } = useTranslation();
  const { linkInfo } = useStore();

  const day = date.slice(0, 10);
  const locksPast = day === todayStr();

  const [nowMin, setNowMin] = useState(() => currentMinutes());
  useEffect(() => {
    if (!locksPast) return;
    const id = setInterval(() => setNowMin(currentMinutes()), TICK_MS);
    return () => clearInterval(id);
  }, [locksPast]);

  const lockBefore = locksPast ? nowMin : null;

  const openPeriods = useMemo(() => (linkInfo ? periodsForDate(linkInfo, day) : []), [linkInfo, day]);
  const activePeriod = useMemo(() => findPeriodForTime(openPeriods, value), [openPeriods, value]);
  const slots = useMemo(() => (activePeriod ? periodSlots(activePeriod) : []), [activePeriod]);

  const hasPeriodsConfigured = (linkInfo?.periods.length ?? 0) > 0;
  const isLocked = (hhmm: string) => lockBefore != null && hhmm !== value && (toMinutes(hhmm) ?? 0) < lockBefore;
  const valueIsPast = lockBefore != null && (toMinutes(value) ?? 0) < lockBefore;

  return (
    <div className="space-y-2">
      {!compact && openPeriods.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {openPeriods.map((p) => {
            const isActive = activePeriod?.periodID === p.periodID;
            const over = lockBefore != null && isPeriodOver(p, lockBefore) && !isActive;
            return (
              <button
                key={p.periodID}
                type="button"
                disabled={over}
                title={over ? t('waitlist.periodOver') : undefined}
                // Jump to the first slot still ahead of us, not blindly to the
                // period's start, which may already be locked.
                onClick={() => onChange(firstOpenSlot(p, lockBefore) || value)}
                className={`chip-btn rounded-full px-3 text-xs font-medium ${
                  isActive
                    ? 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_4px_16px_rgba(239,68,68,0.35)]'
                    : over
                      ? 'cursor-not-allowed bg-slate-800/30 text-slate-600'
                      : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {over && '🔒 '}
                {p.periodName}
                <span className={`ml-1.5 ${isActive ? 'text-white/75' : over ? 'text-slate-600' : 'text-slate-500'}`}>
                  {periodLabel(p)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!compact && slots.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {slots.map((slot) => {
            const locked = isLocked(slot);
            return (
              <button
                key={slot}
                type="button"
                disabled={locked}
                title={locked ? t('waitlist.timeInPast') : undefined}
                onClick={() => onChange(slot)}
                className={`chip-btn shrink-0 rounded-lg px-3 text-xs font-semibold ${
                  slot === value
                    ? 'bg-white text-slate-900'
                    : locked
                      ? 'cursor-not-allowed bg-black/15 text-slate-600 line-through'
                      : 'bg-black/25 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {slot}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          value={value}
          // Steers the native picker; the warning below is what actually tells
          // staff, since browsers don't block out-of-range typing.
          min={lockBefore != null ? pad(lockBefore) : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="field chip-btn w-32 px-3 text-sm text-white"
        />
        {valueIsPast && <span className="text-xs text-amber-300">⚠ {t('waitlist.timeInPast')}</span>}
        {activePeriod ? (
          <span className="text-xs text-emerald-300">
            ✓ {activePeriod.periodName} · {periodLabel(activePeriod)}
          </span>
        ) : hasPeriodsConfigured && openPeriods.length === 0 ? (
          <span className="text-xs text-amber-300">⚠ {t('waitlist.noPeriodToday')}</span>
        ) : hasPeriodsConfigured ? (
          <span className="text-xs text-amber-300">⚠ {t('waitlist.timeOutsidePeriod')}</span>
        ) : null}
      </div>
    </div>
  );
}
