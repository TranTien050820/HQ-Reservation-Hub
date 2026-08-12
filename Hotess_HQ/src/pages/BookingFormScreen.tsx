import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { fetchAvailableSlots } from '../api/availableSlots';
import { createBooking } from '../api/bookings';
import { apiErrorMessage } from '../utils/apiError';
import { formatVnDate, formatVnHHmm, nowTimeStr, todayStr } from '../utils/date';
import { ArrowLeftIcon } from '../components/icons';
import {
  BookingStatus,
  ExtraFieldType,
  type CreateReservationBookingRequest,
  type ReservationBooking,
} from '../types';

interface FormValues {
  bookingPhone: string;
  bookingName: string;
  zoneID: string;
  partySize: number;
  notes: string;
}

/** BookingPhone is a 20-char column on the backend — anything longer is rejected on POST. */
const PHONE_MAX_LENGTH = 20;

/**
 * Digits only. A phone typed with spaces or dashes ("090 123 4567") is the same
 * number to a human but a different string to the search that looks the guest up
 * again at check-in, so the separators are dropped as they are typed rather than
 * being stored. The slice covers values set programmatically (autofill, paste
 * handlers), which the `maxLength` attribute doesn't police.
 */
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, PHONE_MAX_LENGTH);

export function BookingFormScreen() {
  const { t, i18n } = useTranslation();
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

  // Registered once so the input can wrap `onChange` without re-registering on
  // every render. `setValueAs` isn't enough on its own — it runs on read, so
  // letters would still appear in the box while being typed.
  const phoneField = register('bookingPhone', {
    required: true,
    setValueAs: digitsOnly,
  });

  // The booking is stamped with "now", so the header shows a clock rather than a
  // frozen value the hostess might read as the time that will be saved.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Store-configured custom fields, in the order the back office arranged them.
  const extraFields = useMemo(
    () =>
      (linkInfo?.extraFieldConfigs ?? [])
        .filter((f) => f.fieldID != null && f.isVisible)
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [linkInfo],
  );
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [extraErrors, setExtraErrors] = useState<Record<string, string>>({});

  const optionsFor = (fieldID: string) =>
    (linkInfo?.extraFieldOptions ?? [])
      .filter((o) => String(o.fieldID) === fieldID)
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  const setExtraValue = (fieldID: string, value: string) => {
    setExtraValues((prev) => ({ ...prev, [fieldID]: value }));
    setExtraErrors((prev) => (prev[fieldID] ? { ...prev, [fieldID]: '' } : prev));
  };

  const onSubmit = async (values: FormValues) => {
    if (!linkInfo) return;

    const missing: Record<string, string> = {};
    for (const field of extraFields) {
      const id = String(field.fieldID);
      if (field.isRequired && !extraValues[id]?.trim()) missing[id] = t('booking.required');
    }
    setExtraErrors(missing);
    if (Object.keys(missing).length > 0) return;

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
      const payload = {
        siteId: linkInfo.siteId,
        sNum: linkInfo.sNum,
        statNum: linkInfo.statNum,
        channelID: linkInfo.channelId,
        bookingName: values.bookingName,
        bookingPhone: values.bookingPhone,
        reservationDate: todayStr(),
        // Walk-in: the guest is standing here, so the booking is stamped with
        // the moment of submission — the backend resolves PeriodID from it.
        reservationTime: nowTimeStr(),
        partySize: Number(values.partySize),
        zoneID: values.zoneID ? Number(values.zoneID) : undefined,
        status: BookingStatus.Confirm,
        customerNote: values.notes,
        userCreated: user?.userId,
        extraValues: extraFields.length
          ? extraFields.map((field) => ({
              fieldID: Number(field.fieldID),
              fieldValue: extraValues[String(field.fieldID)] ?? '',
            }))
          : undefined,
      } satisfies CreateReservationBookingRequest;
      const created = await createBooking(payload);
      toast.success(t('booking.success'));
      // Hand the new booking to the seating screen the same way check-in does,
      // so it opens ready to seat this guest instead of as a read-only floor
      // plan. The POST echoes the stored row, but fall back to what we just
      // sent for anything it leaves out — a blank name or a party size of 1
      // there would quietly mis-drive the capacity warnings.
      const booking: ReservationBooking = {
        ...created,
        bookingName: created.bookingName || payload.bookingName,
        bookingPhone: created.bookingPhone || payload.bookingPhone,
        partySize: created.partySize || payload.partySize,
        reservationDate: created.reservationDate || payload.reservationDate,
        reservationTime: created.reservationTime ?? payload.reservationTime,
        zoneID: created.zoneID ?? payload.zoneID ?? null,
        status: created.status || payload.status,
      };
      navigate('../seating', { state: { booking } });
    } catch (err) {
      toast.error(apiErrorMessage(err, t('booking.error')));
    } finally {
      setSubmitting(false);
    }
  };

  const values = watch();

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="glass-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => navigate('../checkin')}
            aria-label={t('common.back')}
            className="chip-btn btn-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <ArrowLeftIcon size={17} />
          </button>
          <h1 className="text-lg font-bold text-ink">{t('booking.title')}</h1>
          {/* Walk-in bookings are stamped with the moment of submission, so this
              is a live clock, not a chosen value — hence the label stays. */}
          <span className="ml-auto flex items-baseline gap-1.5 text-right">
            <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-faint sm:inline">
              {t('booking.dateTime')}
            </span>
            <span className="text-xs font-semibold text-ink">
              {formatVnDate(i18n.language === 'vi' ? 'vi-VN' : 'en-US', now)} · {formatVnHHmm(now)}
            </span>
          </span>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="field-label">{t('booking.phone')}</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={PHONE_MAX_LENGTH}
              className="field touch-btn px-4"
              {...phoneField}
              // Sanitise before handing the event on, so the field and the form
              // state never disagree about what was typed.
              onChange={(e) => {
                e.target.value = digitsOnly(e.target.value);
                void phoneField.onChange(e);
              }}
            />
            {errors.bookingPhone && <p className="mt-1 text-xs text-bad">{t('booking.required')}</p>}
          </div>
          <div>
            <label className="field-label">{t('booking.name')}</label>
            <input
              className="field touch-btn px-4"
              {...register('bookingName', { required: true })}
            />
            {errors.bookingName && <p className="mt-1 text-xs text-bad">{t('booking.required')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{t('booking.zone')}</label>
              <select
                className="field select touch-btn px-3"
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
              {t('booking.notes')} <span className="normal-case text-faint">({t('common.optional')})</span>
            </label>
            <textarea
              className="field px-4 py-2"
              rows={2}
              {...register('notes')}
            />
          </div>

          {extraFields.map((field) => {
            const id = String(field.fieldID);
            const value = extraValues[id] ?? '';
            return (
              <div key={id}>
                <label className="field-label">
                  {field.fieldName}
                  {!field.isRequired && (
                    <span className="normal-case text-faint"> ({t('common.optional')})</span>
                  )}
                </label>
                {field.fieldType === ExtraFieldType.Option ? (
                  <select
                    className="field select touch-btn px-3"
                    value={value}
                    onChange={(e) => setExtraValue(id, e.target.value)}
                  >
                    <option value="">{t('booking.selectOption')}</option>
                    {optionsFor(id).map((o) => (
                      <option key={o.optionValue} value={o.optionValue ?? ''}>
                        {o.optionText ?? o.optionValue}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      field.fieldType === ExtraFieldType.Number
                        ? 'number'
                        : field.fieldType === ExtraFieldType.Date
                          ? 'date'
                          : 'text'
                    }
                    className="field touch-btn px-4"
                    value={value}
                    onChange={(e) => setExtraValue(id, e.target.value)}
                  />
                )}
                {extraErrors[id] && <p className="mt-1 text-xs text-bad">{extraErrors[id]}</p>}
              </div>
            );
          })}

          {zoneFull && (
            <div className="note note-warn">
              <p className="text-sm font-semibold">{t('booking.zoneFull')}</p>
              <p className="mt-0.5 opacity-85">{t('booking.zoneFullHint')}</p>
              <button
                type="button"
                onClick={() => navigate('../waitlist', { state: { prefill: values } })}
                className="chip-btn btn-warning mt-2 rounded-lg px-3 text-xs font-semibold"
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
