# Báo giá RN và trạng thái giao nhận web — 02/11/2026

Owner duyệt gói2 sau chốt bảo vệ Buyer. Branch `codex/checkout-quote-recovery`,
base `60d089985bd9b0b92de26671c653dd5c0964b37b`, subject
`fix(checkout): recover expired quotes and clarify delivery reviews`.
Đây là kiểm chứng local, chưa publish hoặc nghiệm thu native/fulfillment.

## Phạm vi và hành trình

| Vai trò / entry | Điều kiện và thao tác | Kết quả, bước tiếp / phục hồi |
| --- | --- | --- |
| Buyer RN: kệ → bản sách → Mua ngay | Quote Current, đúng listing/revision/địa chỉ và còn hạn theo server | Xem tổng tiền → tạo Order. Quote không giữ sách; Order mới giữ15phút. Server vẫn kiểm lại dưới transaction |
| Buyer RN: quote hết hạn trong cửa sổ hoặc sau Back | GET trả Expired hoặc hết ngân sách thời gian từ serverTime/expiresAt | Chặn đặt mua; chủ động “Lấy báo giá mới”, key mới, xem lại tổng tiền trước xác nhận |
| Buyer RN: quote Changed/Unavailable | Thông tin sách/địa chỉ/điều kiện thay đổi | Không đặt mua; đọc lại cùng quote hoặc “Xem lại bản sách” refresh nguồn rồi đóng cửa sổ. Không tự thay version người mua đã xem |
| Buyer RN: mất ACK tạo quote / lỗi GET | Chưa rõ kết quả, kể cả khi địa chỉ đã đổi phiên bản | Thử lại pinned key/body; đã có receipt thì chỉ GET bằng ID. Báo giá cũ khôi phục khác selection không cho mua; sau đó mới chủ động tính phí selection mới |
| Buyer RN: mất ACK tạo Order | Có create intent chưa xác minh | Chỉ retry create gốc qua shared session-client; không lấy quote mới hoặc mở lệnh tài chính ngược. ID đã ACK tiếp tục đọc được sau Back |
| Buyer/Seller web: đơn → thông tin đơn | ResolutionPending + preparation.pickupReview/carrierReview | Nêu đúng quá hạn bàn giao hoặc mâu thuẫn carrier; hiển thị mốc có thật, giữ tiền và trao đổi trong hội thoại. Không khẳng định đã giao sách |
| Buyer/Seller web: đơn quá hạn giao | ResolutionPending + deliveryReview | Nêu chưa xác nhận Buyer nhận sách, hạn giao đã ghi nhận và ACK báo chưa nhận nếu có. Không bịa report hoặc tự hoàn tiền |
| Buyer/Seller web: Inspection lịch sử | API có trạng thái/mốc cũ | Hiển thị thông tin đã ghi nhận, giữ tiền và chưa tự giải ngân khi hết hạn; không hứa luồng claim72h đã đầy đủ |

## Source và giới hạn nghiệp vụ

- [RN modal](../../apps/mobile-react-native/src/features/orders/buy-now-modal.tsx),
  [quote recovery](../../apps/mobile-react-native/src/features/orders/checkout-quote.ts),
  [schema](../../apps/mobile-react-native/src/features/orders/contracts.ts): giữ
  assessment/serverTime, timer dọn khi đóng, guard ngay trước submit, identity key
  remount và selection signature. Không thêm token store. Quote intent trong bộ
  nhớ modal; không hứa khôi phục sau force-stop/reload. Order intents dùng shared
  client hiện có, không thay cơ chế replay tiền.
- [Web schema](../../apps/user-web/src/services/orders.ts) giữ các projection
  review/deadline đã có trong OpenAPI; [guidance](../../apps/user-web/src/lib/direct-delivery-guidance.ts)
  và [OrderDetails](../../apps/user-web/src/pages/OrderDetails.tsx) tách nguyên nhân,
  bỏ lời hứa kiểm định72h trên mọi đơn. Không tạo API mới hoặc đổi contract.
- [CSS](../../apps/user-web/src/pages/DirectOrders.module.css) bỏ min-content
  overflow của hai card và cho stepper/copy xuống dòng. Ảnh đầu cho thấy chữ bị
  cắt dù document không tràn; regression nay kiểm cả bounding box của review.
  Giữ màu/font/component và motion hiện có, không redesign.
- Đây không phải mở Buyer receipt, Delivered, claim/return hoặc settlement.
  [ADR bảo vệ Buyer](../adr/0062-direct-delivery-completion-release-gate.md),
  [READINESS](../handoff/READINESS.md), GHN và DB/bucket chính giữ nguyên.
  Hội thoại giúp trao đổi, không tự là command giải quyết review hoặc hoàn tiền.

## Kiểm chứng

Windows, Node24.22.1/pnpm11.19.0, Vitest4.1.2/TypeScript6.0.3. QA replica set
rs-test riêng, database ngẫu nhiên `ops_browser_*_test`; Nest HTTP/Mongo thật,
ảnh/storage fake, ví/carrier simulator, mail local. Không Brevo/AI/provider trả phí.

