# Auth: ba tờ giấy nguyên vẹn bay theo gió — nghiên cứu13/10/2026

Trạng thái14/10/2026: chủ dự án đã duyệt [toàn chuỗi Auth](../../.impeccable/review/auth-wind-journey/README.md) tại `5de3a4e` và giao tích hợp làm hiệu ứng Login chính. Production hiện dùng cùng source ba tờ nguyên vẹn với preview: dấu280ms → bay1152ms, đường bay/độ uốn riêng, mảnh nhỏ cũ; giấy ngoài che/mở trang đích, breeze phủ viewport rồi tan nominal2500ms. Không gust trước bay, không xé, không phóng form. Chỉ bắt đầu sau Login API thành công; chờ mount thật của trang đích trước release. [Documentation production](../../.impeccable/review/auth-wind-production/documentation.md) ghi source, evidence và giới hạn; verdict AI chấm lỗi P2 đồng bộ dấu đã resolved, `ship` đúng phạm vi lỗi đó. Human review, live Auth/Safari/native/FPS và remote CI chưa là PASS; READINESS không đổi.

Các khảo sát, thử nghiệm và đề xuất bên dưới là lịch sử trước quyết định này. Motion một tờ `f8a095b` được chấp nhận tạm; [xấp `54ba953`](../../.impeccable/review/auth-wind-stack/README.md) bị từ chối vì ba tờ bay giống nhau. Sau [ba chuyển động riêng](../../.impeccable/review/auth-wind-distinct/README.md), [nhịp gust rút80%](../../.impeccable/review/auth-wind-immediate/README.md) vẫn bị nhận xét giả. Chủ dự án chọn [chỉ bay](../../.impeccable/review/auth-wind-flight/README.md), rồi [dấu+bay](../../.impeccable/review/auth-wind-stamp/README.md), [mảnh nhỏ](../../.impeccable/review/auth-wind-fragments/README.md) và toàn chuỗi. Preview có clock4700ms cố định; production thêm latency chuẩn bị/mount thật. Giữ các trial để đối chiếu, không coi storyboard/gust/cloth đề xuất dưới đây là recipe production mới.
Source khảo sát: `codex/login-breeze-step1`, head `7d838f0`, visual tại `486d3cd`.
Chủ dự án muốn bỏ xé giấy; ba tờ trong xấp được gió nâng/phất, rồi cuốn đi,
giữ không khí sách cũ, bồ công anh và ánh vàng. Quy trình vẫn từng bước để duyệt.

## Kết luận

Khả thi. Đề xuất thử **lưới giấy WebGL + bộ điều khiển độ cong/quán tính có chủ đích**.
Three.js là ứng viên renderer cho prototype; không cần React Three Fiber hoặc đổi
framework. Chốt renderer/dependency sau thử độ đúng của tờ form và chi phí thực tế.
Full cloth simulation/WebGPU là nhánh nghiên cứu phụ, không là điều kiện chạy Login.

## Khảo sát lại ba tờ — 14/10/2026

