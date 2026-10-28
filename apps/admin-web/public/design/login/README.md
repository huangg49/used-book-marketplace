# Preview đăng nhập admin — 26/10/2026

Owner đã duyệt đưa bản đồi sách + phiếu kiểu User vào Login Admin thật tại `/`.
Source ở [LoginPage.tsx](../../../src/features/auth/LoginPage.tsx) và
[CSS module](../../../src/features/auth/LoginPage.module.css); runtime dùng ảnh
trong [login-art](../../login-art/README.md). Các HTML trong thư mục này tiếp tục
là mock để so sánh thiết kế, không gửi credential; nút “Trang hiện tại” mở Login
thật. Phần mô tả bên dưới ghi quá trình chọn phương án, không phải auth runtime.

## Hướng mới: đồi sách, asset tách lớp

Owner chọn giữ chất minh họa 3D gần vector, đổi nền gần màu Lật Lại và tách sách
khỏi nền. Xem [meadow.html](meadow.html) tại `/design/login/meadow.html`.
Nền kem giấy, đồi olive/đỏ hồng ấm; form bên phải dùng đỏ rượu. Logo góc trên phẳng,
đỏ rượu, không khung hoặc bóng. SVG inline lấy đúng cửa sổ ảnh cú/chữ từ
`/brand/logo-original.png` như Member web, chuyển độ sáng thành alpha và tô màu
qua filter; không vẽ lại biểu tượng/chữ hoặc sửa file ảnh gốc. A/B/C chưa đổi logo.

Theo owner đối chiếu SpendSense: thêm `.meadow-badge` độc lập phía trên/trái cụm
sách, khung kem bo tròn nghiêng 3D, mặt lõm và biểu tượng cú nổi màu đỏ rượu.
Khung/chiều sâu bằng CSS, biểu tượng từ cùng ảnh gốc qua SVG filter; không gen
lại logo. Chỉnh `--badge-size`, `--badge-left`, `--badge-top` riêng với lớp sách.

Hướng1 được giữ ở [meadow-opening.html](meadow-opening.html) để so sánh:
“Trang sách mở đầu” giữ nền kem liền mạch, Be Vietnam Pro
với tiêu đề lớn hai dòng, form tối đa400px và khoảng cách thoáng. Input nền kem
cao58px, nhãn/focus đỏ rượu; nút chữ Hiện/Ẩn có accessible name/pressed tương ứng.
CTA “Vào không gian quản trị” có arrow chuyển nhẹ khi hover/focus và trạng thái
nhấn/disabled; chân form là đường phân cách và thông tin tài khoản được cấp quyền.
Validation/giữ input và thông báo preview dùng lại script chung; chỉ bổ sung đổi
chữ reveal nếu trang có `.reveal-label`, A/B/C tiếp tục dùng icon cũ. Chưa thêm
loading giả hoặc gọi auth thật từ preview. Form mobile giữ font input16px.

Theo yêu cầu mới nhất, [meadow.html](meadow.html) dùng kiểu phiếu giống Login User,
đối chiếu `apps/user-web/src/layouts/AuthLayout.module.css` và
`apps/user-web/src/pages/LoginPage.module.css`: ba lớp giấy lệch2.2°/.9°, giấy
`/login-art/ivory-paper.webp`, góc3px/viền trên đỏ rượu6px, padding26/32/18px,
logo và loại thẻ ở header, heading Bricolage32px/800, input46px/gạch chân1.5px,
eye reveal, nút48px/góc4px/căn giữa và footer “Sách cũ. Người đọc mới.”.
Font và texture có SHA256 trùng hai app. Copy Admin dùng “Thẻ vận hành” và hướng
dẫn kiểm duyệt; không đổi code User hoặc auth. CSS nằm riêng trong
[library.css](library.css); ảnh minh họa trái giữ nguyên. Script chỉ bổ sung đổi
hai icon eye khi có data attribute; hướng1 vẫn dùng nút chữ Hiện/Ẩn như trước.
Thanh preview chuyển trực tiếp giữa hai hướng. Form vẫn mock, không gửi credential.
Đã kiểm HTTP hai bản/CSS/texture/font, JS syntax, admin build và docs/diff;
visual/keyboard vẫn NOT RUN do browser automation đang bị tắt khi thử lại.

Lượt form: JS syntax, admin build, HTTP và docs/diff check PASS. Browser automation
được thử lại nhưng vẫn báo bị tắt; visual/keyboard và hành vi DOM chưa nghiệm thu.

- [Nền riêng](assets/meadow-latlai-v3.png): 1536×1024, không chứa sách.
- [Cụm sách riêng](assets/books-floating-v3.png): 1254×1254, PNG có alpha trong suốt;
  sách mở, sách xanh phía sau và bookmark là một element cùng lớp.
- [CSS ghép lớp](meadow.css): chỉnh `--books-width`, `--books-left`, `--books-top`
  để đổi kích thước/vị trí sách độc lập với nền. Chưa thêm motion ở bản ghép này.
- [Prompt đầy đủ](assets/prompts-v3.json): tạo bằng built-in ImageGen từ style study
  đã được owner nhận xét tổng thể ổn; không dùng CLI/API key.

Đã xem riêng hai ảnh và kiểm alpha thật của PNG sách. Preview dùng lại form mock,
không thay Login/session thật. Browser automation vẫn bị tắt trong Work settings;
layout desktop/mobile và thao tác bàn phím của bản ghép chưa được kiểm trên browser.

## Ba phương án ban đầu

Ba phương án theo yêu cầu owner: chuyên nghiệp, tối giản, có điểm nhấn khi demo.
Nhánh `codex/admin-ui-refactor`; chưa thay component Login hoặc luồng session.

| Bản | File | Hướng thiết kế |
| --- | --- | --- |
| A — Biên tập | [index.html](index.html) | Nền giấy sáng, typography mạnh, form chia cột; đề xuất ưu tiên |
| B — Không gian sách | [space.html](space.html) | Khối đỏ rượu, ảnh hiệu sách có sẵn, form sáng tách biệt |
| C — Tập trung | [focus.html](focus.html) | Form ở giữa, nền giấy và khung đỏ rượu tiết chế |

Mở `/design/login/index.html` trên admin Vite, chuyển phương án bằng thanh preview.
Form chỉ kiểm nhập và hiện/ẩn mật khẩu; không gọi API, gửi hoặc lưu credential.
Nút “Trang hiện tại” trở về app để đăng nhập thật. Chưa có phương án nào được owner
chọn áp dụng. Dùng logo, font và ảnh sẵn có trong repo; không thêm thư viện/UI kit.

Đã kiểm HTTP200/content type cho ba HTML và tám asset, JS syntax và admin build.
Detector một lượt có warning chữ nhỏ; đã nâng chữ chức năng/phụ tối thiểu12px và
đưa radius control về8px. Cream background là brand có chủ đích; typography display
và hình gáy sách là chi tiết proposal. Finding padding là detector ghép breakpoint,
không được nhận thành browser PASS. Chưa chạy lại detector để tăng số evidence.

Browser CUA bị tắt trong Work settings tại lượt kiểm tra cuối: desktop/mobile,
keyboard interaction và visual acceptance NOT RUN. Cần xem trên browser trước khi
áp dụng bản chọn. Không đổi auth/API/quyền; không mở gate READINESS.
