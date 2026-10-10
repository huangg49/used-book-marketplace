# Lật lại 1.1 — Dấu chuyền tay

Ngày09/10/2026: [brief hiện hành](../../../DESIGN.md) thay các ràng buộc thẩm mỹ
UI-1 sau phản hồi của chủ dự án. Lora không còn là font bắt buộc. Bộ này giữ
asset, giấy phép và lịch sử; font/màu trong runtime chưa tự thay theo brief mới.

Trạng thái: hướng nhận diện từ bước 1, đã được áp dụng vào nền tảng UI React Native
ở bước 3 (25/09/2026). Cần tiếp tục kiểm chứng native và phản hồi sử dụng; không
thay thế đặc tả nghiệp vụ. Xem [component và phạm vi](../../../docs/design/UI_COMPONENTS.md).

Mở [trang trình bày](../index.html) để xem thiết kế và [bảng tổng quan](assets/identity-board.png).
Đọc [báo cáo rà soát](../../../docs/design/BRAND_AUDIT.md) để xem căn cứ và giới hạn.

## 1. Ý tưởng trung tâm

**Một cuốn sách. Một người đọc mới.**

Lật lại phục vụ việc mua bán, trao đổi từng bản sách đã qua sử dụng. Một người khép
sách lại, một người khác mở ra. Tính riêng đến từ khoảnh khắc chuyền tay và thông tin
về chính cuốn sách đó: bìa, gáy, trang, ấn bản, tình trạng và người bán.

“Dấu chuyền tay” là tên hướng thiết kế nội bộ, không phải tên mới của ứng dụng.
“Sách cũ. Chương mới.” vẫn là tagline chính. “Đọc xong. Đọc tiếp.” là câu truyền thông,
không thay tên nút thao tác. “Gửi người đọc sau” là mẫu lời nhắn thương hiệu, chưa phải
cam kết có tính năng nhắn gửi hoặc lịch sử các chủ sách trong app.

## 2. Những quyết định được giữ

- Giữ tên **Lật lại**, đầy đủ dấu và cách viết hoa. Logo nằm trong `../logos/`.
- Giữ hình học logo gốc. Không thay wordmark bằng chữ gõ, không thêm dấu chấm.
- Giữ năm màu gốc: xanh trầm, giấy kem, cam đất, mực, lá non.
- Giữ cặp Lora và Be Vietnam Pro cùng giấy phép OFL trong `../fonts/`.
- Giữ nguyên `../tokens/` cho các client chưa chuyển đổi. React Native dùng palette
  1.1 qua `core/ui/theme.ts`; không trộn hai nguồn trong cùng UI. Năm màu cốt lõi
  giữa hai bản phải trùng nhau.

Lý do giữ logo: trang cam đang lật có thể phát triển thành một hệ đồ họa nhất quán.
Chưa có bằng chứng sử dụng thực tế cho thấy phải thay biểu tượng. Bản thân hình sách
mở khá quen thuộc; sự khác biệt cần được chứng minh bằng toàn bộ trải nghiệm.

## 3. Ba dấu hiệu hình ảnh

### Trang lật

Trích mảng nghiêng từ logo (bản gốc có cạnh chuyển ngang 22, dọc 25 đơn vị). Dùng một
mảng chính trong một bố cục, cạnh thẳng, màu đặc. Minh họa sách trong `page-turn.svg`
là ứng dụng đồ họa; không lấy nó thay file logo. Không biến mọi card/nút thành trang
sách, không chồng trang cam lên ảnh bìa hoặc thông tin giá.

### Nhịp gáy sách

Dải đứng có độ rộng và cao khác nhau, cùng đường chân. Dùng làm mép ấn phẩm hoặc
chuyển đoạn truyền thông. Nhịp này gợi kệ sách do nhiều người góp vào. Không biến thành
mã vạch, số lượng sách, biểu đồ hay dữ liệu hành trình khi chưa có dữ liệu thật.

### Thẻ nhắn gửi

Một lề cam, một lời nhắn cụ thể và khoảng trống để người đọc viết tiếp. Nội dung mẫu
phải ghi rõ là gợi ý của thương hiệu; không giả chữ viết tay, đánh giá, chữ ký hoặc
lịch sử người dùng. Đây là ứng dụng nhận diện, không bổ sung chức năng vào SRS.

