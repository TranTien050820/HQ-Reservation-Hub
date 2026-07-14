import { useTranslation } from 'react-i18next';

export function TableLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-emerald-400/30 bg-emerald-950/10" /> {t('seating.legendAvailable')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-sky-400/40 bg-sky-950/20" /> {t('seating.legendReserved')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-red-500/30 bg-red-950/30" /> {t('seating.legendOccupied')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-amber-400/40 bg-amber-950/20" /> {t('seating.legendOverdue')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-indigo-500/40" /> {t('seating.legendMerged')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-white/5 bg-slate-800/30" /> {t('seating.legendUnavailable')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-white bg-gradient-to-br from-[#ef4444] to-[#dc2626]" /> {t('seating.legendSelected')}
      </span>
    </div>
  );
}
