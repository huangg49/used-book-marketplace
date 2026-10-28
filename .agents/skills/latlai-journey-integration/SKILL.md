---
name: latlai-journey-integration
description: "Connect Lật lại Member web/RN and Staff/Admin journeys across modules: entry, current permission/state, command, result, next step, deep links and failure recovery. Use for fragmented workflows; keep SRS, contract and readiness gates authoritative."
---

# Nối một hành trình trong Lật lại

Đọc [AGENTS](../../../AGENTS.md), [SESSION_STATE](../../../docs/handoff/SESSION_STATE.md)
và [READINESS](../../../docs/handoff/READINESS.md). Dùng cùng ba skill UI theo
[UI_SKILLS](../../../docs/design/UI_SKILLS.md) và [API/Mongo](../latlai-api-mongo/SKILL.md)
khi có phần việc tương ứng. Chỉ sửa client/phần việc được giao.

1. Tìm entry thật trong menu/routes, contract và service của từng vai trò.
   Đối chiếu SRS/ADR; phân biệt yêu cầu, source đã nối và evidence đã chạy.
   Không suy RN/Flutter có parity từ web hoặc lấy checkpoint cũ làm hiện trạng.
2. Trong issue/PR hoặc báo cáo của gói, ghi bảng: **vai trò → entry/nút vào →
   điều kiện/trạng thái → command và side effect → nơi xem kết quả → bước tiếp/Back**.
   Thêm phía đang chờ, deadline và phục hồi nếu mất phản hồi. Dùng lại bảng của
   gói thay vì tạo nhiều bản trạng thái cạnh tranh; chốt owner tại giao điểm module.
3. Nối một lát cắt xuyên suốt. Link mở đúng hồ sơ bằng ID và đọc lại quyền/state,
   kể cả hồ sơ ngoài trang đầu. Menu/role không thay service, owner, phân công
   tại điểm hoặc độc lập. Không tự mở carrier/Delivered/settlement/gate để kín luồng.
4. Phân biệt cần người dùng xem, chờ đối tác/hệ thống và bị chặn. Quá hạn chờ worker
   không được nhắc thao tác cũ. Empty chỉ áp dụng phạm vi đã đọc; lỗi API, trang
   sau hoặc dữ liệu cũ không là zero. Không bịa progress, tiền hoặc khả năng client.
5. Kiểm cùng tên gọi, đúng target, query key theo identity, pagination không bỏ
   hồ sơ, refresh sau command/Back, đổi account không lộ dữ liệu cũ. Mất ACK giữ
   key/body/version; command bất định chặn quyết định ngược. Giữ input và retry.
6. Thử từ entry trong QA riêng: thành công, sai owner/role, expired/stale state,
   empty/error, trang sau, Back và trở lại sau thao tác. Quyền/phiên kiểm tại server.
   Chọn replay/race theo diff; không ghi DB chính hoặc gọi provider ngoài phạm vi.
7. Dùng [verify/handoff](../latlai-verify-handoff/SKILL.md) và [TEAMWORK](../../../docs/TEAMWORK.md).
   Ghi giới hạn: browser khác native, fixture trạng thái cuối khác nghiệm thu
   fulfillment. Người khác thử từ entry không được hướng dẫn từng nút là evidence
   UX riêng; AI/test không thay human acceptance. Phần chưa nối phải ghi cụ thể.
