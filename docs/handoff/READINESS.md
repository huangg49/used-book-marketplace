# Tiến trình chốt F2h để bàn giao

Cập nhật29/09 lane MongoDB: [điểm lưu mới nhất](SESSION_STATE.md) và
[bằng chứng sửa/import/native smoke](../refactor/MONGODB_INTEGRITY_FIXES_2026_09_29.md).
493 E2E / 42 Mongo / 33 unit PASS, hai P1 đã sửa. Native chỉ thêm smoke Android
trên bản sao Mongo; không đóng full native, human review hoặc cutover dữ liệu chính.

Bổ sung sau đó: [import Order](../refactor/MONGODB_ORDER_IMPORT_2026_09_29.md)
PASS43Mongo; [live media](../refactor/MONGODB_LIVE_MEDIA_2026_09_29.md) và
[Android upload Mongo](../refactor/MONGODB_NATIVE_UPLOAD_2026_09_29.md) đã kiểm
JPEG/PNG/WebP, content PUT lost-ack/retry, preview lỗi/phục hồi và lưu/cold start.
Các lượt này dùng Supabase QA thật/cách ly; full native/TalkBack/human review/CI
remote/cutover chính vẫn mở. Không cộng các bằng chứng hẹp thành PASS toàn app.

Bổ sung30/09: [N13 native finalize/submit lost ACK](NATIVE_ACK_2026_09_30.md) PASS
trên Android/Mongo/Supabase QA riêng; retry không thêm effect. N21/ARM/iOS/review
người thật vẫn mở; không lặp các ca đã có evidence nếu source liên quan không đổi.

Ngày 28/09/2026. Người dùng đã duyệt: dừng mở rộng nghiệp vụ, rà code, làm rõ cách
tiếp nhận, tân trang UI hiện có rồi đóng mốc Git có thể tái dựng. Không cần hỏi lại
phạm vi này ở mỗi lần tiếp tục. Không tự mở Delivered/inspection/settlement trong đợt này.

**Hiện tại:** vòng rà soát kỹ thuật và lát cắt polish RN đã có bằng chứng;
chưa có release bàn giao cuối. Nguồn đã lưu tại commit `beea372` trên nhánh
`codex/f2h-handoff-audit`, gồm các increment trước còn chưa commit và đợt audit/polish.
Clone sạch của commit này đã qua install/generate/migrate/seed/build, 127 unit,
480 API E2E và hai suite browser; xem [REBUILD](REBUILD.md). Checkpoint
`checkpoint/f2h-handoff-2026-09-28` chứa hồ sơ cuối, không đồng nghĩa native đã nghiệm thu.

Bổ sung: operations polish đã commit `76230ca`. Bộ thực thi
[native N01–N21](NATIVE_ACCEPTANCE.md) và [review độc lập R01–R09](INDEPENDENT_REVIEW.md)
đã chuẩn bị. [Vòng Android 28/09](NATIVE_RUN_2026_09_28.md) đã kiểm phiên,
picker hủy/chọn JPEG, upload Supabase thật và một phần form ở chữ OS 130%.
Đã sửa lệnh media worker không khởi động qua tsx. Native acceptance còn một phần
chưa chạy; review độc lập chưa ký nhận. Không đóng toàn bộ các gate bên dưới.

## Gate 1 — Rà soát và sửa lỗi

Bổ sung theo phản hồi người dùng: [vòng trải nghiệm mobile](MOBILE_EXPERIENCE.md)
đổi bố cục kệ, điều hướng, account/login và bộ lọc có nút Áp dụng cố định.
Browser regression qua; Android đã kiểm bộ lọc với bàn phím số và chữ OS 130%.
Đây chưa là người dùng duyệt thẩm mỹ hoặc nghiệm thu toàn bộ form/native.

Vòng tiếp nối [kệ/chi tiết](SHELF_DETAIL_REVIEW.md) dùng chung presentation giữa
màn thật và fixture review tách riêng. Đã kiểm bìa, chi tiết, Back/modal và kệ chữ
OS 130% trên Android; gate bản export thường chuyển route mẫu về kệ thật đã qua.
Form dài/địa chỉ và các gate native/review còn mở không bị đánh dấu hoàn tất.

- [x] Chốt hiện trạng F2h/contract 0.20.0, 17 migration; phân biệt API và UI.
- [x] So 72 operation OpenAPI với 14 controller: thiếu/thừa/trùng bằng 0.
- [x] Đọc các đường đi trọng yếu về auth/session, command/replay, locks, ledger,
  Order/payment/fulfillment, media riêng tư; ghi phạm vi và giới hạn trong [audit](AUDIT_F2H.md).
