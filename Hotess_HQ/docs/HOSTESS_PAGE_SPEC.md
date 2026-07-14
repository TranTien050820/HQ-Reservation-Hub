# Hostess Page — Yêu cầu hoàn thiện (React + TypeScript + Vite)

> File này là "đề bài" để yêu cầu Claude hoàn thiện trang **Hostess** trong dự án Booking_HQ.
> Khi thực hiện, đọc kỹ các mục **Tham chiếu** trước khi code.

---

## 1. Mục tiêu

Convert trang Hostess hiện tại (jQuery/Razor) sang **React + TypeScript + Vite**, tích hợp vào dự án Booking_HQ hiện có, dùng chung pattern API/i18n/component của dự án.

Trang Hostess là màn hình dành cho nhân viên lễ tân nhà hàng, chạy trên tablet, gồm các nghiệp vụ:
1. **Check-in** khách có đặt chỗ trước (tìm theo mã đặt chỗ / SĐT / quét QR).
2. **Đặt chỗ trực tiếp** (walk-in booking) cho khách chưa đặt trước.
3. **Xếp chỗ (seat)** khách vào **zone** hoặc **bàn cụ thể** (tính năng mới).
4. **Waitlist**: tạo và xử lý danh sách chờ khi hết chỗ (tính năng mới).

## 2. Tham chiếu

