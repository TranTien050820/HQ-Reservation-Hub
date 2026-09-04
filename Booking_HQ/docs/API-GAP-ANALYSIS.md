# Booking_HQ (trang đặt bàn của khách) — Đối chiếu với HQ-WebOffice-API

> **Ngày rà:** 2026-08-21
> **Bản API đối chiếu:** `HQ-WebOffice-API` nhánh `trantien_dev` @ `3075f7d` **+ toàn bộ thay đổi chưa commit trên máy** (`ReservationSlotOverrides`, cờ `IsPrimary` cho Zone/Channel, tồn kho món `IsSoldOut`/`Available`, `MenuSchedulePricing`).
> **Tài liệu gốc nên đọc kèm:**
> - `HQ-WebOffice-API/HQ-WebOffice-API/docs/API-Reservation-Integration.md`
> - `HQ-WebOffice-API/HQ-WebOffice-API/docs/FE-V2-RESERVATION-SLOT-POOL.md` (**breaking change** mô hình kho vé)
> - `HQ-WebOffice-API/docs/ORDERHUB_API_GUIDE.md` §3, §8.4, §10

---

## 0. Kết luận nhanh

Booking_HQ có **hai nửa với chất lượng rất khác nhau**:

| Nửa | Trạng thái |
|---|---|
| **Bootstrap cửa hàng + Đặt bàn + Pre-order (OrderHub)** | ✅ Đã nối API thật, dùng đúng `ReservationLinks/Booking` và `OrderHub/Public` |
| **Danh sách nhà hàng, sức chứa, thực đơn của trang giới thiệu** | 🔴 **Vẫn chạy trên mock** (`src/api/mockData.ts`, `src/api/reservations.ts:48-91`) |

Vấn đề nghiêm trọng nhất: **trang đặt bàn không hề kiểm tra sức chứa**. Khung giờ được sinh hoàn toàn client-side từ `startTime`/`endTime` của period, không gọi bất kỳ endpoint tồn kho nào. Khách có thể đặt vào ngày/khu vực đã hết chỗ và chỉ biết khi BE từ chối.

| Nhóm | Số mục | Ảnh hưởng |
|---|---|---|
| **P0 — Sai nghiệp vụ / mock trong luồng thật** | 5 | Khách đặt được chỗ không tồn tại; huỷ sai trạng thái |
| **P1 — API đã có nhưng chưa dùng** | 6 | Thiếu tính năng khách nhìn thấy được |
| **P2 — Dữ liệu mới của API chưa đọc** | 5 | Hiển thị thiếu / kém chính xác |

---

## 1. Ảnh chụp — Booking_HQ **đang** gọi những gì

| Endpoint | Method | File | Dùng ở đâu |
|---|---|---|---|
| `/api/ReservationLinks/Booking?publicKey=` | GET | `src/api/booking.ts:244` | `StoreDataContext` — bootstrap toàn bộ cửa hàng |
| `/api/ReservationBookings` | GET | `src/api/reservations.ts:98` | `MyBookingsPage` (tra theo SĐT) |
| `/api/ReservationBookings` | POST | `src/api/reservations.ts:111` | `BookPage` |
| `/api/ReservationBookings` | PUT | `src/api/reservations.ts:125` | Huỷ đặt chỗ |
| `/api/OrderHub/Public/Session` | POST | `src/api/orderHub.ts:322` | `PreOrderPage` |
| `/api/OrderHub/Public/Menu` | GET | `src/api/orderHub.ts:331` | Thực đơn pre-order |
| `/api/OrderHub/Public/Product/{n}` | GET | `src/api/orderHub.ts:337` | Chi tiết món |
| `/api/OrderHub/Public/Cart` (+ items, promo) | GET POST PUT DELETE | `src/api/orderHub.ts:341-372` | Giỏ pre-order |
| `/api/OrderHub/Public/Checkout` | POST | `src/api/orderHub.ts:391` | Chốt pre-order |
| `/api/OrderHub/Public/Orders` | GET | `src/api/orderHub.ts:412` | Đơn của phiên |

