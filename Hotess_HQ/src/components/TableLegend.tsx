import { useTranslation } from 'react-i18next';
import { MergeIcon } from './icons';

/**
 * Swatches reuse the grid's own `.tbl-*` classes rather than restating their
 * colours, so a legend entry can never drift from the tables it explains.
 */
const ENTRIES = [
  { cls: 'tbl-available', label: 'seating.legendAvailable' },
  { cls: 'tbl-upcoming', label: 'seating.legendUpcoming' },
  { cls: 'tbl-reserved', label: 'seating.legendReserved' },
  { cls: 'tbl-occupied', label: 'seating.legendOccupied' },
  { cls: 'tbl-overdue', label: 'seating.legendOverdue' },
  { cls: 'tbl-posOpen', label: 'seating.legendPosOpen' },
  { cls: 'tbl-own', label: 'seating.ownTable' },
  { cls: 'tbl-unavailable', label: 'seating.legendUnavailable' },
  { cls: 'tbl-selected', label: 'seating.legendSelected' },
] as const;

export function TableLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-4 text-muted">
      {ENTRIES.map((entry) => (
        <span key={entry.label} className="flex items-center gap-1">
          <span className={`${entry.cls} h-2.5 w-2.5 shrink-0 rounded-[3px] border`} />
          {t(entry.label)}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <MergeIcon size={13} className="text-merge" />
        {t('seating.legendMerged')}
      </span>
    </div>
  );
}
