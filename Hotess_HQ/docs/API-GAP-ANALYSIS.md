# Hostess (Hotess_HQ) — Đối chiếu với HQ-WebOffice-API

> **Ngày rà:** 2026-08-21
> **Bản API đối chiếu:** `HQ-WebOffice-API` nhánh `trantien_dev` @ `3075f7d` **+ toàn bộ thay đổi chưa commit trên máy** (đáng chú ý: `ReservationSlotOverrides`, cờ `IsPrimary` cho Zone/Channel, `MenuSchedulePricing`, chẩn đoán Agent).
> **Phạm vi:** mọi endpoint `api/Reservation*`, `api/Reser*`, `api/AvailableSlot*`, `api/OrderHub/*`, `api/PosLocal/*` mà một app lễ tân có thể cần.
> **Tài liệu gốc nên đọc kèm:**
> - `HQ-WebOffice-API/HQ-WebOffice-API/docs/API-Reservation-Integration.md` (đặc tả từng endpoint)
> - `HQ-WebOffice-API/HQ-WebOffice-API/docs/FE-V2-RESERVATION-SLOT-POOL.md` (**breaking change** mô hình kho vé)
> - `HQ-WebOffice-API/docs/ORDERHUB_API_GUIDE.md` §5.10, §8.4 (pre-order của booking)

---

## 0. Kết luận nhanh

Hostess là app **hoàn thiện nhất** trong ba app đang xét: check-in, walk-in booking, sơ đồ bàn, waitlist và pre-order đều đã nối API thật, không còn mock.

Vấn đề còn lại chia làm 3 nhóm:

| Nhóm | Số mục | Ảnh hưởng |
|---|---|---|
| **P0 — Đang lệch với API hiện tại, có thể ra số sai** | 4 | Hiển thị sai sức chứa, cho đặt vào chỗ không còn |
| **P1 — API đã có nhưng app chưa dùng, nghiệp vụ đang thiếu** | 7 | Lễ tân phải làm tay hoặc nhờ back-office |
| **P2 — Tối ưu / dữ liệu mới của API chưa đọc** | 6 | Chạy được nhưng tốn round-trip, thiếu thông tin |

---

## 1. Ảnh chụp — Hostess **đang** gọi những gì

| Endpoint | Method | File | Màn hình |
|---|---|---|---|
| `/api/auth/login` | POST | `src/api/auth.ts:6` | Login |
| `/api/auth/refresh-token` | POST | `src/api/auth.ts:22` | Interceptor 401 |
| `/api/ReservationLinks/Booking?publicKey=` | GET | `src/api/links.ts:33` | Bootstrap cửa hàng |
| `/api/ReservationBookings` | GET/POST/PUT | `src/api/bookings.ts:15,67,73` | Check-in, Walk-in, Seating |
| `/api/ReservationWaitlists` | GET/POST/PUT | `src/api/waitlists.ts:27,65,88` | Waitlist |
| `/api/AvailableSlots` | GET | `src/api/availableSlots.ts:6` | Sức chứa theo zone/ngày |
| `/api/PosLocal/TabInfo` | GET | `src/api/posTabs.ts:11` | Bàn POS đang mở |
| `/api/OrderHub/Orders` | GET | `src/api/orderHub.ts:38` | Pre-order của booking |
| `/api/OrderHub/Reservation/{no}/Release` | POST | `src/api/orderHub.ts:104` | Check-in → đẩy bếp |
| `/api/OrderHub/Reservation/{no}/Cancel` | POST | `src/api/orderHub.ts:118` | Khách không tới |

**Tổng: 10 endpoint / khoảng 60 endpoint thuộc miền Reservation + OrderHub.**

---

## 2. P0 — Phải sửa: app đang lệch với API hiện tại

### 2.1 🔴 `zone.availableSlots` đã bị **gỡ khỏi API** nhưng code vẫn đọc

