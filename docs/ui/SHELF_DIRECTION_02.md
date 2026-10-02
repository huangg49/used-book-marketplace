# Kệ sách vòng02 — trả lại nhịp dạo kệ

30/09/2026 · `codex/ui-direction`, base `ead610b`.
Checkpoint: `feat(rn): restore browsable shelf with adaptive book offers`.
[Ảnh mới và so sánh](shelf-direction-02.html).

Chủ dự án từ chối vòng01 rồi giao quyền quyết định thiết kế. Vòng này sửa lỗi
thiết kế: một cuốn chiếm gần hết kệ nhưng bìa nhỏ, cột chữ dài để trống dưới ảnh.
Quyền tự quyết thiết kế không là quyền push/merge/deploy hoặc đổi nghiệp vụ.

## Kết quả

- Hai cột ở width>=360dp/chữ thường. Bìa contain cao180dp trên nền giấy;
  tên Lora18/26, tác giả, tình trạng đất nung và giá. Không cắt tên/tác giả.
- Chữ130% hoặc màn hẹp: một cột, ảnh38% cạnh tên/tác giả/tình trạng; giá nằm
  trên hàng riêng đủ chiều rộng bên dưới. Hai nhóm giá wrap khi thiếu chỗ.
  Không còn kéo cả giá/người bán xuống cột cạnh bìa như vòng01.
- `BookOffer` dùng nhãn Bán/Đổi sát đúng số tiền, Be Vietnam Pro18/25. Cả hai
  giá đều hiện khi listing có cả hai, không gộp giá hay chọn giá thấp nhất.
  Vùng giá một cột mở cùng chi tiết hiện có; không là hành động mua/đổi.
- Tên người bán vẫn ở chi tiết và nhãn accessible của mục sách, bỏ khỏi phần
  nhìn thấy trên kệ để giảm lặp. Tình trạng chỉ một nét nhấn, không tem kiểm định.
- Gom search/chips, metadata tự wrap cạnh tiêu đề kệ, dùng compactFooter đã có.
  Không đổi query/filter/cursor/retry/navigation/session/API. Shared showcase
  và `/ui` có ví dụ BookOffer; màn chi tiết và BookTradeBar giữ nguyên.

## Evidence thực chạy

Android Pixel_7/API35/x86_64, APK debug hiện có + Metro8081;1080×2400,
density443 (~390dp), font1.0/1.3. Kiểm thêm density540 (~320dp),font1.3.
API3046/Mongo QA57017 thật, run ui-refine, database riêng `*_test`, storage fixture
FAKE. Cùng bốn listing cũ, không tạo/chỉnh data. Ảnh trước tái dùng bộ Sau ead610b;
ảnh mới ở `evidence/ui-1-shelf-v2`, không chỉnh PNG.

- Đã xem đầu kệ100%/130%, tên dài/Cũ nhiều và hai giá35K/45K, chỉ đổi60K;
  cuộn qua125K/150K và chỉ bán85K. Cuối kệ không bị footer che.
- Mở sách từ bìa, Back về kệ; mở bảng lọc/Back, bàn phím/tìm không có kết quả,
  bỏ lọc, lọc Bán và trở lại Tất cả. Dữ liệu/đường điều hướng giữ nguyên.
- Ngắt adb reverse API rồi refresh: danh sách cũ có cảnh báo, ảnh chuyển
  placeholder. Khôi phục reverse/retry phục hồi kệ; không giả API hay nới quyền ảnh.
- 320dp/130%: cuộn đọc tên/dấu, giá tự xuống dòng; header/nav wrap. Không yêu cầu
  mọi dữ kiện nằm trong viewport đầu ở cấu hình này.
- Xem showcase100%/130% với ảnh tư liệu vuông/dọc có sẵn. Không crop, banner mẫu
  còn nguyên; không coi đây là listing bán thật. Đây giúp kiểm thẩm mỹ ngoài bìa
  DEMO, không thay bằng chứng API của kệ thật.

PASS: RN91/91 (12 files), lint, typecheck; Prettier, docs:check và diff-check.
Không viết test phản chiếu spacing; không chạy lại API E2E/contract/export/native
build vì phần tương ứng không đổi. Giới hạn: TalkBack thực, máy yếu/FPS/ARM,
iOS/Expo web và `/ui` native chưa kiểm; không đóng gate release/human review.

QA serve ban đầu bị RUN_LOCKED do process phiên trước đã dừng nhưng còn lock.
Đã kiểm PID25676 không còn, chỉ xóa file lock của đúng QA run rồi mở lại; không
reset DB. Harness/snapshot riêng ignored ở `.tmp/ui-shelf-v2`.

Kết thúc: phục hồi snapshot app/font/density/reverse, dừng API/media/emulator
do agent mở; giữ Metro/Docker/preview người dùng. SESSION_STATE ghi bước tiếp.
Chưa push/merge; chưa thêm animation, vuốt ảnh hoặc mở C02/C04.
