/**
 * Sơ đồ bàn — kiểu dữ liệu khớp đúng JSON của API (HQ-WebOffice-API docs/RESERVATION_FLOOR_PLAN_DESIGN.md §5.3, §7).
 *
 * Thư mục `floorplan/` là phần DÙNG CHUNG (kiểu, hình học, cách vẽ, màn xem): Hotess_HQ chép nguyên thư mục này (quyết định
 * Q9) — đừng import gì ngoài React / Konva / chính thư mục này vào đây.
 *
 * Hệ toạ độ: cm, gốc góc trên trái, trục y xuống dưới; vật thể có `x, y` là TÂM, `w, h` trước khi xoay, `rotation` độ theo
 * chiều kim đồng hồ quanh tâm; đường / đa giác dùng `points` tuyệt đối.
 */

export type FloorObjectType = 'table' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'image' | 'text';
export type FloorTableShape = 'rect' | 'ellipse' | 'image';

export interface FloorImageRef {
  assetId?: number | null;
  url?: string | null;
  variants?: Record<string, string> | null;
  width?: number | null;
  height?: number | null;
}

export interface FloorStyle {
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number | null;
  cornerRadius?: number | null;
  opacity?: number | null;
  fontSize?: number | null;
}

export interface FloorObject {
  id: string;
  type: FloorObjectType;
  tableNum?: number | null;
  label?: string | null;
  shape?: FloorTableShape | null;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  rotation?: number | null;
  z?: number | null;
  seats?: number | null;
  points?: number[] | null;
  text?: string | null;
  style?: FloorStyle | null;
  image?: FloorImageRef | null;
  // Chỉ trình vẽ dùng — không có trong bản phát hành.
  locked?: boolean | null;
  hidden?: boolean | null;
  name?: string | null;
  /** F31 — vật thể cùng nhóm được chọn và kéo cùng nhau. */
  groupId?: string | null;
}

export interface FloorCanvas {
  width: number;
  height: number;
  unit?: string | null;
  background?: string | null;
  gridSize?: number | null;
  /** F7 — vẽ ghế quanh bàn theo `seats` (gợi ý hiển thị, không phải vật thể). */
  chairs?: boolean | null;
}

export interface FloorBackground {
  assetId?: number | null;
  url?: string | null;
  variants?: Record<string, string> | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number | null;
  opacity?: number | null;
  /** "Chỉ dùng làm nền để đồ lại" — không có trong bản phát hành. */
  editorOnly?: boolean | null;
}

export interface FloorLayout {
  schemaVersion: number;
  floorPlanId?: number | null;
  version?: number | null;
  publishedAt?: string | null;
  siteId?: number | null;
  sNum?: number | null;
  statNum?: number | null;
  zoneID?: number | null;
  zoneName?: string | null;
  canvas: FloorCanvas;
  backgroundImage?: FloorBackground | null;
  previewImage?: FloorImageRef | null;
  objects: FloorObject[];
}

/** Mã trạng thái bàn — đối tác có thể nhận mã mới về sau: mã lạ vẽ như không xác định. */
export type FloorTableStatusCode = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | (string & {});

export interface FloorTableBooking {
  reservationNo: string;
  status: number;
  bookingName?: string | null;
  partySize?: number | null;
  from: string;
  to: string;
  current: boolean;
}

export interface FloorTableStatus {
  tableNum: number;
  status: FloorTableStatusCode;
  since?: string | null;
  reservedFrom?: string | null;
  reservedTo?: string | null;
  late?: boolean | null;
  nextReservedAt?: string | null;
  mergedWith?: number[] | null;
  // Chỉ app nội bộ
  conflict?: boolean | null;
  covers?: number | null;
  bookings?: FloorTableBooking[] | null;
}

/**
 * Màu một bàn do app TỰ quyết — thắng màu theo `FloorTableStatus`. Hotess tô theo đúng trạng thái của lưới bàn (7 trạng
 * thái, tính theo khung giờ đang xếp khách) để lưới và sơ đồ không bao giờ nói khác nhau.
 */
export interface FloorTablePaint {
  fill: string;
  stroke: string;
  text: string;
  /** Viền nét đứt (vd. bàn đang gộp). */
  dash?: number[] | null;
  /** Viền đậm (vd. bàn đang chọn). */
  emphasis?: boolean | null;
}

/** Trạng thái bàn trên sơ đồ của một zone — một bàn có thể có mặt ở nhiều zone, cùng một trạng thái. */
export interface FloorZoneStatus {
  statNum: number;
  zoneID: number;
  floorPlanId: number;
  layoutVersion: number;
  tables: FloorTableStatus[];
}

export interface FloorStatusSnapshot {
  siteId: number;
  sNum: number;
  /** Số thứ tự snapshot của Sub — tăng mỗi khi một bàn đổi trạng thái (GĐ2). */
  seq: number;
  asOf: string;
  posAsOf?: string | null;
  posStale: boolean;
  zones: FloorZoneStatus[];
}

/** Một bàn đổi trạng thái trên một zone — khoá zone + nguyên trạng thái mới của bàn. */
export interface FloorStatusChange extends FloorTableStatus {
  statNum: number;
  zoneID: number;
  floorPlanId: number;
  layoutVersion: number;
}

/**
 * Sự kiện SignalR `floorplan.status` của hub `/reservationHub` (chỉ JWT nhân viên). Giữ đúng `prevSeq` thì áp `changes`,
 * lệch thì GET lại trạng thái. `full` = không kèm `changes` (sơ đồ vừa phát hành / tắt, quá nhiều bàn đổi, hoặc vừa nối lại
 * hub): đọc lại cả snapshot — và cả bố cục khi `reasons` có `layout`.
 */
export interface FloorStatusPush {
  siteId: number;
  sNum: number;
  seq: number;
  prevSeq: number;
  asOf: string;
  posAsOf?: string | null;
  posStale: boolean;
  full: boolean;
  /** `booking` | `pos` | `layout` | `refresh`; client tự thêm `resync` khi vừa nối lại hub. */
  reasons: string[];
  changes: FloorStatusChange[];
}

/** Thông tin bàn đọc lúc trả (không nằm trong bố cục). */
export interface FloorTableInfo {
  tableNum: number;
  name?: string | null;
  minCovers?: number | null;
  maxCovers?: number | null;
  reservable: boolean;
}

export interface FloorPublishedLayout {
  layout: FloorLayout;
  tables: FloorTableInfo[];
}

/** Zone đặt chỗ (khoá SiteId + SNum + StatNum + ZoneID) đã phát hành sơ đồ. */
export interface FloorPublishedZone {
  statNum: number;
  zoneID: number;
  name?: string | null;
  floorPlanId: number;
  version: number;
  publishedAt?: string | null;
  tableCount: number;
}
