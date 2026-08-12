import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/StoreContext';
import {
  currentMinutes,
  findPeriodForTime,
  firstOpenSlot,
  isPeriodOver,
  periodContainsTime,
  periodLabel,
  periodSlots,
  periodsForDate,
} from '../utils/periods';
import { toMinutes } from '../utils/timeWindow';
import { todayStr } from '../utils/date';
import { AlertIcon, CheckCircleIcon, LockIcon } from './icons';

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

  /**
   * The period the hostess tapped. Needed because periods share their
   * boundaries — a store whose lunch ends at 14:00 and dinner starts at 14:00
   * has two periods covering 14:00, and resolving the selection from the time
   * alone always returned the first of them. Tapping "Ca tối" then listed "Ca
   * trưa"'s slots and labelled the field with the wrong period.
   */
  const [pinnedPeriodID, setPinnedPeriodID] = useState<number | null>(null);

  // Another day offers other periods, so a pin from the previous one means nothing.
  useEffect(() => setPinnedPeriodID(null), [day]);

  const activePeriod = useMemo(() => {
    // The pin only holds while the chosen time still falls inside it: typing a
    // time elsewhere in the day moves the selection, exactly as before.
    const pinned = openPeriods.find((p) => p.periodID === pinnedPeriodID);
    if (pinned && periodContainsTime(pinned, value)) return pinned;
    return findPeriodForTime(openPeriods, value);
  }, [openPeriods, pinnedPeriodID, value]);

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
                onClick={() => {
                  setPinnedPeriodID(p.periodID);
                  onChange(firstOpenSlot(p, lockBefore) || value);
                }}
                className={`chip-btn inline-flex items-center gap-1 rounded-full px-3 text-xs font-medium ${
                  isActive ? 'pill-on' : over ? 'pill-off' : 'pill'
                }`}
              >
                {over && <LockIcon size={12} />}
                {p.periodName}
                <span className={`ml-1.5 ${isActive ? 'text-white/75' : 'opacity-70'}`}>
                  {periodLabel(p)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!compact && slots.length > 0 && (
        <div className="scroll-x-soft flex gap-1.5 pb-1.5">
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
                    ? 'pill-on'
                    : locked
                      ? 'pill-off line-through'
                      : 'pill'
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
          className="field chip-btn w-32 px-3 text-sm"
        />
        {valueIsPast && (
          <span className="flex items-center gap-1 text-xs text-warn">
            <AlertIcon size={13} /> {t('waitlist.timeInPast')}
          </span>
        )}
        {activePeriod ? (
          <span className="flex items-center gap-1 text-xs text-ok">
            <CheckCircleIcon size={13} /> {activePeriod.periodName} · {periodLabel(activePeriod)}
          </span>
        ) : hasPeriodsConfigured && openPeriods.length === 0 ? (
          <span className="flex items-center gap-1 text-xs text-warn">
            <AlertIcon size={13} /> {t('waitlist.noPeriodToday')}
          </span>
        ) : hasPeriodsConfigured ? (
          <span className="flex items-center gap-1 text-xs text-warn">
            <AlertIcon size={13} /> {t('waitlist.timeOutsidePeriod')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
