# Rèm sân khấu 2D — bản tách lớp v1

Ngày 13/10/2026; nhánh `codex/auction-stage-curtains`, sau `f3402e5`.
Checkpoint: `docs(web): prepare layered 2d auction curtain artwork`.

Theo yêu cầu của chủ dự án, tách hình thành các lớp trước khi dựng chuyển động.
Đây là **bộ lớp art đã được chủ dự án duyệt**, giữ bản tham chiếu riêng cho runtime.
Thiết kế hướng tới entrance toàn viewport `/auctions`, sau đó khung rèm biến mất;
Hero đứng riêng. [Bản thử chuyển động riêng](motion/README.md) đã được duyệt tại
8c0afdb; [bản tích hợp](../../../.impeccable/review/auction-entrance/README.md)
toàn trang đã dựng và đang chờ chủ dự án xem lại.

## Mở bản duyệt

Phục vụ thư mục này bằng HTTP local rồi mở [index.html](index.html). Preview dùng
ES module, không mở bằng file://; không có dependency, không gọi API/ghi dữ liệu.
Có nút đổi dáng đóng/mở, nền kiểm alpha, bật/tắt từng lớp, đánh dấu bounds,
đổi thứ tự navbar mẫu và đối chiếu bản hình gốc.

Navbar trong preview là thanh kiểm tra che phủ, không phải navbar của website.
Danh sách 20 lớp gồm cả hai mốc dáng của rèm trong và hai lớp lót; không phải
20 tấm vải cùng hiện một lúc. Có 15 PNG riêng và 1 SVG lót được dùng hai lần.

## Các phần riêng

| Nhóm | File / lớp | Vai trò |
| --- | --- | --- |
| Diềm sau | `valance-rear-left`, `valance-rear-right` | Có đủ thân phía sau diềm giữa |
| Diềm trước | `valance-front` | Mảng giữa phủ lên hai diềm sau |
| Rèm ngoài | `outer-left`, `outer-right` | Thân vải, không dính dây/tua |
| Rèm trong đóng | `inner-closed-left`, `inner-closed-right` | Mốc dáng đóng với phần che phủ bổ sung |
| Rèm trong mở | `inner-open-left`, `inner-open-right` | Mốc dáng thu gọn, không có dây cài |
| Dây cài | `rope-left`, `rope-right` | Có thể đi cùng điểm gom vải |
| Tua | `tassels-left`, `tassels-right` | Điểm neo ở đầu trên, tách khỏi dây cài |
| Họa tiết | `pendant-center`, `pendant-side` | Họa tiết giữa riêng; họa tiết nhỏ dùng ở 4 vị trí |
| Lót | `inner-underlay.svg` | Hai mảng hình học kín ở dáng đóng |

[manifest.json](manifest.json) ghi viewport tham chiếu 1920×1080, vị trí, kích thước,
điểm neo chuẩn hóa 0–1, thứ tự z và pose. PNG là sprite đã cắt padding theo alpha;
preview đặt chúng bằng phần trăm từ manifest. Không thay ảnh bằng SVG minh họa.
SVG lót chỉ là hình chữ nhật màu wine, không chứa hình vải hay nếp gấp.

## Chồng lớp và navbar

Từ sau ra trước: trang → lót/rèm trong → diềm sau → diềm giữa → rèm ngoài → dây → tua.
Họa tiết đi ngay phía trước diềm tương ứng. Thứ tự trong manifest là cục bộ của
một stacking context; các số z không được tự coi là giá trị đúng khi tích hợp app.

Preview có các slot navbar: z10 sau tất cả; z30 sau khung diềm/rèm ngoài;
z45 giữa diềm sau và diềm giữa; z90 trước tất cả. Khi đặt giữa các diềm,
một phần thanh có thể bị diềm trước che: đây là phép thử topology, không là bố cục
navbar sản phẩm đã được duyệt. Vị trí/navbar responsive thực tế quyết định ở bước tích hợp.

## Nguồn hình và giới hạn

