---
name: latlai-api-mongo
description: "Change Lật lại NestJS APIs, permissions, sessions or MongoDB persistence with contract-first implementation, transaction invariants and scoped negative/race tests."
---

# Sửa API và MongoDB Lật lại

Đọc [AGENTS](../../../AGENTS.md), contract/code hiện tại, rồi phần liên quan trong
[domain rules](../../../docs/architecture/DOMAIN_RULES.md). Chỉ đọc ADR/report của
miền đang sửa. [START_HERE](../../../docs/handoff/START_HERE.md#3-tìm-đúng-nơi-để-sửa)
dẫn đến service/test; SRS mô tả mục tiêu, không chứng minh endpoint đã tồn tại.

1. Xác định thay đổi quan sát được và invariant bị ảnh hưởng. API request/response
   đổi thì sửa `packages/api-contract/openapi.yaml` trước, chạy `pnpm contract:generate`,
   commit cả YAML/types. Không tự thêm endpoint riêng cho một client.
2. Đọc [ADR 0027](../../../docs/adr/0027-mongodb-persistence-protocol.md) và
   [model map](../../../docs/refactor/MIG02_MODEL_MAP.md) trước sửa persistence.
   Dùng shared command executor/`runTransaction`, lock order/`lockSeq`, commit-time
   checks và `updatedAt`. Không thay transaction bằng chuỗi write rời rạc.
3. Guard không thay ownership/eligibility/state check trong service. Kiểm tra auth
   hiện tại trước replay; giữ `expectedVersion`, key/body và receipt theo protocol
   đang có. Không coi tên role, login thành công hoặc nút bị ẩn là đủ quyền.
4. Giữ ledger/hold/commitment bất biến. Đừng sửa balance trực tiếp, tạo tiền bù,
   restock hoặc hoàn tiền vì một ảnh/review/report. Sau seller acceptance không dùng
   nhánh refund trước acceptance. Không mở Delivered/settlement khi gate còn mở.
5. Validator/index/reference data đổi thì thêm numbered migration mới; không sửa
   checksum/migration đã áp dụng. SQL migrations chỉ đọc phục vụ import. Không
   reset DB hoặc nhập lại dữ liệu chính để làm test xanh.
6. Viết/chạy test theo rủi ro thay đổi: thiếu quyền/sai owner, trạng thái không hợp
   lệ, stale version, replay cùng key/body, key khác body, mất phản hồi và race khi
   liên quan. Race cần tạo được cạnh tranh thực; không chỉ gọi tuần tự hai request.
   Dùng QA replica set/database `_test` theo
   [hướng dẫn](../../../docs/handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app),
   không DB/bucket local chính. Phân biệt storage fake và live Supabase.
7. Chạy contract/routes, lint/typecheck/test/build phù hợp theo
   [ma trận](../../../docs/AI_WORKFLOW.md#kiểm-tra-theo-thay-đổi). Sửa invariant/schema
   cần Mongo suite; thay import/failover cần ca tương ứng. Ghi rõ skip/blocker.

Khi đổi hành vi/configuration, cập nhật hướng dẫn và ADR liên quan. Báo invariant
đã kiểm, migration mới nếu có, consumer bị ảnh hưởng và giới hạn. Không lấy CI
xanh hoặc AI review làm chứng nhận human review/release.
