# Prompt gửi cho người tiếp nhận / Claude

Clone trước (không chép `.env` qua Git):

```sh
git clone --branch codex/handoff-roadmap https://github.com/huangg49/used-book-marketplace.git
cd used-book-marketplace
git log -5 --oneline
git status --short
```

Nếu đã có repo với thay đổi local, không dùng reset/clean để ép giống nhánh này.
Lưu lại công việc rồi tạo checkout riêng theo công cụ/môi trường đang dùng.

Copy đoạn dưới vào phiên đầu:

```text
Tiếp nhận dự án Lật lại trên nhánh codex/handoff-roadmap. Đọc CLAUDE.md và AGENTS.md,
docs/handoff/SESSION_STATE.md, START_HERE.md, READINESS.md, CONTINUATION_PLAN.md.

Mục tiêu: tiếp tục kế hoạch theo đúng dependency, ưu tiên React Native đẹp và dễ
dùng, giữ bản sắc Lật lại. Backend hiện F2h/OpenAPI0.20.0; không mở rộng nghiệp vụ
trước các gate bàn giao. Dùng SRS1.1 và phụ lục TP.HCM làm chuẩn, không tự đổi policy.

Việc đầu: xác minh source/môi trường và chẩn đoán A00 (Android splash ở lần mở lại
cuối), sau đó U02/U03 form đăng sách/địa chỉ và các ca native còn mở. Giữ công việc
hiện có; không làm lại gate đã đóng nếu code/rủi ro liên quan không đổi.

Vận hành theo từng gói có checkpoint: khảo sát → thực hiện → kiểm thử phù hợp →
ghi evidence/giới hạn → commit. Làm tiếp gói độc lập được phép nếu task đang chặn.
Không giả native PASS bằng web export, không gọi fixture là dữ liệu thật, không
tự ký human review. Không reset DB, sửa migration cũ, seed lại mật khẩu, xóa work
hoặc in secrets. Không bypass chặn công cụ đang có hiệu lực.

Mỗi lần sắp kết thúc cập nhật SESSION_STATE với ID gói, commit, test thực chạy,
file liên quan, blocker và đúng bước tiếp theo. Giữ nhánh main; không force push.
Đọc kỹ CONTINUATION_PLAN trước khi chọn các gói giao dịch/Exchange/ViaPoint/auction.
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
- Phản hồi UI bằng màn cụ thể/hành vi cụ thể. Các lựa chọn TP.HCM, giữ ship,
  hai điểm mô phỏng, RN trước và tiền/carrier mô phỏng đã chốt; không hỏi lại từ đầu.

Với review tiền/quyền/tranh chấp, TEAMWORK yêu cầu reviewer thứ hai. Có thể dùng
agent hỗ trợ tìm lỗi, nhưng không ghi tên/kết luận thay người review thực tế.
