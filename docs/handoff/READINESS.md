# Gate bàn giao và release — 30/09/2026

MongoDB đã tích hợp vào main tại1be5144, cutover local đã xong. Mốc này đủ làm nền
phát triển cho nhóm; chưa là nghiệm thu toàn bộ sản phẩm. Việc đang làm xem
[SESSION_STATE](SESSION_STATE.md), setup xem [TEAM_WINDOWS](TEAM_WINDOWS.md).

| Gate | Trạng thái hiện tại | Bằng chứng / giới hạn |
| --- | --- | --- |
| Runtime Mongo và tích hợp | PASS phạm vi PR5 | [PR5](https://github.com/huangg49/used-book-marketplace/pull/5):5 nhóm CI xanh trên head7587983; hai P1 đã sửa |
| Dữ liệu máy chủ dự án | DONE local | [Cutover/restore](LOCAL_MONGO_CUTOVER_2026_09_30.md); nguồn PG giữ nguyên, chưa deploy ngoài máy |
| Hướng dẫn nhận dự án | READY hướng dẫn | [Windows](TEAM_WINDOWS.md), [setup](START_HERE.md); mỗi teammate vẫn cần chạy trên máy mình |
| Native Android | PARTIAL | [Q01](Q01_NATIVE_COMPLETION_2026_09_29.md), [upload Mongo](../refactor/MONGODB_NATIVE_UPLOAD_2026_09_29.md), [finalize/submit retry](NATIVE_ACK_2026_09_30.md); không mở lại ca đã đóng nếu source không đổi |
| TalkBack / ARM / iOS | OPEN | Chưa nghiệm thu tương ứng; hierarchy/web export không thay được native/audio |
| Review tiền/quyền và UX người thật | OPEN | [Review độc lập](INDEPENDENT_REVIEW.md); chưa có người phụ trách, AI review không thay ký nhận |
| Tag release / nghiệp vụ sau F2h | BLOCKED bởi gate còn mở | Chưa mở Delivered/inspection/settlement; [kế hoạch](CONTINUATION_PLAN.md) không tự cấp quyền bỏ gate |

Live storage có bằng chứng riêng: [listing/packaging Mongo](../refactor/MONGODB_LIVE_MEDIA_2026_09_29.md).
Browser fixture dùng storage fake vẫn chỉ là bằng chứng browser; không cộng thành
Supabase thật. Test xanh không chứng minh mọi dòng code không có lỗi.

Checklist và cập nhật28–30/09 được giữ nguyên ở
[READINESS_HISTORY](READINESS_HISTORY_2026_09_30.md). Các checkbox/số test trong đó
thuộc mốc nguồn được ghi. Không nối thêm bản tóm tắt cũ vào đầu file hiện tại;
cập nhật bảng gate này và dẫn báo cáo cụ thể khi có thay đổi.