**Chỗ hỏng:** `src/pages/SeatingScreen.tsx:51`

```ts
const total = found?.availableSlots ?? zone.availableSlots ?? 0;   // ← zone.availableSlots không còn tồn tại
```

và khai báo thừa ở `src/types/index.ts:103` (`ReservationZone.availableSlots`).

**Vì sao:** hệ thống đã chuyển sang **mô hình kho vé (Slot Pool)**. Sức chứa không còn nằm trên khu vực nữa mà nằm ở kho, khu vực chỉ là *hạn mức phủ lên kho*. `GET api/ReservationLinks/Booking` **không còn trả** `zones[].availableSlots` (xem `FE-V2-RESERVATION-SLOT-POOL.md` §3.3).

**Hệ quả:** khi `GET api/AvailableSlots` chưa trả về (đang tải / lỗi mạng), `total` rơi về `0` thay vì rơi về sức chứa cấu hình → thẻ zone hiện "0 chỗ" trong khi zone vẫn còn chỗ.

**Cách sửa:**
- Xoá `availableSlots` khỏi `ReservationZone` trong `types/index.ts`.
- Bỏ nhánh fallback: chỉ có một nguồn sự thật là `GET api/AvailableSlots`. Chưa có dữ liệu thì hiện trạng thái "đang tải", **không** hiện số 0.

---

### 2.2 🔴 `GET api/AvailableSlots` — tham số bắt buộc đã đổi, `globalId` luôn `null`

**Chỗ hỏng:** `src/api/availableSlots.ts:6-18`

| Điểm | Hiện tại | Đúng theo API mới |
|---|---|---|
| `IsActive: true` | vẫn gửi | **đã bị gỡ**, không còn ý nghĩa — bỏ đi |
| `SiteId`/`SNum`/`StatNum`/`ArrivalDateFrom`/`ArrivalDateTo` | có gửi | ✅ đúng, nay là **bắt buộc**, thiếu ⇒ **HTTP 400** kèm message cụ thể (không còn trả mảng rỗng âm thầm) |
| Khoảng ngày | 1 ngày | ✅ hợp lệ (ràng buộc: **< 366 ngày**) |
| `globalId` trong response | — | **luôn `null`** — nếu chỗ nào dùng làm React `key` thì đổi sang khoá ghép `zoneID + arrivalDate` |

**Quan trọng nhất — không được tự tính:**

```
numberOfUsed + numberOfUnused  ≠  availableSlots      // đẳng thức CŨ, nay SAI
```

Khu vực được phân bổ 200 vé từ kho A, nhưng kho A chỉ còn 50 ⇒ khu vực thực bán được 50. **Luôn đọc thẳng `numberOfUnused`.**

**Kiểm tra lại:** `src/pages/CheckinScreen.tsx:73` và `BookingFormScreen.tsx:112` đang đọc thẳng `numberOfUnused` — ✅ đúng. Chỉ `SeatingScreen.tsx:51-53` là còn tính/fallback theo lối cũ.

**Cách sửa:** bỏ `IsActive` khỏi params; bắt và hiển thị nguyên văn 4 message 400 của server:

| Message | Nguyên nhân |
|---|---|
| `SiteId, SNum and StatNum are required` | thiếu định danh cửa hàng |
| `ArrivalDateFrom and ArrivalDateTo are required` | thiếu khoảng ngày |
| `ArrivalDateTo must be on or after ArrivalDateFrom` | khoảng ngày ngược |
| `The date range must be shorter than 366 days` | khoảng ngày quá rộng |

---

### 2.3 🔴 Chưa đọc `zone.isPauseBooking` / `zone.isNoTable`

**Chỗ hỏng:** `src/types/index.ts:102,106` khai báo đủ hai trường, nhưng **không file nào đọc chúng** (chỉ `isUseDurationMinutes`/`durationMinutes` được dùng ở `SeatingScreen.tsx:202,602` và `WaitlistSeatModal.tsx:114`).

