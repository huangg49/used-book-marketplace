export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const fishSpecs = Object.freeze([
  { phase: .25, speed: .22, baseY: .54, sway: .105, width: 132, opacity: 1 },
  { phase: 2.8, speed: .18, baseY: .65, sway: .075, width: 85, opacity: .9 },
  { phase: 4.6, speed: .26, baseY: .43, sway: .065, width: 57, opacity: .78 },
]);

// The three fish are illustration, never a projection of a queue count.
export function fishPoint(time, index, height, attraction = null) {
  const spec = fishSpecs[index];
  let x = 575 + Math.sin(time * spec.speed + spec.phase) * 295;
  let y = height * (spec.baseY + Math.sin(time * spec.speed * 1.47 + spec.phase) * spec.sway);
  if (attraction) {
    const progress = clamp((time - attraction.at) / 4, 0, 1);
    const weight = Math.sin(progress * Math.PI) ** 2 * .65;
    x += (clamp(attraction.x + (index - 1) * 65, 220, 900) - x) * weight;
    y += (clamp(attraction.y + index * 22, height * .4, height * .72) - y) * weight;
  }
  // Tall card layouts reserve a quiet upper-left area for the DOM metric.
  // The route bends down gradually instead of swimming across its caption.
  const clearance = height > 720 ? clamp((620 - x) / 220, 0, 1) : 0;
  y = Math.max(y, height * (.32 + clearance * .24));
  return { x: clamp(x, 220, 900), y: clamp(y, height * .32, height * .75) };
}

export function fishPose(time, index, height, attraction = null) {
  const point = fishPoint(time, index, height, attraction);
  const next = fishPoint(time + .04, index, height, attraction);
  const dx = (next.x - point.x) / .04;
  const dy = (next.y - point.y) / .04;
  const direction = dx / Math.sqrt(dx * dx + 36);
  return {
    ...point,
    facing: (Math.sign(direction) || 1) * Math.max(.06, Math.abs(direction)),
    tilt: clamp(Math.atan2(dy, Math.abs(dx) + 24) * Math.sign(dx) * .28, -.16, .16),
    wag: Math.sin(time * 16 + index * 2) * .15,
    tailWidth: .72 + Math.cos(time * 16 + index * 2) * .24,
  };
}

export function canPlay({ paused, visible, onscreen, focused, disposed }) {
  return !paused && visible && onscreen && focused && !disposed;
}

// Cancellable, bounded-delta loop. A stale queued callback cannot revive a
// disposed/paused scene or start a second animation after rapid toggling.
export function createFrameLoop({ request, cancel, draw }) {
  let id = null, generation = 0, playing = false, disposed = false, last = null;
  function start() {
    if (playing || disposed) return;
    playing = true;
    last = null;
    const own = ++generation;
    const tick = now => {
      if (!playing || disposed || own !== generation) return;
      id = null;
      if (last === null || now - last >= 1000 / 30) {
        const delta = last === null ? 0 : clamp((now - last) / 1000, 0, .05);
        last = now;
        draw(delta);
      }
      if (playing && !disposed && own === generation) id = request(tick);
    };
    id = request(tick);
  }
  function pause() {
    playing = false;
    generation++;
    last = null;
    if (id !== null) cancel(id);
    id = null;
  }
  return { start, pause, dispose() { disposed = true; pause(); } };
}

function cover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function plant(ctx, image, x, rootY, height, time, phase, opacity = 1) {
  const width = height * image.width / image.height;
  ctx.save(); ctx.globalAlpha = opacity;
  // Bend from a fixed root with one affine draw: clean alpha silhouettes,
  // no horizontal slice seams and no per-leaf simulation overhead.
  ctx.translate(x + width / 2, rootY);
  ctx.transform(1, 0, Math.sin(time * .9 + phase) * .04, 1, 0, 0);
  ctx.rotate(Math.sin(time * .6 + phase) * .012);
  ctx.drawImage(image, -width / 2, -height, width, height);
  ctx.restore();
}

function fish(ctx, images, time, index, height, attraction) {
  const spec = fishSpecs[index], pose = fishPose(time, index, height, attraction);
  const body = images["fish-body"], tail = images.tail;
  const bw = spec.width, bh = bw * body.height / body.width;
  const tw = bw * .34, th = tw * tail.height / tail.width;
  ctx.save();
  ctx.globalAlpha = spec.opacity;
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.facing, 1);
  ctx.rotate(pose.tilt);
  ctx.save();
  // Hinge at the right tip of the separate tail, tucked behind the body root.
  ctx.translate(-bw * .48, bh * .055);
  ctx.rotate(pose.wag);
  ctx.scale(pose.tailWidth, 1);
  ctx.drawImage(tail, -tw * .98, -th * .52, tw, th);
  ctx.restore();
  ctx.drawImage(body, -bw * .5, -bh * .5, bw, bh);
  ctx.restore();
}

export function renderAquarium(ctx, images, { width = 1000, height, time, attraction = null, ripples = [] }) {
  ctx.clearRect(0, 0, width, height);
  cover(ctx, images.water, width, height);
  plant(ctx, images["broad-plant"], 720, height * .88, height * .31, time, 1.2, .55);
  plant(ctx, images["ribbon-plant"], -25, height * .88, height * .46, time, .1, .92);
  for (const index of [2, 1, 0]) fish(ctx, images, time, index, height, attraction);
  ctx.save();
  ctx.strokeStyle = "#fffcf5";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 11; i++) {
    const progress = (time * (.035 + i % 3 * .007) + i / 11) % 1;
    const x = 185 + (i * 173 % 740) + Math.sin(time * .7 + i) * 7;
    const y = height * (.86 - progress * .78);
    ctx.globalAlpha = Math.sin(progress * Math.PI) * .55;
    ctx.beginPath(); ctx.arc(x, y, 2 + i % 3 * 1.4, 0, Math.PI * 2); ctx.stroke();
  }
  for (const ripple of ripples) {
    const progress = (time - ripple.at) / 1.3;
    if (progress < 0 || progress > 1) continue;
    ctx.globalAlpha = (1 - progress) * .65;
    ctx.beginPath(); ctx.ellipse(ripple.x, ripple.y, 8 + progress * 42, 3 + progress * 14, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  plant(ctx, images["broad-plant"], 845, height * .9, height * .41, time, 3.4);
  plant(ctx, images["broad-plant"], 120, height * .91, height * .22, time, 2.4, .88);
  const rock = images.pebbles;
  ctx.drawImage(rock, 24, height * .92 - 82, 125, 125 * rock.height / rock.width);
  ctx.drawImage(rock, 850, height * .925 - 56, 86, 86 * rock.height / rock.width);
}