| Nguồn | Đường dẫn | Dùng để |
|---|---|---|
| Giao diện gốc | `C:\Users\Asus\Documents\GitHub\SpeedCoreWeb\SpeedCoreWeb\Areas\Reservation\Views\Hostess\Index.cshtml` | Layout, luồng màn hình, i18n keys, nghiệp vụ gốc |
| CSS gốc | `SpeedCoreWeb\Areas\Reservation\Asset\css\hostess.css` | Tham khảo style (glass-card, dark theme) |
| Dự án đích | `C:\Users\Asus\Desktop\Booking_HQ` | Codebase React/TS/Vite hiện tại — thêm trang Hostess vào đây |
| API pattern | `Booking_HQ\src\api\*` (`http.ts`, `reservations.ts`, `types.ts`) | Cách gọi API (axios + ApiEnvelope), Vite proxy |
| API + giao diện admin | `C:\Users\Asus\Documents\GitHub\HQ_FE_V2\src\features\reservations\` | **Xem toàn bộ API và giao diện Reservations ở đây** rồi thiết kế lại giao diện phù hợp cho hostess (đơn giản, thao tác nhanh, màn hình cảm ứng) |

Các file quan trọng trong HQ_FE_V2 cần đọc:
- `api/bookings.api.ts` — CRUD ReservationBookings
- `api/waitlists.api.ts` — CRUD ReservationWaitlists
- `api/zones.api.ts` — ReservationZones
- `api/tableSetup.api.ts` — danh sách bàn (TableSetup)
- `api/reserSeatTables.api.ts` — bàn đã được gán cho reservation theo ngày
- `api/availableSlots.api.ts` — slot trống theo zone/ngày
- `components/bookings/WaitlistTab.tsx` — UI waitlist tham khảo (status config, quick-seat panel, chọn bàn, merge bàn)
- `components/bookings/FloorPlanTab.tsx`, `availability/TableCards.tsx` — UI sơ đồ bàn tham khảo
- `types/index.ts` — types: `ReservationZone`, `ReservationBooking`, `ReservationWaitlist`, filters…

## 3. Tech stack & ràng buộc

- React 19 + TypeScript, Vite (dùng cấu hình sẵn có của Booking_HQ).
- Gọi API qua `src/api/http.ts` (axios, relative `/api/...`, Vite dev proxy — xem `vite.config.ts`).
- Response envelope: `{ status, statusText, message, data }`; list trả `PagedResult { items, totalRecords, pageIndex, pageSize, totalPages }`.
- i18n: dùng hệ thống i18n sẵn có của Booking_HQ (`src/i18n`), bổ sung namespace/keys cho hostess. Tối thiểu **EN + VI** (map lại từ `hostessTranslations` trong Index.cshtml).
- Route đề xuất: `/hostess` (có thể tách sub-route: `/hostess/checkin`, `/hostess/booking`, `/hostess/seating`, `/hostess/waitlist`).
- Style: giữ tinh thần giao diện gốc (dark theme, glass-card, nút to cho cảm ứng) nhưng viết lại bằng CSS của dự án; **không** copy jQuery/SweetAlert — dùng component/toast/dialog React.
- Context cửa hàng: `siteId`, `sNum`, `statNum` lấy từ **publicKey** giống Booking_HQ: route chứa `:publicKey` → gọi `GET /api/ReservationLinks/Booking?publicKey=...` → `data.linkInfo` trả về `{ siteId, sNum, statNum, channelId }` (xem `src/api/booking.ts` → `fetchBookingByPublicKey` và `src/store/StoreDataContext.tsx`). Route hostess đề xuất: `/hostess/:publicKey`.

## 4. API sử dụng (theo pattern HQ_FE_V2)

Tất cả endpoint thuộc HQ-WebOffice-API:

| Endpoint | Method | Dùng cho |
|---|---|---|
| `/api/ReservationBookings` | GET | Tìm booking theo `ReservationNo`, `BookingPhone`, `BookingName`, filter `ReservationDate`, `Status`, `ZoneID` + phân trang |
| `/api/ReservationBookings` | POST | Tạo booking trực tiếp (walk-in) |
| `/api/ReservationBookings` | PUT | Cập nhật status (seat, close, no-show…) |
| `/api/ReservationZones` | GET | Danh sách zone (`SiteId`, `IsActive`) |
| `/api/AvailableSlots` (xem `availableSlots.api.ts`) | GET | Số chỗ trống theo zone + ngày |
| `/api/TableSetup` | GET | Danh sách bàn theo section (`SiteId`, `SECNUM`) — capacity `minnumcust`/`maxnumcust`, `canreserve` |
| `/api/ReserSeatTables` | GET | Bàn đã gán cho reservation theo `ReserDate` → xác định bàn occupied |
| `/api/ReserSeatTables` | POST/PUT | Gán bàn cụ thể cho reservation (xem cách WaitlistTab/HQ_FE_V2 làm) |
| `/api/ReservationWaitlists` | GET/POST/PUT | Waitlist CRUD |
| `/api/ReservationLinks/Booking?publicKey=...` | GET | Load config cửa hàng (linkInfo: `siteId`, `sNum`, `statNum`, `channelId` + settings, zones, periods…) |
| `/api/auth/login` | POST | Đăng nhập nhân viên (xem mục 5.1) |

**Status booking** (`ReservationStatus` — đã có ở `Booking_HQ/src/api/types.ts`):
`1=New, 2=Confirm, 3=Cancel, 4=Reserved, 5=Overdue, 6=Seated, 7=NoShow, 8=Close`

**Status waitlist**: `0=Waiting, 1=Confirmed, 2=Reserved(đã xếp bàn), 3=Cancelled, 4=Expired`

> Lưu ý: giao diện gốc dùng API cũ của SpeedCoreWeb (`/api/Reservation`, `/api/Zone`, ClientGUID header…) — **KHÔNG dùng lại**, thay bằng API HQ ở trên.

## 5. Màn hình & tính năng

### 5.1 Header & Login
- Logo + tên trang, chọn ngôn ngữ (EN/VI), tên nhân viên, nút logout, ngày hiện tại.
- **Đăng nhập nhân viên dùng API của HQ_FE_V2**: `POST /api/auth/login` với body `{ UserName, Password }`, response `{ status, data: { user, group, roles, sites, accessToken, refreshToken } }` — xem `HQ_FE_V2/src/features/auth/api/auth.api.ts` và `types/index.ts`.
- Sau login: lưu `accessToken` (store/localStorage), gắn header `Authorization: Bearer <accessToken>` cho mọi request qua axios interceptor; khi gặp 401 thì gọi `POST /auth/refresh` rồi retry (tham khảo `HQ_FE_V2/src/services/apiClient.ts`).
- Hiển thị `fullName` của user làm tên nhân viên; `user.userId` dùng làm `userCreated`/`userReser`… khi tạo booking/waitlist/seat.
- Chưa login (hoặc token hết hạn không refresh được) → hiện màn hình Login trước khi vào Check-in, tương tự bản gốc.

### 5.2 Check-in (màn hình chính)
- Ô tìm kiếm: nhập **mã đặt chỗ** hoặc **SĐT** → gọi `GET /api/ReservationBookings` (song song theo `ReservationNo` và `BookingPhone`), lọc booking **hôm nay** có status `Confirm(2)` hoặc `Reserved(4)`.
- **Quét QR bằng camera — làm ngay bản đầu tiên** (dùng thư viện QR cho React, ví dụ `html5-qrcode`): nút Scan QR mở modal camera (ưu tiên camera sau `facingMode: environment`), quét được mã → tự điền vào ô tìm kiếm và tìm luôn; đóng modal phải stop camera đúng cách.
- Kết quả: 1 booking → mở màn hình Seating với booking đó; nhiều booking → modal danh sách cho chọn (có ô lọc theo tên/SĐT); không có → thông báo + gợi ý **"Thêm vào Waitlist"** hoặc **"Đặt chỗ mới"**.
- 3 nút điều hướng lớn: **New Booking**, **Zone Map**, **Waitlist** (kèm badge số khách đang chờ).

### 5.3 Direct Booking (walk-in)
- Form: SĐT (bắt buộc, autocomplete tên từ API customer nếu có), Họ tên (bắt buộc), Zone, Số khách, Ghi chú.
- Submit → `POST /api/ReservationBookings` với `reservationDate = hôm nay`, status phù hợp cho khách vào ngay (`Seated=6` nếu seat luôn, hoặc `Confirm=2` rồi seat sau — xem payload thực tế trong `CreateReservationBookingRequest` của HQ_FE_V2).
- Nếu zone hết chỗ → hỏi chuyển sang tạo **Waitlist**.

### 5.4 Seating / Zone Map (nâng cấp so với bản gốc)
- Cột trái: danh sách zone (nút lớn). Chọn zone → hiện thống kê: Tổng chỗ / Đã dùng / Trống / Đã seat (từ AvailableSlots).
- **Mới — sơ đồ bàn**: lưới bàn của zone (từ `TableSetup` + section links của zone), trạng thái mỗi bàn từ `ReserSeatTables` theo ngày: `available` / `occupied` / `selected`. Hiện capacity trên bàn, disable bàn không đủ chỗ với party size.
- **Seat vào zone** (không chọn bàn): PUT booking → status `Seated(6)` + zone.
- **Seat vào bàn cụ thể**: chọn 1 hoặc nhiều bàn (merge khi đông khách) → PUT booking + tạo `ReserSeatTables` record.
- Nút **Close Table** cho booking đã seat (status `Close(8)`, giải phóng bàn).
- Legend: Trống / Đang dùng / Đã chọn.

### 5.5 Waitlist (mới)
Tham khảo `WaitlistTab.tsx` của HQ_FE_V2 nhưng thiết kế lại gọn cho hostess:
- **Tạo waitlist**: tên, SĐT, số khách, zone mong muốn, ghi chú, priority (VIP) → `POST /api/ReservationWaitlists`.
- **Danh sách chờ hôm nay**: tab lọc theo status (Tất cả / Đang chờ / Đã xác nhận / Đã xếp bàn), hiển thị thời gian đã chờ (phút), badge VIP, stats bar (số khách chờ, thời gian chờ TB, chờ lâu nhất).
- **Xử lý**: từ 1 dòng waitlist → gọi khách (Confirmed), **quick-seat** (chọn zone/bàn → tạo booking + seat, waitlist → status 2 kèm `reservationNo`), huỷ (status 3).
- Tự đánh dấu Expired nếu quá lâu (chỉ hiển thị cảnh báo, không auto-update nếu backend chưa hỗ trợ).

### 5.6 i18n
- Map toàn bộ key từ `hostessTranslations` (EN/VI) trong Index.cshtml sang file locale của Booking_HQ, bổ sung key mới cho waitlist/table.

## 6. Cấu trúc code đề xuất

```
src/
  api/
    hostess/            # hoặc mở rộng src/api hiện có
      bookings.ts       # search/create/update ReservationBookings
      zones.ts
      tables.ts         # TableSetup + ReserSeatTables
      waitlists.ts
  pages/hostess/
    HostessPage.tsx     # shell + routing giữa các screen
    CheckinScreen.tsx
    BookingFormScreen.tsx
    SeatingScreen.tsx   # zone map + table grid
    WaitlistScreen.tsx
  components/hostess/
    QrScannerModal.tsx
    SearchResultsModal.tsx
    TableGrid.tsx
    WaitlistCard.tsx
    ...
