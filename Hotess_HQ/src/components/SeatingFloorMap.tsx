import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFloorPlanLayout, type FloorPlanScope } from '../api/floorPlans';
import { FloorPlanView } from '../floorplan/FloorPlanView';
import type { FloorPublishedLayout, FloorPublishedZone, FloorTablePaint } from '../floorplan/types';
import type { TableSetup } from '../types';
import { TABLE_STATE_LABEL, type TableDescriptor } from '../utils/tablePicker';
import type { TableMapContext, TableState } from './TableGrid';
import { Spinner } from './Spinner';
import { AlertIcon, CloseIcon, ExpandIcon, InfoIcon, MinusIcon, PlusIcon, UsersIcon } from './icons';

type PaintKey = TableState | 'own' | 'selected';

/**
 * The floor itself is always light — the colour or photo the admin drew it on — whatever the
 * app's theme, so these are the light theme's hues (index.css `--ok-*`, `--cool-*` …) fixed
 * here rather than read from the live theme, whose dark values are pastel ink meant for a
 * dark card and vanish on a white floor.
 */
const PAINT: Record<PaintKey, FloorTablePaint> = {
  available: { fill: '#D1FAE5', stroke: '#059669', text: '#065F46' },
  upcoming: { fill: '#CFFAFE', stroke: '#0E7490', text: '#155E75' },
  reserved: { fill: '#E0F2FE', stroke: '#0369A1', text: '#075985' },
  occupied: { fill: '#FEE2E2', stroke: '#DC2626', text: '#991B1B' },
  overdue: { fill: '#FEF3C7', stroke: '#D97706', text: '#92400E' },
  posOpen: { fill: '#FAE8FF', stroke: '#A21CAF', text: '#86198F' },
  unavailable: { fill: '#F1F5F9', stroke: '#CBD5E1', text: '#94A3B8' },
  own: { fill: '#EDE9FE', stroke: '#6D28D9', text: '#5B21B6' },
  selected: { fill: '#EF4444', stroke: '#B91C1C', text: '#FFFFFF', emphasis: true },
};

/** Merged for a larger party: same colour, dashed outline — the cards show the merge icon instead. */
const MERGED_PAINT = Object.fromEntries(
  Object.entries(PAINT).map(([key, paint]) => [key, { ...paint, dash: [10, 6] }]),
) as Record<PaintKey, FloorTablePaint>;

/** Same precedence as the card classes in TableGrid: picked → held for this guest → too small → state. */
function paintKey(d: TableDescriptor): PaintKey {
  if (d.selected) return 'selected';
  if (d.isOwn) return 'own';
  if (d.disabledByFilter && !d.isUnavailableState) return 'unavailable';
  return d.state;
}

/**
 * Loaded once per published version: a new publish is a new key, so a plan can't go stale
 * here, and switching zones back and forth costs nothing. A failed load is dropped so the
 * next attempt really asks again.
 */
const layoutCache = new Map<string, Promise<FloorPublishedLayout>>();

function loadLayout(scope: FloorPlanScope, plan: FloorPublishedZone): Promise<FloorPublishedLayout> {
  const key = `${scope.siteId}:${scope.sNum}:${plan.statNum}:${plan.zoneID}:${plan.floorPlanId}:${plan.version}`;
  let pending = layoutCache.get(key);
  if (!pending) {
    pending = fetchFloorPlanLayout({ ...scope, statNum: plan.statNum }, plan.zoneID);
    layoutCache.set(key, pending);
    pending.catch(() => layoutCache.delete(key));
  }
  return pending;
}

