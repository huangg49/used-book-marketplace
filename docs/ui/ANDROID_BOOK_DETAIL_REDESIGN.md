# Redesign chi tiết sách Android — 10/10/2026

Nhánh `codex/android-book-detail-redesign`, base `2f766ca` (tìm sách).
Checkpoint subject: `feat(rn): redesign Android book detail`.
Scope React Native Member; giữ hệ thống đã duyệt ở [DESIGN](../../DESIGN.md),
[brief màn](../design/ANDROID_BOOK_DETAIL.md). Không đổi API/contract/session,
Vite/Flutter, checkout hoặc gate READINESS.

## Thay đổi

Tên/tác giả dùng toàn chiều ngang. Giá bán và giá trị đổi có nhãn cạnh ảnh,
không chiếm thanh footer cố định. Giá trị đổi có giải thích; người đăng hiển thị
đúng dữ liệu. Nút xem ảnh có chữ; chọn ảnh giữ selected và khóa khi refresh lỗi.
320dp/chữ130% chuyển ảnh/giá xếp dọc, giữ đầy đủ chữ và giá.

“Phiếu tình trạng” thành “Tình trạng sách”; giữ trang, bìa/gáy, ghi chú, phụ kiện,
khai báo thiếu trang và mô tả. “Về đầu sách” thành “Thông tin xuất bản”.
“Cập nhật tình trạng sách” thành “Làm mới thông tin”, tránh hiểu nhầm chỉnh sửa.
Lưu qua wishlist hiện có khi authenticated; anonymous mở tài khoản để đăng nhập.
Copy nói rõ native chưa có đặt mua/đề nghị đổi. Không bịa hành động thương mại.

BookPresentation/BookGallery cập nhật cả consumer showcase; bỏ footer giá lặp.
Chip nhận `disabled` tùy chọn, giữ mặc định và selected; `/ui` có ví dụ khóa ảnh.
Giữ query30s, reset ảnh theo revision, foreground,404, signed-media expiry/retry.
Refresh lỗi giữ nội dung có cảnh báo, ẩn hành động lưu và khóa xem/chọn ảnh.

## Evidence Android

Android35/Pixel_7 x86_64,1080×2400; density443 ≈390dp,540 =320dp;
font_scale1.0/1.3. Dev-client APK có sẵn02/10/2026 nhận JS hiện tại qua Metro;
không là APK release mới. Gear là overlay dev-client. SDK screenshot nguyên bản,
không dùng web/imagegen thay bằng chứng native.

Database `*_test` riêng trên rs-test57017; accounts/books hoàn toàn QA,
storage FAKE, xử lý ảnh qua Sharp/API thật. Bìa tư liệu và license theo
[nguồn](shelf-directions/assets/sources.json); ba ảnh ở Gatsby cố ý dùng ba bìa
tư liệu khác nhau để kiểm selection, không phải ảnh bản sách thật.

| Ca | Evidence / kết quả |
| --- | --- |
| Both, phân biệt hai giá | [390dp100%](android-book-detail-redesign/detail-both-100.png) |
| Sale chỉ có giá bán | [Sale](android-book-detail-redesign/detail-sale-100.png) |
| Chọn ảnh2/3 | [Ảnh2](android-book-detail-redesign/gallery-second.png) |
| Mở ảnh lớn và system Back | [Sheet](android-book-detail-redesign/gallery-expanded.png), [trở lại ảnh1](android-book-detail-redesign/gallery-back.png) |
| Tình trạng đầy đủ | [390dp](android-book-detail-redesign/condition.png) |
| Mở thông tin xuất bản | [Metadata](android-book-detail-redesign/metadata-open.png) |
| Tên/tác giả dài,320dp130% | [Tên](android-book-detail-redesign/detail-long-320-130.png), [hai giá](android-book-detail-redesign/detail-prices-320-130.png) |
| Khai báo thiếu trang | [320dp130%](android-book-detail-redesign/missing-pages-320-130.png) |
| Mất kết nối khi có dữ liệu | [Cảnh báo cũ](android-book-detail-redesign/detail-stale-320-130.png); forward tới cổng QA không phục vụ |
| Restore kết nối + thử lại | [Phục hồi](android-book-detail-redesign/detail-recovered-320-130.png) |
| Mở tài khoản từ nút lưu anonymous | [Form trống](android-book-detail-redesign/account-entry-320-130.png); không nhập credential |

