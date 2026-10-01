# Lật lại — Định hướng giao diện UI-1

Ngày 30/09/2026 · Nhánh `codex/ui-direction` · Nền sản phẩm main `4273f10`.

## Nguồn sự thật và phạm vi

Tài liệu này là **nguồn sự thật về định hướng trình bày UI-1**, theo câu trả lời
trực tiếp của chủ dự án: người mê đọc nhiều độ tuổi; gần gũi, thư thái; nền gọn
hiện đại pha chi tiết ấm; câu chuyện chuyền tay; tránh tối giản lạnh lẽo.
Nếu UI cũ, brand v1.1 hoặc quyết định thẩm mỹ trong tài liệu cũ mâu thuẫn, sửa lớp
trình bày theo tài liệu này; không giữ vì đã có sẵn. Chủ dự án đã duyệt ba vấn đề
trong CRITIQUE_01 và **chi tiết sách** làm màn chuẩn. Token được thử trên màn này;
đã được chủ dự án duyệt tại a70e5a3. Chủ dự án cho phép áp hướng này sang kệ
sách trước; chuyển động mở ảnh lớn làm sau lượt kệ. Sau khi từ chối kệ vòng01,
chủ dự án giao quyền quyết định thiết kế và yêu cầu agent tự hoàn thiện kết quả.
Giữ ảnh trước/sau và kiểm tra thực tế; quyền này không mở nghiệp vụ hoặc merge/deploy.

SRS/ADR/OpenAPI vẫn quyết định nghiệp vụ, quyền, dữ liệu và hành vi. UI-1 chỉ đổi
màu, font, spacing, bố cục, microcopy, icon và chuyển động; không thêm endpoint,
state, quyền, thao tác hoặc đổi navigation/retry/validation/session đã merge.
Các quy tắc accessibility và bảo toàn dữ liệu trong
[UI_CODING_RULES](design/UI_CODING_RULES.md) vẫn áp dụng. C02 tạm hoãn.

## Câu chuyện sản phẩm

Lật lại là một tiệm sách có người yêu sách đứng sau quầy, nơi người đọc ở nhiều
độ tuổi thong thả tìm một cuốn sách đã qua tay người khác. Mỗi bản sách có một
“lý lịch” nhìn thấy được qua tình trạng thật, ảnh và những ghi chú người bán đã
cung cấp; dấu vết thời gian giúp hiểu cuốn sách, không bị che đi để dễ bán.
Đây là một tiệm sách để chọn và giao dịch: giao diện chỉ dẫn tận tình để người
xem biết cuốn nào, tình trạng gì, giá bao nhiêu và bước mua/đổi tiếp theo — hoặc
lý do hiện chưa thể giao dịch.

## Cảm giác cần tạo

- **Gần gũi**: lời nói tự nhiên, cụ thể, như người trông tiệm đang giúp bạn.
- **Thư thái**: không gây áp lực mua; giá và hành động vẫn rõ, dễ tìm. Giảm
  thúc giục, khan hiếm giả và trang trí ồn ào không có nghĩa giảm tín hiệu giao dịch.
- **Có dấu vết**: từng bản sách có đặc điểm riêng từ dữ liệu và ảnh thật.
- **Chân thật**: tình trạng cũ/hỏng, giới hạn và tiền mô phỏng đều nói rõ.
- **Tinh tế**: chi tiết ấm có chủ đích; nền và tác vụ vẫn gọn, dễ dùng.

Không muốn: **lạnh lẽo**, **đại trà**, **làm màu**.

## Nguyên tắc luôn ưu tiên

1. **Cuốn sách là nhân vật chính.** Trên kệ và chi tiết, bìa, tên, tình trạng và
   giá cùng hành động/trạng thái giao dịch giúp người đọc quyết định trong khoảng
   năm giây, trước khi gặp trang trí/khẩu hiệu. Giữ nguyên
   ảnh và màu bìa; ảnh thiếu có trạng thái thật, không thay bằng bìa tưởng tượng.
2. **Một bản sách, một lý lịch có căn cứ.** Chuyển dữ liệu hiện có thành cách
   trình bày dễ đọc: nhãn tình trạng như dấu mộc, mô tả như thẻ thư viện, ảnh gáy/
   trang minh họa dấu vết. Một cụm chính trên màn chi tiết là đủ; trên kệ chỉ cần
   nhãn nhỏ. Không rải tem, vết mực, đường răng cưa ở mọi khối.
