import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ReservationWaitlist, ReservationZone } from '../types';
import { PeriodTimePicker } from './PeriodTimePicker';
import { nowHHmm } from '../utils/waitlist';
import { VN_TIME_ZONE, todayStr, vnEpochMs } from '../utils/date';
import { isPastDateTime } from '../utils/timeWindow';

export interface WaitlistFormValues {
  guestName: string;
  phoneNumber: string;
  email: string;
  partySize: number;
  expectedDate: string;
  /** "HH:mm" from the time input — converted to a TimeSpan before it hits the API. */
  expectedTime: string;
  zoneId: string;
  priority: boolean;
  notes: string;
}

interface WaitlistFormModalProps {
  open: boolean;
  /** Present -> edit that entry; absent -> create a new one. */
  entry?: ReservationWaitlist | null;
  /** Seed values for a new entry, e.g. carried over from a booking that hit a full zone. */
  prefill?: Partial<WaitlistFormValues> | null;
  zones: ReservationZone[];
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: WaitlistFormValues) => void;
}

function defaultsFor(
  entry?: ReservationWaitlist | null,
  prefill?: Partial<WaitlistFormValues> | null,
): WaitlistFormValues {
  return {
    guestName: entry?.guestName ?? '',
    phoneNumber: entry?.phoneNumber ?? '',
    email: entry?.email ?? '',
    partySize: entry?.partySize ?? 2,
    expectedDate: entry?.expectedDate?.slice(0, 10) ?? todayStr(),
    // A walk-in wants a table now, so "now" is the sensible default rather than
    // a blank field — leaving it empty makes the backend book the guest at 00:00.
    expectedTime: entry?.expectedTime?.slice(0, 5) ?? nowHHmm(),
    zoneId: entry?.zoneId != null ? String(entry.zoneId) : '',
    priority: (entry?.priority ?? 0) > 0,
    notes: entry?.notes ?? '',
    ...(entry ? null : prefill),
  };
}

