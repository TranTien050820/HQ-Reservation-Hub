import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { fetchAvailableSlots } from '../api/availableSlots';
import { createBooking } from '../api/bookings';
import { todayStr } from '../utils/date';
import { BookingStatus } from '../types';

interface FormValues {
  bookingPhone: string;
  bookingName: string;
  zoneID: string;
  partySize: number;
  notes: string;
}

export function BookingFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { linkInfo } = useStore();
  const { user } = useAuth();
  const zones = linkInfo?.zones ?? [];
  const [zoneFull, setZoneFull] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { partySize: 2 } });

  const onSubmit = async (values: FormValues) => {
    if (!linkInfo) return;
    setSubmitting(true);
    setZoneFull(false);
    try {
      if (values.zoneID) {
        const slots = await fetchAvailableSlots(linkInfo, todayStr());
        const slot = slots.find((s) => s.zoneID === Number(values.zoneID));
        if (slot && (slot.numberOfUnused ?? 0) <= 0) {
          setZoneFull(true);
          setSubmitting(false);
          return;
        }
      }
      await createBooking({
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        channelID: linkInfo.channelId,
        bookingName: values.bookingName,
        bookingPhone: values.bookingPhone,
        reservationDate: todayStr(),
        partySize: Number(values.partySize),
        zoneID: values.zoneID ? Number(values.zoneID) : undefined,
        status: BookingStatus.Confirm,
        customerNote: values.notes,
        userCreated: user?.userId,
      });
      toast.success(t('booking.success'));
      navigate('../seating');
    } catch {
      toast.error(t('booking.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const values = watch();

  return (
    <div className="mx-auto max-w-xl">
      <div className="glass-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate('../checkin')}
            aria-label={t('common.back')}
            className="chip-btn btn-secondary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-white">{t('booking.title')}</h1>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="field-label">{t('booking.phone')}</label>
            <input
              className="field touch-btn px-4"
              {...register('bookingPhone', { required: true })}
            />
            {errors.bookingPhone && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>
          <div>
            <label className="field-label">{t('booking.name')}</label>
            <input
              className="field touch-btn px-4"
              {...register('bookingName', { required: true })}
            />
            {errors.bookingName && <p className="mt-1 text-xs text-red-400">{t('booking.required')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">{t('booking.zone')}</label>
              <select
                className="field touch-btn px-3"
                {...register('zoneID')}
              >
                <option value="">{t('booking.selectZone')}</option>
                {zones.map((z) => (
                  <option key={z.zoneID} value={z.zoneID}>
                    {z.zoneName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">{t('booking.partySize')}</label>
              <input
                type="number"
                min={1}
                className="field touch-btn px-4"
                {...register('partySize', { required: true, min: 1, valueAsNumber: true })}
              />
            </div>
          </div>
          <div>
            <label className="field-label">
              {t('booking.notes')} <span className="normal-case text-slate-500">({t('common.optional')})</span>
            </label>
            <textarea
              className="field px-4 py-2"
              rows={2}
              {...register('notes')}
            />
          </div>

          {zoneFull && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4">
              <p className="font-medium text-amber-200">{t('booking.zoneFull')}</p>
              <p className="mt-1 text-sm text-amber-300/80">{t('booking.zoneFullHint')}</p>
              <button
                type="button"
                onClick={() => navigate('../waitlist', { state: { prefill: values } })}
                className="touch-btn btn-warning mt-3 rounded-xl px-4 text-sm font-semibold"
              >
                {t('checkin.addToWaitlist')}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="touch-btn btn-success w-full rounded-xl font-semibold"
          >
            {t('booking.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