| Trường | Ý nghĩa | Hostess phải làm gì |
|---|---|---|
| `isPauseBooking = 1` | Cửa hàng **tạm dừng nhận đặt** ở khu vực này | Ẩn/khoá zone trong form walk-in và trong picker xếp bàn, kèm nhãn "Tạm dừng nhận đặt" |
| `isNoTable = 1` | Khu vực **không có bàn vật lý** (kiểu quầy bar / khu chờ) | Không mở picker chọn bàn cho zone này; xếp chỗ theo zone, không theo `reserTable` |

**Hệ quả hiện tại:** lễ tân vẫn đặt được vào zone mà quản lý đã tắt → BE từ chối hoặc dữ liệu vào sai khu.

---

### 2.4 🔴 Chưa dùng `IsPrimary` — cờ **mới** trên Zone và Channel

**Mới trong bản trên máy (chưa commit)** — `ReservationZones.IsPrimary`, `ReservationChannels.IsPrimary`, migration `SqlReport/ReservationPrimaryZoneChannel-Migration.sql`.

| Quy tắc BE | Chi tiết |
|---|---|
| Mỗi `(SiteId, SNum, StatNum)` chỉ có **tối đa một** zone mặc định và **một** channel mặc định | ràng buộc bằng partial unique index |
| `POST api/ReservationBookings` **không truyền `ZoneID`** | rơi vào zone `IsPrimary = 1`. **Station chưa cấu hình zone mặc định ⇒ booking không gắn zone và KHÔNG trừ sức chứa** |
| `POST` **không truyền `ChannelID`** | rơi vào channel `IsPrimary = 1` |
| `PUT` bỏ trống | **giữ nguyên** giá trị cũ — PUT **không** rơi về `IsPrimary` |

**Hostess cần:**
1. Thêm `isPrimary?: number` vào `ReservationZone` (và channel nếu dùng tới).
2. Form walk-in (`BookingFormScreen`) **chọn sẵn** zone `isPrimary = 1`.
3. ⚠️ **Luôn gửi `zoneID` tường minh** khi tạo booking. Bỏ trống mà station chưa cấu hình zone mặc định ⇒ booking **không trừ vé** ⇒ bán quá chỗ. Đây là rủi ro dữ liệu, không phải rủi ro giao diện.

---

## 3. P1 — API đã có, Hostess chưa dùng (nghiệp vụ đang thiếu)

### 3.1 `PUT api/ReservationBookings/ReservationClose` — đóng booking theo bill POS

| | |
|---|---|
| **Endpoint** | `PUT api/ReservationBookings/ReservationClose` |
| **Làm gì** | Quét các booking `Seated(6)` mà `POSHEADER.STATUS = 3` (bill đã thanh toán xong) → chuyển sang `Close(8)` và **cộng trả vé về kho** |
| **Hiện trạng** | Hostess **không gọi** ⇒ booking đứng mãi ở `Seated`, vé không được nhả, bàn hiện "đang có khách" sau khi khách đã về |
| **Nên làm** | Gọi định kỳ (cùng nhịp poll của `SeatingScreen`, ~30–60s) hoặc gắn vào nút "Kết thúc lượt". Xem `API-Reservation-Integration.md` §3.1.3 để biết payload và điều kiện chống gọi trùng |

### 3.2 `POST api/ReservationZoneSwitchSlots` — điều phối vé giữa hai khu vực

Kịch bản thật: *trời mưa, chuyển 5 vé từ sân vườn vào phòng kín*. Hiện lễ tân phải nhờ back-office.

```
POST api/ReservationZoneSwitchSlots
{ "SiteId":1, "SNum":1, "StatNum":1, "DateSwitch":"2026-08-21",
  "FromZoneId":5, "ToZoneId":1, "Quantity":5,
  "Reason":"Trời mưa", "UserCreated": <userId>, "PoolID": <tuỳ chọn> }
```

