import { useEffect, useRef, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  type Locale,
} from 'date-fns';
import { vi as viLocale, ko as koLocale, ja as jaLocale, zhCN as zhLocale } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface Props {
  value: string; // "yyyy-MM-dd"
  minDate: string; // "yyyy-MM-dd"
  onChange: (value: string) => void;
}

const WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const DATE_FNS_LOCALES: Record<string, Locale> = {
  vi: viLocale,
  ko: koLocale,
  ja: jaLocale,
  zh: zhLocale,
};

const WEEKDAY_LABELS: Record<string, string[]> = {
  vi: WEEKDAYS_VI,
  ko: WEEKDAYS_KO,
  ja: WEEKDAYS_JA,
  zh: WEEKDAYS_ZH,
};

export default function DatePicker({ value, minDate, onChange }: Props) {
  const { i18n } = useTranslation();
  const dateLocale = DATE_FNS_LOCALES[i18n.language];
  const weekdays = WEEKDAY_LABELS[i18n.language] ?? WEEKDAYS_EN;
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const min = startOfDay(parseISO(minDate));
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  const canGoBack = !isBefore(endOfMonth(subMonths(viewMonth, 1)), min);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setViewMonth(startOfMonth(selected));
          setOpen((o) => !o);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-left text-sm font-medium text-neutral-900 outline-none transition-colors hover:border-neutral-300 focus:border-resy-red focus:bg-white focus:ring-2 focus:ring-resy-red/15"
      >
        <span>{format(selected, 'EEE, MMM d, yyyy', { locale: dateLocale })}</span>
        <span aria-hidden className="text-neutral-400">📅</span>
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-72 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              disabled={!canGoBack}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="text-sm font-bold">{format(viewMonth, 'MMMM yyyy', { locale: dateLocale })}</span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-neutral-400">
            {weekdays.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const disabled = isBefore(day, min);
              const inMonth = isSameMonth(day, viewMonth);
              const isSelected = isSameDay(day, selected);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(format(day, 'yyyy-MM-dd'));
                    setOpen(false);
                  }}
                  className={`aspect-square rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-resy-red text-white'
                      : disabled
                        ? 'cursor-not-allowed text-neutral-300'
                        : inMonth
                          ? 'text-neutral-700 hover:bg-resy-red/10 hover:text-resy-red'
                          : 'text-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