[reference-board.png](reference-board.png) là bản hình tĩnh gần nhất đã trình chủ dự án.
Nó là ảnh phẳng, không có PSD hay layer gốc. Các phần và vùng bị che được dựng lại
bằng built-in `image_gen.imagegen`, nền trong suốt; không nhận là cắt chính xác từng
pixel của nguồn hoặc có source art Genshin. Các tỷ lệ ráp lại được ghi rõ trong manifest
và phải được người dùng duyệt trước khi chuyển sang chuyển động.

[generation-prompts.json](generation-prompts.json) giữ prompt từng nhóm và lượt sửa;
[source](source/) giữ 6 sheet đầu vào xuất sprite. `export-layers.cjs` chỉ cắt theo
ô và bounding box alpha rồi xuất PNG, không repaint, đổi alpha hay tái tạo hình vải.
RGBA RGB ở pixel alpha=0 có thể có màu nền dư; browser không hiển thị chúng.
Không xử lý màu đó bằng cách vẽ matte thủ công quanh silhouette.

Một số pixel bên trong ảnh generated có alpha dưới 255. Hai lớp lót riêng giúp
dáng đóng che kín cả nội dung tương phản bên dưới, thay vì dùng màu nền preview
để giấu khe. Khi làm rig, mỗi lớp lót phải đi cùng **cùng mesh/mask reveal của nửa
rèm tương ứng**; không để một mảng wine toàn màn đứng yên trong quá trình mở.

Dáng đóng/mở hiện là mốc art; **không crossfade hoặc đổi PNG đột ngột để giả mở rèm**.
Bước tiếp theo cần biến dạng liên tục của mép/nếp vải, độ trễ thân và tua, nhịp
bồng trở vào rồi ổn định. Lớp riêng giúp điều khiển, chưa chứng minh chuyển động mượt.

## Kiểm chứng

[evidence/checks.json](evidence/checks.json): Chromium 1440×1050 và 390×844;
15 PNG + 1 SVG decode, đóng/mở, bật/tắt, slot navbar, không lỗi JS hoặc tràn mobile.
So ảnh dáng đóng trên nền kem và nền xanh tương phản: **0 pixel thay đổi** ở capture
desktop sau bổ sung lót. Không suy kết quả này thành phủ kín mọi viewport của app.
Ảnh mở/đóng, control desktop/mobile và thử navbar được lưu trong [evidence](evidence/).

Kiểm art tĩnh ở bước này không kiểm animation/rig/FPS/Safari/thiết bị mobile thật
hoặc tích hợp app. Kiểm bản thử chuyển động được ghi riêng trong thư mục motion.
Không chạy API/native suite vì không thay code sản phẩm, session, contract hay dữ liệu.
READINESS giữ nguyên. Chưa push; chủ dự án đã duyệt bộ lớp ngày13/10/2026.

## Tái xuất và kiểm bản duyệt

Chỉnh điểm nối13/10 sau phản hồi chi tiết treo rời: [attachments.mjs](attachments.mjs)
neo5họa tiết vào mép vàng của diềm trước/sau với2px overlap, đặt lại đầu tua vào
nút dây và clip mảnh thừa ở sprite dây. PNG nguồn giữ nguyên. Manifest, preview
tĩnh và motion dùng cùng binding; tắt diềm trong preview tĩnh sẽ ẩn chi tiết treo
trên diềm đó. Ảnh/evidence đã cập nhật; motion có6invariant gồm giữ điểm nối khi chạy.
Preview tĩnh dùng ES module, cần mở qua HTTP local thay vì file://.

`export-layers.cjs` nhận thư mục tuyệt đối chứa ảnh generated; nguồn file được ghi
trong `generation-prompts.json`. Set `CURTAIN_SHARP_PATH` tới module sharp nếu máy
không có sharp ở module resolution thông thường. Nguồn copy trong `source/` được
giữ để tiếp tục chỉnh art mà không phải sinh lại.

`verify-preview.cjs` nhận module qua `CURTAIN_PLAYWRIGHT_PATH` và `CURTAIN_SHARP_PATH`;
phục vụ thư mục này trên `http://127.0.0.1:5191/` trước khi chạy. Đây là kiểm preview
độc lập, không phải test animation hay E2E trang Đấu giá.

Bộ lớp và [bản thử chuyển động độc lập](motion/index.html) đã duyệt → tích hợp
`/auctions` chờ duyệt. Giữ checkpoint art/motion để đối chiếu.
