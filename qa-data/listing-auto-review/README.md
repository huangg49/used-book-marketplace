# Bộ dữ liệu đánh giá AI tự duyệt bài đăng

Dùng để đo [ADR0061](../../docs/adr/0061-ai-listing-auto-review.md) trước khi bật cờ.
Hiện là **bộ thử sơ khởi**, chưa đủ làm bằng chứng bật tính năng. Kết quả chạy thật ở
[ADR0063](../../docs/adr/0063-ai-listing-review-hardening.md).

## Có gì ở đây

| Đường dẫn | Nội dung | Git |
| --- | --- | --- |
| `cases.draft.json` | Các ca: ảnh, bài đăng giả lập, kết quả mong đợi, lý do | Có |
| `validate.mjs` | Kiểm offline: nhãn, giấy phép, hash ảnh, độ phủ. Không gọi model | Có |
| `incoming/images/` | Ảnh tải về, đã mã hóa lại để bỏ EXIF | Không |
| `incoming/provenance.json` | Nguồn, tác giả, giấy phép, hash từng ảnh | Không |
| `incoming/results.json` | Câu trả lời mô hình theo từng ca, để chạy tiếp không tốn lại | Không |

```sh
node qa-data/listing-auto-review/validate.mjs
```

Exit0 chỉ nghĩa là tệp nhất quán. Script báo riêng cỡ mẫu và số ca đã có người kiểm.
Chấm bằng mô hình thật (tốn tiền, không đụng DB), bản tóm tắt ghi vào
`apps/api/eval/auto-review/results/`:

```sh
pnpm --filter @used-books/api eval:auto-review --max-usd 1
```

## Nguồn ảnh

Ảnh thật lấy từ Wikimedia Commons, chỉ nhận CC0, phạm vi công cộng hoặc CC BY/BY-SA.
Ảnh không đưa vào Git và không dùng làm tài sản sản phẩm. Bản thân bìa sách có thể có
bản quyền riêng dù ảnh chụp có giấy phép mở, nên chỉ dùng nội bộ để đánh giá; nhãn
"Public domain" là khai báo của Commons, chưa được kiểm độc lập. Nếu chia sẻ lại ảnh
CC BY/BY-SA, phải ghi công theo `provenance.json`.

## Nhãn

- `Approvable`: ảnh và bài đăng đủ để duyệt mà không cần Staff.
- `MustEscalate`: phải chuyển Staff, có `escalationReasons`.
- `Ambiguous`: người có thể bất đồng, không tính vào chỉ số.

`kind`: `Natural` dùng đúng thông tin trong ảnh. `ConstructedMismatch`,
`ConstructedOverstated`, `ConstructedInjection` là ảnh thật kèm bài đăng **cố ý sai**
(sai sách, khai tình trạng quá tốt, chèn lệnh vào mô tả). Báo cáo tách các nhóm này,
vì chúng là ca dựng, không phải gian lận quan sát được.

**Mọi nhãn hiện do AI soạn nháp (`humanReviewed: false`) từ ảnh thu nhỏ và mô tả
Commons.** Không chấm được bằng nhãn nháp rồi coi là nghiệm thu. Người kiểm phải xem
ảnh gốc, sửa nhãn, rồi đặt `humanReviewed: true` và `reviewedBy`.

## Giới hạn đã biết

- Ảnh Commons thường đẹp hơn, hoặc cũ/hiếm hơn, ảnh người bán chụp bằng điện thoại ở
  TP.HCM; rất ít sách tiếng Việt bán lại. Điểm số không suy ra được chất lượng thực tế.
- Mỗi ca chỉ một ảnh, trong khi luật dữ kiện yêu cầu ít nhất2 ảnh. Bộ này chỉ đo tầng
  đánh giá của model, phải bỏ qua luật số ảnh khi chạy và ghi rõ điều đó.
- Không có ảnh thật cho: sách lậu, trang bản quyền, ISBN, chênh ấn bản. Các tiêu chí
  này chưa đo được ở đây.
- Chưa có tập phát triển/đối chứng tách riêng: prompt v3 được sửa sau khi đọc kết quả v2
  trên chính các ca này.
- 61 ca `MustEscalate` dùng tên giữ chỗ nên bị so tên chặn dù ảnh thế nào. Đọc chỉ số
  `falseApprovalIfTitleMatched`; người kiểm nên điền tên thật khi có thể.
- Mới có10 ca `Approvable`, nên tỷ lệ tự động gần như chưa nói được gì.

## Ngưỡng trước khi bật

Đề xuất, chủ dự án chốt: ít nhất60 ca `MustEscalate` và60 `Approvable` đã có người
kiểm, ưu tiên ảnh điện thoại thật, trên tập đối chứng chưa dùng để chỉnh prompt. Không
duyệt sai ca nào trong59 ca trở lên cho cận trên95% của tỷ lệ duyệt sai dưới5%.
