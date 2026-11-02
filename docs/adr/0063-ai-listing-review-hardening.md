# ADR 0063: Gia cố AI tự duyệt bài đăng và đo bằng mô hình thật

02/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc, **cờ vẫn tắt**.
Bổ sung [ADR0061](0061-ai-listing-auto-review.md). Khác biệt với SRS FR-L03 vẫn chờ chủ
dự án xác nhận; ADR này không sửa SRS.

## Kết luận đo

**Chưa đủ điều kiện bật.** Mô hình: `nvidia/nemotron-3.5-super-vl-120b-a12b`, cùng cấu
hình `AUTOFILL_*`. Không thêm mô hình, khóa chỉ đọc từ `.env`.

| Chỉ số trên118 ca (103 ca chấm) | v2 | v3 |
| --- | --- | --- |
| Duyệt sai, ca `MustEscalate` | 5/93 | 0/93, cận trên95% một phía 3,2% |
| **Sẽ lọt nếu tên sách khai đúng**, ca tự nhiên | chưa đo | **6/71 (8,5%), cận trên 16%** |
| Ảnh quét/bìa dựng bị chặn đúng lý do | 5/14 | 12/14 |
| Tự động duyệt ca `Approvable` | 9/10 | 8/10 |
| Chèn lệnh hoặc liên hệ ngoài sàn lọt | 0/9 | 0/9, cận trên 28% |
| Output sai dạng | 0 | 0 |
| Ca bị timeout 25 giây ở lượt đầu, thử lại thì được | 13 | 12 |
| Độ trễ mỗi ca (3 lượt gọi), p50 / p95 | 3,5 / 9,1 s | 3,8 / 11,6 s |
| Chi phí theo bảng giá nội bộ, cả bộ | 0,41 USD | 0,43 USD |

Bản đầy đủ: [v2](../../apps/api/eval/auto-review/results/pilot-auto-review-v2.json),
[v3](../../apps/api/eval/auto-review/results/pilot-auto-review-v3.json).

Đọc các số này thế nào:

- `0/93` lạc quan. 61 ca dùng tên giữ chỗ nên bị so tên chặn bất kể ảnh. Sáu ca ở dòng in
  đậm chỉ bị chặn nhờ so tên, trong đó có ảnh laptop và hộp (`c488`), sách cổ Baedeker
  (`d121`), sách bị mọt (`c019`). Kẻ gian sẽ khai đúng tên.
- v3 được chỉnh sau khi đọc v2 trên chính các ca này, nên là kết quả phát triển, không
  phải đối chứng. Nhãn do AI soạn, chưa có người kiểm. Ảnh Commons, không phải ảnh điện
  thoại của người bán. Mới có10 ca `Approvable`.
- Điểm tin cậy tự báo cao hơn thực tế: nhóm 0,85–0,95 đúng 80%, nhóm 0,95–1 đúng 95,5%.
  Vì vậy ngưỡng theo tiêu chí là chặn thêm, không phải bảo đảm.
- Hai tiêu chí yếu: `conditionConsistent` (precision 25%, recall 39%) và
  `noAuthenticityRedFlags` (10%, 50%). Không thể coi AI phát hiện được sách lậu hay đánh
  giá đúng tình trạng. Chúng hiện chủ yếu đẩy thêm việc cho Staff.
- Không đo được: dữ kiện lưu trong DB, luật hai ảnh, ấn bản và ISBN so với catalog, sách
  lậu thật. Mỗi ca chỉ có một ảnh.

Test worker sống (`listing-auto-review-live.e2e-spec.ts`, 4/4, DB QA, nhà cung cấp thật):
sách đúng được duyệt qua đủ ba bước; ảnh thật khai sai sách, chồng sách, và câu lái kết quả
viết kín không khớp bộ lọc cục bộ đều chuyển Staff. Ca cuối bị chính mô hình bắt
(`noReviewerInstructions:Failed`).

Điều kiện bật, chủ dự án chốt: ít nhất60 `MustEscalate` và60 `Approvable` có người kiểm,
ưu tiên ảnh điện thoại, tên sách thật, trên tập chưa dùng để chỉnh prompt; cận trên95% của
tỷ lệ duyệt sai dưới5%; chủ dự án xác nhận FR-L03; rồi mới đặt
`LISTING_AUTO_REVIEW_APPROVED_POLICY`.

## Quyết định

**Ba lượt gọi tách riêng, mỗi lượt chỉ thấy phần cần xét** (theo hướng phân tách dữ liệu của
[OWASP LLM Prompt Injection Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)):

| Bước | Thấy gì | Trả về | Ai kết luận |
| --- | --- | --- | --- |
| Text | Chữ người bán, enum tình trạng | Phù hợp, liên hệ ngoài sàn, câu nhắm tới kiểm duyệt, khớp tình trạng | Mô hình, có ngưỡng |
| Extraction | Chỉ ảnh | Tên, tác giả, ISBN, ấn bản, NXB in trên sách | **Máy chủ** so với catalog; mã vạch đọc cục bộ thắng số mô hình đọc |
| Visual | Ảnh, enum tình trạng | Ảnh thật, thấy hiện vật, một cuốn, bìa rõ, khớp tình trạng, dấu hiệu lậu/đọc thử/sách cổ, phù hợp; mức hư hại | Mô hình, có ngưỡng; máy chủ so hư hại với mức khai |

