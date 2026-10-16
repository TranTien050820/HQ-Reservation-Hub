import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { useAuth } from '../store/AuthContext';
import { useToast } from '../components/ToastProvider';
import { fetchSlotPoolAvailability, maxBookable, PERIOD_NOT_CONFIGURED } from '../api/slotPoolAvailability';
import { createBooking } from '../api/bookings';
import {
  FREE_SEATS_INVALID,
  SURCHARGE_WAIVE_REASON_REQUIRED,
  SURCHARGE_WAIVE_REASON_TOO_LONG,
  apiErrorCode,
  apiErrorMessage,
  bookingFieldRefusalMessage,
  isWaiverRefusalToRevert,
} from '../utils/apiError';
import { waiveReasonProblem, waiverPatch } from '../utils/charges';
import { formatVnDate, formatVnHHmm, nowTimeStr, todayStr } from '../utils/date';
import { ArrowLeftIcon } from '../components/icons';
import { SurchargeWaiveField } from '../components/SurchargeWaiveField';
import {
  BookingStatus,
  ExtraFieldType,
  type CreateReservationBookingRequest,
  type ReservationBooking,
  type SlotPoolAvailability,
} from '../types';

interface FormValues {
  bookingPhone: string;
  bookingName: string;
  zoneID: string;
  partySize: number;
  /** YC5 — how many of the party are not charged (children, invited guests): 0..partySize. */
  freeSeats: number;
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

/**
 * Why a walk-in was turned away before anything was written.
 * - `capacity`: the zone cannot seat this party right now; `bookable` is the largest party it
 *   still can (0 = full).
 * - `closed`: no serving period covers this minute, so the store sells nothing at this hour.
 */
type WalkInRefusal =
  | { kind: 'capacity'; bookable: number; zoneName: string | null }
  | { kind: 'closed' };

export function BookingFormScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { linkInfo } = useStore();
  const { user, canWaiveSurcharge } = useAuth();
  const zones = linkInfo?.zones ?? [];
  const [refusal, setRefusal] = useState<WalkInRefusal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * "Miễn phụ thu (VIP)" (YC3). A walk-in has no table yet, so there is no amount to show — the
   * flag travels with the booking, and whatever table it is seated at later comes to 0 surcharge.
   */
  const [waiveOn, setWaiveOn] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveTried, setWaiveTried] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { partySize: 2, freeSeats: 0 } });

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

    // Only an account allowed to give it away sends a waiver at all — the server refuses
    // anyone else's with 403 — and only with the reason it requires.
    const wantWaived = canWaiveSurcharge && waiveOn;
    if (waiveReasonProblem(false, wantWaived, waiveReason)) {
      setWaiveTried(true);
      return;
    }

    setSubmitting(true);
    setRefusal(null);
    // One instant for the whole walk-in, so the capacity check below and the booking itself ask
    // about the same minute — and therefore the same serving period.
    const at = Date.now();
    const partySize = Number(values.partySize);
    // An emptied box means none; the field's own rule already kept it within 0..partySize.
    const freeSeats = Number.isFinite(values.freeSeats) ? Math.max(0, Math.floor(values.freeSeats)) : 0;
    try {
      // The zone the booking will really draw from: the one picked or, left blank, the station's
      // default zone — where the server puts a booking sent without ZoneID. No zone at all means
      // the booking takes no capacity, so there is nothing to check.
      const zoneId = values.zoneID ? Number(values.zoneID) : zones.find((z) => z.isPrimary === 1)?.zoneID;
      if (zoneId != null) {
        // Ask exactly what the POST below will be held to: this zone, this channel, this minute.
        // `bookable` is right for every allocation tree; the AvailableSlots grid's
        // `numberOfUnused` ignored the channel/period limits and the party size.
        let rows: SlotPoolAvailability[] | null = null;
        try {
          rows = await fetchSlotPoolAvailability(linkInfo, {
            date: todayStr(at),
            zoneId,
            channelId: linkInfo.channelId,
            time: formatVnHHmm(at),
          });
        } catch (err) {
          if (apiErrorCode(err) === PERIOD_NOT_CONFIGURED) {
            setRefusal({ kind: 'closed' });
            return;
          }
          // Any other failure says nothing about the seats. The POST enforces the same limits
          // server-side, so let it decide rather than turn a guest away over a lost request.
        }
        // MAX, never the sum: one booking takes all its seats from a single pool.
        const bookable = rows ? maxBookable(rows) : null;
        if (bookable != null && bookable < partySize) {
          setRefusal({
            kind: 'capacity',
            bookable,
            zoneName: zones.find((z) => z.zoneID === zoneId)?.zoneName ?? null,
          });
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
        reservationDate: todayStr(at),
        // Walk-in: the guest is standing here, so the booking is stamped with
        // the moment of submission — the backend resolves PeriodID from it.
        reservationTime: nowTimeStr(at),
        partySize,
        // Still seated, still counted against capacity — just not charged (YC5).
        freeSeats: freeSeats > 0 ? freeSeats : undefined,
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
        ...waiverPatch(false, wantWaived, waiveReason),
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
        // What the seating screen compares its own switches against. `??`, not `||`: an echoed
        // 0 is an answer (e.g. a server without the column ignored the waiver), not a gap.
        freeSeats: created.freeSeats ?? payload.freeSeats ?? 0,
        isSurchargeWaived: created.isSurchargeWaived ?? payload.isSurchargeWaived ?? 0,
        surchargeWaiveReason: created.surchargeWaiveReason ?? payload.surchargeWaiveReason ?? null,
      };
      navigate('../seating', { state: { booking } });
    } catch (err) {
      const code = apiErrorCode(err);
      // The waiver or the free seats were refused (YC3 / YC5) — nothing was created, so put the
      // field right and the same tap creates the booking.
      const fieldRefusal = bookingFieldRefusalMessage(err, t);
      // A booking with no zone skips the check above, so the POST is what finds an unsold hour —
      // say it the same way rather than in the server's English.
      if (code === PERIOD_NOT_CONFIGURED) setRefusal({ kind: 'closed' });
      else if (fieldRefusal) {
        toast.error(fieldRefusal);
        if (isWaiverRefusalToRevert(err)) {
          // Not this login's to give: drop the waiver rather than refuse the guest over it.
          setWaiveOn(false);
          setWaiveReason('');
          setWaiveTried(false);
        } else if (code === SURCHARGE_WAIVE_REASON_REQUIRED || code === SURCHARGE_WAIVE_REASON_TOO_LONG) {
          setWaiveTried(true);
        } else if (code === FREE_SEATS_INVALID) {
          setError('freeSeats', { message: fieldRefusal });
        }
      } else toast.error(apiErrorMessage(err, t('booking.error')));
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
            {/* Part of the party, not on top of it: they still take a seat (YC5). */}
            <div>
              <label
                className="field-label"
                title={t('freeSeats.hint', { party: Number.isFinite(values.partySize) ? values.partySize : '—' })}
              >
                {t('freeSeats.label')}
              </label>
              <input
                type="number"
                min={0}
                max={Number.isFinite(values.partySize) ? values.partySize : undefined}
                inputMode="numeric"
                className="field touch-btn px-4"
                {...register('freeSeats', {
                  valueAsNumber: true,
                  validate: (value, all) => {
                    const free = Number.isFinite(value) ? value : 0;
                    return (free >= 0 && free <= Number(all.partySize)) || t('freeSeats.invalid');
                  },
                })}
              />
              {errors.freeSeats && (
                <p className="mt-1 text-xs text-bad">{errors.freeSeats.message || t('freeSeats.invalid')}</p>
              )}
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

          {canWaiveSurcharge && (
            <SurchargeWaiveField
              checked={waiveOn}
              onCheckedChange={(on) => {
                setWaiveOn(on);
                setWaiveTried(false);
              }}
              reason={waiveReason}
              onReasonChange={setWaiveReason}
              reasonProblem={waiveTried ? waiveReasonProblem(false, waiveOn, waiveReason) : null}
              disabled={submitting}
            />
          )}

          {refusal && (
            <div className="note note-warn">
              <p className="text-sm font-semibold">
                {refusal.kind === 'closed'
                  ? t('booking.periodClosed', { defaultValue: 'Giờ này cửa hàng không nhận đặt' })
                  : refusal.bookable > 0
                    ? t('booking.zoneTooSmall', {
                        bookable: refusal.bookable,
                        defaultValue: 'Khu vực này chỉ còn nhận đoàn tối đa {{bookable}} khách',
                      })
                    : t('booking.zoneFull')}
                {/* Named, because a blank zone field was checked against the default zone. */}
                {refusal.kind === 'capacity' && refusal.zoneName && (
                  <span className="font-normal opacity-85"> · {refusal.zoneName}</span>
                )}
              </p>
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
