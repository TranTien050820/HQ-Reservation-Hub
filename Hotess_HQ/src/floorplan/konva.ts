/**
 * Gói Konva TỐI GIẢN cho phần dùng chung (docs §8.3 mục 9, §9.5): lõi + đúng các shape cần vẽ — không kéo cả bản
 * đầy đủ (Transformer, filter…) vào chunk màn xem. Trình vẽ của HQ_FE_V2 tự import thêm `Transformer`.
 *
 * Phiên bản ghim: konva 10.7.1, react-konva 19.2.7 (react-konva khoá theo minor của React — React 19.2.x).
 */
import Konva from 'konva/lib/Core';
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Ellipse';
import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Text';
import 'konva/lib/shapes/Image';

export { Stage, Layer, Group, Rect, Ellipse, Line, Text, Image as KonvaImage, Shape } from 'react-konva/lib/ReactKonvaCore';

// Màn hình retina 3x nhân ba số điểm ảnh phải vẽ — giới hạn 2 (docs §9.4). Máy yếu có thể hạ tiếp về 1.
if (typeof window !== 'undefined') Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