- BE **chặn cứng**: `FromZone.NumberOfUnused < Quantity` ⇒ HTTP 400.
- Hai zone **phải cùng có phân bổ từ một kho**; bỏ trống `PoolID` thì server tự chọn theo `priority`.
- `GET` cùng route trả lịch sử điều phối (trả **mảng thuần**, không phân trang).

### 3.3 `GET api/ReservationSlotPools/availability` — nhìn được **vì sao** hết chỗ

`GET api/AvailableSlots` chỉ trả con số của **khu vực**. Khi khách bị từ chối, lễ tân không biết nghẽn ở tầng nào.

```
GET api/ReservationSlotPools/availability
  ?SiteId=&SNum=&StatNum=&date=2026-08-21&ZoneID=&ChannelID=&PeriodID=
```

Trả về sức chứa còn lại **tách theo từng tầng** (kho / khu vực / kênh / khung giờ). Trường `Bookable` = MIN của các tầng đang ràng buộc — đó là con số thật sự đặt được.

**Giá trị:** một dòng chữ "Hết chỗ vì **hạn mức kênh Website**, khu vực vẫn còn 12 chỗ" thay cho "Hết chỗ" trống rỗng.

### 3.4 `GET api/AvailableSlotTransactions` — lịch sử biến động sức chứa

Hiện chưa dùng. Nếu làm màn hình đối soát, lưu ý **breaking change**: một lần đặt/huỷ nay sinh **2–4 dòng** (kho + khu vực + kênh + khung giờ) thay vì 1.

| Trường mới | Ý nghĩa |
|---|---|
| `scopeType` | `0` = Kho · `1` = Khu vực · `2` = Kênh · `3` = Khung giờ |
| `scopeID` | `poolID` / `zoneID` / `channelID` / `periodID` tương ứng |
| `poolID` | Kho vé của dòng này |
| `txnGroupId` | Nối các dòng của **cùng một hành động** |

→ Muốn giữ giao diện "một hành động = một dòng" thì thêm bộ lọc `ScopeType=1`. `zoneID = null` ở các dòng khác **không phải lỗi dữ liệu**.

### 3.5 `GET api/ReserSeatTables` — đọc bàn đã gán mà không phải tải cả ngày booking

Hiện `SeatingScreen` lấy toàn bộ booking trong ngày (`fetchAllPages`) rồi đọc `booking.seatTables[]` lồng bên trong. Đúng nhưng nặng.

```
GET api/ReserSeatTables?SiteId=&SNum=&StatNum=&ReserDate=2026-08-21&IsActive=1&pageSize=500
```

Bộ lọc đầy đủ: `GlobalId`, `SiteId`, `SNum`, `StatNum`, `ReservationNo`, `TableNum`, `ReserTable`, `ReserDate`, `UserReser`, `IsActive` + phân trang + sort.

Có cả `POST` / `PUT` để gán bàn **độc lập** với việc cập nhật booking (POST thay thế **toàn bộ** danh sách bàn của một `ReservationNo`; chỉ chạy khi booking đang `Reserved` hoặc `Seated`).

### 3.6 Khối `settings` của `ReservationLinks/Booking` đang bị vứt bỏ

**Chỗ hỏng:** `src/api/links.ts:16-49` — `RawReservationConfig` chỉ khai báo và chỉ lấy `linkInfo`, `zones`, `zoneSectionLinks`, `sections`, `tableSetups`, `extraFieldConfigs`, `extraFieldOptions`, `periods`, `periodRules`, `dateOverrides`.

API **trả về nhiều hơn thế** trong cùng một request (xem `Core/Application/DTOs/Query/ReservationConfigDTO.cs`):

