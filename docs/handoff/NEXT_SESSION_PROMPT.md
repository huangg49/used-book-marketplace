# Prompt gửi cho người tiếp nhận / Claude

Clone trước (không chép `.env` qua Git):

```sh
git clone --branch main https://github.com/huangg49/used-book-marketplace.git
cd used-book-marketplace
git log -5 --oneline
git status --short
```

Nếu đã có repo với thay đổi local, không dùng reset/clean để ép giống nhánh này.
Lưu lại công việc rồi tạo checkout riêng theo công cụ/môi trường đang dùng.

Copy đoạn dưới vào phiên đầu:

```text
Bạn tiếp nhận dự án Lật lại từ main và triển khai cuốn chiếu với tiêu chuẩn cao
nhất. Hãy thực hiện công việc, không dừng ở đề xuất kế hoạch hoặc hỏi “có làm tiếp
không?” sau mỗi bước thông thường. Không cần hoàn thành toàn roadmap trong một
phiên; cần hoàn thành từng gói đúng dependency, có bằng chứng và điểm lưu rõ ràng.

1. Khởi động bằng git status/log và đọc CLAUDE.md, AGENTS.md, docs/handoff/
SESSION_STATE.md, START_HERE.md, READINESS.md, CONTINUATION_PLAN.md, ENV_HANDOFF.md.
Đối chiếu tài liệu với source và trạng thái thực tế, giữ nguyên công việc local
của người khác. Chỉ đọc thêm ADR/feature report/test cần cho gói đang làm.

2. Mục tiêu ưu tiên: React Native thật đẹp, dễ thao tác, mang bản sắc Lật lại;
cùng lúc giữ đúng nghiệp vụ, dữ liệu, tiền và quyền. Backend đang F2h/OpenAPI
0.20.0. TP.HCM, direct shipping còn giữ, hai điểm mô phỏng, tiền/carrier mô phỏng.
Dùng SRS1.1 và LOCAL_HANDOVER_AUCTION làm chuẩn; không tự thay policy hoặc coi
workflow planned là implemented. Merge nguồn vào main không có nghĩa đã nghiệm
thu native, đóng review hoặc hoàn tất mua sách.

3. Chọn gói đầu tiên có dependency đã đáp ứng theo điểm lưu mới nhất. Main ca16a22
đã có A00 và U02–U06; không tự mở lại các gói đó. Lượt Pixel_7 sau merge đang
bổ sung Q01 và xử lý picker sau đổi cỡ chữ OS (Q01-F01); xem trạng thái cuối ở
SESSION_STATE và Q01_NATIVE_COMPLETION_2026_09_29. Nếu Android không vào app,
xác minh cấu hình/Metro/bundle trước khi sửa; không giả tạo fix cho lỗi môi trường.
Đóng ca native còn mở và giữ các gate human review, không lặp phần đã PASS khi
không có thay đổi liên quan. Kiểm branch/status vì điểm lưu local có thể chưa push.

4. Chu trình cho mỗi gói: khảo sát hiện trạng → nêu vấn đề và invariant cần giữ
ngắn gọn → triển khai một lát cắt hoàn chỉnh → chạy focused tests và gate liên
quan → xem UI render/thao tác thật nếu là UI → sửa lỗi → cập nhật evidence và
tài liệu → commit trên nhánh feature → chọn gói tiếp theo được mở. Không kết thúc
phiên chỉ vì xong một bước nhỏ nếu còn việc độc lập, đủ thông tin và đủ tài nguyên.
Không tự push/merge/deploy trong các phiên sau nếu chưa có ủy quyền cho hành động đó.

5. UI: đọc UI_CODING_RULES, UI_COMPONENTS và brand v1.1. Dùng core/ui, bố cục
mobile, vùng chạm/keyboard/safe area, ảnh và nội dung có ý nghĩa. Giữ nền giấy,
chữ rừng, Lora/Be Vietnam Pro, dấu cam tiết chế. Không card/gradient vô cớ, rating
giả, trust badge giả, nút chết hoặc khẩu hiệu che tác vụ. Luôn xem loading/empty/
error/offline, tên dài, ảnh thiếu, chữ lớn, Back, focus và nội dung nhập sau lỗi.
Fixture có nhãn và tách riêng; cải tiến presentation phải áp dụng được vào app thật.

6. Logic: giữ session owner/transport/TanStack Query hiện có. Không thêm token
store. Giữ expectedVersion, key/body khi retry mất ack, dirty guard và cache theo
user. Contract-first, generate types; migration mới có review; transaction,
lock order và shared command executor giữ nguyên invariant. Không reset DB,
db push, sửa migration cũ, seed lại mật khẩu, UPDATE balance hoặc disable test.
Auth/tiền/transaction phải có negative/race/replay/rollback phù hợp trên DB _test.

7. Sau M1 và các gate, đi tiếp theo CONTINUATION_PLAN: thiết kế Delivered/receipt/
inspection/claim/settlement → backend hoàn chỉnh → ví/Order read-only, simulator,
checkout và fulfillment UI/ops → Exchange → ViaPoint → auction. Đọc kỹ dependency
từng gói; không mở checkout bán hoàn chỉnh khi đường lỗi/tiền/custody còn thiếu.
Auto auction có trần, không tự tăng vô hạn. Ưu tiên hoàn chỉnh một luồng hơn nhiều
màn đẹp chưa hoạt động. Mốc main hiện tại không miễn human review cho thay đổi sau.

8. Tự xử lý lựa chọn kỹ thuật thông thường trong phạm vi và ghi tradeoff. Chỉ hỏi
khi thiếu quyết định nghiệp vụ/quyền truy cập bắt buộc, hành động phá hủy hoặc
thay đổi dịch vụ/chi phí ngoài phạm vi. Nếu task bị chặn, ghi rõ lý do và chuyển
sang task độc lập được mở. Không bypass chặn công cụ; không suy PASS từ im lặng.
Không biến blocker thành làm lại toàn bộ test hoặc viết tài liệu vòng quanh.

9. Bằng chứng phải đúng môi trường: Expo web export không là Android build;
storage fake không là live Supabase; AI tự review không là reviewer độc lập.
Không in/commit .env, key, token, request body hoặc PII. File env nhận riêng phải
đặt đúng chỗ, chỉnh URL/port theo máy mới; chỉ báo tên biến thiếu, không báo giá trị.

10. Cuối mỗi gói và trước khi context/credit thấp: cập nhật SESSION_STATE với ID,
branch/SHA, file đã đổi, lệnh test thực chạy/kết quả, evidence, giới hạn, working
tree chưa commit, blocker và đúng một bước tiếp theo. Khi tiếp tục phiên mới,
đọc điểm lưu rồi đi tiếp; không bắt đầu lại từ đầu. Báo kết quả ngắn gọn, nói rõ
đã làm/chưa làm, không tuyên bố toàn bộ dự án production-ready từ test xanh.
```

