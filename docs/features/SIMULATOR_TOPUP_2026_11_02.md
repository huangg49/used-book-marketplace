# Nạp mô phỏng thuận tiện cho demo — 02/11/2026

Gói `codex/simple-simulator-topup`, base `7a9af802`. Theo yêu cầu owner bổ sung
thao tác chọn Member → nhập tiền → xác nhận, dùng khi không demo được VNPay.
Không phải sửa/chuyển trạng thái giao dịch VNPay chưa xác minh.

## Cách dùng local

1. Mở [Nạp tiền mô phỏng](http://localhost:5173/simulator/events/topups) trên Admin.
2. Đăng nhập tài khoản **TEST_OPERATOR** đã có; Admin/Staff thông thường không có
   quyền này. Thông tin đăng nhập lưu riêng ở checkout ứng dụng, file ignored
   `.tmp/simulator-topup-runtime/LOGIN.txt`; không đưa vào Git hoặc chat.
3. Tìm theo tên hiển thị hoặc mã tài khoản, chọn Member nhận tiền. Danh sách chỉ
   gồm Member ACTIVE đã xác minh email, loại chính operator; tối đa40 kết quả,
   cần tìm cụ thể hơn khi còn kết quả khác. Không trả email/địa chỉ/số điện thoại.
4. Nhập số nguyên1.000–10.000.000đ; có nút100.000/500.000/1.000.000đ.
5. Bấm **Kiểm tra khoản nạp**, đối chiếu tên/mã/số tiền, rồi **Xác nhận**.
6. Khi báo thành công, Member mở **Ví của tôi** và làm mới để thấy số dư/lịch sử.
   Bấm **Nạp cho lượt tiếp theo** chỉ khi muốn tạo một khoản nạp mới thật sự.

Mất phản hồi: giữ trang, bấm **Thử lại thao tác vừa gửi**. Key/body được giữ
nguyên, input khóa trong lúc kết quả chưa rõ. Không reload rồi nạp lại để đoán.
API không bật simulator hoặc nguồn hữu hạn hết tiền sẽ từ chối; không tự bù nguồn.
Hạ tầng local vẫn cần backend/Mongo/Admin chạy. Simulator không gọi VNPay nhưng
không phải tính năng chạy offline khi backend đã tắt. Production cấm bật simulator.

## Hành trình và source

| Vai trò | Entry/điều kiện | Command/kết quả | Bước tiếp/phục hồi |
| --- | --- | --- | --- |
| TEST_OPERATOR | Menu Mô phỏng → Nạp tiền mô phỏng; ACTIVE, verified, độc lập với người nhận | GET `topup-recipients`; POST `operations/simulator/topups` với recipientId/amount, Idempotency-Key | Xem biên nhận; mất ACK retry cùng key/body; từ chối giữ input để sửa |
| Member | ACTIVE, verified tại thời điểm khoản nạp mới được ghi | Nhận TopupIntent/event/ledger thật trong DB, tiền được gắn nhãn mô phỏng | Làm mới ví/lịch sử, rồi tiếp tục mua sách |

- [Form Admin](../../apps/admin-web/src/features/operations/simulator-topup.tsx),
  [ActionPanel](../../apps/admin-web/src/features/operations/action-panel.tsx).
- [Contract](../../packages/api-contract/openapi.yaml), generated types đã sinh lại.
- [WalletService](../../apps/api/src/modules/wallet/wallet.service.ts): command mới
  khóa operator/recipient/session qua shared executor; kiểm quyền hiện tại trước
  replay, kiểm recipient tại mutation. Retry biên nhận cũ vẫn được phép nếu sau đó
  recipient bị khóa; không cho tạo khoản mới cho recipient đó.
- [LedgerService](../../apps/api/src/modules/wallet/ledger.service.ts): cùng nguồn
  hữu hạn/sổ cái bất biến; mở rộng checkTopupRecord cho receipt nguyên tử của
  operator, không làm mất kiểm tra intent/event/journal/audit/outbox.
- Tạo intent Succeeded/version2 + event có xác thực + journal + receipt/audit/outbox
  trong **một transaction**. Không impersonate Member, không chỉnh balance hoặc
  dùng VNPay intent có sẵn. Endpoint sự kiện kỹ thuật cũ vẫn giữ contract.
- Không migration/index/validator mới; không chạy migration/seed/reset DB chính.

## Bằng chứng

Source: working tree của gói trên base nêu trên; tests chạy trước commit gói.
Windows, Node24.22.1, Chromium headless; QA Mongo8 replica set rs-test port57017,
database riêng kết thúc `_test`, không dùng DB/bucket ứng dụng.

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| API wallet + wallet-migration | **PASS47/47**; trong đó6 ca mới cho atomic command, quyền, eligibility, race, disabled và rollback nguồn hết trong ca nguồn hữu hạn |
| API wallet-checkout | **PASS48/48**; regression VNPay dùng adapter QA, không phải gateway live PASS |
| Admin unit | **PASS229/229** |
| Browser `pnpm --filter @used-books/admin-web test:simulator-topup:browser` | **PASS**: lookup empty/error/retry, validation, cancel không write, command thật trên QA, mất ACK giữ key/body và chỉ1journal, Member wallet, sai role, desktop1440/mobile390/320 chữ130% |
| API typecheck/build/lint; Admin typecheck/build/lint | **PASS**; lint còn warnings cũ ngoài phạm vi, không lỗi mới |
| Contract generate/check/routes, diff whitespace | **PASS**;244operations/38controllers |
| Checkout local của nhóm | **PASS** operator hiện có đăng nhập, lookup thật, chọn User2, mở xác nhận rồi hủy;0pageErrors; fingerprint toàn bộ collection tiền không đổi |
| Local `wallet:check` read-only | **PASS** balanced=true, tổng debit=credit, nguồn hữu hạn đúng; không có khoản nạp mới từ bước xác minh local |
| Remote CI/push/PR/merge; human demo acceptance | **NOT RUN** trong gói này; chưa đóng READINESS |

API và worker local đã restart cùng source. Admin5173, Member5174, API3000 và
Mongo27017 giữ chạy. QA API/Vite đóng và Mongo QA dừng sau kiểm thử.
Checkout ứng dụng ở nhánh khác, chỉ áp patch tương thích vào API/contract/form và
sinh contract tại chỗ; fingerprints các file local tracked/untracked ngoài gói
giữ nguyên. Không pull/reset/stash/ghi đè công việc teammate.

Gates VNPay live trong [diagnosis](VNPAY_DIAGNOSIS_2026_11_02.md), các giới hạn
storage/native/AI/human review và READINESS vẫn giữ nguyên. Chưa phát hành feature
ra main; thành viên trong nhóm cần nhận code/config riêng theo quy trình bàn giao.
