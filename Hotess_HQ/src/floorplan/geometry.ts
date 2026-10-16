import type { FloorLayout, FloorObject, FloorTableStatus } from './types';

/** Phần DÙNG CHUNG với Hotess_HQ — xem types.ts. */

export const FLOOR_SCHEMA_VERSION = 1;
export const MIN_OBJECT_SIZE = 20;
export const DEFAULT_GRID = 25;

/** Độ theo chiều kim đồng hồ, về [0, 360), làm tròn 0,1° — giống server. */
export function normalizeRotation(deg: number | null | undefined): number {
  if (deg == null || !Number.isFinite(deg)) return 0;
  const r = Math.round((((deg % 360) + 360) % 360) * 10) / 10;
  return r >= 360 ? 0 : r;
}

/** Kích thước mặc định (cm) của bàn theo số khách tối đa — giống server (FloorPlanAdminUseCase.DefaultSize). */
export function defaultTableSize(maxCovers: number | null | undefined): { w: number; h: number; shape: 'rect' | 'ellipse' } {
  if (maxCovers == null || maxCovers <= 2) return { w: 70, h: 70, shape: 'rect' };
  if (maxCovers <= 4) return { w: 120, h: 80, shape: 'rect' };
  if (maxCovers <= 6) return { w: 180, h: 90, shape: 'rect' };
  return { w: 160, h: 160, shape: 'ellipse' };
}

/** Thứ tự vẽ: `z` tăng dần, cùng `z` thì theo thứ tự trong mảng. */
export function sortByZ(objects: FloorObject[]): FloorObject[] {
  return objects
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.z ?? 0) - (b.o.z ?? 0) || a.i - b.i)
    .map((x) => x.o);
}

export function isTable(o: FloorObject): boolean {
  return o.type === 'table';
}

/** Hình chữ nhật bao (không xoay) của vật thể trong toạ độ canvas. */
export function objectBounds(o: FloorObject): { x1: number; y1: number; x2: number; y2: number } | null {
  if (o.type === 'line' || o.type === 'polygon') {
    const pts = o.points ?? [];
    if (pts.length < 2) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      x1 = Math.min(x1, pts[i]); x2 = Math.max(x2, pts[i]);
      y1 = Math.min(y1, pts[i + 1]); y2 = Math.max(y2, pts[i + 1]);
    }
    return { x1, y1, x2, y2 };
  }
  if (o.x == null || o.y == null) return null;
  const w = o.w ?? 40, h = o.h ?? 40;
  const rad = ((o.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const hw = (w * cos + h * sin) / 2, hh = (w * sin + h * cos) / 2;
  return { x1: o.x - hw, y1: o.y - hh, x2: o.x + hw, y2: o.y + hh };
}

/** Tỉ lệ để cả canvas lọt khung (chừa lề). */
export function fitScale(layout: FloorLayout, width: number, height: number, padding = 24): number {
  const cw = Math.max(1, layout.canvas.width), ch = Math.max(1, layout.canvas.height);
  return Math.max(0.01, Math.min((width - padding * 2) / cw, (height - padding * 2) / ch));
}

/** Cỡ ảnh nên tải: cạnh hiển thị thật × devicePixelRatio (tối đa 2) — docs §9.3. */
export function pickImageUrl(
  ref: { url?: string | null; variants?: Record<string, string> | null } | null | undefined,
  displayedPx: number,
): string | null {
  if (!ref?.url) return null;
  const need = displayedPx * Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const sizes = Object.entries(ref.variants ?? {})
    .map(([k, v]) => ({ size: Number(k), url: v }))
    .filter((v) => Number.isFinite(v.size) && v.url)
    .sort((a, b) => a.size - b.size);
  const fit = sizes.find((s) => s.size >= need);
  return fit?.url ?? ref.url;
}

/** Màu theo trạng thái — luôn đi kèm chú giải / chữ (không chỉ dựa vào màu). */
export const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  AVAILABLE: { fill: '#DCFCE7', stroke: '#16A34A', text: '#14532D' },
  RESERVED: { fill: '#EDE9FE', stroke: '#7C3AED', text: '#4C1D95' },
  OCCUPIED: { fill: '#FEE2E2', stroke: '#DC2626', text: '#7F1D1D' },
  UNKNOWN: { fill: '#F1F5F9', stroke: '#94A3B8', text: '#334155' },
};

