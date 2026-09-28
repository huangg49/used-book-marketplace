# Thay đổi nghiệp vụ 1.0 → 1.1

Ngày 26/09/2026. Bản hiện hành: [SRS 1.1](SRS_V1_1.md), [bản đọc offline](SRS_V1_1.html).
Các quyết định chủ dự án duyệt trong hội thoại được cụ thể hóa thành baseline;
không ghi rằng giảng viên đã phê duyệt chi tiết hoặc phần mềm đã nghiệm thu.

## 1. Bảng thay đổi

| Vấn đề | SRS 1.0 | Baseline 1.1 | Ảnh hưởng |
|---|---|---|---|
| Client | Web, native ngoài M | RN Member trước, web vận hành, API chung Flutter | Đồng bộ ADR0003; không đổi nền tảng API |
| Địa bàn | Chưa chốt một thành phố | TP.HCM, validate service-area version | Địa chỉ, checkout/accept/bid và fixture phải kiểm tra vùng |
| Giao nhận | Mô hình direct carrier | Giữ direct; thêm ViaPoint tùy chọn mua/đổi | Plan một điểm, các chặng tùy chọn, custody tách delivery |
| Điểm | Hub ngoài M | Hai điểm nội bộ mô phỏng thuộc M | Assignment, capacity, receipt, report, shelf, reclaim, incident |
| Phí Exchange | Mỗi bên tự chi chiều gửi, ghi khá khuất | Direct giữ nguyên; via point trả inbound của mình + outbound mình nhận | Bảng phí trước chốt, riêng cọc/Δ; self0đ/carrier30k/chặng |
| Phí Order | Buyer P+S, Seller ứng S | Direct giữ; via point Seller inbound, Buyer outbound, fee holds riêng | Không hoàn ứng ship lần nữa cho Seller qua điểm |
| Cọc | 100% giá trị nhận | Giữ100% cả hai phương thức | Không suy luận có điểm thì tự miễn cọc |
| Cam kết độ tin cậy | Ảnh/lời khai/duyệt/dispute | Tách duyệt thông tin với kiểm tra hiện vật; không hứa chính hãng | Badge, report/evidence, quyền đọc; nghi giả chặn release |
| Mất tại điểm | Chưa có custody điểm | Quỹ demo hữu hạn2m, giá bảo vệ snapshot, decision độc lập | Ngoại lệ nguồn bồi thường; không chi trùng/âm quỹ/đóng hồ sơ giả |
| Đấu giá | Ngoài M | Tập nhỏ thuộc M; mở sau Pass tại điểm | Auto ceiling, tie, max private, BuyNow, timeout, winner→Order |
| Khóa sách | Order/Exchange | Chung Order/Exchange/AuctionIntake; custody còn mở vẫn chặn | Shared unique commitment, chuyển quyền nguyên tử |
| Vận chuyển | 1 outbound Order, 2 Exchange | ViaPoint tối đa2 carrier legs/cuốn; self receipt riêng | Chặng đến điểm không bắt đầu inspection của recipient |
| Snapshot tài liệu | Bộ HTML/diagram/ZIP v1.0 | V1.0 lưu trữ nguyên trạng, v1.1 riêng có phụ lục | Chỉ mục phân biệt phiên bản; không đổi manifest lịch sử |

## 2. Bộ tài liệu hiện hành và thứ tự ưu tiên

1. [SRS 1.1](SRS_V1_1.md) và [phụ lục nghiệp vụ](features/LOCAL_HANDOVER_AUCTION.md):
   quy định sản phẩm; phụ lục cụ thể hóa ViaPoint/Auction và ghi các ngoại lệ so với lõi cũ.
2. [Thiết kế logic](features/LOCAL_TRANSACTION_DESIGN.md),
   [use case/traceability/acceptance/demo](features/LOCAL_TRANSACTION_ACCEPTANCE.md),
   [ADR0007](adr/0007-hcm-handover-auction-scope.md): triển khai và chứng minh quyết định.
3. Đặc tả listing hiện hành, OpenAPI, migration và source: phản ánh từng phần đã
   thiết kế/triển khai; trạng thái implemented/planned phải đúng thực tế.

SRS1.0 MD/HTML và gallery PlantUML/PNG/SVG/ZIP vẫn là nguồn lịch sử. Chúng không
được giới thiệu như sơ đồ v1.1. Mô hình trạng thái mới dùng Mermaid có source trong
tài liệu logic; bảng use case v1.1 chỉ rõ đường nối lại các UC/AC cũ. Bản offline
v1.1 chứa cả SRS và ba phụ lục; mã Mermaid được giữ trong phần mở rộng có nhãn.

## 3. Giới hạn lần cập nhật này

Chỉ thay tài liệu và công cụ tạo/kiểm tra tài liệu. Không sửa runtime API, UI,
Prisma schema, migration, OpenAPI0.4.0 hoặc generated types. Point/auction/ship/
ledger/transaction mới vẫn planned. API catalog/nháp đã có không tự có geographic
gating hay authentication capability cho tài khoản LOCKED còn nghĩa vụ.

26 yêu cầu mới: FR-H01–12, FR-T01–04, FR-AU01–10. 12 use case mới: UC-H01–07,
UC-AU01–05. 38 nhóm nghiệm thu mới: AC-H01–24, AC-AU01–14. Sáu kịch bản demo
không thay thế matrix; mọi case mới ghi chưa chạy. Con số này chỉ đếm tài liệu,
không đếm chức năng hoặc tests đã đạt.

## 4. Kiểm tra và tái tạo

`scripts/build-business-docs.py` tạo HTML offline và kiểm tra links, mã yêu cầu,
coverage ma trận, bộ giá trị Auto/tiền demo, dấu chưa triển khai và digest bản1.0.
Phụ thuộc render duy nhất: Python Markdown3.7, cài trong thư mục local ignored.

```powershell
python -m pip install --target .tmp/docs-render Markdown==3.7
python scripts/build-business-docs.py
python scripts/build-business-docs.py --check
pnpm contract:check
```

HTML không tải font/script/CDN; copy một file để đọc nội dung chính và các phụ lục
offline. Link source/code khác vẫn cần repo. Quy tắc tiền/Auto trong script là kiểm
tra ví dụ trong đặc tả, không phải test nghiệp vụ phần mềm đã implement.

Kết quả kiểm tra thực chạy được ghi ở [báo cáo tài liệu](SRS_V1_1_VERIFICATION.md).
