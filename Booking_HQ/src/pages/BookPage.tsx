import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCreateBooking } from '../api/queries';
import { useStoreData } from '../store/StoreDataContext';
import { ReservationStatus } from '../api/types';
import { ExtraFieldType } from '../api/booking';
import { formatDateHeadingWithYear } from '../lib/i18nFormat';
import { restaurantPhoto } from '../lib/restaurantImages';

interface BookingFormValues {
  bookingName: string;
  bookingPhone: string;
  bookingEmail: string;
  customerNote: string;
}

export default function BookPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { publicKey, data } = useStoreData();
  const settings = data?.settings;

  const date = searchParams.get('date') ?? '';
  const time = searchParams.get('time') ?? '';
  const label = searchParams.get('label') ?? '';
  const partySize = Number(searchParams.get('partySize') ?? '2');
  const zoneId = searchParams.get('zoneId');
  const zoneName = searchParams.get('zoneName') ?? '';
  const periodId = searchParams.get('periodId');
  const storeName = searchParams.get('storeName') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookingFormValues>({
    defaultValues: { bookingName: '', bookingPhone: '', bookingEmail: '', customerNote: '' },
  });
  const createBookingMutation = useCreateBooking();

  const extraFieldConfigs = useMemo(
    () =>
      (data?.extraFieldConfigs ?? [])
        .filter((field) => field.isVisible)
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [data],
  );
  const extraFieldOptions = data?.extraFieldOptions ?? [];

  const [extraFieldValues, setExtraFieldValues] = useState<Record<string, string>>({});
  const [extraErrors, setExtraErrors] = useState<Record<string, string>>({});

  // Seed each extra field with its configured default once, without clobbering user edits.
  useEffect(() => {
    setExtraFieldValues((prev) => {
      const next = { ...prev };
      for (const field of extraFieldConfigs) {
        if (next[field.fieldID] === undefined) next[field.fieldID] = field.defaultValue ?? '';
      }
      return next;
    });
  }, [extraFieldConfigs]);

  const optionsForField = (fieldID: string) =>
    extraFieldOptions.filter((o) => String(o.fieldID) === String(fieldID));

  const onSubmit = async (values: BookingFormValues) => {
    const missing: Record<string, string> = {};
    for (const field of extraFieldConfigs) {
      if (field.isRequired && !extraFieldValues[field.fieldID]?.trim()) {
        missing[field.fieldID] = t('booking.extraFieldRequired');
      }
    }
    if (Object.keys(missing).length > 0) {
      setExtraErrors(missing);
      return;
    }
    setExtraErrors({});

    try {
      const booking = await createBookingMutation.mutateAsync({
        siteId: data?.linkInfo?.siteId,
        sNum: data?.linkInfo?.sNum,
        statNum: data?.linkInfo?.statNum,
        bookingName: values.bookingName,
        bookingPhone: values.bookingPhone,
        bookingEmail: values.bookingEmail || undefined,
        bookerName: values.bookingName,
        bookerPhone: values.bookingPhone,
        bookerEmail: values.bookingEmail || undefined,
        reservationDate: date,
        reservationTime: time,
        partySize,
        status: ReservationStatus.New,
        channelID: data?.linkInfo?.channelId,
        zoneID: zoneId ? Number(zoneId) : undefined,
        periodID: periodId ? Number(periodId) : undefined,
        customerNote: values.customerNote || undefined,
        extraValues:
          extraFieldConfigs.length > 0
            ? extraFieldConfigs.map((field) => ({
                fieldID: Number(field.fieldID),
                fieldValue: extraFieldValues[field.fieldID] ?? '',
              }))
            : undefined,
      });
      navigate(`/${publicKey}/confirmation/${booking.globalId}`, { state: { booking } });
    } catch {
      // surfaced below via createBookingMutation.error
    }
  };

  const submitError = createBookingMutation.isError
    ? createBookingMutation.error instanceof Error
      ? createBookingMutation.error.message
      : t('booking.submitError')
    : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-neutral-500 hover:text-resy-red"
      >
        ← {t('booking.back')}
      </button>

      <div className="mt-4 grid gap-8 md:grid-cols-[1fr_280px]">
        <form onSubmit={handleSubmit(onSubmit)} className="order-2 flex flex-col gap-4 md:order-1">
          <h1 className="text-2xl font-bold">{t('booking.title')}</h1>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('booking.fullName')}</span>
            <input
              {...register('bookingName', { required: t('booking.fullNameError') })}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
              placeholder={t('booking.fullNamePlaceholder')}
            />
            {errors.bookingName && <span className="text-xs text-resy-red">{errors.bookingName.message}</span>}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('booking.phone')}</span>
            <input
              type="tel"
              {...register('bookingPhone', { required: t('booking.phoneError') })}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
              placeholder={t('booking.phonePlaceholder')}
            />
            {errors.bookingPhone && <span className="text-xs text-resy-red">{errors.bookingPhone.message}</span>}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('booking.email')}</span>
            <input
              type="email"
              {...register('bookingEmail')}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
              placeholder={t('booking.emailPlaceholder')}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('booking.notes')}</span>
            <textarea
              {...register('customerNote')}
              rows={3}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
              placeholder={t('booking.notesPlaceholder')}
            />
          </label>

          {extraFieldConfigs.map((field) => (
            <label key={field.fieldID} className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {field.fieldName}
                {!!field.isRequired && <span className="text-resy-red"> *</span>}
              </span>
              {field.fieldType === ExtraFieldType.Option ? (
                <select
                  value={extraFieldValues[field.fieldID] ?? ''}
                  onChange={(e) => setExtraFieldValues((v) => ({ ...v, [field.fieldID]: e.target.value }))}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
                >
                  <option value="">—</option>
                  {optionsForField(field.fieldID).map((opt) => (
                    <option key={opt.optionValue} value={opt.optionValue}>
                      {opt.optionText}
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
                  value={extraFieldValues[field.fieldID] ?? ''}
                  onChange={(e) => setExtraFieldValues((v) => ({ ...v, [field.fieldID]: e.target.value }))}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-resy-red focus:outline-none"
                />
              )}
              {extraErrors[field.fieldID] && (
                <span className="text-xs text-resy-red">{extraErrors[field.fieldID]}</span>
              )}
            </label>
          ))}

          {submitError && <p className="text-sm text-resy-red">{submitError}</p>}

          <button
            type="submit"
            disabled={createBookingMutation.isPending}
            className="mt-2 rounded-lg bg-resy-red px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
          >
            {createBookingMutation.isPending ? t('booking.submitting') : t('booking.submit')}
          </button>
        </form>

        <aside className="order-1 h-fit overflow-hidden rounded-xl border border-neutral-200 md:order-2">
          <img
            src={restaurantPhoto(settings?.sNum ?? 0)}
            alt={storeName}
            className="h-32 w-full object-cover"
            loading="lazy"
          />
          <div className="p-5">
            {storeName && <h2 className="text-lg font-bold">{storeName}</h2>}
            <h3 className="mt-2 text-sm font-semibold uppercase text-neutral-500">{t('booking.details')}</h3>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('booking.date')}</dt>
                <dd className="font-medium">{formatDateHeadingWithYear(date, i18n.language)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('booking.time')}</dt>
                <dd className="font-medium">{label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t('booking.partySize')}</dt>
                <dd className="font-medium">{partySize} {t('booking.guests')}</dd>
              </div>
              {zoneName && (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">{t('booking.seating')}</dt>
                  <dd className="font-medium">{zoneName}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="border-t border-neutral-100 bg-neutral-50 p-5">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">{t('restaurant.goodToKnow')}</h3>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm text-neutral-600">
              {((data?.goodToKnows ?? []).length > 0
                ? (data?.goodToKnows ?? []).map((item) => item.content)
                : (t('restaurant.goodToKnowItems', { returnObjects: true }) as string[])
              ).map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-resy-red">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
