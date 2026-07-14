import { addDays, format, isSameDay, parseISO, type Locale } from 'date-fns';
import { vi as viLocale, ko as koLocale, ja as jaLocale, zhCN as zhLocale } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

const DATE_FNS_LOCALES: Record<string, Locale> = {
  vi: viLocale,
  ko: koLocale,
  ja: jaLocale,
  zh: zhLocale,
};

interface Props {
  value: string; // "yyyy-MM-dd"
  onChange: (date: string) => void;
  days?: number;
}

/** Horizontal strip of upcoming dates (today + N) for quick day-by-day filtering, Resy-style. */
export default function DateStrip({ value, onChange, days = 14 }: Props) {
  const { i18n } = useTranslation();
  const dateLocale = DATE_FNS_LOCALES[i18n.language];
  const selected = parseISO(value);
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i));

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {dates.map((date) => {
        const iso = format(date, 'yyyy-MM-dd');
        const active = isSameDay(date, selected);
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            className="flex shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1 transition-colors"
          >
            <span
              className={`text-[11px] font-semibold uppercase tracking-wide ${
                active ? 'text-resy-red' : 'text-neutral-400'
              }`}
            >
              {format(date, 'EEE', { locale: dateLocale })}
            </span>
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                active
                  ? 'bg-resy-red text-white shadow-sm shadow-resy-red/30'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {format(date, 'd')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
