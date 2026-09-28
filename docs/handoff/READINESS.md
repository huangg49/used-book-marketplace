# Tiến trình chốt F2h để bàn giao

Ngày 28/09/2026. Người dùng đã duyệt: dừng mở rộng nghiệp vụ, rà code, làm rõ cách
tiếp nhận, tân trang UI hiện có rồi đóng mốc Git có thể tái dựng. Không cần hỏi lại
phạm vi này ở mỗi lần tiếp tục. Không tự mở Delivered/inspection/settlement trong đợt này.

**Hiện tại:** vòng rà soát kỹ thuật và lát cắt polish RN đã có bằng chứng;
chưa có release bàn giao cuối. Nguồn đã lưu tại commit `beea372` trên nhánh
`codex/f2h-handoff-audit`, gồm các increment trước còn chưa commit và đợt audit/polish.
Clone sạch của commit này đã qua install/generate/migrate/seed/build, 127 unit,
480 API E2E và hai suite browser; xem [REBUILD](REBUILD.md). Checkpoint
`checkpoint/f2h-handoff-2026-09-28` chứa hồ sơ cuối, không đồng nghĩa native đã nghiệm thu.

## Gate 1 — Rà soát và sửa lỗi

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
cho ảnh và phạm vi cụ thể. Operations đã rà detail, chưa đóng toàn bộ visual matrix.
Native còn mở: build APK qua nhưng runtime bị chặn khi khởi động Metro.
Không mở ví/checkout/Order UI giả; chưa đóng toàn bộ Gate 3.

## Gate 4 — Đóng gói mốc bàn giao

- [x] Chạy lint/typecheck/unit, export và RN browser regression sau lát cắt polish;
  cập nhật báo cáo thực tế. Kiểm lại nếu có sửa tiếp.
- [ ] Build/debug và QA native trong phạm vi được ghi rõ; không dùng export web thay thế.
  Build debug x86_64 qua với tài nguyên thương hiệu mới. Metro bị automatic approval
  review chặn (`blocked by policy`); runtime, ARM và iOS chưa kiểm trong lượt này.
- [x] Chuẩn bị [kịch bản và checklist trước demo](DEMO_CHECKLIST.md); ghi rõ
  yêu cầu storage thật, seed chỉ có một Member và giới hạn UI/API.
- [x] Lưu nguồn/ảnh/tài liệu tại checkpoint có thể chuyển bằng Git bundle.
  Tag này chỉ chứng nhận phạm vi nguồn và kiểm thử trong REBUILD, không là release cuối.
- [ ] Review độc lập theo TEAMWORK, hoàn tất native/visual gates trước tag release.
- [x] Clone/checkout mốc nguồn vào thư mục mới, install frozen lockfile, generate,
  migrate DB riêng, build/test; ghi commit/tag/hash và kết quả vào tài liệu.
- [x] Ghi việc còn mở theo vai trò trong START_HERE. Team chưa chỉ định tên người
  nhận từng vai trò. Chưa push/PR; không tuyên bố remote đã có nguồn này.

Không stage tất cả mù quáng hoặc sửa/xóa migration cũ để gọn lịch sử. Không trộn phần
nghiệp vụ mới vào commit polish. Snapshot đã bao gồm baseline trước đây chưa được
track; không chỉ chứa tài liệu bàn giao. Các sửa sau checkpoint nên theo từng feature.

## Sau mốc bàn giao

Tiếp tục F2 DirectDelivery theo [transaction plan](../features/TRANSACTION_FOUNDATION_PLAN.md):
Delivered/Buyer receipt → Inspection 72h và claim → custody/review resolution,
returns/settlement → client. F3 Exchange, F4 ViaPoint, F5 auction ở sau. Luồng nhận
hàng phải giữ an toàn tiền/sách cả khi báo giao thành công bị Buyer phủ nhận.
