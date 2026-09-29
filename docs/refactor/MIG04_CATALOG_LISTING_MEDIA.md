# MIG-04 — Catalog, listing, media, địa chỉ trên MongoDB

29/09/2026, nhánh `codex/mongodb-refactor`. Nền: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md),
[bản đồ backstop](MIG02_MODEL_MAP.md).

## Đã chuyển

- Địa chỉ: sổ địa chỉ, identity chèn cùng địa chỉ, version nội dung chỉ tăng khi đổi
  nội dung; `checkAddressBook` lúc commit (≤10, đúng 1 mặc định, locality/identity).
- Catalog: yêu cầu/nộp lại/duyệt; migration **0003** thêm `catalog_books.titleKey`
  (khóa sắp xếp đã chuẩn hóa, thay biểu thức `normalize(... NFD)` của SQL) có backfill;
  `checkCatalog` lúc commit; trùng ISBN khi duyệt đồng thời → 409 `CatalogDuplicate`.
- Listing: nháp, nộp, duyệt, sửa sau duyệt, hiển thị, lưu trữ, gỡ; kệ công khai dùng
  pipeline aggregation tương đương `publicFrom/publicEligible`; `checkListing` lúc commit
  (kiểm duyệt khớp revision/decision, 1–8 ảnh Ready, catalog Confirmed khi Approved,
  commitment ⇔ Reserved, origin thuộc chủ listing, người duyệt khác chủ).
- Media: intent/upload/finalize/đọc ký; khóa ngân sách lưu trữ toàn cục bằng document
  `counters` (thay advisory lock); worker claim bằng transaction + điều kiện, lease,
  heartbeat, retry; dọn ảnh hết hạn với tombstone.
- Mọi update đặt `updatedAt` (thay `@updatedAt` của Prisma) và `version` +1 có điều kiện.

## Bằng chứng

E2E trên MongoDB (DB `_test` riêng, app user tối thiểu quyền):

| Suite | Test | Ghi chú |
|---|---|---|
| addresses | 14 | gate thay khóa hàng, validator thay trigger lỗi |
| catalog-drafts | 20 | retry có giới hạn + 503 thay test serialization 3 lần |
| listing-review | 70 | tạm dừng lệnh trong transaction để ép thứ tự thắng |
| media | 13 | lease theo đồng hồ server |
| listing-schema | 13 | mỗi backstop SQL → V/I/P/C/W |
| fulfillment-migration | 1 | bảo đảm tương đương, không có migration SQL |
| auth, commands, operations-users, app | 21 | MIG-03 |

Toàn bộ 152 test E2E đã port PASS một lượt chung (10 file); từng file đã chạy lặp 4 lần
bởi tác tử port. Ba suite do subagent port, lead đã chạy lại độc lập và review diff.

## Bảo đảm giờ chỉ còn ở tầng ứng dụng

Ghi không qua command executor bằng thông tin đăng nhập app có thể làm những điều sau
mà DB không chặn (C chỉ phát hiện khi lệnh kế tiếp chạm aggregate đó hoặc khi đối soát
toàn DB ở MIG-06):

1. Sửa nội dung hoặc thứ tự ảnh của revision đã nộp (PostgreSQL: trigger bất biến).
2. Đổi field định danh của ảnh Ready (`derivativeKey`, `pinnedKey`, `sha256`…).
3. Sửa payload outbox.
4. Đổi `ownerId` hoặc nhảy `version` khác +1.
5. Giả version địa chỉ.

Tự duyệt (self-review) đã được đưa lại vào kiểm lúc commit sau khi review phát hiện thiếu.
