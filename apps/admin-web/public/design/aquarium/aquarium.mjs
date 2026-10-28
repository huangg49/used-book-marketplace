import { canPlay, clamp, createFrameLoop, renderAquarium } from "./scene.mjs";

const stage = document.getElementById("aquarium");
const canvas = document.getElementById("water-canvas");
const pauseButton = document.getElementById("pause");
const callButton = document.getElementById("call-fish");
const sizeButton = document.getElementById("size-toggle");
const preview = document.getElementById("preview-wrap");
const status = document.getElementById("scene-status");
let disposed = false, mountId = 0, cleanupScene = () => {};
const dispose = () => {
  disposed = true; mountId++; cleanupScene(); cleanupScene = () => {};
  delete stage.dataset.renderer;
  pauseButton.disabled = true; callButton.disabled = true; sizeButton.disabled = true;
};
window.addEventListener("pagehide", dispose);
window.addEventListener("pageshow", event => { if (event.persisted) { disposed = false; boot(); } });

async function loadImage(asset) {
  const image = new Image();
  image.src = new URL(`./assets/${asset.file}`, import.meta.url).href;
  await image.decode();
  return [asset.id, image];
}

async function start(own) {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof requestAnimationFrame !== "function") {
    status.textContent = "Trình duyệt đang hiển thị bản tĩnh của bể cá.";
    return;
  }
  const response = await fetch(new URL("./assets/manifest.json", import.meta.url));
  if (!response.ok) throw new Error("Asset manifest unavailable");
  const { assets } = await response.json();
  const images = Object.fromEntries(await Promise.all(assets.map(loadImage)));
  if (disposed || own !== mountId) return;
  let time = 0, worldHeight = 650, attraction = null, ripples = [];
  let paused = false, focused = document.hasFocus(), onscreen = true, ratio = 1;
  const frame = () => renderAquarium(ctx, images, { height: worldHeight, time, attraction, ripples });
  const loop = createFrameLoop({
    request: callback => requestAnimationFrame(callback),
    cancel: id => cancelAnimationFrame(id),
    draw: delta => {
      time += delta;
      if (attraction && time - attraction.at > 4) attraction = null;
      ripples = ripples.filter(ripple => time - ripple.at <= 1.3);
      frame();
    },
  });
  const updatePlayback = () => {
    const play = canPlay({ paused, visible: !document.hidden, onscreen, focused, disposed });
    if (play) loop.start(); else loop.pause();
  };
  const resize = () => {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    ratio = bounds.width / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(dpr * ratio, 0, 0, dpr * ratio, 0, 0);
    worldHeight = bounds.height / ratio;
    onscreen = bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
    frame();
    updatePlayback();
  };
  const pause = () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Tiếp tục" : "Tạm dừng";
    pauseButton.setAttribute("aria-pressed", String(paused));
    callButton.disabled = paused;
    status.textContent = paused ? "Đã tạm dừng. Bấm Tiếp tục để cá bơi lại." : "Ba người bạn nhỏ đang bơi. Thử gọi cá lại gần.";
    updatePlayback();
  };
  const attract = (x, y) => {
    if (paused) return;
    attraction = { x: clamp(x, 220, 900), y: clamp(y, worldHeight * .4, worldHeight * .72), at: time };
    ripples = [...ripples.slice(-2), { x, y, at: time }];
    status.textContent = "Cá đang ghé lại gần. Số cá chỉ là minh họa.";
  };
  const call = () => attract(650, worldHeight * .55);
  let pointer = null;
  const down = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const up = event => {
    const start = pointer; pointer = null;
    if (!start || event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    const bounds = stage.getBoundingClientRect();
    attract((event.clientX - bounds.left) / ratio, (event.clientY - bounds.top) / ratio);
  };
  const cancelPointer = () => { pointer = null; };
  const size = () => {
    const compact = preview.dataset.compact !== "true";
    preview.dataset.compact = String(compact);
    sizeButton.setAttribute("aria-pressed", String(compact));
    sizeButton.textContent = compact ? "Xem bể lớn" : "Xem cỡ thẻ Dashboard";
    resize();
  };
  const blur = () => { focused = false; pointer = null; updatePlayback(); };
  const focus = () => { focused = true; updatePlayback(); };
  const visibility = () => { pointer = null; updatePlayback(); };
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    onscreen = entries.some(entry => entry.isIntersecting); updatePlayback();
  }) : null;
  observer?.observe(stage);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(stage);
  window.addEventListener("resize", resize);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  document.addEventListener("visibilitychange", visibility);
  pauseButton.addEventListener("click", pause);
  callButton.addEventListener("click", call);
  sizeButton.addEventListener("click", size);
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", cancelPointer);
  stage.addEventListener("pointerleave", cancelPointer);
  cleanupScene = () => {
    loop.dispose(); observer?.disconnect(); resizeObserver?.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("blur", blur); window.removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", visibility);
    pauseButton.removeEventListener("click", pause); callButton.removeEventListener("click", call);
    sizeButton.removeEventListener("click", size);
    stage.removeEventListener("pointerdown", down); stage.removeEventListener("pointerup", up);
    stage.removeEventListener("pointercancel", cancelPointer); stage.removeEventListener("pointerleave", cancelPointer);
  };
  resize();
  stage.dataset.renderer = "canvas";
  pauseButton.disabled = false; callButton.disabled = false; sizeButton.disabled = false;
  pauseButton.textContent = "Tạm dừng";
  pauseButton.setAttribute("aria-pressed", "false");
  status.textContent = "Ba người bạn nhỏ đang bơi. Thử gọi cá lại gần.";
}

function boot() {
  const own = ++mountId;
  start(own).catch(() => {
    if (disposed || own !== mountId) return;
    cleanupScene(); cleanupScene = () => {};
    delete stage.dataset.renderer;
    pauseButton.disabled = true; callButton.disabled = true; sizeButton.disabled = true;
    status.textContent = "Chưa tải đủ các lớp chuyển động. Bể đang giữ bản tĩnh; tải lại trang để thử lại.";
  });
}
boot();