| Khối bị bỏ | Nội dung | Hostess dùng được gì |
|---|---|---|
| `settings` | `logoUrl`, `storeName`, `phoneNumber`, `introduction`, **`colorNew`/`colorConfirmed`/`colorCancelled`/`colorReserved`/`colorOverdue`/`colorSeated`/`colorClosed`/`colorNoShow`**, `emailAddress`, `isSendGmail`, `reminderTime` | **Màu trạng thái do cửa hàng cấu hình** — hiện app tự chế màu riêng, không khớp back-office. Logo + tên cửa hàng cho header |
| `channel` | `channelName`, `isLimitAvailable`, `qtyLimit`, `isPauseBooking`, `isPrimary` | Cảnh báo sớm "kênh này đang tạm dừng / sắp hết hạn mức" |
| `menu`, `reserMultiMenus` | Thực đơn + lịch áp dụng theo thứ/giờ | Xem nhanh menu khi khách hỏi |
| `emailTemplates`, `messageTemplates` | Mẫu email/SMS | Xem trước nội dung sẽ gửi cho khách |
| `mainCarousels`, `highlightEvents`, `goodToKnows`, `howitworks`, `storeRecommendations` | Nội dung tiếp thị | Không cần cho lễ tân |

**Chi phí sửa:** 0 request thêm — dữ liệu đã nằm sẵn trong response, chỉ cần khai báo và đọc.

### 3.7 `periods[].isLimitAvailable` / `qtyLimit` chưa dùng

`BookingPeriodDTO` trả `IsLimitAvailable` + `QtyLimit`. Form walk-in nên cảnh báo trước khi submit thay vì để BE trả lỗi.

---

## 4. P2 — Tối ưu & dữ liệu mới chưa đọc

### 4.1 Pre-order: dùng `Search` thay vì quét toàn bộ trạng thái

**Hiện tại** (`src/api/orderHub.ts:38-96`): với **mỗi** trạng thái trong `PRE_RELEASE_ORDER_STATUSES`, gọi một loạt `GET api/OrderHub/Orders` rồi ghép client-side. Comment trong file ghi *"There is no 'orders of reservation X' endpoint"* — **điều này không còn đúng.**

`GET api/OrderHub/Orders` có tham số `Search`, và query khớp cả `ReservationNo`:

```sql
-- Infrastructure/Repositories/QueryRepository/OrderHubOrderQueryRepository.cs:300-305
AND (o."OrderNumber" ILIKE @SearchLike OR o."OrderUid" ILIKE @SearchLike
     OR o."CustomerName" ILIKE @SearchLike OR o."CustomerPhone" ILIKE @SearchLike
     OR o."TableName" ILIKE @SearchLike OR o."ReservationNo" ILIKE @SearchLike)
```

**Các tham số khác chưa dùng:** `StatNum`, `Channel` (CSV `qr,tablet,web,reservation`), `ServiceMode`, `PaymentStatus`, `PosPushStatus`, `Phase`, `SortBy`, `SortDir`.

**Đề xuất:**
- Panel chi tiết một booking → `GET api/OrderHub/Orders?SiteId=&Search={reservationNo}` (1 request thay cho N).
- Danh sách tổng → `?Channel=reservation&Phase=booking` thay cho việc lặp từng `Status`.

### 4.2 `GET api/OrderHub/Orders/Stats` — thẻ KPI

Cùng bộ lọc với `GET Orders`, trả số liệu tổng hợp. Dùng cho dải "Hôm nay: 12 booking có pre-order · 3 chưa release".

### 4.3 Bộ lọc `PoolID` trên `GET api/ReservationBookings`

Tham số **mới**. Lọc theo kho vé mà booking đã rút vé. Cột này bị xoá về `NULL` khi booking nhả vé (huỷ / no-show / đóng) ⇒ lọc theo kho chỉ trả booking **đang giữ vé** của kho đó. Dùng cho màn hình đối soát tồn kho.

Response của `POST` và `GET api/ReservationBookings` nay **luôn có `poolID`**.

