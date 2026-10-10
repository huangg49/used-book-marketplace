# Redesign tìm sách Android — 10/10/2026

Nhánh `codex/android-search-redesign`, base `270acbf` (sản phẩm main `da59199`).
Checkpoint subject: `feat(rn): redesign Android book search`.
Chủ dự án duyệt triển khai Android trước theo kế hoạch hai hướng và refinement.

## Kết quả

Màn tìm sách RN chuyển từ các kệ ngang sang danh sách dọc. Tìm kiếm cố định,
“Bộ lọc” có nhãn; tên, tác giả, tình trạng, giá bán và giá trị đổi nằm cùng một
nhóm. Be Vietnam Pro400/700 thay Lora trong các role RN chung. Điều hướng sáng,
đích đầu tiên “Tìm sách”; target chung tối thiểu48dp. Không thêm API hoặc giao
dịch chưa có. Query, sort, filter, cursor, detail, foreground refetch và signed
photo/retry giữ semantics cũ.

Hướng danh sách và lưới dùng cùng fixture/thứ tự/component trong màn nội bộ
`/showcase?composition=list|grid`, chỉ mở khi cờ design-preview bật. Dữ liệu mẫu
được ghi rõ. Lưới không thành một lựa chọn sản phẩm. Danh sách được chọn vì
giữ các dữ kiện quyết định đọc được trong cột đủ rộng.