Reference chủ dự án gửi: [Flying Paper Animation — Jafar Fazel](https://www.youtube.com/watch?v=lazj6wFnLkw),
31/05/2023. Đã mở bằng IAB, soi các frame đoạn0–3s, phần CC Cylinder và
Wave Warp; đọc transcript auto-generated toàn bài, đối chiếu các chương.
Web fetch YouTube lỗi; browser xem được. Trang project MotionGuru fetch lỗi,
không tải/chạy project AE, không suy rằng đã kiểm được nội dung project.

### Những gì reference thực sự dạy

- [0:57–2:05](https://www.youtube.com/watch?v=lazj6wFnLkw&t=57s): dựng đường
  bay cong và chỉnh đồ thị tốc độ, có đoạn chậm rồi tăng tốc ra khỏi cảnh.
- [2:11–4:00](https://www.youtube.com/watch?v=lazj6wFnLkw&t=131s): CC Cylinder
  với bán kính lớn tạo độ uốn rộng, kết hợp xoay trên các trục.
- [4:07–5:09](https://www.youtube.com/watch?v=lazj6wFnLkw&t=247s): giảm shading
  mặc định; thêm Wave Warp cho dao động nhỏ hơn độ uốn chính.
- [5:52–6:08](https://www.youtube.com/watch?v=lazj6wFnLkw&t=352s): cùng kỹ thuật
  cho ba tờ, nhưng đổi đường bay và rotation riêng từng tờ.

Frame đầu cho thấy các tờ có silhouette và hướng nghiêng khác nhau trong cùng
một thời điểm. Reference là motion được tác giả dựng, không chứng minh mô phỏng
khí động học. Áp dụng nguyên lý, không sao chép thông số AE theo pixel sang mesh.
[Adobe Wave Warp](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/distort-effects.html)
phân biệt wave height/width/direction/speed/phase/pinning; đây là lớp dao động
có thể kiểm soát, không thay quỹ đạo và chuyển động xoay toàn thân.

### Vì sao bản `54ba953` thất bại về cảm giác

Đối chiếu [stack.mjs](../../apps/user-web/previews/auth-wind/stack.mjs) và
[paper.mjs](../../apps/user-web/previews/auth-wind/paper.mjs):

1. Cả ba gọi cùng `actor.render(local)`; chỉ delay156/312ms, góc nghỉ và fan
   offset khác nhau. Wave, release, rotation và hướng exit vẫn là cùng hàm.
   Khi bù delay, ba tờ tái hiện cùng một chuyển động; stagger không tạo cá tính.
2. Đường bay chính là dịch lên/phải theo cùng `leave ** 3`; chưa có đường cong
   và nhịp tốc độ riêng cho từng actor. Rear tail chỉ giúp ra khỏi viewport.
3. Depth guard ép các bbox vào ba slab liên tiếp mỗi frame. Nó ngăn xuyên
   về mặt kỹ thuật nhưng không mô tả va chạm; correction có thể tạo dịch sâu
   không gắn với chuyển động đã dựng. Chưa có kiểm tra tính liên tục của nó.
4. Test hiện tại chứng minh count/rest/exit/lifecycle, không chứng minh motion
   đẹp hoặc giống gió. Kết quả PASS giữ làm evidence kỹ thuật lịch sử; visual
   approval của xấp đã bị từ chối, không được tiếp tục tích hợp từ bản này.

### Hướng dựng thay thế đề xuất

Giữ renderer/snapshot/hai mặt/controls và đúng ba tờ Auth. Tách ba phần riêng:
đường bay3D, hướng xoay thân, độ uốn cộng sóng nhỏ. Mỗi actor có dữ liệu riêng
cho cả ba phần; chung một hướng gió và envelope cơn gió, không dùng random
mỗi frame. Cùng clock không có nghĩa ba tờ phải xoay, uốn hay rời xấp giống nhau.

| Tờ | Đường bay đề xuất | Xoay và uốn đề xuất |
| --- | --- | --- |
| Form phía trước | Rời xấp trước; trôi chéo lên/phải, qua cung vừa rồi tăng tốc đi | Nghiêng vừa, uốn rộng; tránh lật liên tục để vẫn nhận ra tờ form |
| Giữa | Ra cạnh xấp khi tờ trước đã tách; cung ngang rộng hơn rồi nâng lên | Roll khác tờ trước, một lần đổi góc thấy mặt sau; trục uốn lệch chéo |
| Sau | Giữ lại ngắn, chao xuống nhẹ rồi được kéo lên/phải theo luồng chung | Góc đón gió khác hai tờ trước, curvature trở lại mềm hơn trước exit |

Đây là storyboard đề xuất, chưa là thông số đã duyệt hoặc mô phỏng vật lý.
Không chọn ba hướng bay đối nghịch chỉ để tạo khác biệt. Bóng mềm là điểm hỗ
trợ khoảng cách lúc tách, không dùng bóng/glow che việc ba tờ vẫn cùng pose.

Kỹ thuật trong preview Three hiện có đủ cho lượt thử tiếp: spline/Bézier cho
vị trí, đường thời gian tốc độ độc lập, orientation keyframes và uốn mesh theo
cung. [CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html) và
[Quaternion](https://threejs.org/docs/pages/Quaternion.html) hỗ trợ các phần đó;
chúng không tự tạo cảm giác giấy hay giải quyết collision. Không cần thêm
framework, AE runtime hay solver cloth để thử storyboard này.

Uốn chủ đạo phải là cung rộng thay đổi theo góc đón gió; sóng nhỏ theo sau,
giảm sau cơn gust. Giữ tích phân chiều dài dải, tránh gập nửa thân như bản
`106499a`, tránh nhiều sóng lớn làm giấy thành vải. Quỹ đạo/hướng xoay có vị
trí và vận tốc nối liên tục; không đạt non-intersection bằng cách đẩy sâu
đột ngột mỗi frame. Dựng khoảng cách giữa ba đường trước, kiểm mesh giao nhau
trong lượt QA; giới hạn vùng gần xấp nếu cần, không nhận bbox guard là solver.

### Bước tiếp và điều kiện xem lại

Chỉ thay motion trong preview ba tờ, giữ entry một tờ để đối chiếu. Dựng
đường/hướng thân trước, rồi thêm độ cong và gust; trình bản ba tờ cho chủ dự
án duyệt trước external cover/breeze hoặc Login success. Tờ form bay tự
nhiên, không phóng lớn làm màn che. Các trang ngoài vẫn chịu trách nhiệm cover.

Xem cả tốc độ thật và slow: có thể theo dõi từng tờ qua lúc tách/đổi mặt/exit;
silhouette và đường đi khác nhau sau khi bù delay, nhưng vẫn cùng cơn gió.
Không xuyên/teleport/đổi vận tốc đột ngột; không fade giữa viewport để giấu
exit. Sau đó kiểm lại rest/replay/scrub/mobile/resize/hidden/context loss.
Chưa chốt duration mới; không rút/gia hạn2.4s để chữa việc actor giống nhau.
Ưu tiên cảm giác chuyển động được duyệt, tách rõ khỏi các test kỹ thuật.

Lượt14/10 chỉ cập nhật research/status, không đổi code, dependency hoặc asset.
`pnpm docs:check` PASS377Markdown/2541link/4skill pairs; có engine warning
Node24.12.0 thấp hơn yêu cầu24.15.0. `git diff --check` PASS. Không chạy lại
browser/product tests vì runtime chưa sửa; không nhận các test cũ là duyệt motion.

Điểm quyết định là mép giấy đi trước thân, giấy giữ chiều dài khi cong, mặt sau
hiện đúng lúc nghiêng, ba tờ lệch nhịp nhưng cùng luồng gió và chuyển cảnh không
khựng khi React mount trang đích. Thư viện tween không tự giải quyết các điểm này.

## Những gì code hiện có thực sự làm

- [AuthLayout](../../apps/user-web/src/layouts/AuthLayout.tsx): một xấp ba lớp ở
  trạng thái nghỉ: front form, middleSheet, backSheet. Hai lớp sau là DOM phẳng,
  không phải mô hình giấy có quán tính. Front có mặt reverse để đổi Auth sheet.
- [Auth CSS](../../apps/user-web/src/layouts/AuthLayout.module.css): perspective
  hiện chỉ bật khi shuffle; front ở rest phẳng để chữ sắc. Có sẵn texture giấy,
  màu hai tờ sau và chữ mặt sau, nên prototype có thể dùng đúng visual hiện tại.
- [PaperStormLayout](../../apps/user-web/src/components/auth/PaperStormLayout.tsx)
  clone front thành hai nửa; [paper-scene](../../apps/user-web/src/components/auth/paper-scene.ts)
  tạo riêng ba trang phủ và30desktop/18mobile mảnh giấy. Để đúng ý mới, phải bỏ
  halves/tear fragments và cho đúng ba actor đi xuyên suốt từ stack tới exit.
- Coverage paint → navigate → actual destination mount → paint → release là
  cơ chế có giá trị, cần giữ. Hiện WAAPI giúp motion tiếp tục khi JS bận mount.
- [Paper breeze](../../apps/user-web/src/components/auth/paper-breeze.ts) đã được
  chủ dự án duyệt; giữ field/glow/continuous flutter/opacity-only dissolve và
  query/filter không cutoff. Đổi timing ghép với paper mới sau khi prototype đạt.
- [Renderer rèm](../../apps/user-web/src/lib/auction-curtain/renderer.mjs) chứng
  minh repo đã có mesh/UV/WebGL/Canvas fallback. Tuy nhiên đây là geometry2D,
  shader position vec2 và depth disabled: không dùng nguyên nó như giấy3D.

## So sánh công nghệ bằng tài liệu/mã nguồn chính thức

| Hướng | Làm được | Giới hạn liên quan trực tiếp | Quyết định đề xuất |
| --- | --- | --- | --- |
| DOM + WAAPI/CSS3D | Chữ thật sắc; nâng, nghiêng và xoay nguyên tờ; phù hợp fallback | Một transform toàn phần tử không tạo độ cong theo từng điểm. CSS3DRenderer không dùng geometry/material và có giới hạn zoom100% theo docs | Giữ DOM khi nghỉ; không chọn làm renderer chính của độ uốn |
| WebGL mesh, Three.js hoặc renderer riêng | Tờ chia thành tam giác, cong/xoắn ở mép; texture/front/back và camera có thể theo cùng geometry | Phải xử lý hình tờ form, shading và thời điểm DOM→mesh. Per-frame JS có thể bị React mount làm ngắt | Ưu tiên thử nghiệm |
| WebGPU compute cloth | Mô phỏng lực trên nhiều điểm, gió tương tác với cloth | Mẫu chính thức cần WebGPU, còn TODO cho WebGL backend; cloth không tự cho độ cứng của giấy. Chi phí calibration và fallback cao hơn | Không chọn mặc định cho ba tờ Login |
| HTML-in-Canvas/HTMLTexture | Đưa nội dung HTML thật lên texture, hỗ trợ deform mesh | API native đang Origin Trial, có đổi tên/signature. Polyfill phải kiểm đúng font, background, logo và controls | Thử làm cầu nối texture, không làm điều kiện bắt buộc |

Nguồn đối chiếu: [CSS3DRenderer](https://threejs.org/docs/pages/CSS3DRenderer.html),
[PlaneGeometry](https://threejs.org/docs/pages/PlaneGeometry.html),
[WebGPU renderer](https://threejs.org/manual/pages/webgpurenderer),
[cloth source](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_cloth.html).
Renderer nói có fallback WebGL2 không đồng nghĩa mọi compute demo cũng fallback;
cloth source hiện vẫn chặn khi WebGPU unavailable và có TODO WebGL backend.

[HTMLTexture](https://threejs.org/docs/pages/HTMLTexture.html) và
[ví dụ chính thức](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_materials_texture_html.html)
đã dùng [three-html-render polyfill](https://github.com/repalash/three-html-render)
khi thiếu native API. Tác giả dùng SVG foreignObject rasterization; README cũng
nêu form-control appearance/color-scheme có thể khác. Đó là ứng viên để thử,
chưa là bằng chứng form Lật lại được tái hiện pixel đúng trên Safari/mobile.

[HTMLMesh cũ](https://threejs.org/docs/pages/HTMLMesh.html) cũng raster DOM, nhưng
[source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/interactive/HTMLMesh.js)
là một painter giới hạn cho text/background/border/input. Suy luận từ code:
không nên kỳ vọng nó tự giữ trọn mọi CSS/texture/shadow của Auth mà không kiểm.

## Công nghệ mới: kiểm tra thực tế thay vì chỉ đọc quảng cáo

[Chrome HTML-in-Canvas update](https://developer.chrome.com/blog/html-in-canvas-ot-changes)
cập nhật29/09/2026: Origin Trial kéo tớiChrome160, thay markup/API qua các phiên
bản. Vì vậy shipping path không nên phụ thuộc vào browser flag/Origin Trial.

Probe riêng trên localhost rỗng, Chromium QA151.0.7922.34/default flags:

| Capability | Kết quả |
| --- | --- |
| navigator.gpu | Có API |
| requestAdapter() | Không cấp adapter |
| captureElementImage/drawElementImage/canvas drawable content | Không có |
| OffscreenCanvas/getContext('webgl2') | Có |

Probe không gọi app/API/DB, server/browser đã đóng. Đây là capability của QA
headless hiện tại, không là kết luận GPU/trình duyệt thật của chủ dự án.
Worker WebGL/performance/Safari chưa thử; có factory không chứng minh FPS.

## Bộ điều khiển giấy: phần nên tự xây

Các ý dưới đây là thiết kế đề xuất, không phải kết quả benchmark:

1. **Quỹ đạo thân tờ:** một đường cong lên/phải, gió tăng nhẹ rồi mạnh; phase
   nâng → tách stack → bay → qua foreground → exit có vị trí/vận tốc nối liên tục.
2. **Độ cong:** dải cong gần cylindrical theo chiều gió, giữ cung dài gần nguyên
   chiều dài giấy thay vì stretch. Thêm xoắn nhẹ chênh lệch hai góc; thân cứng hơn
   mép. Chỉ vài bậc tự do, tránh nhiều sóng sine khiến nó thành vải/cao su.
3. **Độ trễ:** curvature/tilt theo một phản ứng damped nhỏ; góc đón gió nhấc
   trước, thân theo sau. Ba tờ lệch release/độ cứng/độ cong trong giới hạn hẹp.
   Không cho cả ba bay đồng bộ hoặc mỗi tờ chịu một gió trái chiều.
4. **Vật liệu:** ivory, hai màu rear hiện tại, mặt sau không in ngược chữ;
   shading dịu theo độ cong, gần2D/illustrated; không PBR bóng, ánh kim hoặc nhăn
   nhung. Bending mesh phục vụ silhouette, không đổi phong cách website.
5. **Wind field chung:** paper và motes dùng cùng hướng/envelope; seed nhẹ phản
   ứng nhanh hơn. Flutter và dissolve của breeze đã duyệt vẫn giữ native clocks.

[Discrete Shells](https://multires.caltech.edu/pubs/DS-CDROM/) cho thấy độ cứng
uốn/damping phân biệt vật liệu mỏng. [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf)
giải quyết sự phụ thuộc stiffness vào time step/iterations trong PBD. Hai nguồn
là tham khảo vật liệu/tính ổn định; không đề xuất tự viết cả solver trong bước đầu.

## Hai bài toán phải chứng minh trước tích hợp

### Hình form và điểm bàn giao

DOM thật giữ nguyên khi người dùng nhập. Sau API success, lớp chuyển cảnh mới
dùng bản sao được làm sạch password theo cơ chế hiện có. Thử snapshot một lần
của form sau stamp, đúng font/texture/logo/spacing; không raster mỗi frame.
Texture/mesh đầu phải khớp DOM về kích thước, vị trí và màu trước khi nâng mép.
Nếu polyfill khác hình hoặc tốn quá nhiều thời gian, thử capture chỉ phục vụ
Auth bằng pipeline riêng; không tuyên bố đã có giải pháp pixel đúng từ docs.

Three.js là renderer ứng viên; phương án renderer nhỏ riêng chỉ chốt nếu có
lợi ích đo được về tải/worker/maintenance. Không thêm dependency chỉ để tween.

### Coverage và React mount

Ba tờ form-size bay khỏi màn hình sẽ không tự che kín viewport. Chủ dự án đã
chốt13/10: giữ các trang lớn từ ngoài bay vào của `paper-scene` cũ để cover;
ba tờ Auth chỉ bay tự nhiên, không phóng lớn/ép đổi quỹ đạo để làm màn che.
Khi ghép timeline, kiểm opaque pixels của giấy ngoài trước commit route,
không dùng bbox hoặc độ bay ra của form làm bằng chứng cover. Quyết định này
thay đề xuất ban đầu cho một trong ba tờ Auth lướt sát camera để phủ viewport.

WebGL vẽ per-frame trên main thread có nguy cơ đứng hình khi React mount.
Đề xuất thử worker renderer với [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas);
Three.js có [ví dụ worker](https://threejs.org/examples/webgl_worker_offscreencanvas.html).
Mục tiêu tách animation khỏi việc mount; không suy từ API rằng mọi thiết bị sẽ mượt.
Main thread chuẩn bị snapshot/bitmap và lifecycle; worker chỉ vẽ actor. Feature
detect và fallback DOM finite khi không có GPU/worker. Giữ owner motion policy.

## Trình tự đề xuất để chủ dự án duyệt

1. **Một tờ giấy, preview riêng:** dùng visual Auth thật; thử nâng mép, cong,
   mặt sau và bay. Đo DOM→texture, không gọi Login thật, không đổi Auth đang dùng.
   Gate: không texture jump, không quá mềm như vải, không vỡ logo/chữ/mép.
2. **Ba tờ và shot chuyển cảnh:** từ đúng stack pose hiện tại, lệch nhịp gió
   và exit tự nhiên. Gate: đúng ba tờ Auth xuyên suốt, không xuyên nhau,
   không đổi quỹ đạo đột ngột hoặc vòng lặp bị thấy. Sau duyệt xấp, ghép giấy
   ngoài để cover và breeze đã duyệt; kiểm coverage riêng trên các trang ngoài.
3. **Tích hợp Login success:** giữ API success/readiness/focus/unlock/Back/hidden,
   không thêm rèm Auction; loại halves/fragments cũ. Test CPU-busy lúc mount,
   resize/mobile/cold snapshot/GPU loss/no GPU/worker fallback và full lifecycle.

Mục tiêu giữ nhịp blocking hiện tại khoảng1.5–1.6s; quyết định nhịp cuối sau duyệt
preview, không hứa FPS/độ cong thật trước thử. Prototype geometry khởi đầu có thể
24×32segments desktop và16×24mobile; phải đo chất lượng/chi phí rồi chốt.

## Bàn giao nghiên cứu ban đầu13/10

Chỉ đọc source/tài liệu và probe capability; không cài thư viện, không viết
hiệu ứng/prototype, không thay Auth/approved breeze, không chạy lại product tests.
Research không đóng READINESS hoặc gate thiết bị. Mục này lưu phạm vi nghiên
cứu ban đầu; trạng thái hiện tại và bước tiếp xem khảo sát14/10 ở đầu tài liệu.