- [x] Tái hiện và sửa lỗi session race và HTTP headers bằng test đỏ → xanh.
- [x] Chạy lại unit, contract, lint/typecheck và build API/operations.
- [x] Dựng PostgreSQL QA riêng từ Compose mới, áp dụng đầy đủ lịch sử migration.
- [x] Ghi kết quả cuối API E2E và browser regression trên DB QA mới: 480/480;
  operations/RN browser baseline qua. Lỗi test schema isolation đã sửa (HA-08).
- [ ] Rà visual từng màn hình hiện có, ghi lỗi/bất nhất trước khi chỉnh; native
  picker/upload/Back/bàn phím/TalkBack vẫn chưa được nghiệm thu đầy đủ.

Đã xem baseline chi tiết sách, địa chỉ chữ lớn và operations detail;
[UI_BASELINE](UI_BASELINE.md) ghi quan sát cụ thể và các màn còn chưa xem.

Đây là review dựa trên rủi ro và bằng chứng thực thi, không tuyên bố đã chứng minh
mọi dòng code không lỗi. SQL/money/permission vẫn cần reviewer độc lập theo TEAMWORK.

## Gate 2 — Người mới biết bắt đầu ở đâu

- [x] [START_HERE](START_HERE.md): setup, code map, lệnh QA, giới hạn và demo.
- [x] README/docs index/AGENTS trỏ về điểm bắt đầu chung; sửa mô tả cũ về funding,
  shipment và worker; kế hoạch nghiệp vụ ghi rõ ưu tiên bàn giao.
- [x] Người tiếp nhận hoặc một checkout sạch thực hiện lại hướng dẫn mà không dùng
  `.tmp`, `.env`, DB hoặc dependency sinh ra từ máy người bàn giao.
  Clone nằm trong thư mục QA riêng; không sao chép các file sinh sẵn. Dependency
  được install lại từ lockfile, có dùng cache pnpm. Đây là cùng máy Windows, chưa
  thay bằng chứng chạy trên máy người nhận; xem phạm vi trong REBUILD.
- [x] Kiểm tra bộ file dự định commit: secrets, file bỏ sót vì ignore, artifact lớn,
  license/font/ảnh và sự khác biệt giữa archive v1.0 với nguồn hiện hành.
  Phạm vi và giới hạn quét ghi ở [FILE_REVIEW](FILE_REVIEW.md).

## Gate 3 — Hoàn thiện giao diện đã có

Đọc UI_CODING_RULES/UI_COMPONENTS và brand v1.1 trước khi sửa. Giữ logo, Lora,
Be Vietnam Pro, nền giấy/chữ rừng và dấu cam tiết chế. Không thêm số liệu, xác thực,
review người dùng hoặc CTA giao dịch giả. Giao diện phục vụ sách và tình trạng thật.

| Lát cắt | Điểm cần rà/chỉnh | Nghiệm thu |
|---|---|---|
| Kệ + chi tiết | Bìa sách, phân cấp tên/tác giả/giá, tìm/lọc, điều hướng, nội dung dài | Rỗng/lỗi/offline, ảnh lỗi, giá bán/đổi rõ; 320/390 và chữ lớn |
| Tài khoản + địa chỉ | Nhóm tác vụ, profile, thông báo trạng thái, form địa chỉ | LOCKED/RESTRICTED, field errors, dirty Back, keyboard |
| Sách của tôi + form | Danh sách trạng thái, từng bước catalog/ảnh/tình trạng/giá/nơi gửi | Giữ dữ liệu khi lỗi, mất ack retry đúng key, rejected/resubmit, form dài |
| Shared UI + `/ui` | Controls, Sheet, Notice, text/focus/loading/disabled | Không modal hóa mọi lỗi; catalog phản ánh thay đổi; native/large text |
| Operations | Queue/detail/reason/checklist, mật độ nội dung, responsive | Quyền, conflict/retry, keyboard/focus, chữ lớn |

Kệ/chi tiết, tài khoản/địa chỉ, danh sách/editor và BackAction đã được chỉnh và chạy
regression mới; `/ui` có kiểm tra 320 px/chữ 135%/bàn phím. Xem [UI_POLISH](UI_POLISH.md)
cho ảnh và phạm vi cụ thể. Lát cắt operations đã đóng theo phạm vi
[OPERATIONS_UI_QA](OPERATIONS_UI_QA.md): queue, detail, lỗi/retry/conflict và focus;
đã sửa nhãn hai giá, skip link và focus recovery. Không thay nghiệm thu screen reader.
Native đã chạy một phần trên Pixel_7/Android 15 với Metro có sẵn; xem
[kết quả từng ca](NATIVE_RUN_2026_09_28.md). Còn upload lỗi/mất mạng,
toàn hành trình listing, TalkBack và các tổ hợp bàn phím/chữ lớn chưa kiểm.
Không mở ví/checkout/Order UI giả; chưa đóng toàn bộ Gate 3.

