import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import DatePicker from './DatePicker';
import { defaultSearchValues, type SearchValues } from '../lib/search';
import { todayDateString } from '../lib/slots';

export { defaultSearchValues, type SearchValues } from '../lib/search';

interface Props {
  initial?: SearchValues;
  onSearch: (values: SearchValues) => void;
}

const fieldClass =
  'w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-900 outline-none transition-colors focus:border-resy-red focus:bg-white focus:ring-2 focus:ring-resy-red/15 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100';

const MAX_PARTY_SIZE = 20;
const minDate = todayDateString();

export default function SearchBar({ initial, onSearch }: Props) {
  const { t } = useTranslation();
  const {
    watch,
    setValue,
    reset,
    register,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<SearchValues>({ defaultValues: initial ?? defaultSearchValues(), mode: 'onChange' });

  const date = watch('date');
  const partySize = register('partySize', {
    required: true,
    valueAsNumber: true,
    min: { value: 1, message: t('searchBar.errorMin') },
    max: { value: MAX_PARTY_SIZE, message: t('searchBar.errorMax', { max: MAX_PARTY_SIZE }) },
  });

  // Keep the form in sync with externally-driven changes — e.g. picking a day on the
  // restaurant page's date strip updates `initial.date` without remounting this bar,
  // and the displayed filter would otherwise keep showing the stale date.
  useEffect(() => {
    if (!initial) return;
    reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.date, initial?.partySize]);

  const commitSearch = async () => {
    const valid = await trigger();
    if (!valid) return;
    onSearch(getValues());
  };

  return (
    <div className="grid gap-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5 sm:grid-cols-2 sm:items-end">
      <label className="flex flex-col gap-1 text-left">
        <span className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <span aria-hidden>📅</span> {t('searchBar.date')}
        </span>
        <DatePicker
          value={date}
          minDate={minDate}
          onChange={(value) => {
            setValue('date', value, { shouldValidate: true, shouldDirty: true });
            void commitSearch();
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-left">
        <span className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <span aria-hidden>👥</span> {t('searchBar.partySize')}
        </span>
        <input
          type="number"
          inputMode="numeric"
          step={1}
          className={fieldClass}
          {...partySize}
          onBlur={(e) => {
            void partySize.onBlur(e);
            void commitSearch();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>

      {errors.partySize && <p className="-mt-1 text-xs font-medium text-resy-red sm:col-span-2">{errors.partySize.message}</p>}
    </div>
  );
}