3. **Gọn để đọc, ấm ở đúng chỗ.** Nền sạch, lề đều, khoảng thở rõ. Sắc đất nung,
   nét viền và typography tạo cảm xúc tại vùng thông tin về sách; form, lỗi và
   tiền ưu tiên độ rõ. Không biến mỗi ô nhập thành một món đồ trang trí.
4. **Như người trông tiệm, không như bảng quản trị.** Tên hành động cụ thể;
   giải thích vừa đủ ngay nơi cần. Không nhân cách hóa lỗi hoặc viết thơ thay
   hướng dẫn. Nội dung dài được xuống dòng. Riêng bản tóm tắt trên kệ được rút
   gọn tên/tác giả theo quy tắc bên dưới, có lối xem đầy đủ; không cắt tình trạng,
   số tiền hoặc dữ kiện giao dịch để giữ bố cục đẹp.
5. **Thẩm mỹ phải sống cùng hành vi thật.** Giữ thứ tự tác vụ, trạng thái tải/
   rỗng/lỗi, dữ liệu form, Back, bàn phím, safe area, accessibility và quyền API.
   Dùng component chung; đổi theme trước màn hình, kiểm consumer bị ảnh hưởng.

## “Lý lịch” cuốn sách: dữ liệu nào, hình thức nào

| Dữ liệu hiện có                              | Hướng trình bày                                                        | Ranh giới                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Condition, gồm `Worn` → “Cũ nhiều”           | Nhãn một nét viền, chữ rõ như dấu đóng lên thẻ; giữ tên mức tình trạng | Không biến thành chứng nhận đã kiểm định; không che mức cũ bằng tên mỹ miều                                                               |
| Ghi chú tình trạng của người bán             | Một vùng giống thẻ thư viện: lề nhỏ, nhãn nguồn, nội dung nguyên nghĩa | Không tự viết dấu vết, bút tích hoặc lời nhắn thay người bán                                                                              |
| Ảnh bìa/gáy/trang và chi tiết hư hại         | Ảnh thật làm bằng chứng ngay cạnh thông tin liên quan                  | Không texture che ảnh, tẩy hư hại, dùng ảnh sinh thay ảnh listing                                                                         |
| Tên sách, tác giả, ấn bản và thông tin đã có | Phân cấp như một phiếu sách ngắn; chỉ hiển thị trường API đã cung cấp  | Không bổ sung trường nhập liệu hoặc dữ liệu giả để đủ bố cục                                                                              |
| Lịch sử chuyền tay                           | Hiện chưa có dữ liệu hành trình được xác minh để trình bày             | Không số đời chủ, timeline, ngày chuyển tay, địa danh, chữ ký, tem “đã chuyền” giả; không dựng timeline rỗng để gợi một tính năng chưa có |

“Dấu mộc” là hình thức của **nhãn tình trạng**, không phải huy hiệu xác thực.
Chất chuyền tay còn có thể đến từ cách nói và sự trân trọng một bản sách cũ;
không cần giả lịch sử để kể câu chuyện. Không dùng font viết tay giả lời người bán.

## Khoảnh khắc đặc trưng

Hai vị trí tạo điểm nhấn bản sắc trên chi tiết sách; chúng không độc quyền
phân cấp thị giác và **không được lấn át tên sách, giá hoặc vùng giao dịch**:

1. **Dấu tình trạng cạnh nhận diện bản sách:** viền đất nung, chữ thật rõ,
   mức tình trạng đúng dữ liệu (kể cả “Cũ nhiều”). Như dấu mộc trên phiếu sách,
   không nghiêng chữ, giả mực lem hoặc gợi chứng nhận kiểm định. Không cần lặp
   nhãn nhìn thấy “Tình trạng” phía trên dấu; giữ nghĩa này trong accessibility
   label. Hình thức “Bán”/“Đổi”/“Bán hoặc đổi” viết rõ ở cụm đầu theo dữ liệu.
2. **Phiếu tình trạng:** một cụm có lề và nhịp đọc như thẻ thư viện, ghi rõ
   “Người đăng mô tả”; bìa/gáy, ruột sách, ghi chú, phụ kiện và trang thiếu
   được đọc liền mạch. Đây là điểm ấm chính, không thêm lớp card trang trí.

Hai vị trí tạo thành một câu chuyện về **bản sách cụ thể**, giúp người đọc quyết
định. Giá, hình thức bán/đổi và bước tiếp theo luôn rõ; không rải dấu mộc sang
điều khiển, lỗi hoặc thông tin giao nhận.

### Vùng giao dịch của màn chuẩn — hướng A