**Đang chạy mock (không phải API):** `fetchStores`, `fetchStore`, `fetchZones`, `fetchPeriods`, `fetchPeriodRules`, `fetchDateOverrides`, `fetchMenuCategories`, `fetchMenuItems` — `src/api/reservations.ts:48-91`.

---

## 2. P0 — Phải sửa

### 2.1 🔴 Trang đặt bàn **không kiểm tra sức chứa** — API tồn kho chưa hề được gọi

**Chỗ hỏng:** `src/lib/slots.ts:buildPeriodAvailability()` sinh khung giờ mỗi 30 phút trong cửa sổ `startTime`–`endTime` của period, chỉ loại các giờ đã qua. **Không có** request nào tới `AvailableSlots` / `SlotPools`.

Trong toàn bộ `src/`, không có chuỗi `AvailableSlots`, `SlotPool` hay `availability`.

**Hệ quả:** khách chọn được ngày/giờ/khu vực đã kín. `POST api/ReservationBookings` bị BE từ chối ⇒ khách thấy lỗi ở bước cuối, sau khi đã điền hết form.

**API phải nối — hai lựa chọn:**

**(a) Đơn giản, đủ dùng cho trang đặt bàn công khai:**

```
GET api/AvailableSlots
  ?SiteId={linkInfo.siteId}&SNum={linkInfo.sNum}&StatNum={linkInfo.statNum}
  &ArrivalDateFrom=2026-08-21&ArrivalDateTo=2026-08-27
  [&ZoneID=13]
```

- `SiteId`, `SNum`, `StatNum`, `ArrivalDateFrom`, `ArrivalDateTo` **bắt buộc**; thiếu ⇒ **HTTP 400** kèm message rõ ràng.
- Khoảng ngày phải **< 366 ngày**.
- Trả về **mọi ngày** trong khoảng, kể cả ngày chưa có booking nào.
- ⚠️ **Đọc thẳng `numberOfUnused`, tuyệt đối không tự tính.** Đẳng thức cũ `numberOfUsed + numberOfUnused = availableSlots` **không còn đúng** — khu vực được phân bổ 200 vé nhưng kho chỉ còn 50 thì chỉ bán được 50.
- `globalId` trong response **luôn `null`** — đừng dùng làm React `key`; ghép `zoneID + arrivalDate`.

**(b) Chi tiết hơn, biết được nghẽn ở tầng nào:**

```
GET api/ReservationSlotPools/availability
  ?SiteId=&SNum=&StatNum=&date=2026-08-21&ZoneID=&ChannelID=&PeriodID=
```

Trả sức chứa còn lại tách theo tầng (kho / khu vực / kênh / khung giờ). Trường **`Bookable`** = MIN của các tầng đang ràng buộc — chính là con số đặt được thật.

**Đề xuất UI:** trên `DateStrip`/`DatePicker`, làm mờ ngày có `numberOfUnused = 0`; trên lưới khung giờ, ẩn/khoá zone đã kín cho ngày đang chọn.

---

### 2.2 🔴 Huỷ đặt chỗ đang ghi sai trạng thái — dùng `NoShow(7)` thay vì `Cancel(3)`

**Chỗ hỏng:** `src/api/reservations.ts:118-131` (comment 118-121, payload dòng 124)

```ts
/** ... there's no dedicated "cancelled by guest" code, so it reports back as status 7 (No-show). */
const payload = { globalId, status: ReservationStatus.NoShow };   // ← 7
```

**Comment này sai.** `Cancel = 3` tồn tại và đúng là trạng thái dành cho việc huỷ (`API-Reservation-Integration.md` §3.1: *"Cancel = 3 (Đã hủy - giải phóng chỗ)"*).

**Hai hệ quả thật sự:**

1. **Email/SMS không được gửi.** `WriteReservationBookingsUseCase.cs:410-416` chỉ enqueue thông báo khi trạng thái mới là `Confirm` hoặc `Cancel`:
   ```csharp
   var mailKind = data.Status.Value switch {
       ReservationBookingStatus.Confirm => NotifyKind.BookingConfirm,
       ReservationBookingStatus.Cancel  => NotifyKind.BookingCancel,
       ...
   ```
   Ghi `NoShow(7)` ⇒ khách **không nhận được email xác nhận huỷ**.

