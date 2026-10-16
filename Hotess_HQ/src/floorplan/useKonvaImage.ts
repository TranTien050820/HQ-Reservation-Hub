import { useEffect, useState } from 'react';

/**
 * Tải ảnh cho Konva, dùng chung một HTMLImageElement theo URL (nhiều bàn cùng ảnh sofa chỉ tải một lần).
 * `crossOrigin = 'anonymous'`: ảnh khác origin mà thiếu header CORS sẽ làm canvas "bẩn" và không xuất được ảnh xem
 * trước — server trả `Access-Control-Allow-Origin: *` cho thư mục ảnh sơ đồ (docs §8.3 mục 5).
 */
const cache = new Map<string, { img: HTMLImageElement; ready: boolean; failed: boolean; waiters: Set<() => void> }>();

export function useKonvaImage(url: string | null | undefined): HTMLImageElement | undefined {
  const [, force] = useState(0);

  useEffect(() => {
    if (!url) return;
    let entry = cache.get(url);
    if (!entry) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      const created = { img, ready: false, failed: false, waiters: new Set<() => void>() };
      img.onload = () => { created.ready = true; created.waiters.forEach((w) => w()); };
      img.onerror = () => { created.failed = true; created.waiters.forEach((w) => w()); };
      img.src = url;
      cache.set(url, created);
      entry = created;
    }
    if (entry.ready || entry.failed) return;
    const notify = () => force((n) => n + 1);
    entry.waiters.add(notify);
    return () => { entry?.waiters.delete(notify); };
  }, [url]);

  if (!url) return undefined;
  const entry = cache.get(url);
  return entry?.ready ? entry.img : undefined;
}

/** Tải trước (vd. ảnh nền của khu mặc định khi đang ở màn check-in). */
export function preloadImage(url: string | null | undefined) {
  if (!url || cache.has(url)) return;
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  const entry = { img, ready: false, failed: false, waiters: new Set<() => void>() };
  img.onload = () => { entry.ready = true; entry.waiters.forEach((w) => w()); };
  img.onerror = () => { entry.failed = true; };
  img.src = url;
  cache.set(url, entry);
}
