# Kệ sách — áp hướng màn chuẩn, vòng 01

30/09/2026 · `codex/ui-direction`, base `d5c0f34`.
Checkpoint: `feat(rn): bring approved book direction to shelf`.
Chủ dự án duyệt màn chi tiết và chọn kệ trước, chuyển động mở ảnh sau.
[Ảnh trước/sau390dp,100%/130%](shelf-direction-01.html). **Chờ duyệt kệ.**

## Thay đổi và đánh đổi

- Bỏ banner khẩu hiệu/ảnh trang trí; đưa sách lên sớm hơn. Giữ logo gốc,
  TP.HCM, tìm kiếm và bộ lọc; rút placeholder thành “Tên, tác giả, ISBN”.
- `ShelfGrid` dùng một hàng cho mỗi bản sách, bìa34% bên trái, tên/tác giả/dấu
  tình trạng/hình thức/giá bên phải. Divider thay hộp card. Bìa2:3 nền giấy,
  contain giữ nguyên ảnh; không tẩy nền hoặc crop. Tên dài không cắt dòng.
- Dùng `BookCondition stamp`, role `shelfTitle`18/26 và annotation14/21.
  `BookPrice reading stacked` giữ nhãn và số tiền thành nhóm dọc, gap12px;
  không đặt hai số sát nhau trong cột hẹp. Nhãn accessible của mục sách có cả
  tình trạng, hình thức và từng mức giá. Không coi hierarchy là TalkBack PASS.
- Dùng lại ShelfGrid trong showcase, cập nhật ví dụ `/ui` và tài liệu chung.
  `BookPrice` mặc định/BookTradeBar, chi tiết đã duyệt và các màn khác giữ nguyên.
- Đánh đổi: ít bìa cùng lúc hơn lưới hai cột, nhưng đọc tên/tình trạng/giá cạnh
  bìa. Không quảng cáo đây là cải thiện hiệu năng; danh sách vẫn phân trang, chưa
  virtualize. Không thêm dependency, animation, API hoặc tính năng giao dịch.

## Kiểm chứng thực chạy

Pixel_7/API35/x86_64, APK debug hiện có + Metro8081, ảnh1080×2400,
density443 (~390dp), font hệ thống1.0/1.3. Cùng bốn listing DEMO trong run
`.tmp/demo/ui-refine`: LikeNew/Good/Fair/Worn, Sale/Exchange/Both, tên ngắn/dài.
API3046/Mongo QA57017 thật, database riêng `*_test`, **storage fixture FAKE**.
Không tạo lại listing, đổi dữ liệu hoặc đụng DB/bucket chính.

- Chụp mới cả trước/sau. Trước dùng source ba file kệ tại d5c0f34; bản đang sửa
  được lưu riêng rồi phục hồi, không checkout/reset working tree. Khởi động lại
  app sau khi đổi cỡ chữ để ảnh không lẫn frame của cấu hình trước. Không chỉnh PNG.
- 390dp/100% và130%: tên dài, Cũ nhiều, Bán hoặc đổi,35K/45K nhìn thấy ở đầu màn.
  Tên người bán dài cuộn tiếp để đọc. Giá125K/150K và chỉ bán/chỉ đổi đã xem;
  [cuối kệ130%](evidence/ui-1-shelf/bottom-130.png) không bị navigation che.
- Mở từ bìa → chi tiết → Android Back về kệ; mở bộ lọc rồi Back; nhập/tìm bằng
  nút Search, bàn phím được đóng khi tìm; [rỗng](evidence/ui-1-shelf/empty-130.png)
  rồi bỏ bộ lọc; chọn Bán trả đúng listing chỉ bán, trở về Tất cả.
- Cố ý ngắt adb reverse API rồi cập nhật: [lỗi](evidence/ui-1-shelf/error-130.png)
  nói rõ danh sách cũ, ảnh thành placeholder. Khôi phục reverse, retry phục hồi
  kệ/ảnh; không sửa query/retry/expiry để vượt lỗi.
- Kiểm thêm320dp/font130% (density540): header/nav xuống dòng, tên và dấu dài
  đọc đủ khi cuộn; [ảnh sau cuộn](evidence/ui-1-shelf/narrow-scroll-130.png).
  Không đặt tiêu chí mọi dữ kiện nằm trong viewport đầu ở màn hẹp/chữ lớn.
  Placeholder tìm kiếm có thể cắt ở320dp/130%; input vẫn nhận/giữ nội dung.
- [Showcase130%](evidence/ui-1-shelf/showcase-130.png) dùng chung bố cục, ảnh tư
  liệu vuông không bị crop; không coi ảnh showcase là dữ liệu bán thật.

PASS: RN91/91 tests (12 files), lint/typecheck; chạy lại lint/typecheck sau chỉnh
nhãn accessible/placeholder cuối. Prettier, docs:check, git diff --check PASS.
Không viết test snapshot chỉ để phản chiếu spacing. Không chạy lại API E2E,
contract/export/native build vì contract/runtime tương ứng không đổi.

Giới hạn: chưa kiểm TalkBack thực, ARM/máy yếu/FPS, iOS/Expo web hay `/ui` native
(preview flag đang tắt). Không đóng full native, review độc lập hoặc release.
Chưa khảo sát phân bố số ảnh/listing (hướng2); không bắt đầu chuyển động (hướng1)
hoặc nối bìa giữa màn (hướng3 hoãn).

## Điểm dừng

Phục hồi app snapshot/font/density/reverse theo ghi nhận trước QA; dừng API/media
và emulator do agent khởi động, giữ Metro/Docker/preview người dùng. Harness và
snapshot riêng ignored tại `.tmp/ui-shelf`. Chưa push/PR/merge.
**Dừng để chủ dự án duyệt ảnh kệ trước khi làm chuyển động mở ảnh lớn.**
