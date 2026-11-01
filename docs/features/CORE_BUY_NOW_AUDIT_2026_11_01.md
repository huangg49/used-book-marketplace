# Khảo sát luồng mua ngay và giao trực tiếp — 01/11/2026

Source khảo sát: `49c5ae1d978098e83dfaf5974f2611adc35aaefb`, đối chiếu main
`be581aeca4afaf3a7cea8b4b047281fd78e661de`. Chỉ khảo sát, chưa sửa các finding
bên dưới. Tài liệu này là đầu vào giao việc, không phải nghiệm thu/release.

## Hành trình và kết luận

Buyer từ kệ/tìm kiếm → chi tiết → địa chỉ/quote → Order chưa trả tiền → thanh toán
ví mô phỏng → Seller đóng gói/đăng ký shipment → carrier pickup → giao nhận/kiểm
tra → kết thúc. Quote không giữ sách; tạo Order giữ sách 15phút; payment BuyNow
giữ P+S và chuyển Preparing atomically. Ledger/commitment/replay có bảo vệ và
evidence kiểm thử. Luồng giao nhận gặp lỗi và ranh giới sau F2h chưa hoàn chỉnh.

## Finding xác nhận và phạm vi giao việc

| Ưu tiên | Finding / tác động | Source và bằng chứng | Giao điểm cần phối hợp |
| --- | --- | --- | --- |
| P1 | Carrier báo Delivered nhưng Buyer phủ nhận thì non-receipt trả409 InvalidState; không mở review. Worker vẫn có đường quyết toán sau72h. Chưa có claim chất lượng DirectOrder tương ứng FR-D01 | [openDeliveryReview](../../apps/api/src/modules/orders/orders.service.ts) chỉ nhận InTransit/ResolutionPending và quá hạn giao; [worker](../../apps/api/src/modules/orders/order-expiry.service.ts) quét Inspection. HTTP QA: Delivered→Inspection/v5, canReportNonReceipt=false, tiền155.000VND mô phỏng giữ; Buyer báo không nhận bị409, review=null. Một đơn khác Buyer receipt→clock qua72h→tick thành Completed/hold0/một settlement journal | API/ledger/contract/QA; owner quyết định ranh giới gate trước khi nối UI. [BR-17/18, EF-10](../SRS_V1_1.md), [READINESS](../handoff/READINESS.md), [ADR0038](../adr/0038-direct-buy-now-orders.md) giữ thẩm quyền; không chỉ thêm nút đã nhận |
| P2 | Web dùng chung nội dung ResolutionPending/Inspection và nói sách đã giao, đang kiểm tra72h kể cả quá hạn pickup chưa có custody | [OrderDetails](../../apps/user-web/src/pages/OrderDetails.tsx). QA expirePickup: ResolutionPending/held155.000, deliveredAt=null, inspectionDeadline=null; browser vẫn nói đã giao | Web + API projection: nguyên nhân, hạn, người đang chờ và đường hỗ trợ phải đúng state |
| P2 | RN dùng lại quote hết hạn cho cùng địa chỉ/revision; đóng/mở lại vẫn đọc cùng ID và hiện đặt mua | [buy-now-modal](../../apps/mobile-react-native/src/features/orders/buy-now-modal.tsx) chỉ đổi attempt theo signature; [quoteSchema](../../apps/mobile-react-native/src/features/orders/contracts.ts) bỏ assessment. QA clock+16phút: GET assessment=Expired, Expo web mở lại reuse ID | RN/session + API: phân biệt kết quả bất định cần retry exact key/body với quote đã xác nhận Expired cần renewal |
| P2, thiếu nối | Seller RN chưa upload packaging/register shipment; chỉ bảo chép mã đơn và tự sang Member web | [order-focus](../../apps/mobile-react-native/src/features/orders/order-focus-screen.tsx), [web OrderShipping](../../apps/user-web/src/pages/OrderShipping.tsx). Buyer API canConfirmReceipt=true nhưng web/RN chưa render action/deadline đầy đủ; đoạn sau F2h không tự mở bằng UI | RN ưu tiên: hoàn thiện phần chuẩn bị/gửi thuộc F2h, hoặc chuyển đúng Order có thể tìm lại; hậu kiểm cần gate riêng |

