// Standalone geometric motion studies; no network requests or Admin state.
const $ = (id) => document.getElementById(id);
const scenes = ['page', 'ink', 'depth'];
const durations = { page: 360, ink: 420, depth: 520 };
const labels = { page: 'Thử chuyển trang', ink: 'Thử chuyển nét mực', depth: 'Thử nâng phiếu' };
const placements = { page: 'Mở danh sách → hồ sơ', ink: 'Đổi kỳ hoặc dữ liệu biểu đồ', depth: 'Phiếu xem nhanh, thẻ hàng chờ' };
let mode = 'page', page = false, ink = false, frame = 0, follow = 0, completion = 0;
let current = [150,140,150,80,100,50,80,45,55];
let targetInk = [...current];
const xs = [20,80,140,200,260,320,380,440,480];
const animations = new Set();
function draw(values) { $('ink-path').setAttribute('d', values.map((y,i) => (i ? 'L' : 'M') + xs[i] + ' ' + y).join('')); }
function resetDepth() { const el = $('depth-paper'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--lift'); }
function stop(message = true) {
  cancelAnimationFrame(frame); cancelAnimationFrame(follow); clearTimeout(completion);
  if (frame) { current = [...targetInk]; draw(current); }
  frame = follow = 0;
  animations.forEach(animation => animation.cancel()); animations.clear();
  resetDepth();
  if (message) $('feedback').textContent = 'Đã dừng. Nội dung vẫn ở trạng thái hiện tại.';
}
function animate(el, keyframes, duration) {
  if (typeof el.animate !== 'function') return;
  const animation = el.animate(keyframes, { duration, easing: 'cubic-bezier(.16,1,.3,1)' });
  animations.add(animation);
  animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
}
function play() {
  stop(false);
  const bounds = document.querySelector('.stage').getBoundingClientRect();
  if (document.hidden || bounds.bottom <= 0 || bounds.top >= innerHeight) return;
  $('feedback').textContent = 'Đang thử ' + labels[mode].replace('Thử ', '').toLowerCase() + '…';
  if (mode === 'page') {
    page = !page;
    $('page-heading').textContent = page ? 'Đến trang tiếp theo.' : 'Từ hàng chờ.';
    $('page-copy').textContent = page ? 'Nội dung mới hiện ngay; mép giấy chỉ tạo sự nối tiếp.' : 'Mỗi lần mở hồ sơ là một trang giấy tiếp nối.';
    animate($('page-paper'), [{ transform:'perspective(1100px) rotateY(-6deg) translateX(-8px)', transformOrigin:'0 50%' }, { transform:'perspective(1100px) rotateY(0) translateX(0)', transformOrigin:'0 50%' }], 360);
    animate($('page-edge'), [{ transform:'translateX(-110%)', opacity:0 }, { transform:'translateX(110%)', opacity:.6, offset:.45 }, { transform:'translateX(320%)', opacity:0 }], 360);
  } else if (mode === 'ink') {
    ink = !ink;
    const from = [...current], target = ink ? [145,110,130,120,60,85,45,65,30] : [150,140,150,80,100,50,80,45,55];
    targetInk = target;
    const start = performance.now();
    const tick = (time) => {
      const progress = Math.min(1, (time - start) / 420), eased = 1 - Math.pow(1 - progress, 4);
      current = from.map((v,i) => v + (target[i] - v) * eased); draw(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else frame = 0;
    };
    frame = requestAnimationFrame(tick);
  } else {
    animate($('depth-paper'), [{ transform:'perspective(1100px) rotateX(0) rotateY(0) translateY(0)' }, { transform:'perspective(1100px) rotateX(1.5deg) rotateY(-2deg) translateY(-6px)', offset:.5 }, { transform:'perspective(1100px) rotateX(0) rotateY(0) translateY(0)' }], 520);
  }
  completion = setTimeout(() => { $('feedback').textContent = 'Đã thử · ' + durations[mode] + ' ms. Bấm lại để so sánh cảm giác.'; }, durations[mode]);
}
function chooseScene(next) {
  stop(false); mode = next;
  document.querySelectorAll('input[name="scene"]').forEach(input => { input.checked = input.value === mode; });
  $('mobile-scene').value = mode;
  scenes.forEach(scene => $('scene-' + scene).hidden = scene !== mode);
  $('play').innerHTML = labels[mode] + ' <span aria-hidden="true">→</span>';
  $('duration').textContent = durations[mode] + ' ms'; $('placement').textContent = placements[mode];
  $('feedback').textContent = 'Sẵn sàng. Không có thao tác nào gửi tới backend.';
}
document.querySelectorAll('input[name="scene"]').forEach(input => input.addEventListener('change', () => chooseScene(input.value)));
$('mobile-scene').addEventListener('change', event => chooseScene(event.target.value));
$('play').addEventListener('click', play);
$('stop').addEventListener('click', () => stop());
const depth = $('depth-paper');
depth.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || event.buttons || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const bounds = depth.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
  const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
  cancelAnimationFrame(follow);
  follow = requestAnimationFrame(() => { depth.style.setProperty('--rx', -y * 1.5 + 'deg'); depth.style.setProperty('--ry', x * 2 + 'deg'); depth.style.setProperty('--lift', '-4px'); });
});
depth.addEventListener('pointerleave', () => { cancelAnimationFrame(follow); resetDepth(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', () => stop());
window.addEventListener('blur', () => stop());
const observer = new IntersectionObserver(entries => { if (!entries.some(entry => entry.isIntersecting)) stop(); });
observer.observe(document.querySelector('.stage'));