2. **Báo cáo sai.** No-show là "khách đặt nhưng không đến" — chỉ số dùng để đánh giá khách hàng. Khách chủ động huỷ trước bị đếm vào no-show làm hỏng số liệu vận hành.

**Sửa:** đổi sang `ReservationStatus.Cancel` (3) và xoá comment sai.

---

### 2.3 🔴 Thiếu hai trạng thái booking `AutoClose(9)` / `AutoCancel(10)`

**Chỗ hỏng:** `src/api/types.ts:4-13` — enum chỉ có 1→8.

BE đã có (`Core/Domain/Entities/ReservationBookings.cs:75,82`):

| Giá trị | Tên | Khi nào |
|---|---|---|
| `9` | `AutoClose` | Khách ngồi quá `DurationMinutes` của zone (zone bật `IsUseDurationMinutes = 1`) |
| `10` | `AutoCancel` | Quá giờ hẹn + `WaitingTime` của zone (zone bật `IsAutoCancel = 1`) |

**Hệ quả:** `MyBookingsPage` / `BookingDetailPage` `switch` trên `status` không có nhánh mặc định ⇒ booking bị hệ thống tự huỷ hiện **nhãn trống**, khách tưởng đặt chỗ vẫn còn hiệu lực.

> Tham khảo: app Hostess đã xử lý đúng hai giá trị này (`Hotess_HQ/src/types/index.ts` — `AutoClose: 9`, `AutoCancel: 10`, coi là terminal).

---

### 2.4 🔴 `RestaurantPage` vẫn lấy "món signature" từ mock

**Chỗ hỏng:** `src/pages/RestaurantPage.tsx:30`

```ts
const { items: menuItems } = useMenu(settings?.siteId ?? 0, settings?.sNum ?? 0);  // ← queries.ts → mock
const signatureItems = menuItems.filter((item) => item.isSignature).slice(0, 3);
```

`useMenu` → `fetchMenuCategories`/`fetchMenuItems` (`api/reservations.ts:79,88`) → `MOCK_MENU_ITEMS` lọc theo `SITE_ID = 2` cứng trong `mockData.ts:13`.

**Hệ quả:** với cửa hàng thật, `signatureItems` **luôn rỗng** — khối "Món đặc trưng" không bao giờ hiện.

**Sửa:** dùng `data.menu` / `data.reserMultiMenus` đã có sẵn trong `StoreDataContext` (chính `MenuPage` đang dùng đúng cách). Không cần request thêm.

---

### 2.5 🔴 Bỏ hẳn `mockData.ts` khỏi luồng chạy

`src/api/reservations.ts:48-91` còn 8 hàm mock. Sau khi sửa 2.4 thì chỉ còn `fetchStores`/`fetchStore` được `useStores`/`useStore` gọi (nếu có màn hình nào dùng).

**Thay bằng API thật:**

| Hàm mock | Endpoint thật |
|---|---|
| `fetchStores` / `fetchStore` | `GET api/StoreInfo?SiteId=&SNUM=&STORENUM=` |
| `fetchZones` | đã có trong `data.zones` (`ReservationLinks/Booking`) |
| `fetchPeriods` | `data.periods` |
| `fetchPeriodRules` | `data.periodRules` |
| `fetchDateOverrides` | `data.dateOverrides` |
| `fetchMenuCategories` / `fetchMenuItems` | `data.menu.categories[].products[]` |

Sau đó xoá `mockData.ts` để không ai vô tình import lại.

---

## 3. P1 — API đã có, Booking_HQ chưa dùng

### 3.1 Chưa đọc cờ tạm dừng của Zone và Channel

`ReservationConfigDTO` trả về nhưng FE không đọc:

| Trường | Nằm ở | Ý nghĩa | Trang đặt bàn phải làm gì |
|---|---|---|---|
| `zones[].isPauseBooking` | `BookingZoneDTO` | Khu vực đang tạm dừng nhận đặt | Ẩn khỏi danh sách chọn khu vực |
| `zones[].isNoTable` | nt | Khu vực không có bàn vật lý | Không hiện sơ đồ bàn cho zone này |
| `channel.isPauseBooking` | `BookingChannelDTO` | **Cả kênh** đang tạm dừng | Chặn toàn bộ form đặt bàn, hiện thông báo "Cửa hàng tạm ngưng nhận đặt online" |
| `channel.isLimitAvailable` + `channel.qtyLimit` | nt | Hạn mức tổng của kênh | Cảnh báo sắp hết / đã hết |
| `periods[].isLimitAvailable` + `periods[].qtyLimit` | `BookingPeriodDTO` | Hạn mức theo khung giờ | nt |

⚠️ **Hạn mức kênh nay chặt hơn trước:** booking `Confirm → Seated` **không còn tự nhả** hạn mức kênh; kênh đếm cả `Confirm(2)` / `Reserved(4)` / `Seated(6)` (xem `FE-V2-RESERVATION-SLOT-POOL.md` §5.2). Kênh có `qtyLimit` sẽ hết chỗ **sớm hơn** so với hành vi cũ.

### 3.2 Chưa dùng `isPrimary` — cờ **mới** cho Zone / Channel

Mới trong bản chưa commit (`SqlReport/ReservationPrimaryZoneChannel-Migration.sql`):

| Quy tắc BE | Chi tiết |
|---|---|
| Mỗi `(SiteId, SNum, StatNum)` có **tối đa một** zone và **một** channel mặc định | partial unique index |
| `POST api/ReservationBookings` bỏ trống `ZoneID` | rơi vào zone `IsPrimary = 1`. **Chưa cấu hình ⇒ booking không gắn zone và KHÔNG trừ sức chứa** |
| Bỏ trống `ChannelID` | rơi vào channel `IsPrimary = 1` |
| `PUT` bỏ trống | **giữ nguyên** giá trị cũ (PUT không rơi về `IsPrimary`) |

**Cần làm:**
1. Thêm `isPrimary?: number` vào `ReservationZone` / `BookingChannel` trong `api/booking.ts`.
2. `RestaurantPage` **chọn sẵn** zone có `isPrimary = 1`.
3. `BookPage.tsx:99-101` hiện gửi `channelID` từ `linkInfo.channelId` và `zoneID` từ query string — ⚠️ **bảo đảm `zoneID` luôn có giá trị**. Bỏ trống ở station chưa cấu hình zone mặc định ⇒ booking không trừ vé ⇒ bán quá chỗ.

### 3.3 Chưa dùng `poolID` khi tạo booking

`POST` / `PUT api/ReservationBookings` nhận thêm `poolID` (**tuỳ chọn**). **Khuyến nghị cho trang đặt bàn công khai: bỏ trống** — server tự duyệt các kho theo `priority` và chọn kho đầu tiên còn đủ chỗ cho **trọn** đoàn.

Response `POST`/`GET` nay **luôn trả `poolID`** — nên thêm vào type `ReservationBooking` để không mất dữ liệu ở màn hình chi tiết.

### 3.4 `storeRecommendations` đang có dữ liệu nhưng không render được

`src/pages/HomePage.tsx:31` đọc `data.storeRecommendations`, nhưng `BookingStoreRecommendationDTO` **chỉ trả `recommendStatNum`** — không có tên, logo, hay `publicKey` để làm link.

**Cách nối hiện tại (N+1, nhưng chạy được):**

```
GET api/ReservationLinks?SiteId={siteId}&StatNum={recommendStatNum}&IsActive=1
  → { publicKey, siteId, sNum, statNum, channelId }
→ link tới /{publicKey}
```

Muốn có tên + logo thì gọi thêm `GET api/StoreInfo?SiteId=&SNUM=` hoặc `GET api/ReservationLinks/Booking?publicKey=` cho từng cửa hàng.

**Đề xuất gửi BE:** bổ sung `storeName` / `logoUrl` / `publicKey` thẳng vào `BookingStoreRecommendationDTO` (xem mục 5).

### 3.5 Theo dõi đơn pre-order sau khi chốt

`src/api/orderHub.ts` chỉ có `fetchSessionOrders` (`GET Public/Orders`). **Chưa dùng:**