P1 backend và P2 nội dung web đã tồn tại ở main trước chuỗi tích hợp hiện tại;
diff OrdersService của chuỗi chỉ bỏ requireActive khi mở hội thoại nghĩa vụ cũ,
controller thêm ExistingObligation. Không gán bug cũ thành regression của bộ sách.
Quote RN là lỗi phục hồi của client hiện tại, cần task riêng và regression.

Chưa tái hiện: web giữ pay/cancel intent trong component useRef và xóa attempt
trên403/429; cần thử lostACK→rời/quay lại→rate-limit/phiên đổi. Không có bằng
chứng thanh toán hai lần. [ADR0026](../adr/0026-delivery-receipt-inspection.md) và
[DOMAIN_RULES](../architecture/DOMAIN_RULES.md) còn ghi receipt/inspection planned
trong khi source đã có; cần đối chiếu trạng thái tài liệu, không tự Accepted/đóng gate.

## Kiểm chứng thực chạy

Windows, Node24.22.1/pnpm11.19.0; Vitest4.1.11 chạy source. Mongo QA replica set
riêng rs-test, database riêng kết thúc `_test`. HTTP Nest/Mongo thật; storage/ảnh
synthetic, wallet/carrier simulator, mail local không gửi. Browser Member web và
RN qua static Expo web export; không suy native PASS. Provider clock riêng của
fixture được tiến thời gian; không đổi đồng hồ máy hoặc dữ liệu ứng dụng chính.

| Check | Kết quả và giới hạn |
| --- | --- |
| order-payment.e2e-spec.ts; filter buy-now, insufficient available, two orders cannot spend,100concurrent payment | PASS9/SKIP41; auth/stale/race/replay/rollback/expiry |
| wallet-checkout.e2e-spec.ts; keeps money held through delivery | PASS1/SKIP40; receipt/72h/settle một lần happy path, không chứng minh claim đầy đủ |
| shipments.e2e-spec.ts + carrier-pickup.e2e-spec.ts; replay, timely pickup, denied roles, binding, HMAC | PASS5/SKIP56. Bộ lọc register không khớp tên ca, không tính ca đó PASS; registration vẫn thực hiện qua HTTP trong probe và ca completion |
| HTTP negative: carrier Delivered→Buyer non-receipt | FAIL yêu cầu BR-17:409 và không review |
| Web quá hạn pickup | FAIL nội dung: khẳng định đã giao khi deliveredAt/deadline null |
| RN Expo web quote hết hạn | FAIL phục hồi: reuse quote Expired; native NOT RUN |
| QA worker tick quá hạn inspection | PASS cơ chế hiện tại: Completed/hold0/một journal; không đóng gate |

Tổng15E2E PASS,137SKIP theo filter; không full-suite PASS. Native Android/iOS,
TalkBack, Flutter, giao nhận thật và human acceptance NOT RUN. Không GHN, provider
trả phí, Brevo hoặc storage thật. Fixture DB/users/roles và DB E2E đã dọn có đối
soát; dịch vụ QA do lượt khảo sát mở đã dừng. DB/bucket/env chính giữ nguyên.

## Ba gói tiếp theo

1. Chốt và bảo vệ ranh giới sau F2h: API/worker/contract không giải ngân vượt gate
   khi Buyer chưa có đường claim tương ứng; giữ nguyên hold/review hiện có. Owner
   quyết định phạm vi và người thật nghiệm thu tiền/quyền trước mở hậu kiểm đầy đủ.
2. Sửa renewal quote RN và thông điệp trạng thái web trong phạm vi hiện có; kiểm
   expired/stale/lostACK/đổi địa chỉ/Back, nguyên nhân review/hạn/bước tiếp. Có thể
   làm độc lập sau khi giao task, không cần GHN hoặc mở gate mới.
3. Nối Seller RN đóng gói/đăng ký shipment tới F2h; kiểm upload lỗi/polling/replay/
   deadline/sai owner và native riêng. Trong thời gian chuyển tiếp mở đúng Order
   ở web, không yêu cầu người dùng tự dò. Nhóm nghiệm thu trên thiết bị thật.

Nên làm việc số1trước vì quyền khiếu nại và thời điểm giải ngân phải khớp nhau.
