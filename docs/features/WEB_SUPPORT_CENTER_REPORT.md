# Trung tâm phản ánh Member/Admin web — 02/11/2026

Nhánh bàn giao `codex/web-support-ready`, tích hợp trên main `d44b813b`.
Chia commit đặc tả, chức năng hỗ trợ, chọn nội dung và thu gọn Admin; giữ riêng
kiểm thử tự động, không gồm helper seed hoặc dữ liệu mẫu local.
[Đặc tả](WEB_FEEDBACK_COMPLAINTS_SPEC.md), [ADR0062](../adr/0062-web-support-cases.md)
và [READINESS](../handoff/READINESS.md) phân biệt phạm vi đã nối và gate còn mở.

## Bản tích hợp bàn giao trên main02/11

Base `d44b813b` đã có AI tự duyệt. Bản hỗ trợ cuối dùng contract0.70,
224operations/36controllers, registry65migration/97collection. Giữ checksum hai
migration0050, thêm0051 union để không ghi đè validator receipt/audit của nhau;
schema notification hiện hành cũng giữ target SupportCase. ADR hỗ trợ đổi thành
0062 để giữ0061 của main. Cờ AI, quyền và READINESS giữ nguyên.

Source tích hợp đã kiểm lại:49HTTP/Mongo (support14/obligations21/AI auto review14),
32Mongo (schema/least privilege/member upgrade và3 đường union giữ checksum,
ledger/inbox); shared119/Admin219/Member264unit; API/web/RN typecheck, API/hai web
build, lint, contract/routes/docs/diffPASS. Warning lint/chunk cũ còn. Browser
support6nhóm và Admin collapse9ca PASS,0page errors, QA57017/*_test/storage fake.
Harness chờ ACK trong lịch sử trước refresh ở role kia, tránh đọc trước commit;
không bỏ assertion quyền, nội dung hay replay. Evidence tại `.tmp/support-evidence/`
và `.tmp/admin-review-collapse/` của workspace kiểm tra. Các bảng sau giữ evidence
source gốc, không cộng thành nghiệm thu human/native/fulfillment. Remote CI chưa
được xác minh ở checkpoint chuẩn bị push.

Nhánh chỉ gồm chức năng, contract/migration, đặc tả và kiểm thử tự động. Không có
helper seed tạo luồng local, manifest/ID mẫu, DB/backup, credential hoặc các commit
ghi nhận tạo mẫu thủ công. Dữ liệu local owner đang dùng được giữ nguyên ngoài Git.

## Chức năng và hành trình

| Vai trò → entry | Quyền / trạng thái | Command / kết quả | Bước tiếp và phục hồi |
| --- | --- | --- | --- |
| Member → menu Hỗ trợ & phản ánh | MEMBER; tạo mới ACTIVE, đọc/bổ sung hồ sơ mình khi LOCKED | Tạo góp ý/báo lỗi hoặc phản ánh có target; ACK cấp mã SupportCase | Xem danh sách có lọc/phân trang, mở đúng ID; Back giữ context và intent đang chờ |
| Member → đơn mua bán/Exchange/đơn thắng đấu giá | Server kiểm participant và đúng target type | Điền sẵn giao dịch vào form hỗ trợ | Xem trạng thái giao dịch; claim/hold/hoàn tiền vẫn theo nghiệp vụ riêng, không theo ticket |
| Member → review công khai/listing/phiên/hồ sơ | Review kiểm publication; không lộ review trước hạn | Gửi báo cáo nội dung, xem hồ sơ riêng | Chờ Admin; không tự ẩn review, trừ điểm hoặc cộng vi phạm |
| Admin → Trung tâm xử lý | ACTIVE ADMIN độc lập với người gửi/participant | Nhận phụ trách với expectedVersion; hai Admin cùng nhận chỉ một thành công | Xem timeline, dữ liệu liên quan, trao đổi hoặc ghi chú riêng; người khác chỉ đọc |
| Admin → yêu cầu bổ sung | Đang phụ trách | Lưu câu hỏi, AwaitingMember và notification cùng transaction | Member bổ sung; về InReview, không tự phạt do thiếu phản hồi |
| Admin → báo cáo review | Độc lập, review đủ publication | Hide/restore/evidence/reply qua service review hiện có; giữ revision, gửi notification | Đối soát command rồi trả lời hồ sơ; pending command chặn quyết định ngược |
| Admin → gửi kết quả/đóng | Đang phụ trách; Answered trước Closed; chưa ResolutionPending | Trả lời và thông báo Member; đóng SupportCase, không đóng dispute | Member mở thông báo tới đúng ID, đọc kết quả; hồ sơ vẫn có lịch sử |

Giao diện kế thừa DashboardLayout/brand Member và shell/component Admin, hỗ trợ
320px, keyboard, loading/empty/error, text dài, retry. Không thêm client/framework.

## Thay đổi kỹ thuật

- OpenAPI0.70,224operations/36controllers, generated types; migration0051, registry65.
  Mongo QA thật, quyền app tối thiểu, messages append-only và cursor theo actor/filter.
- `apps/api/src/modules/support/`: owner/independence/assignment/version/state
  trước mutation; quyền hiện tại trước replay; receipt/audit target SupportCase.
- `packages/session-client/src/support.ts`: schema, command/draft memory theo
  account, coalescing double click và exact replay. Review intent cũng giữ qua
  auth/timeout/rate-limit bất định. Không tạo token store hoặc persist chứng cứ.
- Hai web có `/support`, chi tiết `/support/:caseId`; Member thêm `/support/new`.
  Thông báo SupportCase mở đúng hồ sơ; review notification resolve đúng transaction
  theo reviewId và current permission, không phụ thuộc trang đầu.
- RN chỉ chấp nhận enum thông báo mới trong schema để API chung không phá inbox;
  không triển khai màn hỗ trợ native. Không native acceptance trong gói này.

## Thay ô mã đối tượng bằng lựa chọn —02/11/2026

Nhánh `codex/support-target-picker`, base `5cbc309d`, subject
`feat(support): select readable related transactions instead of entering IDs`.
Owner yêu cầu bỏ việc nhớ/nhập mã. Member hiện chọn giao dịch của mình từ danh
sách tìm kiếm/phân trang, nhận biết bằng tên sách snapshot (DirectOrder/PointOrder
nếu có), đối tác, ngày và trạng thái. Exchange tìm theo tên đối tác. Không còn
ô UUID. Góp ý/báo lỗi có thể không gắn nội dung; phản ánh giao dịch và báo cáo
vẫn kiểm target bắt buộc theo nghiệp vụ.

Từ Listing/Auction/Review/Member, nút Báo cáo nội dung tự gắn đối tượng và form
resolve nhãn hiện tại để xác nhận. Nếu vào form chung, có hướng dẫn/link đi tìm
nội dung; tiêu đề/mô tả được giữ qua entry mới. Có loading/empty/error/retry,
bỏ chọn, tìm bằng Enter và tải thêm. Mất ACK vẫn giữ nguyên command gốc.

Contract0.70,224operations/36controllers; thêm hai read endpoint được bảo vệ theo
actor/participant/publication, không tạo directory Member hoặc trả địa chỉ/email.
Tái dùng policy create để resolve, không ghi lock target trong read. Phần chọn
không thêm quyền nghiệp vụ; yêu cầu migration khi nhận source xem cuối báo cáo.

Kiểm chứng lát cắt mới: HTTP/Mongo35PASS (support14 + obligations21), gồm
participant/role/locked denial, cursor actor/type/query, literal search, nhãn từ
snapshot hai lane, private/hidden review và read không ghi lock target.
Shared119/Member264unitPASS; API build/type/lint, Member build/type/lint,
Admin typecheck, contract/routes/docs/diffPASS. Warning lint/chunk cũ còn.
Browser hai web6nhómPASS,0page errors: thêm search/empty/tải trang2/chọn/gửi,
giữ draft qua entry review và nhãn tác giả/excerpt; giữ toàn bộ lostACK/Back,
Admin xử lý/notification/moderation cũ. Đã xem ảnh desktop và320px/chữ130%,
detector0finding. Các lượt harness đầu sửa fixture trùng unique order key,
điều hướng SPA khi fixture không có BFF cookie, tên link có mũi tên và radio
unmount sau chọn; giữ assertion quyền/command/submit. Fake storage/mail local;
native/human/remote CI NOT RUN. Bảng bên dưới là evidence gói0.68 ban đầu,
không cộng thành gate nghiệp vụ/native/human mới.

## Kiểm chứng source trước tích hợp main

Windows, Node24.21.0/pnpm11.19.0. QA riêng loopback57017/rs-test, DB kết thúc
`_test`; fixtures giao dịch Completed dùng kiểm quyền/link, không nghiệm thu
giao nhận/giải ngân. Storage fake và mail local, không gọi provider thật.

| Kiểm tra | Kết quả |
| --- | --- |
| Contract check/routes | PASS0.68,222operations/35controllers |
| API/support/review/obligations HTTP/Mongo | PASS43, gồm13support; auth/current permission/replay/race/rollback, ba lane và giới hạn lịch sử |
| Mongo schema/migration | PASS28: nâng từ0049, giữ checksum/inbox, rerun, append-only và role denial |
| Shared client unit | PASS119; exact intent/auth/408/429/schema/late ACK và draft/account isolation |
| Member/Admin unit | PASS264/219, gồm regression cache thông báo khác shape/account |
| API, Member, Admin typecheck/build | PASS; Member có warning chunk cũ, lint có warning ngoài phạm vi |
| RN compatibility typecheck | PASS; không là native runtime PASS |
| Browser hai web và responsive | PASS4nhóm: Member→Admin→Member/inbox; lostACK/Back/remount; note privacy; báo cáo review→moderation→notification đúng transaction. 320px/chữ130%,0page errors; captures/journal tại `.tmp/support-evidence/` của máy chạy |
| Visual review / detector | Đã xem ảnh hai web desktop/màn hẹp, detector0finding trên hai feature mới; giữ brand hiện hành, không áp palette achromatic trái brief từ helper |
| Human review, remote CI, live storage/mail | NOT RUN; workflow đã nối harness nhưng chưa push/PR/merge |

Browser từng lượt ban đầu bị locator tên Email đầy đủ và tương tác trước khi
lazy route commit; đã sửa script chờ URL/heading thật. Không thay assertion
privacy/replay để qua test. Form cũng khôi phục trực tiếp từ pinned create intent
khi trở lại sau lost ACK; không suy mọi lỗi harness là regression nghiệp vụ.

Browser còn bắt lỗi có sẵn: Dashboard summary ghi flat notification page vào
key dùng bởi infinite inbox, gây lỗi render khi mở thông báo. Đã tách key theo
shape/account, thêm regression unit; inbox và SupportCase detail đọc mới khi
mount để mở thông báo không giữ state cũ sau Admin phản hồi. Kết quả cuối PASS
trên source đã sửa, không suy một lượt FAIL thành PASS nếu chưa chạy lại.

## Nhận source và giới hạn

Khi áp dụng vào môi trường của mình: dừng API/workers, chạy `pnpm db:migrate`
để áp đủ hai nhánh0050 và0051 union rồi `pnpm db:bootstrap` để cập nhật quyền app; chạy API/workers và hai
web cùng contract mới. Không reset/reseed hoặc sửa checksum migration cũ. Chưa
chạy các lệnh migration này trên DB chính trong gói hiện tại.

Hiện hỗ trợ chứng cứ văn bản và dữ liệu giao dịch gắn hồ sơ. Chưa có file upload
chứng cứ, tái xét moderation riêng, reassignment giữa Admin hoặc SLA phản hồi.
Dispute hai chiều, decision hiệu lực/appeal/custody/allocations/return/settlement
đầy đủ chưa được thay bằng SupportCase. Giữ ADR0057 và các gate READINESS; không
biến đóng ticket thành đã hoàn tiền hoặc đã hoàn thành giao dịch.
