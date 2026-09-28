# ADR 0026: Delivered, Buyer receipt and inspection window (DirectDelivery Order)

**Status: Proposed — bản nháp D01, chưa review, chưa triển khai.** 29/09/2026.
Không có API, migration hay worker nào trong tài liệu này tồn tại. OpenAPI vẫn 0.20.0.
Cần reviewer tiền/quyền theo TEAMWORK chấp nhận và chủ dự án trả lời các câu hỏi ở §9
trước khi mở T01. Mở rộng ADR 0013, 0020–0025.

Nguồn: SRS 1.1 §7.3 (Order), §7.5 (Shipment), POL-07/08, FR-O07/O08/O10,
FR-S03/S04/S05, FR-D01/D02, BR-15–BR-18, EF-10/EF-11, AC-13/AC-14/AC-16.

## 1. Phạm vi

Trong phạm vi: một Order DirectDelivery một chiều outbound, từ InTransit (pickup
Applied, ADR 0024) tới khi cửa sổ kiểm tra 72 giờ (POL-08) kết thúc hoặc bị chặn bởi
claim/review. Gồm ba nguồn sự kiện: carrier mô phỏng báo Delivered/DeliveryFailed/Lost,
Buyer xác nhận đã nhận, Buyer phủ nhận Delivered (BR-17 nhánh 1).

Ngoài phạm vi (gói khác): quyết toán tiền và listing Sold (D03/T04), claim chất lượng và
hồ sơ chứng cứ (D02/T02), giải quyết review/return (T03), Exchange (E0x), ViaPoint
(P0x), UI Member/ops (C05/O01). Tài liệu này chỉ định nghĩa điểm nối tới các gói đó.

## 2. Nguyên tắc giữ nguyên

- BR-15: Delivered ≠ Completed. Không journal, không release hold, không đổi listing,
  commitment hay ownership phase trong mọi command của ADR này.
- FR-S03: chỉ adapter (TEST_OPERATOR độc lập, như ADR 0024) ghi carrier event; Member
  chỉ xác nhận/phủ nhận việc chính mình nhận.
- FR-S04/AC-16: event cũ/lặp/sai thứ tự không lùi trạng thái; review đã mở là sticky.
- Shared command executor, authorization trước replay, khóa theo thứ tự hiện có
  (participants sorted → listing → Order → revisions/media/commitment → shipment → ledger),
  thời điểm quyết định là DB time sau khi đủ khóa; receipt/audit/outbox cùng transaction.
- LOCKED/RESTRICTED Buyer vẫn thực hiện nghĩa vụ hiện có (ADR 0019) qua
  ExistingObligation + kiểm tra ownership trong service.

## 3. Actor × command

| Actor | Command (đề xuất) | Điều kiện quyền | Không được |
|---|---|---|---|
| TEST_OPERATOR độc lập | `POST /operations/simulator/delivery-events` type `Delivered`/`DeliveryFailed`/`Lost` | ACTIVE, verified, phiên hợp lệ, không phải Buyer/Seller; chữ ký HMAC domain `LatLaiCarrierDelivery-v1\n` | Chọn deadline, trạng thái Order, tiền |
| Buyer | `POST /orders/{id}/receipt` xác nhận đã nhận | MEMBER verified, đúng Buyer, phiên hiện tại, Idempotency-Key, expectedVersion | Khai thời điểm nhận; kết thúc sớm cửa sổ (AC-14) |
| Buyer | `POST /orders/{id}/non-receipt` mở rộng: phủ nhận Delivered | Như ADR 0025 + đang trong cửa sổ kiểm tra | Phủ nhận sau khi đã tự xác nhận nhận (xem Q4) |
| Seller | Chỉ đọc | — | Tự báo Delivered; xác nhận thay Buyer |
| Order worker `OrderInspectionExpiry` | Nội bộ `expireInspection` | Principal hệ thống allowlist, không qua HTTP | Chạy khi có review/claim/report mở (BR-18) |

## 4. Bảng chuyển trạng thái Order (đề xuất)

Version theo ADR 0025: InTransit = 4, ResolutionPending = 5.

