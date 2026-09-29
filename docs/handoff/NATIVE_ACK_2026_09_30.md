# N13 — native mất ACK sau finalize/submit

30/09/2026, nhánh `codex/native-finalize-submit-retry`, base `307341e`.
Không sửa code sản phẩm; không push/merge/deploy. Đây là hai ca bổ sung Q01,
không phải toàn bộ native acceptance hay human review.

## Môi trường và thực thi

Pixel_7 Android15/API35 x86_64, APK Q01 có sẵn (SHA-256 trong
[Q01](Q01_NATIVE_COMPLETION_2026_09_29.md)), Metro8081 preview=0. Đầu lượt emulator,
API/Metro và Mongo đã dừng; khởi động lại acceptance57117 và QA57017, dữ liệu
acceptance còn nguyên. Không khởi động worker trên acceptance có media keys nguồn.

Tạo Mongo UUID `_test` và Supabase private bucket QA mới; migrate hiện hành,
chỉ copy users/auth_sessions để dùng phiên native đã sao lưu. Catalog/nháp QA
được tạo qua API hợp lệ, chưa confirm catalog hoặc approve listing. Chọn WebP
Alice có sẵn bằng photo picker thật; API3002 + Supabase + Sharp worker thật.
Proxy3102 chỉ cắt phản hồi finalize/submit của đúng listing QA **sau upstream200**;
log chỉ operation/byte count/hash key/hash body/status, không token hoặc body.

| Ca | Quan sát native và server |
| --- | --- |
| Finalize mất ACK | 4 request cùng key/body, cả 4 phản hồi upstream200 bị cắt. App hiện thử lại, khóa chọn ảnh mới. Trước retry: 1 media Processing/version3, 1 finalize receipt, 1 job; worker tạm chưa chạy. |
| Retry finalize | Gỡ fault, bấm thử lại: đọc trạng thái Processing, không thêm POST finalize/PUT content/create. Snapshot DB không đổi. Khởi động worker QA → Ready/version4, preview thật và ảnh được chọn. Tổng chỉ 1 content PUT, 1 media, 1 job. |
| Submit mất ACK | Bấm khai báo và Lưu và gửi duyệt. Save đúng1 lần → version2; submit ghi PendingReview/version3. Hai phản hồi submit200 bị cắt; app khóa sửa/lưu và giữ yêu cầu chưa biết kết quả. |
| Retry submit | Gỡ fault, bấm Thử lại yêu cầu vừa gửi: request thứ3 cùng key/body, không save lại. UI Đang chờ duyệt/Đã gửi duyệt. Snapshot trước/sau retry bằng nhau: 1 revision, 1 link, 1 save receipt, 1 submit receipt; version và submittedAt/ownershipDeclaredAt không đổi. |

**PASS hai ca trong phạm vi trên.** Socket transport có thể gửi lại request;
không giả định số retry cố định giữa các lượt. Assertion kiểm hash, completion,
số cut200, số effect/receipt/job và snapshot trước/sau; integrity sweep bằng app
user `failures=[]`, ledger cân bằng. Không có lỗi sản phẩm mới được tái hiện.
Pilot harness bị401 vì token thiếu issuer/audience (closure còn giữ token cũ khi
thay biến); tạo lại client đã sửa. Assertion đầu giả định số retry bằng lượt cũ
bị fail; thay bằng quan hệ giữa wire thực tế và effect, không đổi code sản phẩm.

## Bằng chứng và khôi phục

- [Assertion/count/hash đã lọc](../verification/native-ack-2026-09-30/assertions.json).
- [Finalize chờ retry](../verification/native-ack-2026-09-30/01-finalize-retry.png),
  [ảnh phục hồi](../verification/native-ack-2026-09-30/02-finalize-recovered.png).
- [Submit chưa biết kết quả](../verification/native-ack-2026-09-30/03-submit-unknown.png),
  [submit phục hồi](../verification/native-ack-2026-09-30/04-submit-recovered.png).

Đã dừng API3002/worker/proxy3102, remove đúng3 object keys QA rồi xóa bucket/DB
riêng thành công. Khôi phục backup app của **lượt này**, reverse3000→3000/8081→8081;
API acceptance refresh200, UI hiện lại nháp N18 cũ/1ảnh. Không restore backup cũ
29/09. Không thay `.env`, mật khẩu, dữ liệu/sách hoặc bucket nguồn.
API3000 PID6424 và Metro8081 PID1928 còn chạy; app ở Sách của tôi. Harness/log/
private config/backup tại `.tmp/native-ack/` ignored, chứa thông tin phiên:
không in/commit hoặc dùng backup để rollback phiên lần nữa.

`pnpm contract:check`, assertion và `git diff --check` PASS. Không lặp build,
493 E2E/RN unit vì chỉ thêm evidence. N13 đã thêm finalize/submit lost ACK trên
Android/Mongo; chưa kiểm giết app giữa upload, N21 nghe TalkBack, ARM/iOS.
Review người thật, CI remote và quyết định cutover vẫn mở; không mở Delivered/
settlement. Các ca đã đóng không cần lặp nếu không đổi source liên quan.
