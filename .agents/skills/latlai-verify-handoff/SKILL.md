---
name: latlai-verify-handoff
description: "Verify and hand off a completed Lật lại change or review a PR, selecting checks from its actual diff and recording evidence, remaining gates and the next action."
---

# Kiểm chứng và bàn giao thay đổi

1. Đọc [AGENTS](../../../AGENTS.md). Kiểm git status/diff, branch/base và commit
   thực tế; phân biệt thay đổi của nhiệm vụ với local work của teammate. Đọc issue
   hoặc yêu cầu để đối chiếu acceptance, không tự chọn thêm feature.
2. Chọn kiểm tra từ [ma trận](../../../docs/AI_WORKFLOW.md#kiểm-tra-theo-thay-đổi).
   Docs-only không cần API/native lại; quyền/session/tiền cần đường lỗi/race tương
   ứng. Đổi component/session/contract chung thì kiểm consumer bị ảnh hưởng.
   Gate đã đóng chỉ mở lại khi thay đổi liên quan hoặc có bằng chứng lỗi mới.
3. Chạy checks được chọn và kiểm kết quả/exit code. Phân biệt PASS, FAIL, NOT RUN,
   BLOCKED và ca bị skip. Không sửa test để hợp thức hóa sai nghiệp vụ. Dùng QA
   riêng theo START_HERE, không xóa hoặc seed DB local chính.
4. Có UI thay đổi thì xem/thao tác nền tảng thực tế và ghi source, thiết bị/browser,
   ca đã thử. Browser fixture/storage fake, Supabase thật, web export và Android
   build là các bằng chứng khác nhau. Chỉ đóng gate tương ứng evidence.
5. Đọc lại diff: phạm vi, dữ liệu riêng/secret, generated contract, migration cũ,
   câu báo thành công và tài liệu đã lỗi thời. Chạy `pnpm docs:check` khi sửa docs/
   instruction và `git diff --check`. Giữ kết quả kiểm tra ngắn trong PR hoặc báo cáo
   đã có; không tạo nhiều bản tóm tắt cùng một sự kiện.
6. Cập nhật điểm lưu theo [quy tắc làm nhóm](../../../docs/AI_WORKFLOW.md#điểm-lưu-khi-nhiều-người-cùng-làm):
   việc xong, branch/base/commit (hoặc subject nếu đang tạo commit chứa điểm lưu),
   checks thực chạy, blocker và bước tiếp. Chỉ cập nhật READINESS nếu gate đổi.
7. Commit đúng phạm vi; push/tạo PR/merge/deploy chỉ trong quyền đã giao cho gói này.
   Không hỏi lại quyền đã rõ và không suy quyền từ lần merge cũ. Nếu review được
   yêu cầu, áp dụng [TEAMWORK](../../../docs/TEAMWORK.md); AI review không thay chữ
   ký người thật. Không tự đánh dấu branch protection/remote CI đã đạt khi chưa kiểm.

Dùng [mẫu PR](../../../.github/pull_request_template.md). Kết quả cuối nêu thay đổi,
test/evidence thực chạy, giới hạn và bước tiếp cụ thể. Không nói “hết bug”, “native
PASS” hoặc “đã lên main” khi bằng chứng chỉ hỗ trợ một phạm vi nhỏ hơn.
