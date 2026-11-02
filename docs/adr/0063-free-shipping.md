# ADR 0063: Miễn phí giao hàng cho giao dịch mới

Chủ dự án yêu cầu ngày 02/11/2026: bỏ phí giao hàng trên toàn hệ thống,
bao gồm mua sách trực tiếp, mua qua thương lượng và giao sách đấu giá từ điểm.
Sau khảo sát dữ liệu, chủ dự án xác nhận giữ nguyên đơn và dữ liệu cũ.

## Quyết định

- Migration `0052-free-shipping` chọn policy mới `DIRECT-FREE-SHIPPING-v1`,
  `shippingFee = 0`; giữ commission và thời hạn báo giá từ policy đang chọn.
  Không sửa policy lịch sử, migration cũ, snapshot đơn hoặc ledger.
- Báo giá mới và giao sách đấu giá mới không thu cước. Tổng người mua trả là
  tiền sách; phí nền tảng/commission không thuộc yêu cầu này và giữ nguyên.
  Exchange hiện không có khoản phí giao hàng được cộng vào ví nên không cần
  thêm hay xóa thao tác tiền. Quy trình gửi/nhận sách và vùng hỗ trợ giữ nguyên.
- Báo giá mua cũ có policy khác chuyển `Changed`, phải lấy lại báo giá trước
  tạo đơn. Khi trả tiền đấu giá, địa chỉ/version và `expectedOutboundFee` vẫn
  kiểm ở server; số phí cũ khác 0 bị từ chối để người mua xác nhận lại.
- Validator và OpenAPI cho phép `CarrierOutbound` có cước bằng 0, vẫn từ chối
  số âm. Trường phí trong contract/snapshot được giữ để đọc, hoàn tiền và
  đối soát giao dịch lịch sử. FE ẩn dòng phí bằng 0 và sửa hướng dẫn lấy địa chỉ;
  các đơn lịch sử có phí vẫn hiển thị số đã chốt.

Quyết định này thay phần thu cước demo cố định trong các ADR báo giá/giao sách
trước đó, bao gồm [ADR 0044](0044-auction-delivery-from-point.md). Không thay
các gate trong [READINESS](../handoff/READINESS.md), không mở rộng settlement.

## Vận hành

Dừng API/worker, backup database hiện tại, chạy `pnpm db:migrate`, rồi khởi
động lại API và worker cùng build. Không reset, seed lại hoặc xóa đơn cũ.
Máy có Mongo chạy sẵn và cấu hình API riêng có thể dùng lệnh trực tiếp trong
`apps/api` theo [DEVELOPMENT](../DEVELOPMENT.md).

## Hành trình và kiểm chứng local — 03/11/2026

| Vai trò / entry | Command / kết quả | Bước tiếp và phục hồi |
| --- | --- | --- |
| Member web/RN → Mua ngay → địa chỉ | Báo giá mới phí 0, tổng bằng giá sách; tạo đơn giữ snapshot | Thanh toán ví theo tổng từ API; mất ACK giữ key/body/version |
| Buyer/Seller → chat thương lượng | Buyer gửi địa chỉ/báo giá; Seller tạo đơn với giá đã thống nhất | Báo giá cũ Changed phải lấy lại; tổng mới không cộng cước |
| Người thắng đấu giá → chọn giao tận nơi | Quote/pay xác nhận địa chỉ/version và outboundFee 0 | Điểm gửi sách, recipient nhận/claim theo workflow hiện có; giữ exact replay |
| Hai bên Exchange → gửi sách | Không có thao tác thu phí giao hàng trong BE | UI bỏ hướng dẫn tự trả cước; giữ địa chỉ, tracking, đặt cọc và gửi/nhận |

- PASS migration QA: nâng schema, chạy lại idempotent, giữ policy/quote có phí
  cũ và ledger, nhận outboundFee 0, từ chối phí âm và phí cũ không khớp.
- PASS18quote HTTP/Mongo; PASS6auction delivery HTTP/Mongo, gồm pay/replay,
  refund, quyền và race kết quả hãng. Auction có67ca ngoài filter không chạy.
- PASS264web/194RN unit, API/web/RN typecheck, API/web build, lint (warning
  có sẵn), contract generate/check/routes và docs/diff. Native runtime NOT RUN.
- PASS browser mua/quote/address/create/pay, mất ACK/replay, thiếu tiền và một
  hold duy nhất; screenshot popup390/1440 đã xem, không có dòng phí, tổng bằng
  giá sách. Storage/payment fake; API/Mongo thật trên QA riêng57017/`*_test`.
- Stress100create trong suite Orders FAIL: chỉ1request thành công thay vì2,
  phần còn lại409/503; lượt filter riêng cũng FAIL1success/99busy. Không đổi
  transaction, timeout hoặc assertion để ép PASS; chưa kết luận nguyên nhân.
  Các ca Orders còn lại PASS61 và toàn bộ50ca payment/refund PASS. Lượt E2E đấu giá trước bị trùng DB QA đã bỏ
  kết quả và chạy lại trên tên DB riêng; không chạm database ứng dụng.
- Đã backup và áp dụng0052 vào DB local theo yêu cầu owner, kiểm hash nội dung
  96collection nghiệp vụ trước/sau giống nhau (loại registry/policy chủ đích
  đổi). API/workers đã khởi động lại; API readiness, hai FE và proxy HTTP200.
  Backup/hash evidence riêng trong `.tmp/dev-support-run/`, không đưa vào Git.

Owner cấp quyền commit/push nhánh `codex/remove-shipping-fees` ngày03/11/2026.
Chưa PR/merge/deploy; remote CI, full native và human review NOT RUN.
