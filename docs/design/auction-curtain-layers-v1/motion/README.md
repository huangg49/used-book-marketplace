# Bản thử chuyển động rèm — bước chờ duyệt

Ngày 13/10/2026, branch `codex/auction-stage-curtains`, sau `f501b3e`.
Checkpoint ban đầu: `7412b84`; chỉnh nhịp sau phản hồi chủ dự án:
`ee93e06`. Chỉnh điểm treo chi tiết: `docs(web): attach curtain ornaments to supporting layers`.
Chủ dự án đã duyệt motion/điểm treo tại8c0afdb và bước tích hợp13/10/2026.
Thư mục này giữ bản thử có controls để đối chiếu; runtime `apps/user-web` đã copy
rig/PNG tại checkpoint đó. Runtime sau đó có biến thể SIDE_WIDTH0,8 theo yêu cầu
gom hai bên gọn hơn; preview này giữ dáng rộng đã duyệt để đối chiếu. [Bản tích hợp](../../../../.impeccable/review/auction-entrance/README.md)
ghi lifecycle và acceptance riêng; bản thử không tự chứng nhận tích hợp sản phẩm.

## Xem bản thử

Mở [index.html](index.html) qua server HTTP của thư mục cha:
`http://127.0.0.1:5191/motion/`. ES modules và manifest cần HTTP; mở `file://`
không phải đường chạy hỗ trợ. Server chỉ phục vụ file art/preview local, không API.

Phát lại, tạm dừng/tiếp tục, tốc độ 1×/0,5×/0,25×, thanh kéo thời gian,
5 mốc pose, giữ khung sau khi gom và 4 slot navbar mẫu. Navbar/nội dung sau rèm
là vùng kiểm tra có nhãn; không phải dữ liệu auction hay navbar sản phẩm.
Mở rộng mục đối chiếu để xem hai mốc hình đã được duyệt.

## Chuỗi đã dựng

| Thời gian | Chuyển động |
| --- | --- |
| 0–120 ms | Rèm đóng với mép chồng nhau |
| 120–1670 ms | Phía trên mở trước, phía dưới chậm tối đa210ms; thân vải đổi độ cong/nếp |
| 1350–2200 ms | Nhịp kéo giảm tốc nối với nhịp lắng; phần trên ổn định trước gấu rèm |
| 2200–2540 ms | Tua lắng xong ở2480ms; có thể giữ frame để duyệt |
| 2540–3000 ms | Toàn bộ khung rèm nhường chỗ cho vùng trang |

Thời gian là nhịp đã dựng cho bản thử Lật Lại, không nhận là số đo source của Genshin.
Sau phản hồi đoạn trở vào giả: bỏ spring bật toàn thân, giảm quãng thu quá từ
134–160px xuống12–54px tùy độ cao. Recovery nhẹ, đơn điệu, nối vào cuối nhịp kéo;
gấu theo sau phần gom phía trên. Nếp/shear giảm theo năng lượng từng vùng thay vì
dao động đến cuối. Dây/tua giảm biên độ và tần số. Đây là rig được tác giả điều
khiển, không nhận là mô phỏng vật lý vải hoặc tái tạo source Genshin.

## Cách dựng liên tục

[model.mjs](model.mjs) định nghĩa hình học theo thời gian tuyệt đối, không tích phân
dựa trên số frame. Kéo thanh thời gian, phát lại và đổi tốc độ đều dùng cùng rig.
Mép, độ rộng nếp, shear thân và độ nâng góc dưới biến đổi liên tục. Dáng ổn định
tham chiếu silhouette layer mở đã duyệt; không thay PNG giữa chừng hay crossfade
từ ảnh đóng sang ảnh mở. Vì một texture thân đi xuyên suốt chuyển động, nếp gấp
ở mốc cuối có thể khác nhẹ ảnh mở tĩnh; đó là phần cần người dùng duyệt.

[renderer.mjs](renderer.mjs) dùng mesh 24×48 cho mỗi nửa rèm, vẽ PNG thân đã duyệt
qua WebGL; có mesh riêng cho rèm ngoài. Không thêm dependency/framework.
Viền vàng được vẽ cùng vật liệu mỗi nửa và đi cùng thứ tự che phủ; không là SVG
đè lên mọi lớp, nên viền phía sau không xuyên qua nửa rèm phía trước khi chồng nhau.
Màu lót wine đi cùng chính mesh đó để alpha trong texture không làm hở nội dung.

Diềm, họa tiết, dây và tua vẫn là layer DOM riêng theo manifest; dây đi cùng vùng
gom của rèm ngoài, tua có góc lệch/độ trễ riêng. Navbar mẫu giữ slot trước/sau.
Khung fade trên parent sau khi ổn định. Không lặp vô hạn hoặc thêm âm thanh.

Sau phản hồi chi tiết treo rời: [attachments.mjs](../attachments.mjs) đo điểm treo
trên mép vàng PNG hiện có, giữ2px overlap. Hai họa tiết phía trong theo diềm trước
(y31,26/31,8 thay y58, z51 thay42); hai họa tiết ngoài theo diềm sau; chi tiết giữa
theo diềm trước. Mỗi họa tiết dùng cùng offset với lớp đỡ và xoay tại điểm treo.
Dây/tua dùng cùng điểm trên mesh rèm ngoài, tua chạm nút dây ởy544. Sprite dây
có mảnh generated rời dưới nút: clip46% phía dưới trong composition, không sửa
PNG nguồn. Preview tĩnh/manifest/export helper dùng cùng hàm để tránh sai lệch.

