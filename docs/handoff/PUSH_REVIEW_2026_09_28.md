# Kiểm tra trước push nhánh bàn giao

Chủ dự án yêu cầu push để bàn giao ngày 28/09/2026. Nhánh nhận nguồn:
`codex/handoff-roadmap`; remote `origin` là
`https://github.com/huangg49/used-book-marketplace.git`.
Push nhánh riêng, không merge/main, không force, không thay tag checkpoint cũ.

## Phạm vi đã kiểm

- Đã fetch origin; nhánh bàn giao kế thừa toàn bộ 8 commit chưa có trên origin/main
  đến `3808b57`, gồm baseline F2h, hồ sơ rebuild, operations/native và hai vòng UI.
  Tài liệu kế hoạch tiếp nhận được thêm trên lịch sử đó, không chỉ gửi patch UI.
- Working tree sạch trước khi viết gói tài liệu mới; không có việc local khác
  bị ghi đè. Stage có danh sách cụ thể, không add toàn bộ file ignored.
- 733 file tracked trước gói tài liệu: không có `.env` thật, dependency, `.tmp`,
  dist/test-results, DB, APK hoặc keystore theo các phép kiểm tên đường dẫn.
  Quét cả tên object trong lịch sử outgoing không thấy các loại file bí mật đó.
- 443 text blob trong `origin/main..3808b57`: không thấy chữ ký private key,
  GitHub/provider keys theo các pattern đã dùng. Đối chiếu trực tiếp giá trị
  key/secret/token/password/database URL hiện tại trong bốn `.env` local với
  text blob, không in giá trị. Có 3 kết quả khớp DEV_SEED_PASSWORD mẫu công khai
  ở `.env.example` và hai revision hướng dẫn RN; không phải provider credential.
- 68 binary blob không được tuyên bố đã quét nội dung bí mật. Hồ sơ baseline ở
  [FILE_REVIEW](FILE_REVIEW.md); ảnh UI mới ở [SHELF_DETAIL_REVIEW](SHELF_DETAIL_REVIEW.md).
  Không có blob outgoing lớn hơn 10 MiB theo phép kiểm đã chạy.
- Các tài liệu tiếp nhận mới/sửa đã kiểm local links, code fences, diff whitespace
  và chữ ký khóa. Không thay implementation, contract hoặc migration trong gói docs;
  không chạy lại full API E2E vì riêng thay đổi tài liệu.

Đây là các kiểm tra có phạm vi, không phải chứng nhận loại trừ mọi loại secret
trong binary/lịch sử. Kết quả không thay native acceptance hoặc independent review.
Không gửi secret local, dump DB hoặc cấu hình private để người nhận khỏi phải setup.

## Xác minh sau push

So SHA của `git rev-parse HEAD` với
`git ls-remote origin refs/heads/codex/handoff-roadmap`. Chỉ báo remote đã nhận khi
hai giá trị khớp. Tạo Git bundle local kèm SHA256 làm bản dự phòng, verify bằng Git.
Commit/tag nguồn không đồng nghĩa release; Android relaunch và các gate còn mở
được giữ rõ trong [SESSION_STATE](SESSION_STATE.md).