Không cần đưa toàn bộ lịch sử chat vào agent. Mỗi task chuyên biệt đọc tiếp ADR,
feature report và tests liên quan. Kế hoạch có nhiều gói không phải yêu cầu một
agent tự merge tất cả trong một phiên.

## Mẫu cuối mỗi phiên

```text
Ngày / branch / source SHA:
Gói đang làm / dependency đã đóng:
Đã đổi gì, vì sao (files):
Kiểm thử thực chạy: lệnh | kết quả | runtime/provider | evidence
Không chạy / giới hạn và lý do:
Working tree còn gì chưa commit:
Commit local / remote SHA nếu đã push được phép:
Blocker / quyết định cần người phụ trách:
Bước tiếp theo (ID + file/command đầu tiên):
Process cần giữ/dừng, chỉ metadata không secrets:
```

## Người chủ dự án chỉ cần gửi gì

- Link nhánh bàn giao và tài liệu này; giao vai trò owner/reviewer cho team.
- Thông tin môi trường cần thiết qua kênh riêng: không gửi key trong prompt hoặc commit.
  Xem danh sách chính xác và cách thay cấu hình máy ở [ENV_HANDOFF](ENV_HANDOFF.md).
- Phản hồi UI bằng màn cụ thể/hành vi cụ thể. Các lựa chọn TP.HCM, giữ ship,
  hai điểm mô phỏng, RN trước và tiền/carrier mô phỏng đã chốt; không hỏi lại từ đầu.

Với review tiền/quyền/tranh chấp, TEAMWORK yêu cầu reviewer thứ hai. Có thể dùng
agent hỗ trợ tìm lỗi, nhưng không ghi tên/kết luận thay người review thực tế.
