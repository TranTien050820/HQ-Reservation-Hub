import { useTranslation } from 'react-i18next';
import type { SeatingView } from '../hooks/useFloorPlans';
import { FloorMapIcon, LayoutIcon } from './icons';

/** Cards or floor map for the open zone — shown only when the zone has a published floor plan. */
export function SeatingViewSwitch({ view, onChange }: { view: SeatingView; onChange: (view: SeatingView) => void }) {
  const { t } = useTranslation();
  const options = [
    { value: 'grid' as const, icon: LayoutIcon, label: t('floorMap.viewGrid') },
    { value: 'map' as const, icon: FloorMapIcon, label: t('floorMap.viewMap') },
  ];
  return (
    <div role="group" aria-label={t('floorMap.viewLabel')} className="flex items-center gap-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          aria-pressed={view === value}
          className={`chip-btn flex items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            view === value ? 'pill-on' : 'pill'
          }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
