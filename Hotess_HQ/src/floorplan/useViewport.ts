import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { fitScale } from './geometry';
import type { FloorLayout } from './types';

/** Phần DÙNG CHUNG với Hotess_HQ — xem types.ts. Kích thước khung + thu phóng / di chuyển khung nhìn. */

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver: đổi kích thước Stage, KHÔNG tạo lại Stage (docs §9.4).
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;

export interface ViewportOptions {
  /**
   * Màn XEM: sơ đồ không bao giờ rời khung — không thu nhỏ hơn "vừa khung", chiều nào sơ đồ nhỏ hơn khung thì nằm giữa,
   * chiều nào lớn hơn thì mép sơ đồ không kéo vào trong quá `padding`. Trình vẽ để tự do (cần chỗ trống quanh canvas).
   */
  bounded?: boolean;
  /** Lề khi "vừa khung" (px màn hình). */
  padding?: number;
}

/** Trục: nội dung dài `size` px trong khung `frame` px — nhỏ hơn khung thì giữa, lớn hơn thì mép không vào quá `pad`. */
function clampAxis(pos: number, size: number, frame: number, pad: number) {
  if (size + pad * 2 <= frame) return (frame - size) / 2;
  return Math.min(pad, Math.max(frame - size - pad, pos));
}

/**
 * Zoom / pan = đổi `scale` / `position` của Stage, không tính lại toạ độ vật thể. Lần đầu (và khi đổi sơ đồ) tự "vừa
 * màn hình"; sau đó người dùng tự thu phóng. `bounded`: khung đổi cỡ khi đang "vừa khung" ⇒ vừa lại theo cỡ mới.
 */
export function useViewport(
  layout: FloorLayout | null | undefined,
  width: number,
  height: number,
  fitKey: unknown,
  { bounded = false, padding = 24 }: ViewportOptions = {},
) {
  const [view, setViewRaw] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const fitted = useRef<unknown>(Symbol('never'));
  /** Khung nhìn đang đúng "vừa khung" (chưa ai thu phóng / kéo) — đổi cỡ khung thì vừa lại thay vì giữ vị trí cũ. */
  const atFit = useRef(true);

  const minScale = useMemo(() => {
    if (!bounded || !layout || width <= 0 || height <= 0) return MIN_ZOOM;
    return fitScale(layout, width, height, padding);
  }, [bounded, layout, width, height, padding]);

  const clamp = useCallback((v: Viewport): Viewport => {
    if (!bounded || !layout || width <= 0 || height <= 0) return v;
    const scale = Math.min(Math.max(MAX_ZOOM, minScale), Math.max(minScale, v.scale));
    return {
      scale,
      x: clampAxis(v.x, layout.canvas.width * scale, width, padding),
      y: clampAxis(v.y, layout.canvas.height * scale, height, padding),
    };
  }, [bounded, layout, width, height, padding, minScale]);

  /** Mọi thay đổi khung nhìn từ ngoài (kéo xong, nút) đều qua `clamp`; ai gọi `setView` là người dùng đã tự chỉnh. */
  const setView = useCallback((next: Viewport | ((v: Viewport) => Viewport)) => {
    atFit.current = false;
    setViewRaw((v) => clamp(typeof next === 'function' ? next(v) : next));
  }, [clamp]);

  const fit = useCallback(() => {
    if (!layout || width <= 0 || height <= 0) return;
    const s = fitScale(layout, width, height, padding);
    atFit.current = true;
    setViewRaw({
      scale: s,
      x: (width - layout.canvas.width * s) / 2,
      y: (height - layout.canvas.height * s) / 2,
    });
  }, [layout, width, height, padding]);

  useEffect(() => {
    if (!layout || width <= 0 || height <= 0) return;
    if (fitted.current === fitKey) return;
    fitted.current = fitKey;
    fit();
  }, [layout, width, height, fitKey, fit]);

  // Khung đổi cỡ (mở / đóng panel, xoay tablet, đổi cỡ cửa sổ): đang vừa khung thì vừa lại, không thì kéo về trong khung.
  useEffect(() => {
    if (!bounded || !layout || width <= 0 || height <= 0) return;
    if (atFit.current) fit();
    else setViewRaw((v) => clamp(v));
  }, [bounded, layout, width, height, fit, clamp]);

  /** Thu phóng quanh một điểm trên màn hình (con trỏ / tâm khung). */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(bounded ? minScale : MIN_ZOOM, v.scale * factor));
      const cx = px ?? width / 2;
      const cy = py ?? height / 2;
      const wx = (cx - v.x) / v.scale;
      const wy = (cy - v.y) / v.scale;
      return { scale, x: cx - wx * scale, y: cy - wy * scale };
    });
  }, [setView, bounded, minScale, width, height]);

  /** Giới hạn ngay TRONG lúc kéo (Konva `dragBoundFunc` của Stage) — không đợi thả tay mới bật về. */
  const dragBound = useMemo(() => {
    if (!bounded) return undefined;
    return (pos: { x: number; y: number }) => {
      const v = clamp({ scale: view.scale, x: pos.x, y: pos.y });
      return { x: v.x, y: v.y };
    };
  }, [bounded, clamp, view.scale]);

  // Gộp sự kiện wheel theo requestAnimationFrame (docs §9.4).
  const pending = useRef<{ factor: number; x: number; y: number } | null>(null);
  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
    if (!p) return;
    const step = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    if (pending.current) {
      pending.current.factor *= step;
      pending.current.x = p.x;
      pending.current.y = p.y;
      return;
    }
    pending.current = { factor: step, x: p.x, y: p.y };
    requestAnimationFrame(() => {
      const q = pending.current;
      pending.current = null;
      if (q) zoomAt(q.factor, q.x, q.y);
    });
  }, [zoomAt]);

  /** Pinch 2 ngón trên tablet. */
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const onTouchMove = useCallback((e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) { pinch.current = null; return; }
    e.evt.preventDefault();
    const stage = e.target.getStage() as Konva.Stage | null;
    // Ngón thứ nhất đã kịp kéo khung nhìn: dừng kéo, kẻo vị trí kéo và vị trí thu phóng giành nhau (giật hình).
    if (stage?.isDragging()) stage.stopDrag();
    const rect = stage?.container().getBoundingClientRect();
    if (!rect) return;
    const [a, b] = [touches[0], touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const cx = (a.clientX + b.clientX) / 2 - rect.left;
    const cy = (a.clientY + b.clientY) / 2 - rect.top;
    if (pinch.current && pinch.current.dist > 0) zoomAt(dist / pinch.current.dist, cx, cy);
    pinch.current = { dist, cx, cy };
  }, [zoomAt]);
  const onTouchEnd = useCallback(() => { pinch.current = null; }, []);

  return { view, setView, fit, zoomAt, onWheel, onTouchMove, onTouchEnd, dragBound };
}
