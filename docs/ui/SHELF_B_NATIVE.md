# Kệ B trong React Native — 02/10/2026

Chủ dự án chọn B từ ba mẫu tại `21d988e`. Gói trên `codex/shelf-b-native`, base `21d988e`;
checkpoint `feat(rn): bring forest storefront and browsable book rails to shelf`.
Chưa push/merge; dừng chờ duyệt thẩm mỹ bản Android. [Đối chiếu mẫu và app](shelf-b-native.html).

## Kết quả và phạm vi

- Mặt tiền forest, logo trắng gốc, nền kệ sáng ngả xanh. Giữ tìm/lọc thật;
  bỏ banner cũ, câu biên tập nằm ở tiêu đề khu vực.
- `ShelfRails` dùng chung kệ thật/showcase, tối đa 3 cuốn liên tiếp theo trang API.
  Không tạo danh mục tuyển chọn, đảo thứ tự hoặc thêm dữ liệu. Cuộn ngang/nút 44dp,
  không animation mới. Vị trí trong ref, state chỉ đổi ở biên; không render lại
  toàn hàng mỗi frame. Tìm/lọc/trang reset hàng; Back/refetch cùng trang giữ vị trí.
- Bìa contain 196dp, thẻ 160dp/chữ thường và 224dp/chữ 130%; giới hạn theo viewport.
  Tên ba dòng/tác giả một dòng, accessibility và chi tiết giữ đủ. Stamp/giá
  không ellipsis; một giá để khoảng trống, hai giá hiện cả hai, nội dung tự tăng cao.
- `Screen appearance="shelf"`, `BrandLogo inverse`, `PublicPhoto rail` là tùy chọn;
  mặc định của consumer cũ giữ nguyên. Catalog có mẫu logo/nền mới.
- DESIGN/UI_COMPONENTS cập nhật hướng B. Không đổi API/contract/session, nghiệp
  vụ, filter/cursor/retry/navigation hoặc màn chi tiết. Không thêm dependency,
  checkout, chuyển động mở ảnh, C02/C04 hoặc áp sang form/tài khoản.

## Nền tảng và dữ liệu

Pixel_7 emulator/API 35/x86_64, APK debug hiện có + Metro 8081 từ terminal người
dùng. Physical 1080×2400, density 443: khoảng 390×867dp. OS font scale 1.0/1.3;
cold launch sau đổi cỡ chữ. Ảnh chụp mới bằng adb, hierarchy mới mỗi lần; đã xem
ảnh và thao tác trên app. [Ảnh 100%](shelf-b-native/refined-100.png),
[ảnh 130%](shelf-b-native/first-130.png). Không dùng ảnh HTML làm native PASS.

QA riêng `.tmp/demo/ui-shelf-b`, database random `*_test`, compose
`latlai-ui-shelf-b`, Mongo 37017/rs-test (57017 bị Windows reserved). API 3046 và
media 3047 thật, storage fixture **FAKE**; không dùng DB/bucket/config chính.
7 listing được tạo/duyệt/upload/process bằng API và journal, không seed trạng
thái/tiền qua SQL hoặc Mongo. 6 bìa tư liệu cùng mẫu B; thêm 1 fixture tên Việt dài,
Worn, giá 1.000.000/999.000đ và bìa tư liệu tái sử dụng để thử giới hạn.
Tên có `[QA]`; tình trạng/giá/ghi chú đều mô phỏng, không là sách đang rao bán.
Nguồn/license của bìa theo [bộ mẫu](shelf-directions/README.md) và
[source manifest](shelf-directions/assets/sources.json); không đưa bìa QA vào bundle sản phẩm.

Mẫu HTML 390×844/CSS 130% và app Android 390×867/OS 130% khác chiều cao, font thật,
tiền tố QA và fixture thứ 7. Gallery ghi đúng khác biệt; không là so sánh hai
bản native cùng dữ liệu. Bố cục cũ có evidence ở [storefront01](SHELF_STOREFRONT_01.md).

