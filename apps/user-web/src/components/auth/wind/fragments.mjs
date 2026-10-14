import * as THREE from 'three';

// The four fragment outlines from production paper-scene.ts. Decorative ink
// only: no fragments of the form, field values or stamped success message.
const outlines = [
  'M28 30C85 19 145 39 204 28L192 154 164 150 158 155 118 150 110 156 31 146Z',
  'M32 82C90 55 155 107 207 72L201 111C151 147 96 95 34 116Z',
  'M53 31L182 50 195 137 150 123 116 146 106 129 59 142Z',
  'M85 26C68 74 105 104 80 165L121 169C144 116 111 73 136 30Z',
];
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp(value); return p ** 3 * (10 + p * (-15 + 6 * p)); };

export function createFragmentBurst(surface) {
  const mobile = innerWidth <= 600;
  const style = getComputedStyle(document.documentElement);
  const palette = ['--shop-cream', '--shop-paper', '--shop-yellow', '--shop-wine'].map(name => style.getPropertyValue(name).trim());
  const textures = outlines.flatMap((outline, shape) => [0, 1, 2].map(tone => {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 320;
    const ctx = canvas.getContext('2d'); ctx.scale(1.6, 1.6);
    ctx.shadowColor = `${palette[3]}14`; ctx.shadowOffsetY = 3; ctx.shadowBlur = 2.5;
    ctx.filter = tone === 2 ? `blur(${mobile ? .6 : 1}px)` : 'none';
    ctx.fillStyle = (shape * 3 + tone) % 7 === 0 ? palette[2] : palette[(shape + tone) % 2];
    ctx.fill(new Path2D(outline));
    if ((shape * 3 + tone) % 3 === 0) {
      ctx.shadowColor = 'transparent'; ctx.globalAlpha = .09; ctx.strokeStyle = palette[3]; ctx.lineWidth = .7;
      ctx.stroke(new Path2D('M56 62L127 65M56 76L135 79'));
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }));
  const group = new THREE.Group(); surface.scene.add(group);
  const actors = Array.from({ length: mobile ? 18 : 30 }, (_, index) => {
    const depth = index / ((mobile ? 18 : 30) - 1), lane = ((index * 17) % 19) / 19 - .5;
    const material = new THREE.SpriteMaterial({ map: textures[(index % 4) * 3 + Math.floor(depth * 2.99)],
      transparent: true, depthWrite: false, opacity: 0 });
    const mesh = new THREE.Sprite(material); group.add(mesh);
    const size = (mobile ? 18 : 24) + depth ** 2 * (mobile ? 44 : 64);
    return { mesh, material, depth, lane, size, index, delay: index % 6 * 18,
      duration: (mobile ? 720 : 850) + (1 - depth) * 65 };
  });
  let origin;
  function render(time) {
    let visible = 0, finite = true;
    const samples = [];
    for (const actor of actors) {
      const { mesh, material, index, depth, lane, size, delay, duration } = actor;
      const u = clamp((time - delay) / duration);
      // Same rising diagonal current as the old burst, with a bounded tail.
      // Opacity reaches zero with zero slope; replay/scrub use the same clock.
      const sway = Math.sin(u * 5 + index * 1.9) - Math.sin(index * 1.9);
      const x = origin.left + origin.width * (.5 + lane * .92)
        + innerWidth * (u * 1.25 - .18 * Math.sin(u * Math.PI) + lane * .35 * u);
      const y = origin.top + origin.height * (.45 + lane * .36) - innerHeight * u * .95
        + sway * innerHeight * (.055 + depth * .04) * Math.min(u * 3, 1);
      const angle = -.25 + lane * .8 + u * (.3 + depth) + sway * .13;
      material.opacity = smooth(u / .09) * (1 - smooth((u - .72) / .28));
      material.rotation = angle;
      mesh.position.set(x - innerWidth / 2, innerHeight / 2 - y, 12 + depth * 30);
      mesh.scale.set(size, size * .8 * (.78 + Math.cos(u * 3 + index) * .12), 1);
      mesh.visible = material.opacity > .001;
      if (mesh.visible) visible++;
      finite &&= [x, y, angle, material.opacity].every(Number.isFinite);
      if (index < 3) samples.push({ x, y, angle, opacity: material.opacity });
    }
    return { count: actors.length, visible, finite, samples };
  }
  return { render, align(rect) { origin = rect; }, dispose() {
    actors.forEach(actor => actor.material.dispose()); textures.forEach(texture => texture.dispose());
    surface.scene.remove(group);
  } };
}