| Trạng thái hiện tại | Sự kiện | Điều kiện | Kết quả |
|---|---|---|---|
| InTransit4, không review | Carrier Delivered đầu tiên hợp lệ | pickup Applied, `occurredAt` ≥ pickup occurredAt và ≤ DB receive time | Inspection5; ghim `inspectionStartsAt`/`inspectionDeadline` (§5) |
| InTransit4, không review | Buyer xác nhận nhận | Đúng Buyer | Inspection5; nguồn BuyerReceipt; ghim deadline |
| Inspection5 | Nguồn nhận còn lại tới sau (Delivered sau BuyerReceipt hoặc ngược lại) | Cùng Shipment | Ghi bằng chứng; **không** đổi deadline, không đổi version (BR-16 dùng mốc sớm nhất) |
| Inspection5 | Buyer bấm nhận lần nữa / key mới | — | 409 hoặc replay receipt gốc; không rút ngắn |
| Inspection5 | Buyer phủ nhận Delivered trong hạn | Nguồn là carrier Delivered, Buyer chưa tự xác nhận (Q4) | ResolutionPending6; DeliveryReview lý do `DeliveredDenied` + báo cáo Buyer |
| Inspection5 | Claim chất lượng hợp lệ (T02) | Trong hạn | ResolutionPending6 — định nghĩa ở D02 |
| Inspection5 | Hết hạn, không review/claim/report/return mở | Worker kiểm tra lại trong transaction | SettlementPending6 với target outcome `SellerPayout` — **chỉ bật khi T02 và T04 có** (Q6) |
| Inspection5 | Carrier Delivered khác `occurredAt` | — | CarrierDeliveryReview sticky; ResolutionPending6; giữ deadline ban đầu (Q3) |
| ResolutionPending5 (pickup/carrier/overdue review) | Carrier Delivered | Hợp lệ | Ghi event + ghim deadline làm bằng chứng; Order giữ nguyên; review không tự đóng |
| ResolutionPending5 | Buyer xác nhận nhận | Đúng Buyer | Ghi xác nhận làm bằng chứng cho review; không tự giải quyết (T03) |
| InTransit4 | DeliveryFailed | Hợp lệ | Order giữ InTransit4; Shipment view DeliveryFailed; deadline 240 h giữ nguyên |
| InTransit4/Inspection5 | Lost | Hợp lệ | ResolutionPending; CarrierLostReview; không refund/restock |
| Bất kỳ trước pickup Applied | Delivered/Buyer receipt | — | 409, không ghi (Q5) |
| Bất kỳ | PickedUp cũ/lặp sau Delivered | Theo ADR 0024 | Duplicate/Conflict evidence; không lùi trạng thái (AC-16) |

Delivery-overdue worker (ADR 0025) phải bỏ qua Order đã có nguồn nhận hợp lệ. Nếu
worker mở DeliveryReview trước (khóa trước), Delivered đến sau chỉ là bằng chứng.

## 5. Thời điểm và deadline

- `inspectionDeadline = inspectionStartsAt + 72h`, policyCode `INSPECTION-v1`, ghim
  bất biến lúc chuyển Inspection. Buyer bấm nhận không rút ngắn (AC-14).
- BuyerReceipt: `inspectionStartsAt` = DB decision time của command.
- Carrier Delivered: BR-16 yêu cầu mốc nhận sớm nhất đã xác minh, nhưng event báo muộn
  với `occurredAt` cũ sẽ rút ngắn quyền kiểm tra. **Đề xuất (chờ Q2):**
  `inspectionStartsAt = min(occurredAt + skew, receivedAt)`, skew mặc định 1 giờ —
  event báo muộn hơn skew bắt đầu từ lúc hệ thống nhận. Không dùng thời gian từ client.
- Khi hai nguồn đều có: dùng mốc sớm nhất đã ghim; nguồn sau không kéo dài/rút ngắn.
- So biên dùng `>=` tại deadline như ADR 0025 (tại đúng deadline là đã hết hạn).

## 6. Hợp đồng wire dự kiến (chưa vào OpenAPI)

- `POST /operations/simulator/delivery-events`: `{eventId, shipmentId, orderId,
  carrier: "LatLaiSimulator", trackingCode, type, occurredAt}`; `Idempotency-Key = eventId`;
  cùng khóa advisory carrier-event toàn cục với pickup; tối đa 128 event/shipment chung
  với pickup (Q7). Kết quả `Applied | Duplicate | ReviewRequired | Rejected`.
- `POST /orders/{id}/receipt`: `{expectedVersion}`; không nhận thời điểm/ghi chú.
- `POST /orders/{id}/non-receipt`: giữ body ADR 0025; thêm nhánh đủ điều kiện “đã có
  carrier Delivered, trong cửa sổ kiểm tra”. Response giữ hình dạng hiện có.
