import { memo, type ReactNode } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Ellipse, Group, KonvaImage, Line, Rect, Shape, Text } from './konva';
import { LATE_STROKE, MUTED_TABLE, NEUTRAL_TABLE, chairSize, chairSpots, pickImageUrl, statusColors, tableLabelSize } from './geometry';
import { useKonvaImage } from './useKonvaImage';
import type { FloorBackground, FloorCanvas, FloorObject, FloorTablePaint, FloorTableStatus } from './types';

/** Phần DÙNG CHUNG với Hotess_HQ — xem types.ts. Cách vẽ từng vật thể; trình vẽ và màn xem dùng chung. */

type KEvent = KonvaEventObject<MouseEvent | TouchEvent | DragEvent | Event>;

export interface FloorObjectHandlers {
  /** Nhấn chuột / chạm — trình vẽ chọn vật thể ngay lúc nhấn để kéo luôn trong cùng một thao tác. */
  onSelect?: (id: string, e: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /**
   * Bấm / chạm XONG (click / tap) — màn xem. Konva không bắn click / tap sau một lần kéo, nên kéo khung nhìn bắt đầu trên
   * một bàn không vô tình chọn bàn đó.
   */
  onActivate?: (id: string) => void;
  onDragStart?: (id: string, e: KEvent) => void;
  onDragMove?: (id: string, e: KEvent) => void;
  onDragEnd?: (id: string, e: KEvent) => void;
  onTransformEnd?: (id: string, e: KEvent) => void;
}

export interface FloorObjectNodeProps extends FloorObjectHandlers {
  object: FloorObject;
  /** Tỉ lệ đang hiển thị (px / cm) — để chọn cỡ ảnh. */
  scale: number;
  draggable?: boolean;
  listening?: boolean;
  status?: FloorTableStatus | null;
  /** Dữ liệu trạng thái cũ (mất kết nối) — làm mờ màu. */
  stale?: boolean;
  selected?: boolean;
  /** Bàn mồ côi (không còn trên POS) / không chọn được — vẽ xám. */
  muted?: boolean;
  /** Nhãn thay thế (vd. tên bàn) — mặc định `label` của vật thể. */
  labelOverride?: string | null;
  /** Màu do app quyết — thắng `status` và `muted`. */
  paint?: FloorTablePaint | null;
  /** Dòng chữ nhỏ dưới nhãn bàn (vd. giờ khách tới, số chỗ). */
  subLabel?: string | null;
  /** F7 — vẽ ghế quanh bàn theo `seats` (bố cục bật `canvas.chairs`). */
  chairs?: boolean;
}

function handlers(id: string, p: FloorObjectHandlers) {
  return {
    onMouseDown: p.onSelect ? (e: KonvaEventObject<MouseEvent>) => p.onSelect!(id, e) : undefined,
    onTap: p.onSelect || p.onActivate
      ? (e: KonvaEventObject<TouchEvent>) => { p.onSelect?.(id, e); p.onActivate?.(id); }
      : undefined,
    onClick: p.onActivate ? (e: KonvaEventObject<MouseEvent>) => { if (e.evt.button === 0) p.onActivate!(id); } : undefined,
    onDragStart: p.onDragStart ? (e: KEvent) => p.onDragStart!(id, e) : undefined,
    onDragMove: p.onDragMove ? (e: KEvent) => p.onDragMove!(id, e) : undefined,
    onDragEnd: p.onDragEnd ? (e: KEvent) => p.onDragEnd!(id, e) : undefined,
    onTransformEnd: p.onTransformEnd ? (e: KEvent) => p.onTransformEnd!(id, e) : undefined,
  };
}

/**
 * Ghế quanh bàn: MỘT shape vẽ mọi ghế (không phải một node mỗi ghế) — sơ đồ vài trăm bàn vẫn nhẹ. Không nhận sự kiện.
 */
function TableChairs({ shape, w, h, seats }: { shape?: string | null; w: number; h: number; seats: number }) {
  const spots = chairSpots(shape, w, h, seats);
  if (spots.length === 0) return null;
  const c = chairSize(w, h);
  const depth = c * 0.8, r = c * 0.22;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      fill="#F5F5F4"
      stroke="#A8A29E"
      strokeWidth={Math.max(1, c * 0.06)}
      sceneFunc={(ctx, node) => {
        ctx.beginPath();
        for (const s of spots) {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate((s.angle * Math.PI) / 180);
          const x = -c / 2, y = -depth / 2;
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + c, y, x + c, y + depth, r);
          ctx.arcTo(x + c, y + depth, x, y + depth, r);
          ctx.arcTo(x, y + depth, x, y, r);
          ctx.arcTo(x, y, x + c, y, r);
          ctx.closePath();
          ctx.restore();
        }
        ctx.fillStrokeShape(node);
      }}
    />
  );
}