function useLayout(scope: FloorPlanScope, plan: FloorPublishedZone) {
  const [layout, setLayout] = useState<FloorPublishedLayout | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadLayout(scope, plan).then(
      (loaded) => {
        if (!cancelled) setLayout(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // The plan's identity is its zone + published version: a new object with the same version
    // is not a reason to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.siteId, scope.sNum, plan.statNum, plan.zoneID, plan.floorPlanId, plan.version, attempt]);

  return { layout, failed, retry: () => setAttempt((n) => n + 1) };
}

export interface SeatingFloorMapProps {
  scope: FloorPlanScope;
  /** The open zone's published plan — one per zone, covering the tables of every section it is linked to. */
  plan: FloorPublishedZone;
  /** The zone's tables — the same list the card grid draws. */
  tables: TableSetup[];
  ctx: TableMapContext;
  onToggle: (table: TableSetup) => void;
  onViewBooking: (globalIds: number[]) => void;
}

/**
 * The seat picker drawn as the zone's floor plan (lazy-loaded: Konva only reaches the tablet
 * once someone opens a map). Which table may be picked, and how it reads, comes from the grid
 * through `ctx` — the two views of a zone can never disagree.
 */
export default function SeatingFloorMap({ scope, plan, tables, ctx, onToggle, onViewBooking }: SeatingFloorMapProps) {
  const { t } = useTranslation();
  const { layout: published, failed, retry } = useLayout(scope, plan);
  const tableByNum = useMemo(() => new Map(tables.map((tb) => [tb.tablenum, tb])), [tables]);
  const [focused, setFocused] = useState<number | null>(null);

  const onPlan = useMemo(() => {
    const nums = new Set<number>();
    for (const o of published?.layout.objects ?? []) {
      if (o.type === 'table' && o.tableNum != null && !o.hidden) nums.add(o.tableNum);
    }
    return nums;
  }, [published]);

  // Rebuilt every render (a few hundred entries at most). The paint objects themselves are the
  // constants above, so a table whose state did not change keeps the same props and its
  // memoised node is not redrawn.
  const paints = new Map<number, FloorTablePaint>();
  const subLabels = new Map<number, string>();
  const muted = new Set<number>();
  for (const num of onPlan) {
    const table = tableByNum.get(num);
    if (!table || !ctx.matchesFilter(table)) {
      muted.add(num);
      continue;
    }
    const d = ctx.describe(table);
    paints.set(num, (d.info?.merged ? MERGED_PAINT : PAINT)[paintKey(d)]);
    subLabels.set(
      num,
      d.state === 'upcoming' && d.info?.nextTime
        ? d.info.nextTime.slice(0, 5)
        : `${table.maxnumcust ?? table.minnumcust ?? 0} ${t('seating.seats')}`,
    );
  }

  const onTableClick = (num: number) => {
    setFocused(num);
    const table = tableByNum.get(num);
    if (!table || !ctx.matchesFilter(table)) return;
    if (!ctx.describe(table).disabled) onToggle(table);
  };

  // Zone tables the plan leaves out (added on the POS after publishing, or simply not drawn).
  const unplaced = published ? tables.filter((tb) => !onPlan.has(tb.tablenum)).map((tb) => `#${tb.tablenum}`) : [];

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col lg:min-h-[320px]">
      {unplaced.length > 0 && (
        <p className="note note-warn mb-2 flex shrink-0 items-start gap-1.5">
          <AlertIcon size={14} className="mt-px shrink-0" />
          <span>{t('floorMap.unplaced', { tables: unplaced.join(', ') })}</span>
        </p>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface">
        {published ? (
          <FloorPlanView
            className="absolute inset-0 overflow-hidden"
            layout={published.layout}
            paints={paints}
            subLabels={subLabels}
            mutedTables={muted}
            onTableClick={onTableClick}
            fitKey={`${plan.zoneID}:${plan.version}`}
            overlay={(api) => (
              <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                <MapButton label={t('floorMap.zoomIn')} onClick={api.zoomIn}><PlusIcon size={16} /></MapButton>
                <MapButton label={t('floorMap.zoomOut')} onClick={api.zoomOut}><MinusIcon size={16} /></MapButton>
                <MapButton label={t('floorMap.fit')} onClick={api.fit}><ExpandIcon size={16} /></MapButton>
              </div>
            )}
          />
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-muted">{t('floorMap.loadFailed')}</p>
            <button onClick={retry} className="chip-btn pill rounded-full px-4 text-xs font-medium">
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner label={t('common.loading')} />
          </div>
        )}
      </div>

      <FocusStrip
        focused={focused}
        table={focused != null ? tableByNum.get(focused) : undefined}
        ctx={ctx}
        onClose={() => setFocused(null)}
        onViewBooking={onViewBooking}
      />
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="chip-btn flex w-[38px] items-center justify-center rounded-lg border border-line bg-[var(--panel)] text-ink shadow-sm hover:bg-[var(--surface-hover)]"
    >
      {children}
    </button>
  );
}

/**
 * What the last-tapped table is and why — the map has no room for the cards' status line, and
 * a tap on a table that can't be picked otherwise looks like the screen ignoring her.
 */
function FocusStrip({
  focused,
  table,
  ctx,
  onClose,
  onViewBooking,
}: {
  focused: number | null;
  table: TableSetup | undefined;
  ctx: TableMapContext;
  onClose: () => void;
  onViewBooking: (globalIds: number[]) => void;
}) {
  const { t } = useTranslation();

  if (focused == null) {
    return (
      <p className="mt-1.5 flex min-h-[46px] shrink-0 items-center gap-1.5 text-xs text-muted">
        <InfoIcon size={13} className="shrink-0" />
        {t(ctx.readOnly ? 'floorMap.hintReadOnly' : 'floorMap.hint')}
      </p>
    );
  }

  const d = table ? ctx.describe(table) : null;
  const filteredOut = table != null && !ctx.matchesFilter(table);
  const paint = d && !filteredOut ? (d.info?.merged ? MERGED_PAINT : PAINT)[paintKey(d)] : PAINT.unavailable;
  const stateLabel = !table
    ? t('floorMap.notInZone')
    : filteredOut
      ? t('floorMap.filteredOut')
      : d!.selected
        ? t('seating.legendSelected')
        : d!.isOwn
          ? t('seating.ownTable')
          : d!.state === 'upcoming' && d!.info?.nextTime
            ? t('seating.upcomingAt', { time: d!.info.nextTime.slice(0, 5) })
            : d!.state === 'reserved' && d!.info?.pending
              ? t('seating.reservedPending')
              : d!.info?.advisory && t('seating.freeForThisSlot')
                ? `${t(TABLE_STATE_LABEL[d!.state])} ${t('seating.freeForThisSlot')}`
                : t(TABLE_STATE_LABEL[d!.state]);
  const tooSmall = d != null && !filteredOut && !ctx.readOnly && d.disabledByFilter && !d.isUnavailableState;
  const bookings = d?.info?.globalIds ?? [];
  // Same line as the card's (YC1): the map has no room for it on the table itself.
  const charge = table ? ctx.chargeLabel(table) : null;

  return (
    <div className="mt-1.5 flex min-h-[46px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-3 py-1 text-sm">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <span
          className="h-3 w-3 shrink-0 rounded-[3px] border-2"
          style={{ background: paint.fill, borderColor: paint.stroke, borderStyle: paint.dash ? 'dashed' : 'solid' }}
        />
        #{focused}
      </span>
      {table && (
        <span className="flex items-center gap-1 text-xs text-muted">
          <UsersIcon size={13} />
          {table.maxnumcust ?? table.minnumcust ?? 0} {t('seating.seats')}
        </span>
      )}
      <span className="text-xs font-medium text-ink">{stateLabel}</span>
      {charge && <span className="text-xs text-muted">{charge}</span>}
      {d?.info?.merged && d.info.mergedWith?.length ? (
        <span className="text-xs text-merge">
          {t('seating.legendMerged')} #{d.info.mergedWith.join(', #')}
        </span>
      ) : null}
      {tooSmall && <span className="text-xs text-muted">{t('floorMap.tooSmall', { count: ctx.partySize })}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        {bookings.length > 0 && (
          <button
            onClick={() => onViewBooking(bookings)}
            className="chip-btn pill rounded-full px-3 text-xs font-medium"
          >
            {t('seating.viewBooking')}
            {bookings.length > 1 ? ` (${bookings.length})` : ''}
          </button>
        )}
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          className="chip-btn flex w-[38px] items-center justify-center rounded-full text-muted hover:text-ink"
        >
          <CloseIcon size={16} />
        </button>
      </span>
    </div>
  );
}
