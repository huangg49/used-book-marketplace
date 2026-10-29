# ADR 0051: Loại Forum khỏi phạm vi dự án

Ngày28/10/2026. **Trạng thái: Accepted — quyết định phạm vi của nhóm, do chủ dự
án xác nhận.** Chủ dự án thông báo nhóm đã quyết định bỏ phần Forum/Cộng đồng
sách sau đề xuất công việc tiếp theo. Đây là loại khỏi phạm vi hiện hành,
không phải hoãn triển khai hoặc đánh dấu đã hoàn tất.

## Quyết định

- Bỏ topic, bình luận công khai, chuyên mục Forum, báo cáo/kiểm duyệt Forum,
  gắn listing/wanted_book vào topic và tạo listing từ trình soạn topic.
- FR-F01–FR-F06 và AC-44 của SRS1.1 được ghi **OUT OF SCOPE**. Giữ mã để truy vết,
  không đánh số lại hoặc tái sử dụng. BR-43 và phần Forum của BR-42/BR-44,
  FR-C06/FR-G02, UC-15, mô hình dữ liệu, UI và mốc G5 được cập nhật tương ứng.
- Chat giao dịch, wishlist/matching, thông báo, đánh giá giao dịch, kiểm duyệt
  listing/catalog và vận hành vẫn thuộc phạm vi yêu cầu tương ứng. Không bỏ
  những phần này chỉ vì chúng từng nằm cùng nhóm “cộng đồng”.
- Không tạo API, collection/migration, worker, route hoặc menu mới cho Forum.
  Tại source khảo sát `f288a73`, chưa thấy workflow Forum trong Nest modules,
  OpenAPI hoặc routes web/RN; thay đổi này chỉ cập nhật tài liệu, không phải
  nghiệm thu việc gỡ một tính năng runtime đã có.

## Tài liệu và truy vết

[SRS1.1 hiện hành](../SRS_V1_1.md) áp dụng quyết định này từ28/10/2026. Snapshot
[SRS1.0](../deliverables/SRS_Nen_tang_sach_cu.md), bộ diagram/HTML/ZIP và báo cáo
có ngày được giữ lịch sử. [Ghi chú deliverables](../deliverables/README.md) chỉ rõ
những nội dung Forum trong bản cũ không còn là yêu cầu hoặc backlog hiện hành.
Không sửa nhãn v1.0 rồi trình bày như thể quyết định đã có từ lúc lập bản đó.

## Giới hạn

Quyết định này không thay các gate [READINESS](../handoff/READINESS.md), không
phê duyệt tính năng thay thế, push/merge/deploy hoặc mở rộng completion/settlement.
GHN/carrier/Driver tiếp tục giữ nguyên theo yêu cầu chủ dự án. Không thay code,
contract, DB hoặc nội dung env trong gói cập nhật phạm vi này.