function ObjectImage({ src, w, h, scale, opacity }: {
  src: FloorObject['image']; w: number; h: number; scale: number; opacity?: number | null;
}) {
  const img = useKonvaImage(pickImageUrl(src, Math.max(w, h) * scale));
  if (!img) {
    // Khung giữ chỗ trong lúc ảnh tải — bố cục không xô lệch (layout có sẵn w / h).
    return <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#E2E8F0" opacity={0.6} listening={false} perfectDrawEnabled={false} />;
  }
  return <KonvaImage image={img} x={-w / 2} y={-h / 2} width={w} height={h} opacity={opacity ?? 1} perfectDrawEnabled={false} />;
}

export const FloorObjectNode = memo(function FloorObjectNode(props: FloorObjectNodeProps) {
  const { object: o, scale, draggable = false, listening = true, status, stale, selected, muted, labelOverride, paint, subLabel, chairs } = props;
  const style = o.style ?? {};
  const ev = handlers(o.id, props);

  if (o.type === 'line' || o.type === 'polygon') {
    return (
      <Line
        id={o.id}
        name="fp-object"
        points={o.points ?? []}
        closed={o.type === 'polygon'}
        stroke={style.stroke ?? (o.type === 'line' ? '#5B5348' : undefined)}
        strokeWidth={style.strokeWidth ?? (o.type === 'line' ? 12 : 0)}
        fill={o.type === 'polygon' ? style.fill ?? '#E7E5E4' : undefined}
        opacity={style.opacity ?? 1}
        lineCap="round"
        lineJoin="round"
        draggable={draggable}
        listening={listening}
        hitStrokeWidth={Math.max(12, (style.strokeWidth ?? 0) + 8)}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        {...ev}
      />
    );
  }

  const w = o.w ?? 40;
  const h = o.h ?? 40;
  const isTable = o.type === 'table';
  // Màu bàn, theo thứ tự ưu tiên: app tự tô (`paint`) → bàn xám (`muted`) → theo trạng thái → màu trung tính / của vật thể.
  const colors = isTable ? paint ?? (muted ? MUTED_TABLE : statusColors(status)) : null;
  const tableColors = colors ?? NEUTRAL_TABLE;
  const fill = isTable ? (colors ? colors.fill : style.fill ?? NEUTRAL_TABLE.fill) : style.fill ?? '#D6D3D1';
  let stroke = isTable ? (colors ? colors.stroke : style.stroke ?? NEUTRAL_TABLE.stroke) : style.stroke ?? undefined;
  const late = isTable && !paint && !muted && status?.late === true;
  if (late) stroke = LATE_STROKE;
  const dash = paint ? paint.dash ?? undefined : late ? [12, 6] : undefined;
  const strokeWidth = selected || paint?.emphasis
    ? Math.max(4, (style.strokeWidth ?? 3) * 1.6)
    : (style.strokeWidth ?? (isTable ? 3 : 0));
  const label = labelOverride ?? o.label ?? (isTable && o.tableNum ? String(o.tableNum) : null);
  const statusOpacity = stale && colors && !muted ? 0.45 : 1;

  let body: ReactNode;
  switch (o.type) {
    case 'table':
      body = o.shape === 'image' ? (
        <>
          <ObjectImage src={o.image} w={w} h={h} scale={scale} />
          {/* Bàn dùng ảnh: trạng thái hiện bằng viền (không dùng filter tô màu ảnh — docs §9.3). */}
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} stroke={stroke} strokeWidth={strokeWidth + 2}
            cornerRadius={8} opacity={statusOpacity} dash={dash} perfectDrawEnabled={false} />
        </>
      ) : o.shape === 'ellipse' ? (
        <Ellipse radiusX={w / 2} radiusY={h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
          opacity={statusOpacity} dash={dash} perfectDrawEnabled={false} shadowForStrokeEnabled={false} />
      ) : (
        <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
          cornerRadius={style.cornerRadius ?? 8} opacity={statusOpacity} dash={dash}
          perfectDrawEnabled={false} shadowForStrokeEnabled={false} />
      );
      break;
    case 'ellipse':
      body = <Ellipse radiusX={w / 2} radiusY={h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
        opacity={style.opacity ?? 1} perfectDrawEnabled={false} shadowForStrokeEnabled={false} />;
      break;
    case 'image':
      body = (
        <>
          <ObjectImage src={o.image} w={w} h={h} scale={scale} opacity={style.opacity} />
          {selected && <Rect x={-w / 2} y={-h / 2} width={w} height={h} stroke="#2563EB" strokeWidth={2 / scale} listening={false} />}
        </>
      );
      break;
    case 'text': {
      const fontSize = style.fontSize ?? 36;
      const textWidth = Math.max(w, (o.text ?? '').length * fontSize * 0.62);
      body = (
        <Text text={o.text ?? ''} fontSize={fontSize} fill={style.fill ?? '#333333'} width={textWidth} align="center"
          x={-textWidth / 2} y={-fontSize / 2} opacity={style.opacity ?? 1} fontStyle={selected ? 'bold' : 'normal'}
          perfectDrawEnabled={false} />
      );
      break;
    }
    default:
      body = <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
        cornerRadius={style.cornerRadius ?? 0} opacity={style.opacity ?? 1} perfectDrawEnabled={false} shadowForStrokeEnabled={false} />;
  }

  const showLabel = !!label && (isTable || o.type === 'rect' || o.type === 'ellipse');
  const showSub = isTable && !!subLabel;
  const baseSize = isTable ? tableLabelSize(w, h) : Math.max(12, Math.min(40, Math.min(w, h) * 0.3));
  const fontSize = showSub ? baseSize * 0.85 : baseSize;
  const subSize = Math.max(10, baseSize * 0.5);
  const textWidth = w * 1.6;

  return (
    <Group
      id={o.id}
      name="fp-object"
      x={o.x ?? 0}
      y={o.y ?? 0}
      rotation={o.rotation ?? 0}
      draggable={draggable}
      listening={listening}
      {...ev}
    >
      {chairs && isTable && o.shape !== 'image' && (o.seats ?? 0) > 0 && (
        <TableChairs shape={o.shape} w={w} h={h} seats={o.seats ?? 0} />
      )}
      {body}
      {(showLabel || showSub) && (
        // Nhãn KHÔNG xoay theo bàn (dễ đọc): xoay ngược góc của nhóm.
        <Group rotation={-(o.rotation ?? 0)} listening={false}>
          {showLabel && (
            <Text text={label!} fontSize={fontSize} fontStyle="bold" fill={isTable ? tableColors.text : '#3F3A33'}
              width={textWidth} align="center" verticalAlign="middle" height={fontSize * 1.3}
              offsetX={textWidth / 2} offsetY={(fontSize * 1.3) / 2} y={showSub ? -subSize * 0.6 : 0}
              perfectDrawEnabled={false} />
          )}
          {showSub && (
            <Text text={subLabel!} fontSize={subSize} fill={tableColors.text} opacity={0.85}
              width={textWidth} align="center" verticalAlign="middle" height={subSize * 1.3}
              offsetX={textWidth / 2} offsetY={(subSize * 1.3) / 2} y={showLabel ? fontSize * 0.6 : 0}
              perfectDrawEnabled={false} />
          )}
        </Group>
      )}
    </Group>
  );
});

/** L0 — màu nền + ảnh nền (không nhận sự kiện). */
export function FloorBackgroundNode({ canvas, background, scale, showImage = true }: {
  canvas: FloorCanvas; background?: FloorBackground | null; scale: number; showImage?: boolean;
}) {
  const img = useKonvaImage(showImage && background ? pickImageUrl(background, Math.max(background.w, background.h) * scale) : null);
  return (
    <>
      <Rect name="fp-canvas" x={0} y={0} width={canvas.width} height={canvas.height} fill={canvas.background ?? '#FFFFFF'}
        stroke="#CBD5E1" strokeWidth={1 / Math.max(scale, 0.01)} perfectDrawEnabled={false} />
      {background && img && (
        <KonvaImage
          id="fp-background"
          image={img}
          x={background.x}
          y={background.y}
          width={background.w}
          height={background.h}
          offsetX={background.w / 2}
          offsetY={background.h / 2}
          rotation={background.rotation ?? 0}
          opacity={background.opacity ?? 1}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </>
  );
}

/** Lưới của trình vẽ — MỘT shape vẽ mọi đường (nhẹ hơn hàng trăm node Line). */
export function FloorGridNode({ canvas, grid, scale }: { canvas: FloorCanvas; grid: number; scale: number }) {
  // Ô lưới nhỏ hơn 6 px trên màn hình thì gộp 4 ô một — vẽ dày quá vừa chậm vừa không nhìn rõ.
  let step = Math.max(1, grid);
  while (step * scale < 6) step *= 4;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        ctx.beginPath();
        for (let x = step; x < canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
        for (let y = step; y < canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
        ctx.strokeStyle = 'rgba(100,116,139,0.18)';
        ctx.lineWidth = 1 / Math.max(scale, 0.01);
        ctx.stroke();
      }}
    />
  );
}
