# Màn chuẩn 02 — rõ cửa hàng, giữ lý lịch cuốn sách

30/09/2026 · `codex/ui-direction`, nối tiếp `cacf3a0`/`c51b0ee`.
Checkpoint: `feat(rn): keep book trade information visible on detail`.
**Hướng A đã được duyệt để triển khai; kết quả hình ảnh vẫn chờ chủ dự án duyệt.**

[Xem trước/sau ở 390px, chữ 100% và 130%](detail-standard-02.html).

## Thay đổi

- Tên/tác giả/tình trạng nằm cạnh bìa, bỏ cấu trúc tiêu đề trải ngang như bài báo.
- Giá bán/giá trị đổi và câu “Tiệm chưa nhận đơn trong phiên bản này” nằm trong
  `Screen.footer`, ngoài ScrollView, trong safe area. Không overlay/fixed height.
  `compactFooter` giảm padding dọc từ 16 xuống 8; mặc định consumer khác giữ nguyên.
- `BookTradeBar` tái sử dụng `BookPrice`, nhận slot nội dung để C04 thay lời nhắn
  bằng hành động thật khi đủ điều kiện. Component không quyết định quyền, gọi API
  hoặc dựng nút giả. Chưa triển khai mua/đổi; C02 vẫn tạm hoãn.
- Giữ phiếu và nhãn nguồn người đăng, dấu tình trạng không mang nghĩa kiểm định.
  [DESIGN](../DESIGN.md) bổ sung cân bằng chất tiệm sách với tín hiệu giao dịch:
  dấu/phiếu không lấn át tên, giá và vùng giao dịch; giảm thúc ép không giấu giá.
- Khi tải lại lỗi, giữ nội dung/cảnh báo có sẵn và ẩn footer giá. Không đổi query,
  retry, callback, navigation, API, contract, session, tiền hoặc dữ liệu nghiệp vụ.
  `/ui` và showcase đồng bộ component; chưa áp thiết kế sang màn sản phẩm khác.

## Nguồn ảnh và dữ liệu

Pixel_7, Android API35/x86_64, APK debug hiện có + Metro source mới. Màn vật lý
1080×2400, density443 (~390×867dp), font hệ thống 1.0/1.3; PNG nguyên bản.
Ảnh “Trước” là bộ **Sau của màn chuẩn 01 tại `c51b0ee`**, không chụp lại và không
chỉnh sửa. Ảnh “Sau” là tám ảnh native mới trong [evidence](evidence/ui-1-commerce/).
Không dùng web export hay HTML dựng màn giả làm bằng chứng Android.

QA `.tmp/demo/ui-commerce`, API3046/media3047, Mongo replica set riêng tại57017,
database random `*_test`. Bốn listing được tạo/duyệt qua API, không sửa DB trực tiếp.
QA cũ dùng tmpfs đã mất dữ liệu khi hạ tầng dừng; bộ mới có ID khác nhưng cùng
tên/tình trạng/giá/mô tả/bìa DEMO để so bố cục. Nest/Mongo/Sharp thật,
**storage fixture FAKE**, không phải Supabase thật. Không chạm DB/bucket chính.

| Bản QA | Tình trạng | Hình thức và số tiền | 100% / 130% |
| --- | --- | --- | --- |
| Mùa đọc | LikeNew — Như mới | Bán85.000đ | Đã xem cả hai |
| Những buổi chiều bên cửa sổ | Good — Còn tốt | Bán125.000đ / đổi150.000đ | Đã xem cả hai |
| Người giữ những trang sách cũ | Fair — Đã dùng nhiều | Chỉ đổi60.000đ | Đã xem cả hai |
| Những con đường nhỏ, những mùa mưa và một cuốn sách ở lại | Worn — Cũ nhiều | Bán35.000đ / đổi45.000đ | Đã xem cả hai |

## Kiểm tra trực tiếp

- Bốn bản đều thấy đủ bìa, tên, nhãn tình trạng, số tiền/hình thức và trạng thái
  chưa nhận đơn ngay đầu màn ở100%. Tên dài không ellipsis, không thu nhỏ font.
- 130%: số tiền vẫn rõ; câu trạng thái xuống hai dòng. Footer đo từ hierarchy
  khoảng92dp ở100%, 124dp ở130% (không gồm safe area), không khóa cứng chiều cao.
  [Cuối màn130%](evidence/ui-1-commerce/bottom-130.png): nút cuối nằm trọn trên
  footer, có khoảng cách; cuộn đọc đủ nội dung, không bị phủ lên.
- [Lỗi refetch](evidence/ui-1-commerce/refetch-error-130.png): tạm chuyển adb
  reverse của API sang cổng không phục vụ, bấm cập nhật. Cảnh báo hiện, mô tả
  giữ lại, ảnh lớn bị vô hiệu hóa theo hành vi cũ; footer giá biến mất.
  Khôi phục reverse và bấm thử lại:
  [phục hồi ảnh/giá](evidence/ui-1-commerce/recovered-130.png).
- Mở ảnh lớn, Android Back đóng sheet, bấm “Về kệ sách” quay lại kệ thành công.
- Consumer showcase: đã xem chi tiết mẫu ở130%, bìa/tên/tình trạng/giá và nhãn
  “Dữ liệu mẫu · không nhận đơn” hiển thị đủ. Trang HTML so sánh đã mở và đổi
  100%→130% đúng nguồn ảnh; đây chỉ là trình xem evidence, không phải client web.
- Không có logo/khẩu hiệu trên chi tiết: dấu tình trạng và phiếu thể hiện bản
  sách đã qua sử dụng; giá/trạng thái cố định bổ sung tín hiệu cửa hàng. Cảm nhận
  “nhìn5giây hiểu” và chất tiệm sách **cần chủ dự án đánh giá**, không tự chấm PASS.

## Checks và giới hạn

Node24.19.0/pnpm11.19.0. PASS: RN typecheck, lint (0 warning), test91/91 (12 files),
contract:check, Prettier, docs:check, git diff --check. Không đổi bundling/native
dependency/config nên không chạy lại export/native build/API E2E.

Không mở gate native tổng thể/TalkBack/ARM/iOS/Expo web hoặc human review/release.
`/ui` được cập nhật source/typecheck nhưng không nghiệm thu native ở lượt này:
Metro chủ dự án đang chạy `EXPO_PUBLIC_DESIGN_PREVIEW=0`, route redirect đúng về kệ.
Không đổi cờ môi trường của terminal người dùng để mở preview.

**Dừng tại đây chờ duyệt ảnh.** Chưa push/PR/merge, chưa mở C02/C04 hoặc áp sang
màn khác. Trạng thái môi trường và bước tiếp lưu ở [SESSION_STATE](../handoff/SESSION_STATE.md).
