import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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

/**
 * Zoom / pan = đổi `scale` / `position` của Stage, không tính lại toạ độ vật thể. Lần đầu (và khi đổi sơ đồ) tự "vừa
 * màn hình"; sau đó người dùng tự thu phóng.
 */
export function useViewport(layout: FloorLayout | null | undefined, width: number, height: number, fitKey: unknown) {
  const [view, setView] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const fitted = useRef<unknown>(Symbol('never'));

  const fit = useCallback(() => {
    if (!layout || width <= 0 || height <= 0) return;
    const s = fitScale(layout, width, height);
    setView({
      scale: s,
      x: (width - layout.canvas.width * s) / 2,
      y: (height - layout.canvas.height * s) / 2,
    });
  }, [layout, width, height]);

  useEffect(() => {
    if (!layout || width <= 0 || height <= 0) return;
    if (fitted.current === fitKey) return;
    fitted.current = fitKey;
    fit();
  }, [layout, width, height, fitKey, fit]);

  /** Thu phóng quanh một điểm trên màn hình (con trỏ / tâm khung). */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
      const cx = px ?? width / 2;
      const cy = py ?? height / 2;
      const wx = (cx - v.x) / v.scale;
      const wy = (cy - v.y) / v.scale;
      return { scale, x: cx - wx * scale, y: cy - wy * scale };
    });
  }, [width, height]);

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

  return { view, setView, fit, zoomAt, onWheel, onTouchMove, onTouchEnd };
}
