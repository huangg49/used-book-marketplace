# ADR0066: Chịu được lúc nhà cung cấp AI chậm hoặc không trả lời

02/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc. Bổ sung
[ADR0048](0048-listing-photo-autofill.md), [ADR0061](0061-ai-listing-auto-review.md) và
[ADR0063](0063-ai-listing-review-hardening.md). **Cờ tự duyệt vẫn tắt**, không đổi
READINESS, không đổi `POLICY_VERSION` vì luật quyết định và prompt giữ nguyên.

## Vấn đề

Trợ lý giá, đọc ảnh và tự duyệt "lúc được lúc không". Số đo trước đó cho thấy lỗi đến từ
độ trễ của NVIDIA hosted, không phải từ câu trả lời: ADR0063 ghi 12–13/118 ca timeout
25 giây ở lượt đầu rồi thử lại thì được, output sai dạng 0; ảnh p50 1,1 s nhưng p95 11 s.
Mã chạy thật không thử lại lần nào. Tự duyệt gọi ba lượt liên tiếp nên khoảng một phần
tư bài gặp ít nhất một lượt lỗi, ghi ngay dòng `Escalated` và không bao giờ thử lại cho
revision đó. Log chỉ ghi loại lỗi, nên không phân biệt được 429, 5xx, rớt kết nối hay treo.
Eval tự chạy lại ca lỗi ở lượt sau, nên số đo đẹp hơn hành vi thật.

## Quyết định

1. `nvidiaChat` thử lại **một lần** trong cùng `timeoutMs` khi HTTP 429/500/502/503/504,
   lỗi mạng hoặc lượt đầu treo. Lượt đầu bị cắt để còn 9 s cho lượt hai (25 s: 16 s rồi
   9 s; 20 s: 11 s rồi 9 s). Chờ 1–1,5 s hoặc theo `Retry-After` tối đa 3 s; treo thì hỏi
   lại ngay. Không thử lại 4xx khác, từ chối nội dung hay câu trả lời sai dạng. Tổng thời
   gian vẫn bị chặn bởi `timeoutMs`, nên cửa sổ in-flight, hạn mức theo lượt và client
   60 s không đổi; lượt lỗi không có token nên không tính phí.
2. Lỗi mang `status`, mã lỗi mạng (ví dụ `ECONNRESET`), số lượt và thời gian. Log của giá,
   đọc ảnh và tự duyệt ghi các trường này; không ghi khóa, prompt, ảnh, chữ người bán hay
   chữ tự do của nhà cung cấp.
3. Tự duyệt và hậu kiểm: khi **mọi** lý do là `*:AssessmentUnavailable` và mọi lỗi là
   `Timeout`/`ProviderError`, worker không ghi quyết định mà trả `Deferred`; chu kỳ sau
   (khoảng một phút) lấy lại bài. Đến lượt thứ ba vẫn vậy thì chuyển Staff như cũ với cùng
   lý do. Từ chối hoặc output sai dạng vẫn chuyển Staff ngay. Bộ đếm theo revision nằm
   trong `price_assist_usage` (`autoreview:review|recheck:<revisionId>`, TTL 7 ngày, cùng
   shape nên không cần migration); không quyết định nào đọc nó để duyệt.
4. Tự duyệt **không** dùng `AUTOFILL_FALLBACK_MODEL`: số đo ADR0063 chỉ có cho một mô hình.
5. Đọc ảnh: replay một key còn `Pending` quá `2×AUTOFILL_TIMEOUT_MS+5 s` (tiến trình đã
   dừng) trả `AI_ASSIST_FAILED`/Timeout để client đổi key, thay vì 429 mãi tới khi tải lại.
6. `answerText` bỏ phần trước `</think>` cuối cùng và lấy khối `{…}` khi mô hình thêm câu
   dẫn. Kiểm tra khóa chặt chẽ của tự duyệt giữ nguyên.

## Hệ quả

- Một bài có thể chờ thêm tối đa khoảng ba chu kỳ trước khi tới Staff khi nhà cung cấp
  lỗi kéo dài. Không có nhánh nào biến lỗi thành duyệt.
- Lượt gọi của chu kỳ `Deferred` không làm tăng `_DAILY_LIMIT` (đếm theo dòng quyết định);
  chi phí vẫn vào ngân sách ngày chung. Tối đa ba chu kỳ cho mỗi revision.
- Lượt đầu của giá bị cắt ở 11 s (p95 đo được 9,8 s): ca chậm hơn sẽ dùng lượt hai.

## Kiểm tra

Unit `nvidia-chat.spec.ts` (thử lại theo status/treo/rớt kết nối, giữ trong một timeout,
không thử lại 400/`Retry-After` dài/câu trả lời sai dạng, `answerText`). E2E trên replica
set QA: `listing-auto-review` (lỗi im lặng → `Deferred` hai lần → Staff; lỗi rồi duyệt;
hậu kiểm chờ rồi `Passed`; output sai dạng vẫn chuyển ngay), `autofill` (Pending mới →
429, Pending bỏ dở → 503 rồi key mới chạy được), `price-assist`. **NOT RUN**: gọi NVIDIA
thật để đo lại tỉ lệ timeout sau khi thử lại; `response_format` cho mô hình ảnh.