- `GET /me/orders/{id}` thêm nullable `inspection {startsAt, deadline, source,
  policyCode}`, `buyerReceipt {confirmedAt}`, `deliveryEvents` tóm tắt; advisory
  `canConfirmReceipt`, `canDenyDelivery`. Không lộ operator/chữ ký/hash.

## 7. Dữ liệu dự kiến (migration mới, không sửa 17 migration cũ)

- `carrier_delivery_events` append-only (sequence chung hoặc riêng — Q7), FK cùng
  Order/Shipment, đúng một Applied Delivered mỗi Shipment outbound.
- `order_receipt_confirmations` một dòng/Order, receipt Buyer.
- `order_inspections` một dòng/Order: nguồn, startsAt, deadline, policyCode, receipt mở.
- DeliveryReview (ADR 0025) thêm lý do `DeliveredDenied`; `carrier_delivery_reviews`
  cho xung đột/Lost. Tất cả chặn UPDATE/DELETE; check deferred cho chronology,
  state/version và receipt/audit/outbox như các migration 16–17.

## 8. Ma trận kiểm thử bắt buộc cho T01

| Nhóm | Ca |
|---|---|
| Quyền | Seller/Member khác/operator là participant/Staff thường → 404/403; LOCKED/RESTRICTED Buyer xác nhận và phủ nhận được; phiên hết hạn trước replay bị chặn |
| Idempotency | Cùng eventId + payload → receipt gốc sau restart; payload khác → 409; Buyer receipt mất ack → retry cùng key/body |
| Thứ tự | Delivered trước pickup → 409; pickup cũ sau Delivered → không lùi; Delivered trùng/khác occurredAt; DeliveryFailed rồi Delivered |
| Race có barrier | Buyer receipt ∥ carrier Delivered (một lần chuyển, mốc sớm nhất); Delivered ∥ overdue worker tại đúng 240 h; phủ nhận ∥ expiry tại đúng deadline; claim ∥ expiry |
| Biên | Deadline đúng từng mili giây; event báo muộn > skew; occurredAt > receive time → 422 |
| Tiền | Mọi ca: hold P+S đủ, không journal, commitment Active, `wallet:check` khớp |
| Worker | Restart giữa sweep; lỗi một candidate không chặn candidate khác; không expiry khi có review/claim/report |
| Upgrade | Order InTransit/ResolutionPending có sẵn từ 0.20.0 vẫn hợp lệ, không backfill Delivered giả |

Trace: AC-14 (hạn 72 h, Buyer bấm không rút ngắn), AC-16 (không lùi, Lost mở dispute),
FR-D01 (một hồ sơ mở/giao dịch — gộp ở D02), BR-17/EF-10 (phủ nhận Delivered), BR-18.

## 9. Câu hỏi mở cần chủ dự án/reviewer quyết định (decision log)

| # | Câu hỏi | Đề xuất của bản nháp |
|---|---|---|
| Q1 | Buyer xác nhận nhận có được mở cửa sổ khi carrier chưa báo Delivered? | Có (SRS §7.3 “Delivered/Buyer nhận hợp lệ”), mốc = DB time |
| Q2 | Mốc bắt đầu khi carrier event báo muộn | `min(occurredAt + 1h, receivedAt)` như §5 |
| Q3 | Delivered thứ hai khác thời điểm khi đang Inspection | Review sticky, ResolutionPending, giữ deadline đầu |
| Q4 | Buyer đã bấm “đã nhận” rồi phủ nhận Delivered | Không cho phủ nhận; chuyển sang claim sai sách/tình trạng (D02) |
| Q5 | Delivered tới trước PickedUp (adapter thật có thể đảo) | Từ chối 409 trong simulator; adapter thật cần hàng đợi riêng |
| Q6 | Bật expiry → SettlementPending khi chưa có claim chất lượng/settlement | Không; chỉ bật cùng T02 + T04 để Buyer luôn có đường claim trong hạn |
| Q7 | Giới hạn 128 event dùng chung pickup/delivery hay riêng | Riêng 128/loại để pickup lặp không chặn Delivered |
| Q8 | Seller có được xem Buyer phủ nhận/ghi chú? | Xem trạng thái/lý do, không xem mô tả tự do cho tới khi D02 định quyền chứng cứ |

Khi các câu hỏi được chốt, cập nhật ADR này thành Accepted cùng chữ ký reviewer; T01
triển khai contract-first theo §6–§8.