Cập nhật 29/09 (máy tiếp nhận, AVD API 37 x86_64): U02–U06 có evidence riêng
([U02](U02_LISTING_FORM.md), [U03](U03_ADDRESS_BOOK.md), [U04](U04_MY_BOOKS.md),
[U06](U06_STATES_COPY.md)); native thêm [lượt 29/09](NATIVE_RUN_2026_09_29.md) với
N02/N07/N08/N12/N17 PASS. N13/N19/N21, WebP, iOS/ARM và review độc lập còn mở;
U01 còn chờ phản hồi thẩm mỹ của người dùng. Gate 3 chưa đóng.

Cập nhật sau merge `ca16a22`: phiếu teammate đầy đủ đã có N13 mất mạng **trước**
gửi và N19 stale địa chỉ PASS. [Lượt Pixel_7 bổ sung](Q01_NATIVE_COMPLETION_2026_09_29.md)
đóng N03, N11 WebP thật (byte/hash + lưu/mở lại), N13 giữa PUT/lost-ack content
và N16 Back/keyboard/hủy/rời;
bổ sung N20 chữ OS 130% cho hai form, sheet, dialog và checkbox. Phát hiện
Q01-F01 picker/font sau thay đổi OS đã sửa và kiểm APK mới trên Android15;
N18 archive bài QA riêng cũng PASS. N20 phần còn lại/N21/review người vẫn mở.
Lost-ack finalize/submit native, N20 walkthrough rộng hơn,
N21 TalkBack, iOS/ARM và review người vẫn mở. Dòng trạng thái cũ phía trên là
lịch sử trước khi các bằng chứng bổ sung được đối chiếu, không phải kết luận mới.

Điểm dở cũ “Android mở lại sau export đứng splash” (A00) đã được kiểm 29/09 trên
AVD x86_64 API 37: cold start, deep link và reopen PASS; cơ chế Metro/cache ghi ở
[A00](A00_ANDROID_STARTUP.md). Đây không đóng N01–N21. Đọc
[SESSION_STATE](SESSION_STATE.md) và gói tiếp theo trong
[kế hoạch tiếp nhận](CONTINUATION_PLAN.md). Các tính năng sau bàn giao có dependency
và tiêu chí riêng; việc lập kế hoạch không đóng gate hoặc mở nghiệp vụ ngay.

## Gate 4 — Đóng gói mốc bàn giao

- [x] Chạy lint/typecheck/unit, export và RN browser regression sau lát cắt polish;
  cập nhật báo cáo thực tế. Kiểm lại nếu có sửa tiếp.
- [ ] Build/debug và QA native trong phạm vi được ghi rõ; không dùng export web thay thế.
  Build debug x86_64 qua với tài nguyên thương hiệu mới. Vòng tiếp nối dùng Metro
  người dùng đã chạy để kiểm native một phần; lịch sử bị chặn ở UI_POLISH vẫn giữ.
  Xem NATIVE_RUN_2026_09_28 cho phạm vi thực thi; ARM và iOS chưa kiểm.
- [x] Chuẩn bị [kịch bản và checklist trước demo](DEMO_CHECKLIST.md); ghi rõ
  yêu cầu storage thật, seed chỉ có một Member và giới hạn UI/API.
- [x] Lưu nguồn/ảnh/tài liệu tại checkpoint có thể chuyển bằng Git bundle.
  Tag này chỉ chứng nhận phạm vi nguồn và kiểm thử trong REBUILD, không là release cuối.
- [ ] Review độc lập theo TEAMWORK, hoàn tất native/visual gates trước tag release.
- [x] Clone/checkout mốc nguồn vào thư mục mới, install frozen lockfile, generate,
  migrate DB riêng, build/test; ghi commit/tag/hash và kết quả vào tài liệu.
- [x] Ghi việc còn mở theo vai trò trong START_HERE. Team chưa chỉ định tên người
  nhận từng vai trò. Chủ dự án đã yêu cầu push nhánh bàn giao; trạng thái nguồn
  và cách xác minh remote ở SESSION_STATE. Chủ dự án cho phép tích hợp trực tiếp
  mốc nguồn này vào main; không đồng nghĩa release hoặc independent review đã qua.

Không stage tất cả mù quáng hoặc sửa/xóa migration cũ để gọn lịch sử. Không trộn phần
nghiệp vụ mới vào commit polish. Snapshot đã bao gồm baseline trước đây chưa được
track; không chỉ chứa tài liệu bàn giao. Các sửa sau checkpoint nên theo từng feature.

## Sau mốc bàn giao

Tiếp tục F2 DirectDelivery theo [transaction plan](../features/TRANSACTION_FOUNDATION_PLAN.md):
Delivered/Buyer receipt → Inspection 72h và claim → custody/review resolution,
returns/settlement → client. F3 Exchange, F4 ViaPoint, F5 auction ở sau. Luồng nhận
hàng phải giữ an toàn tiền/sách cả khi báo giao thành công bị Buyer phủ nhận.
