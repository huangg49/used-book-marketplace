# ADR 0044: Auction wins can be delivered from the point

20/10/2026. Owner decision: the winner of an auction may have the book delivered
instead of collecting it at the point. The owner lifted the READINESS gate for
this package only (“Delivered/inspection/settlement” for ViaPoint auction
Orders). The carrier is the project simulator; no real carrier or money is used.
This implements the `CarrierOutbound` choice already named in DEC-04/FR-H11/FR-T03
of [LOCAL-AUCTION-01](../features/LOCAL_HANDOVER_AUCTION.md) for auction Orders.

## Decision

- **Choice at payment.** A won auction still forms one ViaPoint Order with
  `SelfCollect` as the default method. When paying, the winner chooses
  `SelfCollect` or `CarrierOutbound`. Delivery needs one of the winner's saved
  addresses in the supported service area (`HCM-DEMO-v1`, ADR 0039). The choice
  is final once paid; v1 has no switching afterwards.
- **Fee.** The outbound fee is the `shippingFee` of the selected DirectSale
  policy (one demo area, fixed fee, same as ordinary deliveries). The buyer sees
  it first (`GET /me/point-orders/{id}/delivery-quote`). The payment command
  carries `expectedOutboundFee` and the address version, so a changed fee or
  address is refused (409) instead of being charged silently.
  `buyerTotal = bookPrice + outboundFee` moves into the Order hold in one
  payment. The formation agreement snapshot stays frozen. A separate delivery
  snapshot (`point_order_deliveries`) records the address, policy code, fee and
  time of the choice.
- **Report, then dispatch.** The 72-hour report acceptance (POL-32) is
  unchanged. Accepting opens the same window (`ReadyForCollection`, 72 hours
  ending within point hours, POL-33). For delivery this window is for the
  point to hand the book to the carrier. No collection code is issued.
- **Hand-off to the carrier.** An assigned Staff member, independent of buyer
  and seller and during point hours, records the hand-off to the simulated
  carrier (`POST /operations/point-orders/{id}/dispatch`). The Order becomes
  `InTransit` with a tracking code and a delivery deadline of 240 hours (the
  same as carrier pickups). Custody leaves the point once: the handover row has
  method `CarrierOutbound`, so the code-checked `SelfCollect` handover cannot
  follow.
- **Carrier events.** An independent TEST_OPERATOR posts the signed simulated
  delivery event (`Delivered` or `Failed`; Idempotency-Key = eventId).
  Khi hãng báo `Delivered`, đơn chờ người mua ở bước **Nhận sách**. Người
  mua xác nhận đã nhận thì 72 giờ kiểm tra bắt đầu từ lúc xác nhận. Người
  mua báo chưa nhận, hãng báo `Failed`, hoặc hết hạn giao mà đơn chưa có xác
  nhận của người mua thì mở `ResolutionPending` theo quy trình `DeliveryFailed`.
  Tiền tiếp tục được giữ cho tới khi xử lý theo quy trình hiện có.
- **Failures.**
  - The book not handed to the carrier in time opens the existing
    `CollectionOverdue`. For delivery the buyer is never at fault: a refund
    states `NoFault`, or the Admin opens a new dispatch window.
  - For `DeliveryFailed` the independent Admin can only require the book back.
    The carrier returns it to the point and Staff receive it with the existing
    return check, which refunds the whole `buyerTotal` (including the fee) and
    sends the book to reclaim.
  - A missed carrier return reopens `DeliveryFailed`. There is no redelivery
    in v1.
- **Money.** Settlement is unchanged. The seller receives `P − C`; the platform
  account receives `C + outboundFee` (it pays the simulated carrier). A refund
  always returns the full hold.

## Persistence and contract

Migration 0034 (`0034-auction-delivery`):

- `point_orders`: adds `CarrierOutbound`, a positive outbound fee (only with
  delivery, set at payment), state `InTransit`, reason `DeliveryFailed`, and
  `dispatchedAt`, `deliveryDeadline` and `trackingCode`.
- `point_handovers`: adds method `CarrierOutbound` with no code.
- `point_order_resolutions`: allows `DeliveryFailed` → `RequireReturn`.
- New collections: `point_order_deliveries` (address/fee snapshot) and
  `point_carrier_events` (append-only signed events).

The contract adds the delivery quote, the payment choice, the dispatch command,
the simulated point delivery event, the new state/reason and the delivery
fields on `PointOrder` and the Staff queue.

## Limits

No real carrier, delivery tracking map, redelivery, partial refund of the fee,
or change of method after payment. The point Staff see the recipient name,
phone and address only for Orders they must dispatch; the seller never sees
them.

## Theo dõi trên Driver

Member web mở `/driver` với mã vận đơn đã cấp khi điểm bàn giao. API tra cứu
mã cho người mua của đơn và Test Operator đang hoạt động, độc lập với giao dịch.
Kết quả gồm thời điểm bàn giao, hạn giao và kết quả đã ghi nhận, không có tên,
điện thoại hay địa chỉ người nhận. Driver dùng lại lệnh báo kết quả mô phỏng
hiện có cho Test Operator. Giao thành công mở hạn kiểm tra theo FR-T03.

Khi máy demo bật `DEMO_SKIP_ENABLED` và dùng Mongo local, người thắng
mở Simulator từ đơn đang vận chuyển. **Bắt đầu đi giao** ghi mốc mô phỏng
trong receipt, rồi **Giao thành công** ghi sự kiện carrier và mở hạn kiểm
tra 72 giờ. Bước đầu giữ đơn ở InTransit. Cả hai lệnh kiểm quyền người mua,
bàn giao, hạn giao và phiên bản. Driver vận hành tiếp tục dùng quyền
Test Operator.

Nút **Hoàn tất kiểm tra ngay · Demo** từ bước kiểm tra dùng cùng quy trình
giải ngân với job hết hạn. Migration 0081 giữ hạn kiểm tra 72 giờ và ghi
`demoInspectionCompletedAt` khi đơn demo kết thúc sớm. Giải ngân, đóng đơn
và receipt cùng commit trong một giao dịch. Chỉ người mua hoặc người bán của
đơn đang kiểm tra mới bấm được khi cổng demo local đã bật.
