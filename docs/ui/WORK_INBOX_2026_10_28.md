# Việc đang chờ và workflow nối hành trình — 28/10/2026

Nhánh `codex/actionable-work-inbox`, base `4b50db6`. Gói tiếp nối Việc của tôi
và hướng dẫn ở [mốc trước](JOURNEY_CLARITY_2026_10_28.md). Owner duyệt triển khai
và yêu cầu tiếp tục sau gián đoạn; chỉ commit local, chưa push/PR/merge/deploy.

## Kết quả và nguồn

Member web/RN nay có danh sách việc cụ thể theo trạng thái nguồn, lý do, hạn,
bên đang chờ và link đúng hồ sơ. Staff/Admin có hồ sơ cần xem theo quyền hiện tại.
Giữ brand/component của từng client, không thêm số liệu hoặc rating mẫu.
Thiết kế theo UI/UX Pro Max + Taste + Impeccable ở chế độ Operate: câu hỏi chính
là “Tôi cần mở hồ sơ nào để làm tiếp?”, dùng hàng sách/giao dịch thật, tên sách
và deadline thay KPI hoặc thẻ trang trí mới.

- [API module](../../apps/api/src/modules/work-inbox/work-inbox.service.ts),
  [phân loại lời nhắc](../../apps/api/src/modules/work-inbox/work-policy.ts),
  [quyết định và giới hạn](../adr/0053-state-derived-work-inbox.md).
- [Contract](../../packages/api-contract/openapi.yaml)0.59.0:
  **193 operations/30 controllers**, tăng hai GET. Không migration mới;
  registry vẫn52 migration tới0040. [Target/schema dùng chung](../../packages/session-client/src/work-inbox.ts).
- [Web inbox](../../apps/user-web/src/components/WorkInbox.tsx),
  [RN inbox](../../apps/mobile-react-native/src/features/account/work-inbox.tsx),
  [Staff/Admin inbox](../../apps/admin-web/src/features/dashboard/WorkInbox.tsx).
- [RN chi tiết đơn](../../apps/mobile-react-native/src/features/orders/order-focus-screen.tsx),
  [danh sách tải tiếp](../../apps/mobile-react-native/src/features/orders/orders-screen.tsx),
  [web trả lời đơn bán](../../apps/user-web/src/components/OrderResponse.tsx),
  [intent chung và chống phản hồi phiên cũ](../../packages/session-client/src/order-response.ts).
- [Workflow nối hành trình](../../.agents/skills/latlai-journey-integration/SKILL.md)
  đi cùng Git và adapter Claude; AGENTS, AI_WORKFLOW, TEAMWORK, UI_SKILLS và mẫu
  PR dẫn cùng quy trình. Ba skill UI giữ nguyên; workflow bổ sung entry/quyền/
  state/kết quả/bước tiếp và kiểm liên kết xuyên module, không thay nguồn nghiệp vụ.

## Ma trận hành trình

| Vai trò | Entry | Điều kiện / việc đang chờ | Nơi tiếp tục / kết quả |
| --- | --- | --- | --- |
| Member mua trực tiếp | Tài khoản → Việc đang chờ → Mua/bán trực tiếp | Đơn AwaitingPayment, hạn chưa tới; LOCKED không được trả tiền mới | Đơn bằng ID; xem tiền/hạn, thanh toán hoặc hủy theo cờ server |
| Member bán trực tiếp | Cùng entry | PendingSellerConfirmation và đúng seller | Mở đơn → xác nhận/từ chối → đọc trạng thái mới. Preparing/SettlementPending tiếp tục nằm ở việc đang chờ, không báo hoàn tất |
| Member đổi sách | Nhóm Trao đổi | Proposed theo người đề nghị mới nhất; funding theo phía chưa góp; gửi/inspection theo từng phía | Web `/exchange/:id`, RN `/exchange?id=...`; command hiện tại vẫn kiểm quyền/state/version |
| Chủ bài đăng | Nhóm Bài đăng sách | Draft/Rejected/PendingReview, chưa xóa/removed và còn Available | Mở đúng editor bằng ID; đọc lý do từ chối, sửa/gửi duyệt hoặc chờ. Auction listing vẫn giữ channel khi mở editor |
| Người gửi đấu giá | Nhóm Sách gửi đấu giá | Dropoff/Received/NeedsEvidence/Passed/ReclaimRequired | Mở lần gửi bằng ID riêng, không phụ thuộc50 lần gần nhất; xem hạn/biên bản, bổ sung bằng chứng hoặc công bố theo service |
| Participant đơn đấu giá | Nhóm Đơn đấu giá | Đơn chưa terminal, phân biệt buyer/seller và từng deadline | Mở đúng phiên có đơn; thanh toán/báo cáo/nhận/claim theo UI và service có sẵn |
| Staff ACTIVE | Dashboard → Hồ sơ cần bạn xem → Bài đăng | PendingReview và không phải chủ bài | Mở thẳng `/review/listings/:id`; kiểm ảnh/revision trước quyết định |
| Admin ACTIVE | Dashboard → cùng mục → Đầu sách | Pending và không phải requester; STAFF đơn thuần bị403 | Mở `/review/catalog-requests/:id`; Admin không tự có quyền bàn điểm |

Completed/cancelled/expired được loại khỏi lane giao dịch khi nguồn cập nhật.
Review sau Completed vẫn ở mục Đánh giá; không giấu yêu cầu này sau nhãn “hết việc”.
Chat, wishlist, tranh chấp và các bàn điểm có entry riêng. Gói chưa gom tất cả
nghĩa vụ của toàn sản phẩm vào một queue hoặc một con số.

## Kiểm chứng

