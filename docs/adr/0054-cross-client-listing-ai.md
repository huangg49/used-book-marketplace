# ADR 0054: Trợ lý đăng sách trên web và React Native

29/10/2026. Accepted cho gói owner yêu cầu hoàn thiện AI và nối hành trình đăng
sách. Kế thừa [ADR0028](0028-listing-price-assistant.md),
[ADR0029](0029-online-price-lookup.md) và
[ADR0048](0048-listing-photo-autofill.md). Không sửa baseline SRS hoặc biến trợ
giúp nhập liệu thành định giá thị trường tự động.

## Quyết định

- Nối đọc ảnh vào DraftEditor RN, gợi ý giá vào form đăng sách đơn Member web.
  Người dùng chọn đầu sách/trường/giá; xác nhận trước thay nội dung đã gõ.
  Web dùng lại một DraftAttempt cho đọc ảnh, gợi ý giá và gửi duyệt. Ảnh đọc có
  nút dùng làm bìa, đi qua crop/upload bình thường. RN dùng ảnh Ready cùng nháp.
- Web có thể gửi yêu cầu danh mục sau khi người bán tự nhập đủ metadata và bấm
  nút ghi rõ xác nhận đầu sách; panel báo tác dụng này trước khi bấm. Đây là
  command có chủ ý, không tự tạo danh mục khi AI trả kết quả.
- Schema và state gợi ý dùng chung trong session-client. Không tạo token store.
  Request memory-only gắn actor/path/body, gộp lượt trùng đang chạy. Mất phản hồi,
  timeout, 429 hoặc UNAVAILABLE giữ nguyên key/body khi thử lại, kể cả quay về
  input cũ sau khi sửa. Phản hồi thuộc tài khoản cũ bị loại.
- Contract0.61 thêm `AI_ASSIST_FAILED` cho **lỗi AI đã lưu terminal**. Chỉ mã
  này cho phép một lần bấm lại tạo intent mới sau lỗi503. API filter chỉ giữ mã
  này với DomainError503; các lỗi server khác vẫn generic. Không đổi key để
  vượt một kết quả chưa rõ, giới hạn/quota hoặc commit thất bại. Auth hiện tại
  vẫn được kiểm trước replay như service cũ.
- Hai endpoint có Server-Timing với tên stage cố định và duration. Không có
  prompt, ảnh, user ID hay secret trong header. `complete` bao gồm model/images/
  catalog nên không cộng các stage thành tổng. Replay không có stage model.
  Log AI bỏ chi tiết lỗi provider có thể chứa nội dung đầu vào.
- Gợi ý giá cũ bị vô hiệu khi đổi input hoặc hết hạn; quyết định lưu cùng nháp
  chỉ ghi `applied` khi giá hiện tại đúng mức người bán đã chọn. Không tự áp giá,
  tự submit, thay bounds/nguồn, quota, ledger, state machine hoặc migration.
- Chưa thêm Qdrant: dữ liệu hiện tại là catalog có cấu trúc và nguồn giá có ID;
  chưa có bằng chứng cần retrieval ngữ nghĩa. Đo pipeline/provider và kiểm
  đáp án thật trước khi thêm hạ tầng.

## Bằng chứng và giới hạn

[Báo cáo gói](../features/LISTING_AI_JOURNEY_2026_10_29.md) phân biệt browser QA,
provider thật và chất lượng ảnh thật. Nhóm xác nhận chưa có bộ ảnh/đáp án;
ngưỡng ADR0048 vẫn NOT_RUN, không suy benchmark ảnh tổng hợp là đạt.
READINESS giữ nguyên; native, human review, dữ liệu giá demo thực tế cần kiểm riêng.
