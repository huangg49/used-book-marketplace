# Trung tâm phản ánh Member/Admin web — 02/11/2026

Nhánh `codex/web-support-center`, base đặc tả `0cdd164f`, business source gốc
`2ae2212b`. Subject checkpoint: `feat(web): connect private member and admin support cases`.
[Đặc tả](WEB_FEEDBACK_COMPLAINTS_SPEC.md), [ADR0061](../adr/0061-web-support-cases.md)
và [READINESS](../handoff/READINESS.md) phân biệt phạm vi đã nối và gate còn mở.

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

- OpenAPI0.68,222operations/35controllers, generated types; migration0050, registry63.
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

## Kiểm chứng

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
để áp0050 rồi `pnpm db:bootstrap` để cập nhật quyền app; chạy API/workers và hai
web cùng contract mới. Không reset/reseed hoặc sửa checksum migration cũ. Chưa
chạy các lệnh migration này trên DB chính trong gói hiện tại.

Hiện hỗ trợ chứng cứ văn bản và dữ liệu giao dịch gắn hồ sơ. Chưa có file upload
chứng cứ, tái xét moderation riêng, reassignment giữa Admin hoặc SLA phản hồi.
Dispute hai chiều, decision hiệu lực/appeal/custody/allocations/return/settlement
đầy đủ chưa được thay bằng SupportCase. Giữ ADR0057 và các gate READINESS; không
biến đóng ticket thành đã hoàn tiền hoặc đã hoàn thành giao dịch.