| Endpoint | Dùng để |
|---|---|
| `GET api/OrderHub/Public/Orders/{orderUid}` | Chi tiết đơn: header + `items[]` kèm `lineStatus` + `statusHistory[]` |
| `GET api/OrderHub/Public/Orders/{orderUid}/status` | Poll trạng thái — **luôn hiển thị `messageForCustomer` do server trả**, không tự map chuỗi trạng thái |
| `POST api/OrderHub/Public/Session/Resume` | Nối lại phiên bàn đang mở mà không đẻ bill mới |
| `GET api/OrderHub/Public/Theme` | Chủ đề/logo trước khi có token (màn hình loading đã có thương hiệu) |

Riêng `Session/Resume` với kênh `reservation` thì chưa cần — kênh này không mở bill trên POS.

### 3.6 `api/ReservationTranslations` — i18n do cửa hàng cấu hình

App có `src/i18n` với EN/VI, nhưng tên khu vực, tên khung giờ, nhãn trường phụ (`extraFieldConfigs[].fieldName`) đều hiện nguyên văn tiếng Việt ở bản EN. `GET api/ReservationTranslations` là nguồn dịch chính thức của các nhãn do cửa hàng nhập.

---

## 4. P2 — Dữ liệu mới của API chưa đọc

### 4.1 Món hết hàng trong thực đơn pre-order

**Mới** — `GET api/OrderHub/Public/Menu` và `Product/{n}` nay trả (`GetPublicMenuUseCase.cs:19-36`):

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `stockTracked` | `bool` | Món có quản tồn không. `false` ⇒ bỏ qua hai trường dưới |
| `available` | `int?` | Số còn bán được (`COUNTDOWN` của HQ − phần đang giữ). `null` khi không quản tồn |
| `isSoldOut` | `bool` | **Đã hết — làm mờ món và chặn chọn** |
| `refCode` | `string?` | Mã tham chiếu POS |
| `tax` | object | Thuế đang áp cho món |
| `priceSchedule` | object | Bảng giá từng giờ của 7 thứ |

**Chỗ hỏng:** `src/api/orderHub.ts` — `OrderHubMenuProduct` (dòng ~77-88) **không khai báo** các trường này. `available` ở dòng 239 chỉ là trường trong payload lỗi 409 của `Checkout`.

**Hệ quả:** khách chọn được món đã hết, chỉ biết khi `Checkout` trả **409** với `issues[].type = "SOLD_OUT"`. Trải nghiệm tệ và có thể mất đơn.

Cùng nguồn dữ liệu này cũng có trong `data.menu.categories[].products[]` của `ReservationLinks/Booking` (`BookingMenuProductDTO` — `Price`, `RefCode`, `Tax`, `PriceSchedule`, `StockTracked`, `Available`, `IsSoldOut`), nên `MenuPage` cũng nên đọc.

### 4.2 `priceDelta` của topping **luôn = 0** — đừng hứa giá với khách

`GetPublicProductUseCase.cs:146` đặt cứng `PriceDelta = 0`; comment ngay trên đó ghi rõ nguồn dữ liệu chưa cung cấp `selectionType`/`isRequired`/`min`/`max`/`priceDelta`.

**FE phải:** không cộng `priceDelta` vào tổng hiển thị, hoặc ghi chú "phụ thu tính tại quầy". Đây là lỗi BE đã biết (`ORDERHUB_API_GUIDE.md` §10).

### 4.3 `Cart/promo` chỉ lưu mã, **chưa trừ tiền**

`POST api/OrderHub/Public/Cart/promo` lưu mã nhưng `discountAmount` giữ nguyên `0` — engine khuyến mãi chưa nối. **Không hứa mức giảm với khách.**

### 4.4 Tham số `lang` của Menu/Product hiện **không có tác dụng**

`OrderHubPublicController.cs:200,228` nhận `[FromQuery] string? lang` nhưng chuyển xuống use case **không truyền lang**:

```csharp
result.Data = await _menu.ExecuteAsync(ctx.SiteId, ctx.StoreId, ctx.StatNum);       // lang bị bỏ
result.Data = await _product.ExecuteAsync(ctx.SiteId, ctx.StoreId, ctx.StatNum, id); // lang bị bỏ
```