Runtime kiểm thực tế: Node24.22.1, pnpm11.19.0. QA replica set riêng, DB `_test`;
không khởi động/reset/seed/migrate Mongo chính. HTTP/Mongo thật, storage browser
fake; topup QA dùng simulator, không có carrier/GHN event. Hai đơn thương lượng
trong browser được tạo/giữ tiền/trả lời qua API thật. Các bản ghi cũ thêm vào để
kiểm phân trang/focus là fixture, không là bằng chứng fulfillment/settlement.

| Kiểm tra | Kết quả / phạm vi |
| --- | --- |
| API unit, loại carrier-adapter | PASS232. Lượt chạy song song ban đầu có timeout ca Windows shutdown; chạy riêng đạt, lượt cuối `--maxWorkers=2` đạt cả232. Không sửa test để che timeout |
| Work inbox HTTP/Mongo | PASS8: hơn50 bản ghi cùng timestamp, cursor ký theo actor/lane, sai filter, terminal/foreign, expiry boundary, current role/status/session, counteroffer/dispute, sort, intake và auction-order |
| Hồi quy nghĩa vụ / Exchange | PASS21 obligations và33 Exchange. Test allowlist tìm ra thiếu `x-locked-access` trên GET mới; đã sửa contract đúng phạm vi, giữ ca từ chối hai lane LOCKED |
| Session-client | PASS42: thêm target/cursor-data validation và intent giữ key/body/version, chặn quyết định ngược, logout/login, phản hồi cũ không xóa intent mới |
| Web / RN / Admin unit | PASS251 /161 /219 |
| API/web/RN/Admin typecheck, lint; API/web/Admin build; RN export web | PASS; warnings cũ và giới hạn export được ghi trong checkpoint, không suy native PASS |
| Contract check/routes | PASS0.59.0,193operations/30controllers; generated types cùng YAML |
| `pnpm test:work-inbox:browser` | PASS Chromium: Member web/RN web, Staff/Admin; lost ACK sau commit và rời/quay lại, true state sau accept/reject, lỗi503 không thành empty, quyền403 ẩn cache, đơn vượt50, focus intake ngoài50 |
| Hồi quy Order/chat browser | PASS `test:order-chat:browser`: hồ sơ riêng theo participant, phòng đúng đơn, command retry, messages/history và responsive; fixture HTTP/socket cục bộ, không provider thật |
| Account browser | PASS `test:account:browser`: session/profile/wallet thật ở QA riêng, menu bàn phím, guide, LOCKED và responsive1440/768/390/320 |
| Chat tổng cũ | **FAIL** `test:chat:browser` tại selector ExchangeOffer: harness bấm input ẩn, nút đã có số cuốn và switch không còn render khi có exchange active. Source ExchangeOffer/AgreementTerms/ChatPage không đổi trong gói. Đã kiểm thao tác qua label có chọn sách; thử thích nghi selector vẫn vướng kỳ vọng switch. Giữ kịch bản cũ, chỉ cập nhật ba trường quyền Order cần cho schema; chưa có PASS toàn bộ chat tổng |
| Responsive / visual | Web1440/768/390/320, RN web390/320 và chữ130% ở hồ sơ focus, Staff1440/390/320, Admin1440; không tràn ngang. Đã xem ảnh web/RN/Staff và sửa loading focus bị kẹt |
| Impeccable detector | PASS một lượt trên tám target UI chính,0 findings; không thay bằng chứng UX/nghiệp vụ |
| Docs / skill | Docs check và5 checker tests PASS; quick_validate skill PASS; diff check PASS |

Harness mới: [test-work-inbox.mjs](../../scripts/test-work-inbox.mjs).
Chạy sau `pnpm --filter @used-books/api build` và export RN với API base QA theo
[START_HERE](../handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app).
Harness tự mở server local với credential QA riêng, đóng và xóa DB fixture khi
kết thúc. Ảnh của lượt chạy nằm ở `.tmp/work-inbox-evidence/`, bị Git ignore;
teammate chạy lại harness để tái tạo, không lấy file local làm evidence đã chia sẻ.

## Chưa nghiệm thu và bước tích hợp

- Native thiết bị/emulator, TalkBack/ARM/iOS, human UX và review tiền/quyền người
  thật: **NOT RUN/OPEN** theo READINESS. Không đóng gate chỉ vì local test xanh.
- Flutter vẫn scaffold, không nhận tính năng mới từ gói này. RN focus đơn chưa
  có full UI chuẩn bị ảnh/vận chuyển như web. Không thêm API command, expiry,
  refund, delivery, inspection hoặc settlement mới.
- Bàn điểm/sự cố/review vẫn có queue và giới hạn riêng; gói không tuyên bố đã
  sửa phân trang mọi endpoint cũ. Chưa benchmark queue ở quy mô sản xuất.
- Trước nghiệm thu chat toàn luồng, owner chat cập nhật harness theo UI hiện tại
  và chạy lại; không coi PASS bộ Order/chat riêng là PASS bộ chat tổng đang lỗi.
- Cần nâng API0.59 trước hoặc cùng client; client mới cần hai GET mới. Không cần
  migrate bổ sung cho gói này, nhưng chuỗi local review trước đó vẫn cần0040.
- Remote được fetch28/10: main vẫn `7d92012`, PR mở0. Bốn workflow main đọc được
  (User Web/API/Docs/Developer startup) completed/success tại SHA đó; **không là
  remote CI của nhánh local này**. Có nhánh teammate mới, không tự merge vào local.
- Bước tiếp: người giữ từng miền review cả chuỗi local phụ thuộc, rồi một thành
  viên thử từ entry không được chỉ từng nút; xử lý các điểm dừng trước khi tích hợp.