Giá và hình thức giao dịch ở footer cố định trong layout, ngoài vùng cuộn và
trong safe area. Dùng nhãn “Giá bán”/“Giá trị đổi” sát đúng số tiền, đủ phân biệt khi
listing hỗ trợ cả hai. Chỉ một câu trạng thái ngắn: **“Tiệm chưa nhận đơn ở bản
này.”** Đây là lời chỉ dẫn bình thường, không phải lỗi hoặc nút giả.
Khi API không cập nhật được dữ liệu, không trình bày giá cũ như giá hiện hành.

Footer gọn, không absolute overlay, không khóa chiều cao hoặc ép chữ một dòng.
Hai mức giá phải đọc thành hai nhóm nhãn/giá rõ: cột co giãn, khoảng cách tối
thiểu32px giữa nhóm,8px tới trạng thái. Thiếu chỗ thì xuống hàng cả nhóm;
không hy sinh khoảng cách để cố nhét mọi số tiền trên một hàng.
Ở 390px/font 100% thấy bìa, tên, tình trạng, giá và trạng thái ngay viewport đầu.
Ở font 130%, ưu tiên đọc đủ và cuộn đến nội dung cuối không bị footer che; câu
trạng thái được xuống dòng nếu cần, không thu nhỏ chữ để giữ một dòng vật lý.

Bìa ở cụm đầu cần đủ lớn để nhận ra cuốn sách; khung ảnh hòa vào nền giấy,
không thêm mảng trắng quanh ảnh. Giữ toàn bộ ảnh bằng contain, không crop hoặc
tẩy nền nằm trong ảnh người đăng. Màn chuẩn thử cột ảnh40%, cách tên16px và
khung tỉ lệ2:3; tên dài vẫn đọc đủ, không nhường toàn bộ trọng tâm cho dấu/phiếu.

Tách slot trạng thái khỏi phần giá: khi C04 đủ điều kiện, caller có thể thay
trạng thái bằng hành động thật mà không thiết kế lại bố cục. Gói đó vẫn phải xử
lý quyền, session, navigation và command protocol; UI-1 không mở checkout.

**Phép thử che nhận diện:** che logo và khẩu hiệu, màn chi tiết vẫn phải gợi
“sách cũ có lý lịch” qua dấu tình trạng và phiếu mô tả thật, đồng thời nhận ra
đây là nơi mua bán/trao đổi qua giá, hình thức và bước tiếp theo rõ ràng. Không
bịa dữ liệu, chứng nhận hoặc hành động chưa triển khai. Đánh giá trên 3–5 bản sách QA có bìa
DEMO, tên ngắn/dài và tình trạng khác nhau. Không lấy chữ DEMO trên bìa, logo
hay câu kể thương hiệu làm bằng chứng đạt. Chủ dự án duyệt cảm nhận từ ảnh
trước/sau; tự đánh giá của AI không thay thế bước duyệt này.

## Design tokens đề xuất

### Kệ sách: chọn giữa nhiều cuốn, không phải chi tiết thu nhỏ

Sau vòng kệ01, chủ dự án từ chối bố cục một hàng với cột chữ kéo dài và giao
quyền quyết định thiết kế cho agent. Kệ ưu tiên nhịp bìa và khả năng so sánh:
hai cột ở chiều rộng từ360dp/chữ thường. Không rải phiếu tình trạng đầy đủ hoặc
tên người bán lên từng mục; các dữ kiện đó vẫn ở màn chi tiết và nhãn accessible.
Trên kệ, tên sách hiển thị tối đa ba dòng và tác giả một dòng, dùng dấu “…” khi
vượt giới hạn. Tên và tác giả đầy đủ luôn có ở màn chi tiết và nhãn accessibility.
Các thẻ cùng hàng căn thẳng vùng bìa, tên, tình trạng và giá, có cùng chiều cao.
Vùng giá dành chỗ cho hai mức; chỉ có một giá thì để khoảng trống, không thêm
giá hoặc ký hiệu giả. Tình trạng dùng một nét đất nung nhỏ. Dòng “Bán”/“Đổi” đi
cùng đúng số tiền; nếu có cả hai phải hiện cả hai, không chọn giá rẻ hơn để nhấn.
Không rút gọn tình trạng, số tiền hoặc ẩn một hình thức giao dịch để cân bố cục.

Ngày01/10, chủ dự án chốt tối đa ba dòng sau ảnh so sánh hai/ba dòng ở100%/130%.
Không áp giới hạn này vào màn chi tiết. Kệ ưu tiên nhận diện, so sánh và chọn bản
sách: tên dùng Be Vietnam Pro16/23, giá18/25 đậm và có vị trí ổn định. Lora tạo
bản sắc ở tiêu đề khu vực và điểm kể chuyện, không bắt buộc ở tên từng cuốn trên
kệ. Cho phép nền sáng nhẹ để nhóm từng bản sách, không bóng đổ/card lồng nhau.
Sự thư thái đến từ phân cấp rõ và lời chỉ dẫn hữu ích, không từ giãn mọi thành phần.