## Thực chạy

| Kiểm tra                | Kết quả / giới hạn                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN tests/lint/typecheck | PASS 91/91, 12 file; lint không lỗi/warning, typecheck PASS trên source cuối                                                                                                                               |
| Expo export:web         | PASS export:web (12 route); chỉ build, không là native/web interaction acceptance                                                                                                                          |
| Format/docs/diff        | PASS Prettier, docs:check và git diff --check                                                                                                                                                              |
| 390dp / 100%            | Hai bìa/tên/stamp, cả hai giá ở viewport đầu; [cuốn 3](shelf-b-native/third-100.png) tên 3 dòng / 1 giá cạnh 2 giá căn hàng                                                                                |
| 390dp / 130%            | Thẻ rộng hơn; [cuốn 3 sau cuộn](shelf-b-native/third-full-130.png), giá/tình trạng đọc đủ; viewport đầu cần cuộn đến giá thứ 2                                                                             |
| Hàng 2/hàng cuối        | [Bìa màu, chỉ đổi/chỉ bán](shelf-b-native/second-100.png); [tên Việt dài/Worn/giá tối đa hợp lệ 130%](shelf-b-native/end-130.png); cuối nội dung không bị footer che                                       |
| Mở chi tiết/Back        | Cuốn3 ở 100% và 130%, giữ vị trí ngang/dọc; status bar đổi tối trên giấy, sáng khi về forest                                                                                                               |
| Tìm/lọc/keyboard        | Gõ từ khóa, submit với keyboard 130%, [kết quả rỗng](shelf-b-native/empty-130.png), bỏ lọc trở lại cuốn đầu; Bán trả 6 listing gồm Both, đối chiếu API; sheet lọc/Back giữ lựa chọn                        |
| Refetch/mất API         | Cập nhật kệ ở cuối giữ vị trí. Dừng QA API: [lỗi](shelf-b-native/offline-130.png) có cảnh báo dữ liệu cũ/ảnh không khả dụng; mở lại: tự refetch phục hồi. Không tuyên bố đã bấm Retry sau phục hồi tự động |
| Consumer chung          | Màn chi tiết 100%/130% và showcase native 130% đã xem; catalog thêm ví dụ, chưa chạy native vì DESIGN_PREVIEW=0                                                                                            |
| Review code             | Agent hỗ trợ đọc diff, không phát hiện vấn đề còn lại; **AI review, không phải human review**                                                                                                              |

Đã sửa khi kiểm: khoảng trắng JSX trong ScrollView gây cảnh báo “Text strings…”;
cụm đầu quá cao làm giá sát thanh điều hướng; lint refs dẫn tới tách `RailBook`.
QA đầu thử giá vượt 1M bị 422 đúng contract. Giữ journal rejected, tạo fixture hợp
lệ ở thư mục mới; không sửa journal/key/body để ép thành công. Đây là lỗi input
của harness, không là lỗi nghiệp vụ sản phẩm.

NOT RUN: TalkBack/audio, web keyboard/gesture, reduced-motion setting trên OS,
ARM/FPS/máy yếu, iOS, 320dp mới, cursor sang trang 2 (7 fixture), native rebuild và
API E2E/storage live Supabase. Không thay đổi các lane đó; không chạy lại gate
tiền/quyền đã kiểm. Không đóng gate native/review người thật/release.

## Điểm lưu và bước tiếp

Harness/snapshot app/font/density/reverse là ignored `.tmp/ui-shelf-b`; không
commit private config, journal, token hoặc DB. Đã phục hồi snapshot/settings và
dừng API/media/emulator/QA compose do agent mở; giữ Metro/Docker
Desktop của người dùng và preview 8089 để xem ảnh. Chờ duyệt B native; sửa đúng
phản hồi trên kệ nếu cần. Chuyển động mở ảnh chỉ bắt đầu sau duyệt kệ và gói riêng.
