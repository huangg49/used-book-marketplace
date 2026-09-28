# Nơi gửi và phương thức giao nhận của tin đăng

27/09/2026 · OpenAPI 0.10.0 · working tree `codex/listing-fulfillment`.
[ADR 0015](../adr/0015-listing-delivery-origin.md) · F0 của
[lộ trình giao dịch](TRANSACTION_FOUNDATION_PLAN.md).

## Phạm vi

RN có chọn nơi gửi tại bước “Chọn cách chuyền sách” và đối chiếu ở bước kiểm tra.
Dùng địa chỉ riêng đã lưu; chỉ khai báo DirectDelivery trong vùng TP.HCM mô phỏng.
Sửa nơi gửi trên bài đã duyệt tạo revision chờ duyệt lại. Khi địa chỉ đổi/xóa,
lựa chọn cũ cần cập nhật, không âm thầm dùng thông tin mới. Operations hiển thị
trạng thái này; public chỉ nhận vùng/phương thức an toàn, không nhận địa chỉ riêng.

Chưa có địa chỉ vẫn được đăng/duyệt nội dung. Tin cũ vẫn đọc được; migration không
tự gán vùng hoặc nơi gửi. Việc bỏ lựa chọn cần thao tác chủ động, bài Approved vẫn
phải duyệt lại. Mọi checkout tương lai phải chặn khi chưa có nơi gửi hiện hành.

Không có quote, giữ sách, đơn hàng, phí ship, carrier, ledger, ViaPoint hoặc đấu giá
ở increment này. DirectDelivery là lựa chọn người đăng, không chứng minh đã giao hàng.

## Dữ liệu và tương thích

- Migration thứ8: `20260927010000_listing_fulfillment`. SQL cũ giữ nguyên.
- PrivateAddress có version riêng nội dung; default/thay địa chỉ khác không tăng nó.
- AddressIdentity giữ ID/owner, không contact. Xóa sổ live vẫn xóa tên/điện thoại/detail.
- `DraftContent`/`SubmittedContent.fulfillment` có thể thiếu để client cũ giữ lựa chọn
  đã lưu; null là chủ động bỏ. Unsupported method/extra properties bị từ chối.
- ListingRevision có `fulfillmentStatus`; PublicListing có `fulfillment` nullable.
  Kết quả Current chỉ nói tham chiếu hiện hành, không phải đủ quyền giao dịch.
- Cùng key/body replay sau xóa địa chỉ vẫn trả receipt cũ. Lệnh mới recheck quyền,
  origin và phiên bản. Receipt/audit không sao chép contact.

## Bằng chứng kiểm tra

Windows, Node24.19.0/pnpm11.19.0; PostgreSQL kiểm thử riêng tại55432, database có
hậu tố `_test`, schema cô lập và đầy đủ migration. Storage của browser suite là
fake; không tính đó là bằng chứng Supabase thật.

| Kiểm tra | Kết quả |
|---|---|
| API E2E | Full140ca qua, gồm12ca fulfillment mới và128ca hồi quy |
| Nâng cấp dữ liệu có sẵn | Thêm1ca riêng qua: áp7migration, tạo contact/listing cũ, áp migration8; không đổi contact, không gán origin, giữ SQL guards |
| Unit workspace |106qua: API18, session14, RN61, operations13; thêm retry giữ nguyên origin/version |
| Contract/lint/typecheck | Qua toàn workspace; generated types đồng bộ |
| Build | API và operations qua; Expo export web/Android/iOS qua |
| RN browser Edge | Chọn origin, quay lại từ sổ giữ form, lost-ack replay cùng key/body, stale address conflict giữ giá đang nhập, chọn lại, submit/reject/resubmit/approve/public qua |
| Operations browser Edge | Hồi quy review/quyền/retry/conflict/ảnh qua; trạng thái origin kiểm bằng API/schema, chưa có browser case riêng cho reviewer NeedsUpdate |
| Android debug x86_64 | Thành công3phút7giây,338tasks (310executed/28up-to-date); chỉ build, không runtime |
| Local DB | Migration8 áp lên database ứng dụng5433; cả8checksum khớp, không còn pending |

12ca fulfillment kiểm nguồn của người khác, version cũ, ViaPoint bị từ chối,
omission giữ/null bỏ, public không lộ contact/reference, default/no-op không gây
stale, edit/delete không sửa revision cũ, reject rồi sửa/resubmit, approved revision
và replay sau xóa, ba race có DB barrier, SQL backstop và rollback khi audit lỗi.
Các ca race xác nhận chờ bằng `pg_blocking_pids`; có cả hai thứ tự approval/delete.
HTTP500 từ failpoint là chủ đích để xác minh rollback. Cảnh báo pg concurrent query
và Gradle deprecated vẫn tồn tại; không làm test/build thất bại.

Đã xem ảnh render thật: [nơi gửi320px](../verification/fulfillment-320.png),
[public390px](../verification/fulfillment-public-390.png). Không tràn ngang; địa chỉ
dài xuống dòng. Browser suite có kiểm chữ lớn của nền hiện có, nhưng chưa có stress
font scale riêng cho vùng chọn origin. Không thay shared UI API; không cần ví dụ
component mới ở `/ui`.

APK SHA256: `4B03598BCBAF5F5123B15D15C00B9350458EB63AF1174168B68DBDF0AD72D678`.
Debug APK cần Metro và không chứng minh JS mới đã chạy trên thiết bị. Không đánh
native acceptance hoặc CM-AC Order/reservation là đạt từ những bằng chứng này.

Log local ignored: `.tmp/fulfillment-e2e.log`, `fulfillment-upgrade.log`,
`fulfillment-unit.log`, `fulfillment-browser.log`, `fulfillment-ops-browser.log`,
`fulfillment-build.log`, `fulfillment-export.log`, `fulfillment-android.log`.

## Chạy và giới hạn

`pnpm db:generate`, `pnpm db:migrate`; không cần khóa/dịch vụ cloud mới. Local setup
theo [hướng dẫn RN](../REACT_NATIVE_START.md). Chỉ áp migration đã được kiểm tra;
không db push/reset hoặc đổi mật khẩu demo.

Migration local đã áp thành công. Automatic approval review chặn lệnh dừng/khởi
động lại API3000 với lý do duy nhất “blocked by policy”; chưa chạy lại lệnh hoặc
vượt chặn. Vì vậy **API local đang mở chưa được xác nhận đã nạp bản0.10.0**.
Người vận hành cần khởi động lại API trước dùng UI mới; build và API fixture kiểm
thử đã dùng code mới. Không cần seed lại hoặc tạo địa chỉ thử trong DB ứng dụng.

Form/intent ở bộ nhớ; reload/kill app có thể mất phần chưa lưu. Query địa chỉ refresh
khi trở lại màn hình và mỗi30giây khi đang xem; server luôn kiểm tra lại lúc ghi.
Private listing history chứa mã địa chỉ cũ và trạng thái hiện tại, không chứa snapshot
contact. Giao dịch tương lai phải có snapshot riêng. Chưa có admin sửa dataset vùng.

Native keyboard/Back/font scale/TalkBack và picker/upload vẫn cần QA trên thiết bị;
web/JS export không thay thế bằng chứng native. Chưa xác nhận CI từ xa hay tải thật.

Bước sau: quote do server tính, chốt version/phí/payer/expiry; quote không giữ sách.