Ở chữ130% hoặc màn hẹp, chuyển một cột: bìa cạnh tên/tác giả/tình trạng, cụm giá
chiếm chiều rộng riêng phía dưới. Không để giá kéo dài cột bên phải và tạo hố
trống dưới bìa. Khi số tiền dài, cả nhóm được wrap, vùng giá được tăng chiều cao;
không thu nhỏ font, cắt số hoặc khóa chiều cao toàn thẻ. Chiều cao dành cho tên/
tác giả theo cỡ chữ thực tế, không cố định cho mọi mức font.
Ảnh contain trong khung sáng cao180dp cùng nền mục sách, không sửa dữ liệu ảnh. Đây là quyết định
trình bày, không đổi quyền truy cập ảnh, query, filter, navigation hay nghiệp vụ.
Không dùng kết quả tests làm bằng chứng thiết kế đẹp; xem cả QA tên dài và ảnh
tư liệu có sẵn, phân biệt rõ tư liệu với listing thật.

### Biển nhỏ của tiệm trên kệ

Một banner biên tập sau hai cuốn đầu tiên, cuộn cùng nội dung. Không đặt trước
bìa đầu, không sticky/overlay, tự thu gọn hoặc chỉ hiện một lần rồi mất. Chỉ có
ở trang đầu của kệ mặc định, khi đủ hai cuốn và không có lỗi tải; ẩn khi tìm/lọc/
đổi sắp xếp. Không chèn lặp ở trang kế hoặc thay trạng thái rỗng/lỗi.

Nền xanh rừng phẳng, chữ màu giấy, minh họa gáy sách/dấu trang với một điểm đất
nung. Tiêu đề **“Đọc xong. Chuyền tay.”**, câu phụ **“Xem bìa, đọc tình trạng,
chọn cuốn hợp mình.”** là lời biên tập, không phải khuyến mãi, cam kết kiểm định
hay lịch sử một listing. Không có nút giả. Tầm110–130dp ở chữ thường là mục tiêu
thử, không khóa chiều cao. Chữ lớn/màn hẹp ưu tiên nội dung, có thể bỏ minh họa
thuần trang trí; text thật tiếp tục scale, không tự chạy carousel/animation.

### Năm màu cốt lõi

| Token ý nghĩa | Giá trị đề xuất | Cách dùng                                                              |
| ------------- | --------------- | ---------------------------------------------------------------------- |
| `paper`       | `#F5EFDF`       | Nền giấy ấm, phẳng, không giả giấy ố                                   |
| `surface`     | `#FFFCF4`       | Vùng nhập liệu hoặc phiếu sách; không bọc mọi phần vào card            |
| `ink`         | `#202C27`       | Nội dung, giá, thông tin quan trọng                                    |
| `forest`      | `#214B40`       | Hành động chính, tiêu đề chọn lọc, trạng thái đang chọn                |
| `stamp`       | `#963F28`       | Màu nhấn riêng: tình trạng, lề phiếu sách, chi tiết chuyền tay có thật |

Giữ các màu giấy/mực/rừng vì phù hợp hướng đã chọn, không vì code cũ dùng chúng.
Chọn sắc đất nung đậm cho chữ/nhãn thay cam sáng khó đọc. Logo gốc giữ nguyên hình
học và màu nhận diện; cam logo không tự trở thành màu chữ nhỏ. Màu chức năng lỗi/
thành công/cảnh báo, chữ phụ, viền và focus là token ngữ nghĩa bổ trợ; giữ ý nghĩa
hiện tại và kiểm tương phản khi triển khai, không ép mọi trạng thái về màu nhấn.
Màu chữ thường phải đạt 4.5:1, viền điều khiển 3:1; không dùng màu làm tín hiệu duy nhất.

### Chữ, khoảng cách và hình khối