WebGL textures dùng LINEAR/CLAMP_TO_EDGE cho kích thước ảnh không phải lũy thừa2;
buffer vertex được cập nhật, indices/texture tạo một lần. Tham khảo primary docs:
[MDN textures](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL),
[bufferSubData](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferSubData),
[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
Raster canvas giới hạn DPR1,5 và rộng1500px; không bật preserveDrawingBuffer.

Fallback Canvas2D dùng cùng rig, grid12×28 và ánh xạ affine từng tam giác;
phần clip có overlap nhỏ để tránh đường nối. Có thể mở `?renderer=canvas` để xem.
Context loss chuyển sang fallback tại cùng thời điểm, không phát lại từ đầu.
Fallback kỹ thuật không là bằng chứng hiệu năng tương đương WebGL.

## Lifecycle và policy motion

Một RAF điều khiển timeline; dừng ở cuối, khi offscreen hoặc document hidden.
Resize cập nhật backing resolution/scale, không reset thời gian. pagehide cleanup
RAF, observer, buffer/texture/program; BFCache pause rồi giữ pose khi quay lại.
Replay/seek reset timestamp để không kéo phần thời gian cũ sang lần phát tiếp.
Nút giữ frame dừng đúng2480ms, không kéo dài vòng lặp.

Giữ đủ chuỗi khi `prefers-reduced-motion` theo policy chủ dự án, không sửa setting máy.
Bản preview không có CSS chung của app; override phạm vi component là việc ở bước
tích hợp. Có kiểm preference bằng browser emulation, không suy thành nghiệm thu app.

## Kiểm chứng và giới hạn

[model.test.mjs](model.test.mjs): 6 test hình học PASS, gồm overlap đóng, top/bottom lag,
overpull/return, mesh hữu hạn không lật, liên tục ở boundary và kết thúc hữu hạn.
Có thêm giới hạn recovery<55px/không bật ra lần hai/gấu chậm hơn phần gom trên.
Có kiểm điểm treo theo hem/gather qua toàn timeline và z của họa tiết. Dùng epsilon
1e-9 cho sai số cộng float sau assertion strict ban đầu lệch4e-15; không nới theo pixel.
Không nhận các invariant này là đánh giá thẩm mỹ chuyển động.

[evidence/checks.json](evidence/checks.json): Chromium1440×1080,390×844 và video1280×950.
8 pose captures; tương phản nền khi đóng0pixel đổi; scrub quay về1780ms0pixel đổi;
pause/replay/speed/hold/keyboard/navbar/offscreen PASS; không tràn mobile hoặc lỗi JS.
Chuỗi đủ3000ms khi reduced preference; Canvas fallback và context loss giữ thời gian PASS.
[opening.webm](evidence/opening.webm) là bản quay local của chuỗi, có cả UI duyệt.

Hiệu năng **chưa đạt gate60FPS trên thiết bị thật**. Headless không quay video:
median frame interval16,7ms/p9533,4ms; phần drawJS median1,3ms/p951,6ms. Khi quay:
median33,3ms/p9533,4ms. Đây là số đo của phiên kiểm local, không chứng minh nguyên nhân
độ trễ, hardware rendering trong IAB, hoặc máy/mobile của người dùng chạy tương tự.
Không gọi video là bằng chứng chuyển động mượt60FPS.
Verifier lượt đầu dừng ở assertion thời gian slow: đo qua hai lệnh protocol/click
làm lẫn độ trễ điều khiển với thời gian playback. Đổi sang đo clock/pause trong
cùng browser task và so với elapsed thực ở0,5×; lượt xác nhận PASS. Không bỏ ca.

Đã mở/thử Phát lại trong IAB, xác nhận timeline chạy và browser dùng WebGL.
Lượt chỉnh điểm treo: preview art desktop/mobile/control PASS, các capture/video
đã cập nhật. [attachment-detail.png](evidence/attachment-detail.png) là crop mép
diềm để người dùng duyệt điểm nối; không là bằng chứng cho toàn bộ animation.
Không dùng bài kiểm CLI để can thiệp tab YouTube hay tab của người dùng.
Physical phone, Safari, native, app route/Back/query/API và art sign-off motion: NOT RUN.
App source/READINESS/WIP API teammate giữ nguyên. Không push/merge/deploy.

Chạy kiểm model bằng `node --test model.test.mjs`. Browser verifier `verify.cjs`
cần Playwright+sharp qua `CURTAIN_PLAYWRIGHT_PATH`/`CURTAIN_SHARP_PATH` nếu module
không resolve thông thường; chỉ phục vụ preview này, không ghi DB/bucket.

Bước tiếp theo: duyệt bản tích hợp toàn trang `/auctions`. Model/renderer và art
giữ checkpoint đã duyệt; acceptance app/lifecycle được ghi riêng, không suy từ
verification preview. Các mục NOT RUN ở trên thuộc phạm vi preview này.