```

## 7. Tiêu chí hoàn thành

- [ ] `npm run build` / `tsc` pass, không lỗi ESLint mới.
- [ ] Đầy đủ 4 luồng: check-in, walk-in booking, seat vào zone/bàn, waitlist (tạo + xử lý).
- [ ] Login qua `/api/auth/login` + Bearer token hoạt động; quét QR camera hoạt động ngay bản đầu.
- [ ] i18n EN/VI hoạt động, đổi ngôn ngữ không reload trang.
- [ ] Loading/error state cho mọi API call; thông báo success/error bằng toast/dialog React.
- [ ] UI responsive cho tablet (ngang + dọc), nút đủ lớn cho cảm ứng, dark theme.
- [ ] Chạy thử bằng dev server và xác nhận từng luồng hoạt động (mock API nếu backend chưa sẵn sàng, theo pattern mockData của Booking_HQ).

## 8. Quyết định đã chốt

1. **Login nhân viên**: dùng API của HQ_FE_V2 — `POST /api/auth/login` (Bearer token + refresh), KHÔNG dùng `/api/LoginJWT` của SpeedCoreWeb. Chi tiết ở mục 5.1.
2. **statNum / siteId / sNum**: lấy từ **publicKey** qua `GET /api/ReservationLinks/Booking?publicKey=...` giống Booking_HQ (`fetchBookingByPublicKey` + `StoreDataContext`). Route: `/hostess/:publicKey`.
3. **Quét QR camera**: làm ngay từ bản đầu tiên (không để phase 2).

## 9. Câu hỏi mở còn lại

1. Trang hostess nằm chung app Booking_HQ (route `/hostess/:publicKey`) hay tách app riêng? *(mặc định: chung app nếu không có chỉ định khác)*