| Hạng mục            | Đề xuất                                                                    | Lý do/ràng buộc                                                                                                  |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tiêu đề và tên sách | **Lora 600** cho tiêu đề/chi tiết; tên trên kệ **Be Vietnam Pro700,16/23** | Kệ gọn để chọn; chi tiết giữ chất đọc, không dùng serif cho mọi tên                                              |
| Nội dung/điều khiển | **Be Vietnam Pro 400/700**, body 16/25, secondary 14/21, button 16/24      | Dấu tiếng Việt rõ, hợp nhiều độ tuổi; không dùng nhãn 11 px cho thông tin cần quyết định                         |
| Giá/số liệu         | Be Vietnam Pro 700, 20/28; đơn vị đồng cùng font                           | Font Lora đang có thiếu glyph `₫`; không dựa vào fallback                                                        |
| Font loading        | Font local có license, theo BrandProvider hiện có                          | Không CDN, không giả weight chưa có; giữ font scaling của hệ điều hành                                           |
| Spacing             | 4,8,12,16,24,32,48; lề màn 20; cách nhóm 24–32                             | Nhịp 4 px, gom dữ kiện liên quan và tách nhóm có ý nghĩa                                                         |
| Radius              | Bìa 2; nhãn/phiếu 4; điều khiển 8; sheet 20                                | Phân biệt sách/phiếu với control; tránh mọi khối cùng một bo góc                                                 |
| Vùng chạm           | Tối thiểu 44×44; nút/input tối thiểu 52 cao, không khóa chiều cao chữ      | Chữ lớn vẫn dùng được; icon nhỏ nằm trong vùng chạm đủ lớn                                                       |
| Icon                | SVG nét thống nhất, chủ yếu 20–24; control có tên accessible               | Dùng hệ icon chung, không emoji, không icon chỉ để lấp khoảng trống                                              |
| Chuyển động         | Nếu cần, phản hồi opacity/translate nhỏ 120–180 ms                         | Chỉ hỗ trợ hiểu thao tác, tôn trọng reduced motion; không đổi timing nghiệp vụ hoặc tự đóng thông báo quan trọng |

Chữ và spacing là đề xuất để thử trên một màn chuẩn; không đồng nghĩa đã kiểm
native. Palette/theme cần một nguồn chung khi được duyệt; không đặt hex/font
riêng lẻ vào từng feature. Các trạng thái và API component theo
[UI_COMPONENTS](design/UI_COMPONENTS.md).

## Điều cấm

- Gradient tím/xanh; glassmorphism, glow và bóng nổi trang trí đồng loạt.
- Font Inter/Roboto mặc định cho nội dung app; font viết tay giả dấu vết cá nhân.
- Emoji làm icon hoặc làm tên nút thay cho nhãn hành động.
- Layout lưới card giống hệt nhau cho mọi loại thông tin; nhiều lớp card lồng nhau.
  Kệ có thể lặp một mẫu sách vì chức năng, nhưng không để mọi màn thành lưới hộp.
- Microcopy chung chung như “Khám phá ngay”, “Trải nghiệm tuyệt vời”, “Bắt đầu
  hành trình” khi có thể nói rõ hành động; khẩu hiệu trong form/lỗi/thông tin tiền.
- Tối giản trắng/xám lạnh lẽo, mất dấu người trông tiệm; giấy ố/vết mực trang trí
  phủ toàn app cũng không đáp ứng hướng này.
- Tem giả kiểm định, sao/rating, khan hiếm, số lượt chuyền tay hoặc lịch sử không
  có dữ liệu; đổi “Cũ nhiều” thành nhãn dễ bán hơn; ẩn nhược điểm của bản sách.
- Dùng chi tiết ấm ở mọi vùng, làm lệch chữ, xoay cả đoạn nội dung, giảm tương phản
  hoặc thu nhỏ chữ để giống tem. Một điểm nhấn rõ có giá trị hơn nhiều dấu trang trí.

## Lượt phê bình và cách duyệt

Chụp mới UI sản phẩm trên emulator khoảng 390 logical px; ghi thiết bị, source,
font scale, dữ liệu QA và giới hạn. Mỗi màn chấm 1–5 theo: khớp câu chuyện, phân cấp
thị giác, khác biệt, nhất quán, dễ đọc/dễ chạm. Mức 1: mâu thuẫn hoặc cản trở;
3: dùng được nhưng còn chung chung/không đều; 5: cụ thể, rõ và thể hiện trọn hướng
trong phạm vi ảnh/thao tác đã xem. Không lấy điểm thị giác làm nghiệm thu accessibility.

Báo cáo docs/ui/CRITIQUE_01.md chọn **tối đa 3 vấn đề lớn**, gắn ảnh và nguyên tắc
bị lệch, đề xuất cách sửa cụ thể; không sửa code trong lượt này. Dừng để chủ dự
án duyệt. Sau duyệt mới thay token/theme, sửa đúng 3 vấn đề trên **một màn chuẩn**,
so ảnh trước/sau và chờ đồng ý trước khi mở sang màn khác. C02 vẫn tạm hoãn.