## 4. Màu và khả năng đọc

Nguồn đề xuất: [identity.tokens.json](identity.tokens.json). `palette.css` và
`contrast-report.json` được sinh từ tệp này, không sửa bằng tay.

| Vai trò | Màu | Quy tắc |
|---|---|---|
| Nhận diện chính | forest / paper | Khối truyền thông mạnh; nền sản phẩm sáng |
| Nội dung | ink | Nội dung dài, dữ liệu quan trọng |
| Chữ phụ | muted | Mô tả phụ có khả năng đọc, không hạ opacity tùy tiện |
| Điểm nhấn đồ họa | terracotta | Không dùng cho chữ nhỏ trên paper: chỉ 3,8201:1 |
| Chữ nhấn | rustText | 6,0210:1 trên paper; không đổi màu logo theo màu này |
| Điểm sáng | leaf | Ưu tiên nền/mảng hình hoặc chữ trên forest |
| Viền điều khiển | border | Từ 3:1 trên paper/surface |
| Đường phân cách trang trí | rule | Không dùng một mình để nhận biết input hoặc focus |
| Trạng thái | error/success/warning/info | Có nền tương ứng và nhãn; không chỉ phân biệt bằng màu |

Màu RGB, không phải bộ màu in CMYK. Tỉ lệ 60/25/10/5 trong v1 là gợi ý truyền thông,
không ép cho mọi màn hình. Ảnh bìa có màu riêng; không phủ xanh/kem lên ảnh để ép nhận diện.

