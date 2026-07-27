import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ReservationWaitlist, ReservationZone } from '../types';
import { PeriodTimePicker } from './PeriodTimePicker';
import { nowHHmm } from '../utils/waitlist';
import { todayStr } from '../utils/date';

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
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WaitlistFormValues>({ defaultValues: defaultsFor(entry, prefill) });

  // The serving periods on offer follow whichever date is selected.
  const expectedDate = watch('expectedDate');
  const expectedTime = watch('expectedTime');

  // The modal stays mounted between openings, so re-seed the fields each time
  // it opens (and whenever a different entry is being edited).
  useEffect(() => {
    if (open) reset(defaultsFor(entry, prefill));
  }, [open, entry, prefill, reset]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[9997] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="glass-card modal-panel my-auto w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-white">
          {entry ? t('waitlist.editTitle') : t('waitlist.create')}
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label">{t('waitlist.name')}</label>
            <input className="field touch-btn px-4" autoFocus {...register('guestName', { required: true })} />
            {errors.guestName && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>

          <div>
            <label className="field-label">{t('waitlist.phone')}</label>
            <input
              type="tel"
              inputMode="tel"
              className="field touch-btn px-4"
              {...register('phoneNumber', { required: true })}
            />
            {errors.phoneNumber && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>

          <div>
            <label className="field-label">
              {t('common.email')} <span className="normal-case text-slate-500">({t('common.optional')})</span>
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
            {errors.partySize && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>

          <div>
            <label className="field-label">{t('waitlist.zone')}</label>
            <select className="field touch-btn px-3" {...register('zoneId')}>
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
            <input type="date" className="field touch-btn px-4" {...register('expectedDate', { required: true })} />
          </div>

          <div className="sm:col-span-2">
            <label className="field-label">{t('waitlist.expectedTime')}</label>
            {/* The picker is the real control; this keeps the value under react-hook-form. */}
            <input type="hidden" {...register('expectedTime', { required: true })} />
            <PeriodTimePicker
              date={expectedDate}
              value={expectedTime}
              onChange={(v) => setValue('expectedTime', v, { shouldValidate: true })}
            />
            {errors.expectedTime && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="field-label">
              {t('waitlist.notes')} <span className="normal-case text-slate-500">({t('common.optional')})</span>
            </label>
            <textarea rows={2} className="field px-4 py-2" {...register('notes')} />
          </div>

          <label className="flex touch-none items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300 sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-[#ffd700]" {...register('priority')} />
            {t('waitlist.vip')}
          </label>

          <div className="flex gap-3 sm:col-span-2">
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
