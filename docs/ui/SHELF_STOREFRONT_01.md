# Kệ sách — tín hiệu cửa hàng và banner biên tập

Ngày 01/10/2026; nhánh `codex/ui-direction`, base `3a35355`.
Checkpoint: `feat(rn): clarify shelf offers and add editorial bookshop banner`.
Chờ chủ dự án xem ảnh; chưa push/merge hoặc áp sang màn khác.

[So sánh Android trước/sau](shelf-storefront-01.html).

## Thay đổi được duyệt

- Chốt tên tối đa ba dòng sau vòng so sánh hai/ba dòng; chi tiết và accessible
  label vẫn giữ đầy đủ. Tên kệ Be Vietnam Pro 700,16/23; giá18/25. Lora giữ ở
  tiêu đề khu vực và lời biên tập. Nền sáng/padding8 nhóm mỗi bản sách, không bóng đổ.
- Giữ căn hàng tên/tình trạng/giá ở hai cột và một cột tại130% hoặc màn hẹp.
  Bìa contain180dp; giữ cả giá bán và giá trị đổi, không suy ra hình thức từ giá thấp nhất.
- `BookshopNote` sau hai cuốn đầu: “Đọc xong. Chuyền tay.” và “Xem bìa, đọc tình
  trạng, chọn cuốn hợp mình.” Minh họa gáy sách/dấu trang dùng SVG hiện có;
  chữ lớn/màn hẹp bỏ minh họa, text vẫn scale. Không thêm dependency/chuyển động.
  Banner chỉ có ở kệ mặc định trang đầu, đủ hai cuốn, không lỗi; cuộn cùng nội dung.
- Không đổi API, query, session, lọc/sắp xếp, navigation hoặc nghiệp vụ. Shared
  shelf grid/photo được cập nhật đồng bộ với showcase; catalog có ví dụ component.
  Màn chi tiết đã duyệt giữ nguyên. DESIGN/UI_COMPONENTS được cập nhật.

## Kiểm thực tế

Android Pixel_7/API35/x86_64, dev client/Metro8081; ảnh nguyên bản1080×2400,
density443 (~390dp), font hệ điều hành100%/130%. Kiểm thêm density540 (320dp),130%.
Ảnh trước tái sử dụng evidence ở3a35355; ảnh sau dùng cùng nội dung bốn bản DEMO
(LikeNew/Good/Fair/Worn, Sale/Exchange/Both, tên ngắn/dài,35K–150K), tạo mới qua API
nên khác ID. Không chỉnh PNG hoặc dùng web thay native.

| Ca                             | Kết quả / ảnh                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đầu kệ, ba dòng/tình trạng/giá | [100%](evidence/ui-1-storefront/after-100.png), [130%](evidence/ui-1-storefront/after-130.png); xem trực tiếp, không cắt số tiền                         |
| Banner sau hai cuốn            | [100%](evidence/ui-1-storefront/banner-100.png), [130%](evidence/ui-1-storefront/banner-130.png); cuộn tự nhiên, text không cắt                          |
| Tên ngắn, một/hai giá          | [100%](evidence/ui-1-storefront/bottom-100.png), [130%](evidence/ui-1-storefront/bottom-130.png); không dùng giá giả để cân thẻ                          |
| Màn hẹp/chữ lớn                | [320dp/130%](evidence/ui-1-storefront/narrow-banner-130.png); banner bỏ hình, lời biên tập đọc đủ                                                        |
| Mở tên dài/Back                | [Chi tiết130%](evidence/ui-1-storefront/detail-130.png), [quay lại](evidence/ui-1-storefront/back-130.png); chi tiết hiện đủ tên                         |
| Lọc/tìm                        | [Both](evidence/ui-1-storefront/filtered-130.png), [tìm DEMO](evidence/ui-1-storefront/search-130.png); banner vắng trong hierarchy sau cuộn hết kết quả |
| Mất kết nối                    | [Lỗi130%](evidence/ui-1-storefront/error-130.png); dừng API QA thật, thông báo danh sách cũ và nút thử lại hiện                                          |
| Kết nối phục hồi               | [Phục hồi](evidence/ui-1-storefront/recovered-130.png); query tự phục hồi khi API chạy lại, không ghi là đã bấm retry                                    |

RN91/91 tests (12 files), lint/typecheck/Prettier/docs:check/git diff --check PASS.
Docs kiểm167 Markdown/1252 link tương đối/3adapter. Trang so sánh đã mở và đổi
100%/130%, trước/sau trong browser. Không chạy lại gate API không đổi source.

Giới hạn: chưa đo FPS/máy ARM yếu, TalkBack, iOS, Expo web, native catalog/showcase
ở source mới. Không có trang2 trong mẫu4cuốn; điều kiện trang2/rỗng kiểm bằng code,
không báo native PASS cho các ca đó. Dữ liệu ảnh vẫn DEMO, chưa thay được đánh giá
với bìa sách thật. Không đóng gate review người thật/native tổng thể/release.

## Môi trường và bàn giao

Windows giữ dải56966–57065, Docker QA57017 không bind được. Tạo compose project
riêng `latlai-ui-storefront` với `TEST_MONGO_PORT=37017`, replica set và DB random
`*_test`; không sửa port exclusion, cấu hình chính hoặc guard repo. Adapter/harness
local ignored tại `.tmp/ui-storefront`, private run `.tmp/demo/ui-storefront`.
Nest/Mongo/Sharp thật, storage fixture **FAKE**, không phải Supabase acceptance.
API3046/media3047 chạy tách biệt; bốn sách được tạo/moderate qua API, không sửa DB trực tiếp.

Sau QA phục hồi snapshot app/font/density/reverse và dừng emulator/API/media/compose
QA do agent mở. Giữ Metro người dùng, Docker Desktop và preview8089 để xem ảnh.
Checkpoint chỉ local. Bước tiếp: nhận phản hồi thẩm mỹ bản này; chưa bắt đầu đổi bộ
lọc/điều hướng, motion hoặc C02/C04.
