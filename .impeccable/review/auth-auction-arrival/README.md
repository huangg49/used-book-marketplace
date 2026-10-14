# Login → Đấu giá: một chuyển cảnh — 13/10/2026

Nhánh `codex/auction-stage-curtains`, base `a2e3e4c`.
Subject: `fix(web): skip auction curtains after successful login`.

Chủ dự án duyệt: Login trả về Đấu giá chỉ chạy hiệu ứng giấy; vào từ navbar hoặc
truy cập/tải lại trực tiếp vẫn mở rèm bình thường. Không đổi art, nhịp giấy/rèm,
API/session hoặc Hero. Không có flag trong URL, history hoặc storage.

PaperArrivalContext báo destination đã commit trong journey. AuctionEntrance lưu
quyết định lúc mount, nên không tạo portal/renderer hoặc tải ảnh rèm sau Login,
kể cả khi paper overlay đã bị gỡ. Route mount mới lấy quyết định mới. Focus H1,
cleanup và technical fallback của paper được giữ.

## Kiểm chứng

- Node24.19.0, pnpm11.19.0; lint PASS không warning;143unit PASS;
  build gồm TypeScript PASS, giữ warning bundle>500kB.
- `node apps/user-web/tests/auth-auction-arrival.mjs`: PASS;
  Chromium1366×768/390×844 với reduced preference, app React StrictMode thật,
  identity Login giả lập và tất cả API bị intercept, không API/DB/bucket thật.
- 401 giữ draft và không paper; success có paper, không curtain node suốt journey,
  không request ảnh rèm; query/hash giữ; hết inert/scroll lock và focus H1.
  Filter sau paper không mở rèm. Rời sang Home rồi desktop/mobile navbar vào lại
  có state opening; reload cũng có opening. [Runtime](runtime.json), pageErrors0.
- Test navigation ban đầu chọn menu trước khi React commit trang Home, bị timeout;
  sửa harness chờ heading Home và chọn đúng navigation desktop/mobile. Không đổi
  implementation để che lỗi. Run cuối PASS trên cả hai viewport.
- Một detector trên3source UI trả0findings. Sau đó lint cảnh báo ref render đã
  được sửa bằng state giữ quyết định mount; lint/build và browser regression chạy
  lại trên source cuối PASS. Không rescan detector.
- IAB actuallocalhost5174 trực tiếp /auctions có WebGL+WebGL/time finished,
  duration1385; error state API unavailable vẫn dùng được. Tab QA đã đóng.

Ảnh [desktop](desktop.png), [mobile](mobile.png) có nhãn Login giả lập/không DB.
Mobile đang ở kệ sau thao tác checkbox, không là ảnh toàn bộ Hero.
Ảnh tĩnh chứng minh trang đích; assertions runtime mới chứng minh absence của rèm.

Live authentication, physical phone/Safari/native/speech/FPS: NOT RUN.
Không đổi READINESS, không push/merge/deploy, giữ nguyên WIP API teammate.
