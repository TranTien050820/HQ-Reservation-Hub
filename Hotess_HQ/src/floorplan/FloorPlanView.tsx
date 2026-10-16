import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type Konva from 'konva';
import { Layer, Stage } from './konva';
import { FloorBackgroundNode, FloorObjectNode } from './FloorPlanNodes';
import { sortByZ } from './geometry';
import { useElementSize, useViewport } from './useViewport';
import type { FloorLayout, FloorTablePaint, FloorTableStatus } from './types';

/** Điều khiển khung nhìn cho lớp `overlay` (nút của app). */
export interface FloorViewApi {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

/**
 * Phần DÙNG CHUNG với Hotess_HQ — xem types.ts.
 *
 * Màn XEM sơ đồ đã phát hành, tô màu bàn theo trạng thái. Ba layer (docs §9.4): L0 nền và L1 vật thể tĩnh KHÔNG nhận sự
 * kiện; L2 bàn nhận chạm. Đổi trạng thái chỉ đổi `fill` của đúng bàn đó (mỗi bàn là một component `memo`).
 */
export interface FloorPlanViewProps {
  layout: FloorLayout;
  /** Trạng thái theo số bàn; thiếu ⇒ vẽ bàn trung tính (vd. xem thử ở trình vẽ). */
  statuses?: ReadonlyMap<number, FloorTableStatus> | null;
  /** Màu do app tự quyết theo số bàn — thắng `statuses` (Hotess tô theo trạng thái của chính lưới bàn). */
  paints?: ReadonlyMap<number, FloorTablePaint> | null;
  /** Dòng chữ nhỏ dưới số bàn, theo số bàn. */
  subLabels?: ReadonlyMap<number, string> | null;
  /** Bàn không còn trên POS / không chọn được — vẽ xám. */
  mutedTables?: ReadonlySet<number> | null;
  selectedTables?: ReadonlySet<number> | null;
  stale?: boolean;
  /** Bấm / chạm một bàn (click / tap — không bắn sau khi kéo khung nhìn). */
  onTableClick?: (tableNum: number) => void;
  className?: string;
  /** Đổi giá trị ⇒ tự "vừa màn hình" lại (vd. đổi khu). */
  fitKey?: unknown;
  stageRef?: RefObject<Konva.Stage | null>;
  /** Lớp HTML đè lên sơ đồ (vd. nút phóng to / thu nhỏ / vừa màn hình) — app tự vẽ theo giao diện của mình. */
  overlay?: (api: FloorViewApi) => ReactNode;
}

function setCursor(stage: Konva.Stage | null, cursor: string) {
  if (stage) stage.container().style.cursor = cursor;
}

export function FloorPlanView({
  layout, statuses, paints, subLabels, mutedTables, selectedTables, stale, onTableClick, className, fitKey, stageRef, overlay,
}: FloorPlanViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(boxRef);
  const { view, setView, fit, zoomAt, onWheel, onTouchMove, onTouchEnd } = useViewport(layout, width, height, fitKey ?? layout.floorPlanId);
  const api = useMemo<FloorViewApi>(() => ({ zoomIn: () => zoomAt(1.25), zoomOut: () => zoomAt(1 / 1.25), fit }), [zoomAt, fit]);

  const { statics, tables, tableNumById } = useMemo(() => {
    const sorted = sortByZ(layout.objects.filter((o) => !o.hidden));
    const tableObjects = sorted.filter((o) => o.type === 'table');
    return {
      statics: sorted.filter((o) => o.type !== 'table'),
      tables: tableObjects,
      tableNumById: new Map(tableObjects.filter((o) => o.tableNum != null).map((o) => [o.id, o.tableNum!])),
    };
  }, [layout]);

  // Một hàm ổn định cho mọi bàn (giữ `memo` của từng bàn) — bàn nào được bấm thì tra theo id.
  const clickRef = useRef(onTableClick);
  useEffect(() => { clickRef.current = onTableClick; }, [onTableClick]);
  const activate = useCallback((id: string) => {
    const n = tableNumById.get(id);
    if (n != null) clickRef.current?.(n);
  }, [tableNumById]);

  return (
    <div ref={boxRef} className={className ?? 'relative h-full w-full overflow-hidden'} style={{ touchAction: 'none' }}>
      {width > 0 && height > 0 && (
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          draggable
          // Ngón tay luôn xê dịch vài px khi chạm: chưa quá 6 px thì vẫn là chạm (chọn bàn), chưa phải kéo khung nhìn.
          dragDistance={6}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Layer listening={false}>
            <FloorBackgroundNode
              canvas={layout.canvas}
              background={layout.backgroundImage?.editorOnly ? null : layout.backgroundImage}
              scale={view.scale}
            />
            {statics.map((o) => (
              <FloorObjectNode key={o.id} object={o} scale={view.scale} listening={false} />
            ))}
          </Layer>
          <Layer
            onMouseOver={onTableClick ? (e) => setCursor(e.target.getStage(), 'pointer') : undefined}
            onMouseOut={onTableClick ? (e) => setCursor(e.target.getStage(), '') : undefined}
          >
            {tables.map((o) => (
              <FloorObjectNode
                key={o.id}
                object={o}
                scale={view.scale}
                status={o.tableNum != null ? statuses?.get(o.tableNum) ?? null : null}
                paint={o.tableNum != null ? paints?.get(o.tableNum) ?? null : null}
                subLabel={o.tableNum != null ? subLabels?.get(o.tableNum) ?? null : null}
                stale={stale}
                muted={o.tableNum != null && (mutedTables?.has(o.tableNum) ?? false)}
                selected={o.tableNum != null && (selectedTables?.has(o.tableNum) ?? false)}
                chairs={layout.canvas.chairs === true}
                onActivate={onTableClick && o.tableNum != null ? activate : undefined}
              />
            ))}
          </Layer>
        </Stage>
      )}
      {overlay?.(api)}
    </div>
  );
}