## Checks và giới hạn

Node24.19.0/pnpm11.19.0: RN108/108 test, typecheck PASS; lint0errors,
8warning wishlist có sẵn. Export Android/iOS/web13 routes PASS, exit0;
Expo báo forcefully exiting sau ghi dist, không là native build/acceptance.
Prettier3.6.2 PASS cho6 file TSX; `docs:check` PASS250 Markdown/1773 relative
links/4 adapters; `git diff --check` PASS. Docs checker không kiểm business claims,
external URLs hoặc anchors. Không chạy lại API gates vì không đổi source API.

Không chạy mutation lưu authenticated, InNegotiation/revision-changing native,
signed-media expiry/live Supabase, TalkBack/audio, ARM/thiết bị thật, iOS hoặc
usability người thật. Tests model giữ nguyên semantics; không cộng thành các ca native trên.
Dark theme riêng chưa được triển khai; bảng màu sáng được brief duyệt.
READINESS không đổi.

Cold boot ban đầu có System UI ANR; sau Wait, app chạy và ảnh đã kiểm đúng nội dung.
System Back ở search root một lần thoát app; dev-client hiện lỗi
`ExpoNavigationBar.setHidden: current activity is no longer available` khi mở lại.
Không đổi navigation-bar/native module trong gói; ảnh có toast/Refreshing hoặc
sai route không dùng làm bằng chứng bàn giao. Exchange đã mở bằng danh sách,
nhưng ảnh có dev toast nên không giữ làm evidence đạt chất lượng hình ảnh.
404/deep-link, showcase và `/ui` native **NOT RUN**: dev-client không chuyển tới
route cần kiểm chứng trong lần thử có giới hạn. Không suy PASS từ `am start`;
consumer được kiểm source/typecheck/export, không tính thành native PASS.

Bộ review tự động từ chối lệnh PowerShell ghép deep link với ID từ response QA,
không nêu lý do; sách được mở bằng thao tác danh sách. Không chạy lại lệnh đó.

## Review và bàn giao

Impeccable4.5.2/engine0.1.14: context đúng target đã nạp một lần; kế thừa
direction/seed3a051903 từ tìm sách, không reroll world. Native không chạy detector
HTML/CSS. Fresh finish reviewer và documenter được giao theo skill, chỉ đọc.
Reviewer `book_detail_finish_reviewer` đối chiếu source, diff từ `2f766ca`, brief,
craft floor và13 ảnh native: **disposition: ship**, **material fixes: none**.
Persistence/fidelity/ceiling đạt trong phạm vi màn chi tiết đã duyệt; standalone
QUALITY BAR card không được cung cấp riêng. Verdict không đóng gate toàn app.
Documenter `book_detail_documenter`: **no canonical update required**; DESIGN,
sidecar và tokens không đổi. Recipe/brief/components được cập nhật riêng.

Cleanup: API/media/Metro QA đã dừng;14 ảnh hợp lệ được giữ,9 ảnh khám phá loại bỏ.
Database/users/roles riêng đã xóa, mongo-test đã dừng. Emulator đóng sau khi khôi
phục font_scale1.0/density443 và bỏ ba adb reverse của gói. Cổng3046/3047/8081
không còn listener; Mongo local37018 và spending-tracker5432 vẫn chạy.
Private fixture/journal chỉ ở `.tmp` bị ignore, không nằm trong checkpoint.

Bước tiếp theo là người dùng thật thử tìm sách → xem chi tiết → lưu, ghi các điểm
khó hiểu trước khi tiếp tục màn đăng sách. Không push/PR/merge/deploy trong gói này.