`src/pages/PreOrderPage.tsx` đang tải lại menu khi khách đổi ngôn ngữ — **thao tác này hiện vô ích**. Giữ lại code cũng được (sẽ đúng khi BE làm xong), nhưng đừng kỳ vọng menu đổi tiếng.

### 4.5 `placeholderTableNum` — nên lấy từ cấu hình, không suy đoán

`src/pages/PreOrderPage.tsx:116-119` lấy `Math.min(...tableSetups.tablenum)` làm số bàn giả cho phiên `reservation`.

`GET api/OrderHub/Settings?SiteId=&StatNum=&SNum=` đã có `tableNumDelivery` và `tableNumTakeaway` cho đúng mục đích này (bàn ảo cho kênh không ngồi tại chỗ). Hiện **chưa có** `tableNumReservation` — đề nghị BE bổ sung (mục 5), trong lúc chờ thì dùng `tableNumDelivery` sẽ ổn định hơn số bàn nhỏ nhất (bàn nhỏ nhất có thể bị xoá/đổi trong `TableSetup`).

---

## 5. Cần BE bổ sung

| # | Việc | Vì sao |
|---|---|---|
| 1 | **CORS chỉ cho phép `localhost` / `127.0.0.1`** (`Program.cs:188-199`) | Trang đặt bàn của khách **bắt buộc** chạy trên domain thật. Không mở CORS thì mọi request bị chặn, trừ khi đặt sau reverse proxy same-origin. **Chặn go-live** |
| 2 | `BookingStoreRecommendationDTO` chỉ có `recommendStatNum` | FE không render nổi thẻ "Nhà hàng gợi ý". Cần thêm `publicKey` + `storeName` + `logoUrl` |
| 3 | `OrderHubSettings` thiếu `tableNumReservation` | Kênh `reservation` đang phải bịa số bàn |
| 4 | `lang` của `Public/Menu` và `Public/Product` chưa có tác dụng | Trang đặt bàn song ngữ nhưng thực đơn chỉ một thứ tiếng |
| 5 | `priceDelta` của topping luôn `0` | Tổng tiền hiển thị lệch với POS |
| 6 | Thuế đang là VAT phẳng theo `SysInfo.TAXRATE1` | `grandTotal` có thể lệch `FINALTOTAL` trên POS |
| 7 | `POST Public/Orders/{uid}/Cancel` chưa có | Khách **không tự huỷ pre-order được**; hiện phải nhờ lễ tân gọi `PUT Orders/{orderUid}/status` |
| 8 | Cổng thanh toán chưa có (`ORDERHUB_API_GUIDE.md` §10) | Đơn `paymentMode: ONLINE` **dừng ở `awaiting_payment`**. Muốn chạy đầu-cuối phải cấu hình kênh dùng `paymentMode: POS` |

---

## 6. Checklist theo thứ tự làm

### Sprint 1 — P0 (chặn go-live)
- [ ] Nối `GET api/AvailableSlots` vào `DateStrip` + lưới khung giờ; đọc thẳng `numberOfUnused`
- [ ] Bỏ dùng `globalId` của `AvailableSlot` làm key
- [ ] Đổi huỷ đặt chỗ từ `NoShow(7)` → `Cancel(3)` (`api/reservations.ts:124`)
- [ ] Thêm `AutoClose: 9`, `AutoCancel: 10` vào `ReservationStatus` + nhãn/màu + nhánh mặc định cho `switch`
- [ ] `RestaurantPage.tsx:30` dùng `data.menu` thay cho `useMenu` mock
- [ ] Gỡ `mockData.ts` khỏi luồng chạy; `fetchStores` → `GET api/StoreInfo`

### Sprint 2 — P1
- [ ] Đọc `zones[].isPauseBooking` / `isNoTable`, `channel.isPauseBooking` / `qtyLimit`, `periods[].qtyLimit`
- [ ] Thêm `isPrimary`; chọn sẵn zone mặc định; **luôn gửi `zoneID` tường minh**
- [ ] Thêm `poolID` vào type `ReservationBooking` (không gửi khi POST)
- [ ] Thẻ "Nhà hàng gợi ý": map `recommendStatNum` → `publicKey` qua `GET api/ReservationLinks`
- [ ] Poll `GET Public/Orders/{orderUid}/status` sau khi chốt pre-order, hiển thị `messageForCustomer`