| Check | Kết quả / giới hạn |
| --- | --- |
| RN unit | PASS206/27file; gồm12ca quote recovery và3ca contracts. Thêm lostACK/GET, Changed/Unavailable, signature, deadline theo server, concurrent read và địa chỉ cũ không thể chọn lại |
| Web unit | PASS273/41file;11ca projection/guidance gồm pickup review không có carrier event, deadline, report ACK và Inspection lịch sử |
| Shared order-response | PASS21; exact intent/replay/account-change/ACK semantics hiện có |
| RN/web types và lint phạm vi | PASS; kiểm source, không là native acceptance |
| User web build / Expo web export | PASS; Expo có warning NO_COLOR và shutdown ép thoát sau export, không gọi native build/PASS. Web có chunk-size/plugin timing warning, không đổi dependency để che |
| Contract | PASS0.68.0,213operation/33controller; generated types hiện hành, không sửa YAML/generated |
| RN browser regression | [Runner](../../scripts/test-rn-buy-now.mjs): PASS real quote POST mất ACK, GET lỗi, Back/expired GET, explicit renewal mới; create/pay/cancel exact replay/remount/lateACK. Actual Changed listing → refresh/reopen; timer test rút TTL trong response là fake timing riêng |
| Web browser regression | [Runner](../../apps/user-web/tests/order-review.mjs): PASS quá hạn pickup/delivery qua service worker thật, lý do/hạn/hold và không settlement;1440/390/320. Inspection chỉ fixture response từ private Order thật, không vượt gate để tạo trạng thái mới |
| UI source inspection | Impeccable detector0findings ở hai component; screenshot hẹp sau sửa đọc đủ review. Detector không thay browser/human review |
| CI trên source gói này | NOT RUN; chưa push/PR/merge/deploy |
| Android/iOS/TalkBack/Flutter/người thật | NOT RUN; native block cũ giữ nguyên, Expo web không thay native/human acceptance |

Lệnh browser sau chuẩn bị QA/API build/RN export theo
[START_HERE](../handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app):
`pnpm test:rn-buy-now:browser` và
`pnpm --filter @used-books/user-web test:order-review:browser`.
Web CI đã thêm ca review; RN regression dùng runner cũ được mở rộng. Chưa có
remote CI cho thay đổi này. Các fixtures tự dọn database/user/role riêng.

Các lượt FAIL trong lúc xây regression được giữ minh bạch: helper chưa cung cấp
clock hook; fixture giả định6ngày thay vì đọc deadline; nhầm pickupReview với
carrierReview; locator Back không có trên màn danh sách. Đã sửa setup/locator theo
API/UI thật, không sửa production rule hoặc bỏ assertion tiền/quyền để qua test.
Lint một lượt từ chối path `..`, đã chạy lại bằng đường dẫn trong app. Lỗi tràn chữ
thấy qua screenshot được sửa bằng CSS và thêm kiểm panel, không chỉ kiểm document.

## Finding còn mở và tích hợp

- Web QA có log `PurchaseGateway.join: Unauthorized` khi đổi room. HTTP/private
  Order và review assertions vẫn PASS; chưa kiểm chứng gửi/nhận chat xuyên hai
  người trong gói này. [Gateway](../../apps/api/src/modules/purchases/purchase.gateway.ts)
  có authenticate bất đồng bộ trước join; race handshake là **nghi vấn**, chưa
  kết luận nguyên nhân hay lỗi quyền. Không gọi toàn hành trình chat PASS.
- Fetch02/11 thấy main `d44b813b` thêm [PR85](https://github.com/huangg49/used-book-marketplace/pull/85)
  về AI review. Gói này giữ base60d08998 và chưa merge main mới vào dirty workspace;
  trước PR cần tích hợp có kiểm soát, gồm thay đổi contract/order-worker/docs và
  xung đột số ADR0061 của hai nhánh. Không chạy migration0050/AI trên DB chính.
- Giữ nguyên28file UI/ảnh ngoài gói. Không đưa các thay đổi đó vào commit này.
  QA được dọn/đối soát cuối lượt; DB ứng dụng chính giữ nguyên.

Bước tiếp theo: nối Seller RN ảnh đóng gói/đăng ký shipment tới F2h theo gói riêng;
triage socket join trước khi coi hội thoại là đường hỗ trợ đã nghiệm thu đầy đủ.
Không mở workflow hậu kiểm hoặc đóng READINESS từ các kết quả client này.

## Tích hợp main sau owner duyệt — 02/11

Base `e2a8fa99` ghép main `d44b813b7631b92d0ddfd301c2de98288ce1eb14` trên nhánh
`codex/integrate-ai-review-main`; contract kết hợp0.69.0. ADR0061 đã publish của
AI giữ nguyên, ADR chốt bảo vệ Buyer đổi0062 và cập nhật link. Giữ toàn bộ checkpoint
AI, worker tick AI mặc định tắt và metrics Inspection bị chặn; không migrate DB chính.

PASS322API unit/42file,62E2E wallet+AI review giả, API types/build và consumer
RN/web/Admin types, contract/routes/docs. CI [API main](https://github.com/huangg49/used-book-marketplace/actions/runs/41365398700)
và8job áp dụng khác PASS trên đúng SHA main trên; chưa CI source kết hợp. Các lỗi
HTTP cố ý trong negative tests không là ca FAIL. Không suy model giả/native export
thành nghiệm thu chất lượng AI hoặc thiết bị. Bước socket và Seller RN nằm ở gói tiếp.