export const LATE_STROKE = '#F59E0B';
export const NEUTRAL_TABLE = { fill: '#FFFFFF', stroke: '#9A8F80', text: '#3F3A33' };
/** Bàn không chọn được / không còn trên POS. */
export const MUTED_TABLE = { fill: '#F1F5F9', stroke: '#CBD5E1', text: '#94A3B8' };

export function statusColors(status: FloorTableStatus | null | undefined) {
  if (!status) return null;
  return STATUS_COLORS[status.status] ?? STATUS_COLORS.UNKNOWN;
}

export interface ChairSpot {
  x: number;
  y: number;
  /** Độ, chiều kim đồng hồ: ghế "nhìn" vào bàn. */
  angle: number;
}

/** Cạnh ghế (cm) theo cỡ bàn — ghế thật khoảng 45 cm, bàn nhỏ thì thu lại cho cân. */
export function chairSize(w: number, h: number): number {
  return Math.max(18, Math.min(45, Math.min(w, h) * 0.4));
}

/**
 * F7 — chỗ đặt ghế quanh một bàn, toạ độ CỤC BỘ của bàn (tâm bàn là gốc, chưa xoay). Bàn tròn / elip: chia đều theo góc.
 * Bàn chữ nhật: xếp hai cạnh dài trước (xen kẽ trên / dưới), đầy mới sang hai đầu bàn; mỗi cạnh dàn đều.
 */
export function chairSpots(shape: string | null | undefined, w: number, h: number, seats: number): ChairSpot[] {
  const n = Math.max(0, Math.min(24, Math.floor(seats)));
  if (n === 0) return [];
  const c = chairSize(w, h);
  const d = c * 0.2 + c * 0.4;   // khe hở + nửa chiều sâu ghế

  if (shape === 'ellipse') {
    const rx = w / 2 + d, ry = h / 2 + d;
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: rx * Math.cos(a), y: ry * Math.sin(a), angle: (a * 180) / Math.PI + 90 };
    });
  }

  const horizontal = w >= h;   // cạnh dài nằm ngang?
  const longLen = horizontal ? w : h, shortLen = horizontal ? h : w;
  const cap = (len: number) => Math.max(1, Math.floor(len / (c * 1.2)));
  const counts = [0, 0, 0, 0];   // dài 1, dài 2, ngắn 1, ngắn 2
  let left = n;
  for (let i = 0; left > 0 && i < 2 * cap(longLen); i++, left--) counts[i % 2]++;
  for (let i = 0; left > 0 && i < 2 * cap(shortLen); i++, left--) counts[2 + (i % 2)]++;
  for (let i = 0; left > 0; i++, left--) counts[i % 2]++;   // quá chỗ: dồn tiếp lên cạnh dài

  const along = (k: number, len: number, i: number) => (len * (i + 0.5)) / k - len / 2;
  const spots: ChairSpot[] = [];
  const push = (count: number, len: number, place: (t: number) => ChairSpot) => {
    for (let i = 0; i < count; i++) spots.push(place(along(count, len, i)));
  };
  if (horizontal) {
    push(counts[0], w, (t) => ({ x: t, y: -h / 2 - d, angle: 0 }));
    push(counts[1], w, (t) => ({ x: t, y: h / 2 + d, angle: 180 }));
    push(counts[2], h, (t) => ({ x: -w / 2 - d, y: t, angle: 270 }));
    push(counts[3], h, (t) => ({ x: w / 2 + d, y: t, angle: 90 }));
  } else {
    push(counts[0], h, (t) => ({ x: -w / 2 - d, y: t, angle: 270 }));
    push(counts[1], h, (t) => ({ x: w / 2 + d, y: t, angle: 90 }));
    push(counts[2], w, (t) => ({ x: t, y: -h / 2 - d, angle: 0 }));
    push(counts[3], w, (t) => ({ x: t, y: h / 2 + d, angle: 180 }));
  }
  return spots;
}

/** Cỡ chữ nhãn bàn theo kích thước bàn (cm). */
export function tableLabelSize(w: number, h: number): number {
  return Math.max(14, Math.min(48, Math.min(w, h) * 0.35));
}

let idSeq = 0;
/** id vật thể: chữ cái + số, '-' / '_' (server kiểm `^[A-Za-z0-9_-]{1,40}$`). */
export function newObjectId(prefix: string): string {
  idSeq = (idSeq + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}${idSeq.toString(36)}`.slice(0, 40);
}