### 4.4 `poolID` khi tạo booking

`POST` / `PUT api/ReservationBookings` nhận thêm `poolID` (**tuỳ chọn**):
- **Bỏ trống** (khuyến nghị cho lễ tân): server duyệt các kho theo `priority`, chọn kho **đầu tiên** còn đủ chỗ cho **trọn** đoàn.
- **Có gửi**: dùng đúng kho đó, thiếu chỗ thì báo lỗi, **không** tự nhảy kho khác.

### 4.5 `api/ReservationTranslations` — i18n do cửa hàng cấu hình

Tên zone / tên khung giờ / nhãn trường phụ đang hiện nguyên văn tiếng Việt kể cả khi app ở EN. `GET api/ReservationTranslations` là nguồn dịch chính thức.

### 4.6 SignalR — **hiện không dùng được cho Hostess**

Hub `/orderHub` (`Infrastructure/SignalR/OrderHub.cs`) **nay bắt buộc xác thực thiết bị**: `OnConnectedAsync` đòi `X-Terminal` + `X-Store-Token` (header hoặc query `?terminal=&storeToken=`), thiếu là `Context.Abort()`. Nhóm được gán **từ thiết bị**; `JoinSiteGroup`/`LeaveSiteGroup` đã `[Obsolete]` và **bỏ qua tham số**.

Hostess là web app đăng nhập bằng JWT nhân viên, **không có cặp token thiết bị** ⇒ không nối được hub. Poll như hiện tại là đúng. Nếu muốn realtime, đây là việc của BE (mở đường xác thực bằng JWT cho hub) — xem mục 5.

---

## 5. Cần BE bổ sung (không phải việc của đội Hostess)

| # | Việc | Vì sao cần |
|---|---|---|
| 1 | **CORS chỉ cho phép `localhost` / `127.0.0.1`** (`Program.cs:188-199`) | Hostess deploy lên domain thật sẽ **chết toàn bộ request** trừ khi đặt sau cùng reverse proxy same-origin. Phải mở danh sách origin trước khi go-live |
| 2 | Cho phép **JWT** nối SignalR `/orderHub` | Hostess không có `X-Terminal`/`X-Store-Token` nên vĩnh viễn phải poll |
| 3 | Endpoint "đơn của một `reservationNo`" | Tuy `Search` đã che được, một endpoint tường minh sẽ rẻ và rõ hơn |
| 4 | `PUT api/ReservationBookings/ReservationClose` có thể chạy nền | Bắt app lễ tân phải nhớ gọi định kỳ là chỗ dễ quên |

---

## 6. Checklist theo thứ tự làm

### Sprint 1 — P0 (rủi ro số liệu)
- [ ] Xoá `ReservationZone.availableSlots` khỏi `types/index.ts:103`; bỏ fallback ở `SeatingScreen.tsx:51`
- [ ] Bỏ `IsActive` khỏi `availableSlots.ts`; hiển thị nguyên văn message 400 của server
- [ ] Rà mọi chỗ dùng `globalId` của `AvailableSlot` làm key → đổi sang `zoneID + arrivalDate`
- [ ] Đọc `zone.isPauseBooking` → khoá zone trong form walk-in + picker xếp bàn
- [ ] Đọc `zone.isNoTable` → không mở picker bàn cho zone đó
- [ ] Thêm `isPrimary`; chọn sẵn zone mặc định; **luôn gửi `zoneID` tường minh** khi POST booking

### Sprint 2 — P1 (nghiệp vụ thiếu)
- [ ] Nối `PUT api/ReservationBookings/ReservationClose`
- [ ] Đọc khối `settings` từ `ReservationLinks/Booking` (màu trạng thái, logo, tên cửa hàng)
- [ ] Đọc khối `channel` → cảnh báo tạm dừng / hết hạn mức
- [ ] Màn hình "Điều phối vé giữa hai khu vực" (`ReservationZoneSwitchSlots`)
- [ ] Khi hết chỗ: gọi `ReservationSlotPools/availability` để nói rõ tầng nào nghẽn

