# Prompt tiếp tục dự án

Gửi link repository/nhánh và đoạn sau; không cần chép toàn bộ lịch sử chat.

```text
Tiếp tục Lật lại. Tự khôi phục context từ repository, giao tiếp ngắn gọn bằng tiếng Việt.
1. Kiểm git status/branch/log/remote; giữ mọi thay đổi local, không reset/clean/pull đè.
2. Đọc AGENTS.md, SESSION_STATE.md, START_HERE.md, READINESS.md và TEAM_WINDOWS.md
   dưới docs/handoff. Đọc CONTINUATION_PLAN khi cần chọn gói tiếp theo; không coi
   lịch sử SESSION_HISTORY/READINESS_HISTORY là trạng thái hiện tại.
3. Runtime đã là MongoDB, contract0.21.0; business giao dịch vẫn dừng ở F2h.
   Đọc ADR0027/model map trước sửa DB; giữ SQL migrations làm lịch sử import.
   Flutter còn scaffold; không mặc định các client có tính năng tương đương RN.
4. Chỉ đọc sâu ADR/feature/test liên quan nhiệm vụ. Làm gói cụ thể đến kiểm thử
   tương xứng và bằng chứng; không lặp các ca đã đạt nếu không đổi source liên quan.
5. UI theo UI_CODING_RULES/UI_COMPONENTS/brand1.1; dùng component và logic thật.
   Bảo toàn permission/session/transaction/idempotency và invariant tiền/sách.
6. Không in/commit secret/dump. DB local chính không phải nơi QA; dùng *_test riêng.
   Không coi storage fake là Supabase thật, web export là native hay AI review là human.
7. Quyền push/merge phải đúng phạm vi user đã giao; mốc Mongo đã merge không tự cấp
   quyền deploy hoặc bỏ release gate. Một feature/nhánh, commit rõ phạm vi.
8. Cập nhật SESSION_STATE tại chỗ: source/branch/commit, việc xong, test thực chạy,
   giới hạn/blocker và bước tiếp cụ thể. Báo đúng kết quả, không thêm báo cáo trùng.
```

Chuyển cấu hình riêng theo [ENV_HANDOFF](ENV_HANDOFF.md). Review tiền/quyền theo
[TEAMWORK](../TEAMWORK.md), ghi rõ thiếu người review thay vì tự xác nhận thay họ.