Các ngưỡng áp dụng: chữ thường từ 4,5:1; phần viền nhận biết điều khiển từ 3:1.
Nguồn: [W3C — text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[W3C — non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
13 cặp chỉ chứng minh bảng màu đã tính, không chứng nhận accessibility toàn sản phẩm.

## 5. Typography

- **Lora 600**: tiêu đề ngắn, câu truyền thông, mở đầu một nội dung biên tập.
- **Be Vietnam Pro 400**: thông tin mô tả, form, trợ giúp và nội dung dài.
- **Be Vietnam Pro 700**: nhãn, hành động, giá và thông tin cần nhấn.
- Không tạo weight 500/600 giả cho Be Vietnam Pro: bộ hiện tại chỉ có tệp 400/700.
- Giá và số liệu dùng Be Vietnam Pro. Đã kiểm tra: Lora hiện tại thiếu U+20AB `₫`.
- Dấu tiếng Việt không được cắt bằng fixed-height hoặc line-height quá chặt. Nội dung
  dài được xuống dòng; mã, tên sách và giá cần kiểm tra riêng trong bước màn hình.
- Logo dùng vector đã outline; nội dung tương tác dùng text thật. Không đem ảnh chữ
  từ poster đặt vào UI để thay title hoặc nút.
- Kích thước chữ lớn trên trang nhận diện là cho truyền thông. Không sao chép nguyên
  78–116 px vào màn hình mua sách. Thang chữ RN sẽ được kiểm chứng ở bước 2.

## 6. Bố cục, ảnh và chuyển động

Chọn một điểm nhìn chính mỗi bố cục. Dùng tương phản kích thước chữ, khoảng trống và
mảng màu để dẫn mắt. Đường lề rõ; tránh đưa mọi thông tin vào các hộp bo tròn giống
nhau. Bo góc trong sản phẩm sẽ theo công năng và nền tảng, không có lệnh cấm chung.

Ảnh listing ưu tiên đúng cuốn sách: ảnh bìa thẳng, gáy, cạnh trang và chi tiết hư hại.
Không làm đẹp đến mức che nếp gấp, ố hoặc ghi chú. Ảnh truyền thông có thể dùng khung
cận cảnh bàn tay trao sách, góc đọc hay kệ thật; phải có quyền sử dụng và ghi rõ dàn
dựng khi cần. Không dùng hình sinh để giả làm bằng chứng tình trạng sách đang bán.
Chưa tạo thư viện ảnh trong bước 1; cần ảnh được phép sử dụng ở bước 2.

Chuyển động phải giúp hiểu thao tác. Trang lật có thể xuất hiện ở thời điểm giới
thiệu; không lật cả màn hình theo từng tap hoặc chạy chuyển động trang trí liên tục.
Trang trình bày hiện tại không có animation tự chạy; cuộn mượt tôn trọng reduced motion.

## 7. Giọng nói

| Ngữ cảnh | Ví dụ phù hợp | Tránh |
|---|---|---|
| Giới thiệu | “Cuốn sách bạn khép lại có thể mở ra điều gì đó cho một người khác.” | Hứa hẹn số độc giả hoặc tác động môi trường chưa đo |
| Hướng dẫn ảnh | “Chụp rõ bìa, gáy sách và những trang có ghi chú.” | “Thổi hồn vào hành trình tri thức” |
| Tình trạng | “Bìa có nếp gấp nhỏ. Trang bên trong sạch.” | “Như mới” khi ảnh có hư hại |
| Thao tác | “Đăng bán sách”, “Đề nghị trao đổi” | “Bắt đầu phép màu” |
| Lỗi | Nêu lỗi và cách xử lý cụ thể | Dùng thơ hoặc slogan thay thông tin sửa lỗi |

Thương hiệu tạo cảm xúc ở đúng chỗ. Phí, trạng thái, tiền mô phỏng, điều kiện đổi trả
và lỗi phải nói chính xác theo nghiệp vụ. Không tự thêm nhãn “đã xác thực”, “an toàn
tuyệt đối”, số lượt chuyền tay hoặc sao đánh giá khi hệ thống không chứng minh được.

## 8. Tài sản và cách dựng lại

| Tệp trong `assets/` | Kích thước SVG/PNG | Mục đích |
|---|---|---|
| campaign | 1600 × 1000 | Áp phích thể hiện câu chuyện |
| identity-board | 1600 × 1200 | Bảng nhận diện tổng quan |
| page-turn | 610 × 640 | Minh họa gốc từ hình trang lật |
| handoff-note | 1000 × 740 | Thẻ nhắn gửi mẫu |
| bookmark | 420 × 1160 | Dấu trang mẫu |
| size-proof | 1100 × 500 | Biểu tượng 16/24/32/48/64 và logo ngang 160 px |

SVG là bản vector; chữ đã outline từ font OFL đi kèm. PNG là bản xem trước, không thay
nguồn. Thẻ và bookmark chưa có kích thước vật lý, bleed, giấy hoặc proof màu của nhà in.
Không dùng chúng như tệp sẵn sàng in thương mại.

Sinh SVG, CSS bảng màu và báo cáo tương phản:

```sh
python -m pip install fonttools==4.63.0
python packages/brand/v1.1/build_identity.py
```

Sinh PNG bằng Node và `sharp` cài riêng trong thư mục công cụ (không cần thêm dependency
vào ứng dụng):

```sh
npm install --prefix .tmp/brand-tools sharp
node packages/brand/v1.1/render_previews.mjs "<absolute-path-to-repository>/.tmp/brand-tools/node_modules/sharp"
```

Mở trực tiếp `packages/brand/index.html` hoặc từ root chạy
`python -m http.server 4178 --bind 127.0.0.1` và truy cập
`http://127.0.0.1:4178/packages/brand/index.html`. Trang không gọi CDN, analytics hay API.

## 9. Ranh giới và bước tiếp

- v1.0 vẫn được giữ ở `../index-v1.0.html`, PDF gốc, logo và token gốc.
- v1.1 là hướng phát triển để người dùng đánh giá, chưa được coi là nhận diện đã duyệt.
- Bước 2: thiết kế khám phá, chi tiết listing, đăng sách với dữ liệu khó và trạng thái
  thực tế. Chỉ sau đó mới chốt thang chữ, spacing và component RN.
- Bước 3: đưa lựa chọn đã kiểm chứng vào token dùng chung, component, quy chuẩn code
  và review. Không duy trì lâu dài hai nguồn token cùng chi phối một màn hình.
- Chưa có nghiên cứu người dùng hoặc đối chiếu thị trường để kết luận nhận diện độc
  quyền, không giống sản phẩm khác, hay cam kết mọi người sẽ cảm nhận “không AI”.

Mốc hoàn thành của bước 1 là một hướng thẩm mỹ có tài sản cụ thể và lý do rõ ràng.
Mức hấp dẫn cuối cùng vẫn cần phản hồi của chủ dự án và kiểm chứng trên sản phẩm.