### Sprint 3 — P2 (tối ưu)
- [ ] Pre-order theo `Search={reservationNo}` / `Channel=reservation&Phase=booking`
- [ ] Thẻ KPI từ `GET api/OrderHub/Orders/Stats`
- [ ] Hiển thị `poolID` trên chi tiết booking
- [ ] `api/ReservationTranslations` cho i18n tên zone / khung giờ

---

## 7. Phụ lục — Toàn bộ endpoint miền Reservation

`✅` đang dùng · `⬜` chưa dùng, có thể dùng · `➖` thuộc back-office, không phải việc của Hostess

| Endpoint | Methods | Hostess |
|---|---|---|
| `api/ReservationBookings` | GET POST PUT | ✅ |
| `api/ReservationBookings/ReservationClose` | PUT | ⬜ **P1** |
| `api/ReservationWaitlists` | GET POST PUT | ✅ |
| `api/AvailableSlots` | GET | ✅ (cần sửa params) |
| `api/AvailableSlotTransactions` | GET | ⬜ P1 |
| `api/ReservationSlotPools` | GET POST PUT | ➖ |
| `api/ReservationSlotPools/availability` | GET | ⬜ **P1** |
| `api/ReservationSlotAllocations` | GET POST PUT | ➖ |
| `api/ReservationSlotOverrides` | GET PUT DELETE | ➖ (**mới**, chưa commit) |
| `api/ReservationZoneSwitchSlots` | GET POST | ⬜ **P1** |
| `api/ReservationZones` | GET POST PUT | ⬜ (đang lấy gián tiếp qua `ReservationLinks`) |
| `api/ReservationChannels` | GET POST PUT | ⬜ (nt) |
| `api/ReservationPeriods` · `PeriodRules` · `DateOverrides` | GET POST PUT | ⬜ (nt) |
| `api/ReservationLinks` | GET POST PUT | ➖ |
| `api/ReservationLinks/Booking` | GET | ✅ (chỉ dùng ~50% payload) |
| `api/ReserSeatTables` | GET POST PUT | ⬜ P1 (đang đọc lồng trong booking) |
| `api/ReserTableConfigs` | GET POST PUT DELETE | ⬜ (toạ độ bàn cho sơ đồ) |
| `api/ReserZoneSectionLinks` | GET POST PUT | ✅ (qua `ReservationLinks`) |
| `api/ReservationExtraFieldConfigs` / `Options` | GET POST PUT (DELETE) | ✅ (qua `ReservationLinks`) |
| `api/ReservationExtraValues` | GET POST PUT DELETE | ⬜ (đang gửi lồng trong booking) |
| `api/ReservationSettings` | GET POST PUT | ➖ |
| `api/ReservationEmailTemplates` · `MessageTemplates` | GET POST PUT | ➖ |
| `api/ReservationTranslations` | GET POST PUT | ⬜ P2 |
| `api/ReserGoodToKnows` · `Howitworks` · `MainCarousels` · `HighlightEvents` · `MenuTags` · `StoreRecommendations` | GET POST PUT | ➖ (trang đặt bàn khách) |
| `api/PosLocal/TabInfo` | GET | ✅ |
| `api/PosLocal/OpenTablePOS` | POST | ⬜ (mở bàn trên POS từ app lễ tân) |
| `api/OrderHub/Orders` | GET | ✅ (chưa dùng `Search`/`Phase`/`Channel`) |
| `api/OrderHub/Orders/Stats` | GET | ⬜ P2 |
| `api/OrderHub/Reservation/{no}/Release` · `/Cancel` | POST | ✅ |
| `api/TableSetup` · `api/Sections` | GET POST PUT | ✅ (qua `ReservationLinks`) |
