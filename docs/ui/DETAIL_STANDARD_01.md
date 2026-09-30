# UI-1 — Màn chuẩn chi tiết sách

30/09/2026 · `codex/ui-direction` · **CHỜ DUYỆT MÀN CHUẨN**.

[Xem ảnh trước/sau](detail-standard-01.html) — chọn bốn bản sách, chữ 100%/130%,
hoặc xem phiếu tình trạng của bản Cũ nhiều. Chỉ là trang xem evidence, không phải
client hay màn sản phẩm mới. Ảnh PNG nguyên bản trong `evidence/ui-1-detail/`.

## Thay đổi đã được phép

Chủ dự án duyệt đúng ba vấn đề trong [CRITIQUE_01](CRITIQUE_01.md) và chọn chi tiết
sách làm màn chuẩn. [DESIGN](../DESIGN.md) đã bổ sung “Khoảnh khắc đặc trưng” và
phép thử bỏ logo/khẩu hiệu. C02 vẫn tạm hoãn; chưa có quyền rollout/push/merge.

1. **Sách trước lời dẫn:** tên và tác giả ở đầu; bìa cạnh tình trạng/giá. Ảnh được
   contain, giữ nguyên màu và nút xem lớn. Chú thích về nguồn ảnh/kiểm duyệt giữ đủ.
2. **Lý lịch bản sách:** nhãn tình trạng viền đất nung; phiếu có nguồn “Người đăng
   mô tả”, tên người đăng và lề đọc. Giữ đủ ruột sách, bìa/gáy, ghi chú, phụ kiện,
   khai báo trang thiếu. Không thêm lịch sử, số đời chủ hoặc tem chứng nhận giả.
3. **Vai trò chữ:** title 22/30, section 20/28, nội dung 16/25, nhãn 14/21, giá
   20/28. Không ép chữ một dòng hoặc tắt font scaling. Mô tả chung/ấn bản/giao
   nhận vẫn đầy đủ bên dưới phiếu; không đổi callback, quyền hoặc request.

Palette hiện tại đã trùng năm màu DESIGN nên không đổi mã màu để tạo diff.
Thêm role trình bày trong theme chung trước khi compose màn. `BookCondition stamp`
và `BookPrice reading` là opt-in; consumer mặc định không đổi style. Ví dụ `/ui`
và trang showcase dùng chung chi tiết được đồng bộ, không thiết kế lại kệ/form.
Bìa chi tiết thu về cao 184dp để đi cùng thông tin; sheet xem lớn giữ 420dp.

## Dữ liệu QA và cách đối chiếu

- Source trước: `33385b8` (code sản phẩm giống main `4273f10`). Source sau: commit
  có subject `feat(rn): shape book detail around its condition record`.
- Pixel_7 / Android API35 / x86_64, APK debug hiện có + Metro 8081; 1080×2400,
  density 443 (~390×867dp). Cùng bốn listing, lần lượt OS font_scale 1.0 và 1.3.
- Run `.tmp/demo/ui-standard`: random database `*_test` tại QA57017/rs-test,
  API3046, media3047. Catalog request/confirm, listing draft, upload/finalize,
  media worker, submit/approve đều qua API thật. Storage **FAKE fixture**, không
  Supabase thật; không tác động database/bucket chính, tiền hoặc đơn hàng.
- Bốn bìa SVG gốc có chữ DEMO được rasterize trước upload, màu khác nhau; không
  phải ảnh sách thật. Titles/notes giữ nguyên giữa hai lần chụp. Journal/credential
  và script điều phối local nằm ignored trong `.tmp`, không đưa vào bàn giao Git.

