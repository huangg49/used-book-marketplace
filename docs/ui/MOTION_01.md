# Chuyển động xem sách — 02/10/2026

Nhánh `codex/ui-motion`, base `053c87e` (kệ B tại304c0a2). Checkpoint
`feat(rn): add restrained motion to browsing and book photos`. Chưa push/merge;
[ảnh và video trước/sau](motion-01.html) để chủ dự án duyệt cảm nhận.

## Đã đổi

- PublicPhoto giữ khung bìa khi tải URL/bytes; phản hồi tải nằm trong khung,
  không thêm dòng làm hàng sách đổi chiều cao. BookCover opt-in fade160ms bằng
  core Animated, native driver trên Android; expo-image vẫn contain/cache none.
  Tách child theo source, guard vòng đời và kết quả terminal để callback cũ hoặc
  success muộn sau error không làm mất lỗi/nút retry của lần mới. Retry giữ attempt,
  URL expiry, foreground, query/refetch và quyền đọc ảnh cũ.
- Nút qua cuốn cuộn native khi OS cho phép; focus/reset vẫn tức thì. Không đảo
  API order/cursor, không carousel tự chạy, gesture mới hay animation giá/stamp.
- Sheet opt-in `motion="photo"`: scrim/body hiện160ms, dịch12dp; header/close đứng
  yên. Đóng ngay, không giữ Modal hoặc ảnh để fade-out. Default Sheet/ConfirmDialog
  giữ hành vi cũ. Chi tiết và ví dụ `/ui` opt-in; chưa mở swipe gallery.
- Một subscription reduced motion chung, cập nhật nóng; chưa biết setting thì
  giảm. Chặn race giữa truy vấn đầu và event mới, cleanup khi hết consumer.
  Khi setting đổi, Animated dừng về trạng thái cuối; không replay ảnh/Sheet đã mở.
- DESIGN/UI rules/components đồng bộ. Không thêm dependency, đổi API/contract/
  nghiệp vụ/session/navigation hoặc mở C02/C04/shared element.

## Bằng chứng thực chạy

Node24.19.0/pnpm11.19.0. RN **96/96 tests,13 file**, gồm5 ca race/cleanup/live setting;
lint/typecheck PASS. Expo export:web PASS12 routes (build, không web acceptance);
formatter/docs:check/diff-check PASS. Export có warning NO_COLOR/FORCE_COLOR và
thông báo forceful exit của Expo; exit code0, routes/artifacts đã xuất.
Gallery đã mở trong in-app browser: đổi100%/130%, chọn ảnh lớn, phát video sau;
ảnh/media tải đủ, video không autoplay. Đây là kiểm gallery evidence, không là
Expo web interaction acceptance. Review diff bằng AI không có blocker còn lại.

Android Pixel_7/API35/x86_64, APK debug hiện có + Metro8081 của người dùng.
1080×2400/density443 ≈390×867dp, OS font1.0/1.3, coldlaunch sau đổi font.
Before lấy source053c87e trên **cùng5 listing QA**; own edits được giữ và phục hồi
byte-for-byte, không reset/clean/pull. After là source cuối gói này.

Đã thao tác và xem ảnh: nút trước/tiếp, mở ảnh/Back, mở lại/Đóng ở100% và130%;
tên dài/Cũ nhiều/1.000.000+999.000đ, viewer có nội dung cuộn và close cố định;
tải bytes chậm10s ở100%/130%, lỗi503 và bấm tải lại phục hồi ở100%.
Khung tải/lỗi giữ chiều cao ảnh. Đã sửa câu lỗi bị lặp khi kiểm native.
Đưa app ra nền lúc ảnh đang tải rồi đưa task trở lại: viewer đóng, detail và
ảnh phục hồi; không giữ ảnh lớn cũ. Bật `animator_duration_scale=0` khi viewer đang
mở, Back về kệ rồi ghi video reduced motion130% **không restart app**;
trả setting1 trong cùng app rồi mở cuốn tên dài. Không coi hierarchy là TalkBack PASS.

QA hoàn toàn riêng: compose `latlai-ui-motion`, Mongo37017/rs-test/random *_test,
API3046/media3047; API/Mongo/Sharp thật, storage fixture **FAKE**. Listing được tạo,
upload/process/duyệt qua API+journal. Bìa tư liệu Standard Ebooks từ
[manifest nguồn](shelf-directions/assets/sources.json), tiền/tình trạng/nội dung
đều mô phỏng, có `[QA]`; bìa tên dài được tái sử dụng để thử layout. Không là sách
đang rao bán. Cả5 listing QA có1 ảnh; **không suy ra số ảnh thường có của dữ liệu thật**.
Faultfile chỉ tác động server ảnh fixture, không đổi metadata contract/app/DB chính.

Emulator GUI cũ tự thoát khi đổi font; log có lỗi Qt/snapshot renderer, chưa đủ
xác định nguyên nhân cuối. Đã khôi phục headless SwiftShader: Before130% và mọi
After dùng software renderer, Before100% dùng renderer trước đó. Video không
dùng so FPS giữa môi trường. Khi foreground có warning Expo CLI tại10.0.2.2:8081;
không phải lỗi nghiệp vụ, coldlaunch devclient bằng127.0.0.1:8081 phục hồi và chụp
lại bản sạch. Không ignore LogBox hoặc sửa logging/app để che warning.

## Giới hạn và điểm lưu

NOT RUN: TalkBack/audio/focus thật, ARM/máy yếu/FPS/release build, iOS,320dp mới,
web keyboard/gesture/reduced motion thực, `/ui` native (flag0), live Supabase và
API E2E. Không thêm native dependency nên dùng APK hiện có; không native rebuild.
AI đọc diff không thay review người thật, không đóng gate native/release.

Harness, faultcontrol, app snapshot/font/density/animation/reverse và logs ở
ignored `.tmp/ui-motion`; private config/journal không commit. Đã phục hồi trạng
thái máy và dừng QA/emulator do agent mở; giữ Metro/Docker Desktop và preview8089.
Bước tiếp: xem video100%/130%/reduced motion và duyệt cảm nhận; chỉ sửa phản hồi
gói này trước khi áp sang màn khác. Chưa mở shared transition/3D/swipe gallery.
