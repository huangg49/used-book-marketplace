import { snapshotPaper } from './capture.mjs';
import { createStack } from './stack.mjs';
import { stampFlightFrame, STAMP_FLIGHT_DURATION } from './stamp-flight.mjs';
import styles from '../../../layouts/AuthLayout.module.css';

const preparations = new WeakMap();
const sheets = source => [source, source.closest('[data-auth-book]')?.querySelector(`.${styles.middleSheet}`), source.closest('[data-auth-book]')?.querySelector(`.${styles.backSheet}`)];
const size = source => `${source.offsetWidth}:${source.offsetHeight}:${new Date().toLocaleDateString('vi-VN')}`;

function prepare(source) {
  const key = size(source), existing = preparations.get(source);
  if (existing?.key === key) return existing.promise;
  const promise = (async () => {
    const nodes = sheets(source);
    if (nodes.some(node => !node)) throw new Error('Auth stack unavailable');
    const [front, back, middle, rear] = await Promise.all([snapshotPaper(source), snapshotPaper(source, true), ...nodes.slice(1).map(node => snapshotPaper(node))]);
    const stamp = document.createElement('div');
    stamp.className = styles.stamp; stamp.dataset.previewStamp = '';
    stamp.textContent = 'ĐÃ MƯỢN';
    const date = document.createElement('span'); date.textContent = new Date().toLocaleDateString('vi-VN'); stamp.append(date);
    Object.assign(stamp.style, { animation: 'none', visibility: 'hidden' });
    source.append(stamp);
    try {
      const ink = await snapshotPaper(source, false, true), rect = stamp.getBoundingClientRect(), parent = source.getBoundingClientRect();
      front.stamp = { canvas: ink.canvas, centre: [(rect.left + rect.width / 2 - parent.left) / parent.width, 1 - (rect.top + rect.height / 2 - parent.top) / parent.height] };
    } finally { stamp.remove(); }
    if (source.isConnected && size(source) === key) source.dataset.flightReady = 'true';
    return [{ front, back }, { front: middle, back: middle }, { front: rear, back: rear }];
  })();
  preparations.set(source, { key, promise });
  void promise.catch(() => { if (preparations.get(source)?.promise === promise) preparations.delete(source); });
  return promise;
}

export async function prepareFlight(source) { await prepare(source); }

export async function createAuthFlight(canvas, source) {
  const snapshots = await prepare(source), nodes = sheets(source);
  if (!source.isConnected) throw new Error('Auth source left before preparation');
  const scale = source.getBoundingClientRect().width / source.offsetWidth;
  const poses = nodes.map(node => {
    const rect = node.getBoundingClientRect(), matrix = new DOMMatrix(getComputedStyle(node).transform);
    const width = node.offsetWidth * scale, height = node.offsetHeight * scale;
    return { left: rect.left + rect.width / 2 - width / 2, top: rect.top + rect.height / 2 - height / 2, width, height, angle: -Math.atan2(matrix.b, matrix.a) };
  });
  // Production does not preserve the drawing buffer or scan mesh bounds per frame.
  const rig = createStack(canvas, snapshots, false);
  rig.align(poses);
  const visibility = nodes.map(node => node.style.visibility);
  let raf = 0, disposed = false;
  const restore = () => nodes.forEach((node, index) => { node.style.visibility = visibility[index]; });
  return {
    count: innerWidth <= 600 ? 18 : 30,
    start() {
      if (disposed) return;
      const draw = time => {
        const frame = stampFlightFrame(Math.min(1, time / STAMP_FLIGHT_DURATION));
        rig.render(frame.flightProgress, frame);
        canvas.dataset.flightTime = String(Math.round(time));
        canvas.dataset.actors = '3';
      };
      draw(0); canvas.hidden = false;
      nodes.forEach(node => { node.style.visibility = 'hidden'; });
      const started = performance.now();
      const tick = now => {
        if (disposed) return;
        try { draw(now - started); }
        catch { canvas.dispatchEvent(new Event('paperflightfailed')); return; }
        if (now - started < STAMP_FLIGHT_DURATION) raf = requestAnimationFrame(tick);
        else { raf = 0; canvas.hidden = true; }
      };
      raf = requestAnimationFrame(tick);
    },
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(raf); canvas.hidden = true;
      restore(); rig.dispose();
    },
  };
}