| Bản QA | Tình trạng | Giá/hình thức | Chữ 100% | Chữ 130% |
| --- | --- | --- | --- | --- |
| Mùa đọc — tên ngắn | LikeNew / Như mới | Bán 85.000đ | [Trước](evidence/ui-1-detail/before-new-100.png) · [Sau](evidence/ui-1-detail/after-new-100.png) | [Trước](evidence/ui-1-detail/before-new-130.png) · [Sau](evidence/ui-1-detail/after-new-130.png) |
| Những buổi chiều bên cửa sổ | Good / Còn tốt | Bán 125.000đ, đổi 150.000đ | [Trước](evidence/ui-1-detail/before-good-100.png) · [Sau](evidence/ui-1-detail/after-good-100.png) | [Trước](evidence/ui-1-detail/before-good-130.png) · [Sau](evidence/ui-1-detail/after-good-130.png) |
| Người giữ những trang sách cũ | Fair / Đã dùng nhiều | Chỉ đổi 60.000đ | [Trước](evidence/ui-1-detail/before-fair-100.png) · [Sau](evidence/ui-1-detail/after-fair-100.png) | [Trước](evidence/ui-1-detail/before-fair-130.png) · [Sau](evidence/ui-1-detail/after-fair-130.png) |
| Những con đường nhỏ, những mùa mưa và một cuốn sách ở lại — tên/mô tả dài | Worn / Cũ nhiều | Bán 35.000đ, đổi 45.000đ | [Trước](evidence/ui-1-detail/before-worn-100.png) · [Sau](evidence/ui-1-detail/after-worn-100.png) | [Trước](evidence/ui-1-detail/before-worn-130.png) · [Sau](evidence/ui-1-detail/after-worn-130.png) |
| Phiếu bản Cũ nhiều (đã cuộn) | Cùng dữ liệu trên | Đối chiếu cách đọc chi tiết | [Trước](evidence/ui-1-detail/before-worn-record-100.png) · [Sau](evidence/ui-1-detail/after-worn-record-100.png) | [Trước](evidence/ui-1-detail/before-worn-record-130.png) · [Sau](evidence/ui-1-detail/after-worn-record-130.png) |

## Kết quả và giới hạn

- Native quan sát: bốn condition và ba mode đúng dữ liệu; tên/giá/tình trạng hiện
  ngay phần đầu ở hai cỡ chữ; chữ dài xuống dòng, phiếu cuộn đọc đủ các trường.
  Nút xem ảnh lớn, Back đóng sheet, Back về kệ, mở ấn bản và refresh vẫn hoạt động.
- Tạm ngắt media reverse3047: ảnh thiếu/lỗi và nút tải lại hiện; nối lại và bấm
  tải lại phục hồi ảnh. Dừng API QA: refresh lỗi giữ dữ liệu cũ, ảnh không còn
  active, có thông báo và retry; bật API và retry phục hồi. Không mock response.
- Phép thử bỏ logo/khẩu hiệu: màn chi tiết vốn không chứa hai yếu tố này. Điểm
  khác trước/sau nằm ở dấu tình trạng và phiếu mô tả, không dựa vào bìa DEMO.
  Đây là nhận định thiết kế; **cảm giác “sách cũ có lý lịch” chờ chủ dự án duyệt**.
- PASS: RN 91/91 tests (12 files), typecheck, lint; contract:check, Prettier và
  docs:check/diff-check. Node24.19.0, pnpm11.19.0. Không đổi API/contract/dependency
  native; không chạy lại API E2E, build native hay export toàn bộ vì không có
  thay đổi tương ứng. Metro đã bundle source mới và chạy trên Android thật.
- Không kiểm mới TalkBack/ARM/iOS/Expo web, 320px, nhiều ảnh trong một listing
  hoặc toàn bộ native/release gate. Phạm vi ảnh theo yêu cầu: 390px, 100%/130%.
  Keyboard không áp dụng vì chi tiết không có ô nhập; không mở lại gate form.

Bản chụp trạng thái app, font/density và adb reverse đầu lượt được phục hồi sau QA;
API/media và emulator do lượt này mở đã dừng. Metro/preview cũ giữ nguyên. Dữ liệu
QA giữ lại để tái hiện, không reset database. SESSION_STATE ghi checkpoint và
bước tiếp. **Dừng chờ duyệt màn chuẩn, chưa triển khai màn khác.**