Catalog không gửi cho mô hình. Không có output nào nghĩa là "đăng". Parser nhận đúng tập khóa:
thêm `{"approved":true}` hoặc sai kiểu đều thành không có đánh giá, tức chuyển Staff. Dừng ở
bước đầu tiên đã phải chuyển Staff để bớt lượt gọi.

**Bổ sung vì đo thật:** v2 chỉ hỏi "ảnh thật không" và cho qua bìa quét phẳng. v3 thêm
`physicalCopyVisible`, câu hỏi hẹp về thứ nhìn thấy được: nền, tay, mép, độ dày.

**Dữ kiện máy chủ chạy trước, không tốn lượt gọi, kiểm lại dưới khóa lúc commit:**

- BR-09: không có nguồn giá đáng tin (`NoTrustedPriceSource`), giá ngoài khoảng tham chiếu
  (`PriceOutsideReference`). Giá rao của người bán khác không được nạp. Hệ quả: đầu sách chưa có
  dữ liệu giá đều về Staff, nên tỷ lệ tự động thực tế có thể thấp hơn nhiều so với bảng trên.
- Tài khoản dưới7 ngày, quá5 bài/24 giờ, mức Như mới (luôn cần người, vì là mức lợi nhất
  khi khai quá; chuẩn tình trạng tham khảo [IOBA](https://www.ioba.org/conditions-definitions)).
- Chữ người bán có ký tự ẩn, liên hệ, URL hoặc câu nhắm tới kiểm duyệt: chuyển Staff, không gọi
  mô hình. Bộ lọc này chỉ bắt mẫu quen; câu viết khéo vẫn tới bước Text.
- Ảnh quá nhỏ, mờ, tối, chói; dHash gần giống ảnh bài khác trong180 ngày (BR-01). Ngưỡng mờ đặt
  dưới mọi ảnh sạch trong bộ thử: chỉ loại ảnh không ai dùng được.

**Cổng phiên bản:** `POLICY_VERSION` (`auto-review-v3`) đổi khi luật, ngưỡng hoặc prompt đổi.
Worker chỉ chạy khi `LISTING_AUTO_REVIEW_APPROVED_POLICY` trùng khớp, nên sửa prompt sẽ tự tắt
cho tới khi có người chấp nhận bằng chứng mới. Mỗi dòng ghi phiên bản.

**Ngân sách:** chi phí tính vào `global:<day>` chung (`PRICE_ASSIST_DAILY_BUDGET_USD`), kiểm
trước từng bài. Giữa kiểm và ghi không có giữ chỗ nên có thể vượt tối đa một bài.

## Người giữ quyền

- `listing_auto_reviews` tách `facts` (máy chủ) khỏi `assessment` (mô hình). Hàng đợi lọc được
  theo `aiOutcome`. Admin ghi rõ "AI đã duyệt, chưa có người xem", không điền sẵn checklist.
- `revokeAutoApproval`: `decideListing` cần PendingReview, còn PendingReview không được mang quyết
  định, nên cùng nội dung quay lại hàng chờ thành **revision mới**. Quyết định của AI và của người
  cùng được lưu, worker bỏ qua (`PreviouslyDecided`). Reserved trả 409, xử lý theo quy trình hiện có.
- AI vẫn không từ chối. Phê duyệt/từ chối của người đi qua `decideListing` như cũ.

## Hậu kiểm

`listing_auto_review_checks`, migration0052. Cảnh báo không bao giờ tự gỡ bài.

- `AiRecheck`: 20% bài AI duyệt, chọn theo hash revision, sau24 giờ chạy lại dữ kiện và mô hình.
- `HumanAudit`: 10% đưa thẳng cho người. Đây là kiểm tra duy nhất không phụ thuộc mô hình tự đồng ý
  với chính nó, nên tỷ lệ bị lật (`overturnRate`) chỉ tính từ cảnh báo người đã đóng.
- Bản đã sửa hoặc đã gỡ: cảnh báo tự đóng `Skipped`.

Mỗi bài chỉ kiểm lại một lần, không lặp định kỳ. Admin có mục "Hậu kiểm AI"; chưa đưa vào Work Inbox.

## Cấu hình, triển khai, kiểm tra

Contract0.71. Dừng API/worker, `pnpm db:migrate`, `pnpm db:bootstrap`. Biến mới ở
`apps/api/.env.example`; các tỷ lệ và ngưỡng là đề xuất, chưa hiệu chỉnh.

```sh
pnpm --filter @used-books/api eval:auto-review --max-usd 1
AUTO_REVIEW_LIVE=1 pnpm exec vitest run --config ./vitest.config.e2e.ts test/listing-auto-review-live.e2e-spec.ts
```

Lệnh sau chạy trong `apps/api`, cần `MONGO_TEST_URL` QA. Cả hai tốn tiền thật và không chạy trong
CI; test CI dùng mô hình giả, chỉ chứng minh luồng quyết định. AI review không thay review người.

Tham khảo thêm: [AbeBooks về tình trạng sách](https://www.abebooks.com/books/rarebooks/collecting-guide/understanding-rare-books/guide-book-conditions.shtml);
[đo độ chính xác kiểm duyệt theo DSA](https://arxiv.org/pdf/2305.09601).