export function WaitlistFormModal({
  open,
  entry,
  prefill,
  zones,
  submitting = false,
  onClose,
  onSubmit,
}: WaitlistFormModalProps) {
  const { t, i18n } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<WaitlistFormValues>({ defaultValues: defaultsFor(entry, prefill) });

  // The serving periods on offer follow whichever date is selected.
  const expectedDate = watch('expectedDate');
  const expectedTime = watch('expectedTime');

  const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';

  /** Today and tomorrow in the *store's* timezone, not the tablet's. */
  const quickDates = useMemo(
    () => [
      { value: todayStr(), label: t('common.today') },
      { value: todayStr(Date.now() + 86_400_000), label: t('common.tomorrow') },
    ],
    [t],
  );

  const formattedExpectedDate = useMemo(() => {
    const ms = vnEpochMs(expectedDate);
    if (ms == null) return '';
    return new Date(ms).toLocaleDateString(locale, {
      timeZone: VN_TIME_ZONE,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [expectedDate, locale]);

  /**
   * The moment the form opened with — always allowed through, whatever the clock
   * does next. Without this the past-time guard would fight the form itself: a
   * new entry is seeded with "now" and would be rejected a minute later, and an
   * entry created at 11:00 could no longer be edited at 11:20.
   */
  const [seeded, setSeeded] = useState(() => {
    const values = defaultsFor(entry, prefill);
    return { date: values.expectedDate, time: values.expectedTime };
  });

  // The modal stays mounted between openings, so re-seed the fields each time
  // it opens (and whenever a different entry is being edited).
  useEffect(() => {
    if (!open) return;
    const values = defaultsFor(entry, prefill);
    reset(values);
    setSeeded({ date: values.expectedDate, time: values.expectedTime });
  }, [open, entry, prefill, reset]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="glass-card modal-panel my-auto w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-bold text-ink">
          {entry ? t('waitlist.editTitle') : t('waitlist.create')}
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label">{t('waitlist.name')}</label>
            <input className="field touch-btn px-4" autoFocus {...register('guestName', { required: true })} />
            {errors.guestName && <p className="mt-1 text-xs text-bad">{t('booking.required')}</p>}
          </div>

          <div>
            <label className="field-label">{t('waitlist.phone')}</label>
            <input
              type="tel"
              inputMode="tel"
              className="field touch-btn px-4"
              {...register('phoneNumber', { required: true })}
            />
            {errors.phoneNumber && <p className="mt-1 text-xs text-bad">{t('booking.required')}</p>}
          </div>

          <div>
            <label className="field-label">
              {t('common.email')} <span className="normal-case text-faint">({t('common.optional')})</span>
            </label>
            <input type="email" className="field touch-btn px-4" {...register('email')} />
          </div>

          <div>
            <label className="field-label">{t('waitlist.partySize')}</label>
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              className="field touch-btn px-4"
              {...register('partySize', { required: true, min: 1, valueAsNumber: true })}
            />
            {errors.partySize && <p className="mt-1 text-xs text-bad">{t('booking.required')}</p>}
          </div>

          <div>
            <label className="field-label">{t('waitlist.zone')}</label>
            <select className="field select touch-btn px-3" {...register('zoneId')}>
              <option value="">{t('booking.selectZone')}</option>
              {zones.map((z) => (
                <option key={z.zoneID} value={z.zoneID}>
                  {z.zoneName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">{t('waitlist.expectedDate')}</label>
            {/* A walk-in queue is almost always today, occasionally tomorrow, so
                those get one tap each. The native picker stays for the rest —
                it just isn't the only way in any more, and it no longer has to
                be read as a bare "2026-08-12" to know what was chosen. */}
            <div className="mb-1.5 flex gap-1.5">
              {quickDates.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => {
                    setValue('expectedDate', q.value, { shouldValidate: true });
                    void trigger('expectedTime');
                  }}
                  className={`chip-btn flex-1 rounded-lg px-2 text-xs font-semibold ${
                    expectedDate === q.value ? 'pill-on' : 'pill'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              // Yesterday is as past as this morning — the native picker says so
              // up front, and the guard below still has the last word.
              min={todayStr()}
              className="field chip-btn px-3"
              {...register('expectedDate', {
                required: true,
                // The time's verdict depends on the date, so moving the date has
                // to re-ask: 09:00 is past today and fine tomorrow.
                onChange: () => void trigger('expectedTime'),
              })}
            />
            {/* The native control renders the date in the *browser's* locale, so
                spell it out in the app's instead of leaving an ISO string. */}
            {formattedExpectedDate && (
              <p className="mt-1 text-xs text-muted">{formattedExpectedDate}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="field-label">{t('waitlist.expectedTime')}</label>
            {/* The picker is the real control; this keeps the value under react-hook-form. */}
            <input
              type="hidden"
              {...register('expectedTime', {
                required: true,
                validate: (time, values) =>
                  (values.expectedDate === seeded.date && time === seeded.time) ||
                  !isPastDateTime(values.expectedDate, time) ||
                  t('waitlist.timeInPastBlocked'),
              })}
            />
            <PeriodTimePicker
              date={expectedDate}
              value={expectedTime}
              onChange={(v) => setValue('expectedTime', v, { shouldValidate: true })}
            />
            {errors.expectedTime && (
              <p className="mt-1 text-xs text-bad">{errors.expectedTime.message || t('booking.required')}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="field-label">
              {t('waitlist.notes')} <span className="normal-case text-faint">({t('common.optional')})</span>
            </label>
            <textarea rows={2} className="field px-4 py-2" {...register('notes')} />
          </div>

          <label className="flex touch-none items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-[var(--gold)]" {...register('priority')} />
            {t('waitlist.vip')}
          </label>

          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="touch-btn btn-secondary flex-1 rounded-xl font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="touch-btn btn-primary flex-[2] rounded-xl font-semibold"
            >
              {entry ? t('common.save') : t('waitlist.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