[Brief/decision](../design/ANDROID_SEARCH.md) ghi các hướng đã cân nhắc.
[Taste redesign](https://github.com/Leonxlnx/taste-skill/blob/main/skills/redesign-skill/SKILL.md)
và [mobile reference](https://github.com/Leonxlnx/taste-skill/blob/main/skills/imagegen-frontend-mobile/SKILL.md)
được tham khảo về chữ, hierarchy và native readability; Taste không được cài.
Impeccable4.5.2 pinned được dùng qua context, concept-seed và new-work/craft-floor;
không chạy lại critique agent hay biến điểm AI thành nghiệm thu người dùng.

## Kiểm tra

Runtime Node24.19.0, pnpm11.19.0; Prettier3.6.2 chạy qua dlx, không thêm dependency.

| Kiểm tra | Kết quả / giới hạn |
| --- | --- |
| RN typecheck | PASS, `tsc --noEmit` |
| RN test | PASS108/108,16 file |
| RN lint | PASS0 error,8 warning wishlist có sẵn, ngoài diff |
| Docs và whitespace | PASS248 Markdown/1750 local links/4 adapters, `git diff --check` sạch |
| Expo export | PASS Android/iOS/web,13 route, exit0 sau fix Notice; không thay native build/release |
| Formatting | PASS Prettier3.6.2 trên11 file TS/TSX chính và sidecar |

Lệnh export cuối: `pnpm --filter @used-books/mobile-react-native export:all --max-workers 2`,
design-preview tắt, EXPO_NO_DOTENV bật và API loopback dùng cho bundle QA. SDK báo
forceful exit sau khi ghi dist; command vẫn exit0, ba bundle và static routes đã
được xuất. Không ghi nhận đây là APK mới hoặc nghiệm thu iOS.

Native QA dùng Pixel_7 Android35 x86_64, debug APK đã có ngày02/10 và JS bundle
của nhánh này. API thật với Mongo replica set57017/database `latlai_demo_*_test`
riêng; bảy bài đăng QA được tạo, upload/process/submit/review qua API. Storage
fixture FAKE, không là Supabase thật. Ảnh Standard Ebooks tư liệu có nguồn và
license ở [sources](shelf-directions/assets/sources.json); không chứng minh tình
trạng một bản sách thực tế. Ảnh evidence chứa dữ liệu mô phỏng có nhãn `[QA]`.

Ca đã thao tác: tìm Gatsby trả đúng sách/giá; mở chi tiết, Back giữ query;
mở bộ lọc, thay draft rồi Back không áp dụng; áp dụng Cũ nhiều trả đúng hai cuốn,
Bán vẫn giữ các cuốn Both. Màn320dp/chữ130% xếp dọc, cuộn xem đủ tình trạng và
cả hai giá; bàn phím Gboard130% giữ tìm kiếm/điều hướng ngoài vùng kết quả.
Tên Việt dài rút gọn3 dòng, accessible label giữ đầy đủ; giá1.000.000₫/999.000₫
không bị cắt. Query không khớp có một action reset; lỗi mất kết nối giữ điều kiện,
“Thử lại” sau khôi phục mạng trả danh sách đúng.

Ảnh native gốc1080×2400 (không AI generate hoặc sửa ảnh):

| Ca | Evidence |
| --- | --- |
| Danh sách thật, chữ100/130% | [100](android-search-redesign/real-list-100.png), [130](android-search-redesign/real-list-130.png) |
| Màn320dp, chữ130%, trước/sau cuộn | [Đầu trang](android-search-redesign/narrow-320-130.png), [đọc giá](android-search-redesign/narrow-320-130-scrolled.png) |
| Bàn phím thật | [Gboard130](android-search-redesign/keyboard-130.png) |
| Search/detail/Back | [Search](android-search-redesign/search-100.png), [detail](android-search-redesign/detail-100.png) |
| Bộ lọc và tên/giá dài | [Sheet](android-search-redesign/filters-100.png), [filtered](android-search-redesign/filtered-100.png), [dài](android-search-redesign/long-title-100.png) |
| Rỗng, lỗi, retry | [Rỗng](android-search-redesign/empty-100.png), [lỗi](android-search-redesign/error-100.png), [phục hồi](android-search-redesign/recovered-100.png) |
| Hai hướng cùng fixture | [Danh sách](android-search-redesign/sample-list-100.png), [lưới](android-search-redesign/sample-grid-100.png) |

Menu Tools nổi là chrome của dev-client, không thuộc giao diện sản phẩm. Lượt
debug bị giữ splash/blank trên emulator đã được loại khỏi evidence; cold boot
với renderer phần mềm và bundle mới hiển thị/thao tác được. APK debug cũ còn yêu cầu `assets/icon.png` dù app config
hiện tại dùng `assets/brand/icon.png`; không thêm asset cũ để che khác biệt build.

Review native độc lập dùng context mới (không fork lịch sử) yêu cầu bỏ viền bên
dày của Notice lỗi. Đã sửa primitive chung, giữ message/tone/accessibility/retry;
verdict xác nhận `disposition: ship`: finding đã resolved, không thấy regression
từ sửa này. Ship ở đây chỉ bao phủ fix được chấm, không là full native/human PASS.
Persistence/fidelity của review đạt trên evidence đã đưa; QUALITY BAR/decision
comp không được cung cấp nên reviewer không đánh giá mức trần hoặc so comp.
Native không chạy HTML/CSS detector. Documenter read-only đối chiếu token từ
source, root ghi frontmatter và `.impeccable/design.json`. Drift metadata Lora
cũ trong brand token lịch sử được báo, không tự áp RN lên web/Flutter.

## Phần còn mở

Gói này redesign màn tìm sách và những token/component chung cần thiết. Các
luồng đăng sách/tài khoản chỉ nhận font và target chung; web Vite, admin và
Flutter chưa được redesign. Không thay session, contract, migration hoặc nghiệp vụ.
Android ARM, TalkBack, iOS, FPS/release, live Supabase, remote CI và nghiệm thu
người thật NOT RUN. READINESS giữ nguyên; không đóng full native hoặc UX gate.
Pagination trang2, stale-data warning khi refetch lỗi, OS dark và UI tablet
NOT RUN trong gói này; fixture chỉ7 sách. Không suy PASS từ code giữ nguyên.
Không push, PR, merge hoặc deploy trong gói này.

QA API/media và Metro đã dừng, font/density được trả về giá trị đầu phiên,
reverse port và emulator do lượt QA tạo đã dừng. Database/users/roles của sandbox
đã xóa sau khi validate config và replica `rs-test`; container QA đã stop.
Mongo local chính/PostgreSQL vẫn chạy, không đổi cấu hình/secret/stash của nhóm.