### Sprint 3 — P2
- [ ] Khai báo + hiển thị `isSoldOut` / `available` / `stockTracked` trong `MenuPage` và `PreOrderPage`
- [ ] Bỏ cộng `priceDelta` vào tổng, hoặc ghi chú "phụ thu tính tại quầy"
- [ ] Ghi rõ mã giảm giá **chưa trừ tiền**
- [ ] `api/ReservationTranslations` cho nhãn zone / khung giờ / trường phụ
- [ ] Dùng `tableNumDelivery` từ `GET api/OrderHub/Settings` thay cho `placeholderTableNum`

---

## 7. Phụ lục A — Bảng trạng thái booking đầy đủ

| Giá trị | Tên | Ý nghĩa | Booking_HQ |
|---|---|---|---|
| `1` | New | Đợi xác nhận — **chưa giữ chỗ thực tế** | ✅ |
| `2` | Confirm | Đã xác nhận — bắt đầu giữ chỗ | ✅ |
| `3` | Cancel | Đã huỷ — giải phóng chỗ | ⚠️ khai báo nhưng **không dùng khi huỷ** |
| `4` | Reserved | Đã xếp bàn cụ thể | ✅ |
| `5` | Overdue | Quá giờ hẹn — nhả chỗ. **API tự suy ra khi trả về** (`ResolveDisplayStatus`) | ✅ |
| `6` | Seated | Khách đã ngồi bàn | ✅ |
| `7` | NoShow | Khách không đến | ⚠️ **đang bị dùng sai cho việc huỷ** |
| `8` | Close | Đóng booking — bill POS đã thanh toán | ✅ |
| `9` | **AutoClose** | Hệ thống tự đóng khi quá `DurationMinutes` của zone | 🔴 **thiếu** |
| `10` | **AutoCancel** | Hệ thống tự huỷ khi quá giờ hẹn + `WaitingTime` | 🔴 **thiếu** |

> `Overdue(5)` là **trạng thái hiển thị**: bản ghi trong DB giữ nguyên `Confirm`/`Reserved`, chỉ đối tượng trả về được điều chỉnh (`ReservationBookings.cs:90-100`). Đừng ghi ngược `5` lên server.

## 8. Phụ lục B — Endpoint miền Reservation

`✅` đang dùng · `⬜` nên dùng · `➖` không thuộc trang khách

| Endpoint | Booking_HQ |
|---|---|
| `api/ReservationLinks/Booking` | ✅ |
| `api/ReservationLinks` (GET) | ⬜ P1 (map `recommendStatNum` → `publicKey`) |
| `api/ReservationBookings` GET/POST/PUT | ✅ (PUT dùng sai status) |
| `api/AvailableSlots` | 🔴 **P0 — chưa dùng** |
| `api/ReservationSlotPools/availability` | ⬜ P0 (phương án chi tiết hơn) |
| `api/StoreInfo` | ⬜ P0 (đang mock) |
| `api/ReservationZones` · `Periods` · `PeriodRules` · `DateOverrides` | ✅ (qua `ReservationLinks/Booking`) |
| `api/ReservationExtraFieldConfigs` / `Options` / `ExtraValues` | ✅ (config qua `ReservationLinks`, values gửi lồng trong booking) |
| `api/ReserMainCarousels` · `HighlightEvents` · `GoodToKnows` · `Howitworks` · `MenuTags` | ✅ (qua `ReservationLinks/Booking`) |
| `api/ReserStoreRecommendations` | ⚠️ có dữ liệu, không render được |
| `api/ReservationTranslations` | ⬜ P2 |
| `api/ReservationWaitlists` | ➖ (nghiệp vụ lễ tân) |
| `api/ReservationZoneSwitchSlots` · `SlotPools` · `SlotAllocations` · `SlotOverrides` | ➖ (back-office) |
| `api/OrderHub/Public/*` | ✅ (thiếu `Theme`, `Orders/{uid}`, `Orders/{uid}/status`) |
