import * as THREE from 'three';

export const DURATION = 2000;
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * t * (10 + t * (-15 + 6 * t)); };

// Integrate a shallow travelling bend through the WHOLE sheet. A translating,
// rolling body carries the wave: no still upper panel and no folding flap.
// Strip length stays constant; cross-strip shear is an authored approximation.
export function createPaperSurface(canvas, preserveDrawingBuffer = false) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const fieldOfView = 32;
  const distance = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fieldOfView / 2)));
  const camera = new THREE.PerspectiveCamera(fieldOfView, innerWidth / innerHeight, 1, distance * 10);
  camera.position.z = distance;
  return { renderer, scene, camera };
}

export function createPaper(canvas, front, back, shared = null) {
  const { renderer, scene, camera } = shared ?? createPaperSurface(canvas);
  const { width, height, left, top } = front.rect;
  const mobile = innerWidth < 601;
  const geometry = new THREE.PlaneGeometry(width, height, mobile ? 24 : 32, mobile ? 32 : 44);
  const textures = [front, back].map(({ canvas: image }) => {
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  });
  if (front.stamp) {
    const ink = new THREE.CanvasTexture(front.stamp.canvas);
    ink.colorSpace = THREE.SRGBColorSpace;
    ink.anisotropy = textures[0].anisotropy;
    textures.push(ink);
  }
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { frontMap: { value: textures[0] }, backMap: { value: textures[1] }, strength: { value: 0 },
      stampMap: { value: textures[2] ?? textures[0] }, stampOpacity: { value: 0 }, stampScale: { value: 1 },
      stampCentre: { value: new THREE.Vector2(...(front.stamp?.centre ?? [.5, .5])) } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal;
      void main() { vUv = uv; vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D frontMap; uniform sampler2D backMap; uniform float strength;
      uniform sampler2D stampMap; uniform float stampOpacity; uniform float stampScale; uniform vec2 stampCentre;
      varying vec2 vUv; varying vec3 vNormal;
      void main() {
        vec4 ink = gl_FrontFacing ? texture2D(frontMap, vUv) : texture2D(backMap, vec2(1.0-vUv.x, vUv.y));
        if (gl_FrontFacing && stampOpacity > 0.0) {
          vec2 uv = (vUv - stampCentre) / stampScale + stampCentre;
          vec4 stamp = texture2D(stampMap, uv);
          ink.rgb = mix(ink.rgb, stamp.rgb, stamp.a * stampOpacity);
        }
        vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
        float light = clamp(dot(n, normalize(vec3(-.3,.45,1.0))), 0.0, 1.0);
        ink.rgb *= mix(1.0, .83 + .20 * light, strength);
        gl_FragColor = ink;
        #include <colorspace_fragment>
      }`,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const base = new THREE.Vector3(left + width / 2 - innerWidth / 2, innerHeight / 2 - top - height / 2, 0);
  const columns = geometry.parameters.widthSegments, rows = geometry.parameters.heightSegments;
  const step = height / rows;
  const centre = new THREE.Vector3();
  const arcSteps = 128, arcY = new Float64Array(arcSteps + 1), arcZ = new Float64Array(arcSteps + 1);
  // A cylindrical bend with a smaller travelling ripple. The bend basis can
  // turn per sheet; integration keeps arc length without a half-sheet hinge.
  function authored(state) {
    const { axis, bend, flutter, phase, position, rotation, lift, release } = state;
    const sine = Math.sin(axis), cosine = Math.cos(axis);
    const length = width * Math.abs(sine) + height * Math.abs(cosine), ds = length / arcSteps;
    let maxBend = 0;
    arcY[0] = -length / 2; arcZ[0] = 0;
    for (let i = 1; i <= arcSteps; i++) {
      const u = (i - .5) / arcSteps;
      const angle = bend * (u - .5) + flutter * Math.sin(2 * Math.PI * 1.05 * u - phase);
      maxBend = Math.max(maxBend, Math.abs(angle));
      arcY[i] = arcY[i - 1] + ds * Math.cos(angle);
      arcZ[i] = arcZ[i - 1] + ds * Math.sin(angle);
    }
    const positions = geometry.attributes.position;
    centre.set(0, 0, 0);
    for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
      const x = (column / columns - .5) * width, y = (.5 - row / rows) * height;
      const along = x * sine - y * cosine, across = x * cosine + y * sine;
      const sample = Math.max(0, Math.min(arcSteps, (along / length + .5) * arcSteps));
      const lo = Math.min(arcSteps - 1, Math.floor(sample)), mix = sample - lo;
      const s = arcY[lo] + (arcY[lo + 1] - arcY[lo]) * mix;
      const z = arcZ[lo] + (arcZ[lo + 1] - arcZ[lo]) * mix;
      const px = across * cosine + s * sine, py = across * sine - s * cosine;
      positions.setXYZ(row * (columns + 1) + column, px, py, z);
      centre.x += px; centre.y += py; centre.z += z;
    }
    centre.divideScalar(positions.count);
    for (let i = 0; i < positions.count; i++) positions.setXYZ(i, positions.getX(i) - centre.x, positions.getY(i) - centre.y, positions.getZ(i) - centre.z);
    positions.needsUpdate = true; geometry.computeVertexNormals();
    mesh.position.copy(base); mesh.position.x += position[0]; mesh.position.y += position[1]; mesh.position.z += position[2];
    mesh.rotation.set(...rotation); material.uniforms.strength.value = lift;
    const profile = [.25, .5, .75, 1].map(fraction => positions.getZ(Math.round(rows * fraction) * (columns + 1) + columns / 2) / height);
    const angles = [.5, 1].map(fraction => {
      const i = Math.round(rows * fraction) * (columns + 1) + columns / 2, prev = i - columns - 1;
      return Math.atan2(positions.getZ(i) - positions.getZ(prev), positions.getY(prev) - positions.getY(i));
    });
    return { profile, angles, maxBend, lift, release, vertices: positions.count, triangles: geometry.index.count / 3 };
  }
  function render(progress) {
    const p = Math.max(0, Math.min(1, progress));
    const wind = smooth(p / .18);
    const lift = smooth((p - .08) / .50);
    const release = smooth((p - .40) / .44);
    const flight = Math.max(0, (p - .20) / .80);
    const leave = flight ** 3;
    const energy = wind * (1 - .32 * release);
    const phase = 2 * Math.PI * (1.65 * p + .36 * p * p);
    // A short stronger gust rides on the approved drift. Quintic attack/release
    // makes it disappear with zero slope/acceleration at the halfway point;
    // the second half is exactly the previous flight, not a retimed version.
    const gust = smooth(p / .055) * (1 - smooth((p - .31) / .19));
    const gustPhase = 2 * Math.PI * (7.4 * p + .6 * p * p);
    const positions = geometry.attributes.position;
    let maxBend = 0;
    for (let column = 0; column <= columns; column++) {
      const across = column / columns - .5;
      const x = across * width;
      let y = height / 2, z = 0;
      positions.setXYZ(column, x, y, z);
      for (let row = 1; row <= rows; row++) {
        const u = (row - .5) / rows;
        // Diagonal, broad wave with a delayed return. Bending changes sign
        // through the sheet, rather than curling its bottom into a horizontal
        // shelf. Every region participates; the upper edge is not a hinge.
        const wave = 2 * Math.PI * (.78 * u + .16 * across) - phase;
        const angle = energy * ((.22 + .55 * u) * Math.sin(wave)
          + .16 * Math.sin(wave * .53 - .6) + .22 * u)
          + .34 * gust * (.4 + .6 * u) * Math.sin(gustPhase - 3.9 * u - .65 * across);
        maxBend = Math.max(maxBend, Math.abs(angle));
        y -= step * Math.cos(angle);
        z += step * Math.sin(angle);
        positions.setXYZ(row * (columns + 1) + column, x, y, z);
      }
    }
    // Centre the bent geometry so bending itself cannot shove the sheet away.
    // Motion of its mass is authored below, independent of the travelling wave.
    centre.set(0, 0, 0);
    for (let i = 0; i < positions.count; i++) {
      centre.x += positions.getX(i); centre.y += positions.getY(i); centre.z += positions.getZ(i);
    }
    centre.divideScalar(positions.count);
    for (let i = 0; i < positions.count; i++) positions.setXYZ(i, positions.getX(i) - centre.x, positions.getY(i) - centre.y, positions.getZ(i) - centre.z);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    mesh.rotation.set(
      -.11 * wind * Math.sin(phase * .70) - .65 * release + .018 * gust * Math.sin(gustPhase - .8),
      .13 * wind * Math.sin(phase * .61 + .4) + 1.48 * release + .014 * gust * Math.sin(gustPhase - 1.5),
      -.065 * wind * Math.sin(phase * .8) - .34 * release,
    );
    mesh.position.copy(base);
    mesh.position.x += width * (.035 * wind * Math.sin(phase * .62) + .12 * lift) + innerWidth * 1.35 * leave;
    mesh.position.y += height * (.025 * wind * Math.sin(phase * .74) + .045 * lift) + innerHeight * .95 * leave;
    mesh.position.z += height * (.10 * lift - .15 * release);
    material.uniforms.strength.value = smooth(p / .2);
    if (!shared) renderer.render(scene, camera);
    const rowHeight = fraction => positions.getZ(Math.round(rows * fraction) * (columns + 1) + columns / 2) / height;
    const rowAngle = fraction => {
      const i = Math.round(rows * fraction) * (columns + 1) + columns / 2, previous = i - columns - 1;
      return Math.atan2(positions.getZ(i) - positions.getZ(previous), positions.getY(previous) - positions.getY(i));
    };
    return { lift, release, leave, maxBend, profile: [.25, .5, .75, 1].map(rowHeight),
      angles: [.5, 1].map(rowAngle),
      vertices: positions.count, triangles: geometry.index.count / 3 };
  }
  render(0);
  return { mesh, render, authored, setStamp(state) {
    material.uniforms.stampOpacity.value = state?.opacity ?? 0;
    material.uniforms.stampScale.value = state?.scale ?? 1;
  }, align(rect) {
    // The preview can fit its DOM after asynchronous font/image preparation.
    // Align at handoff, not at the earlier snapshot request's layout epoch.
    base.set(rect.left + rect.width / 2 - innerWidth / 2, innerHeight / 2 - rect.top - rect.height / 2, 0);
    mesh.scale.set(rect.width / width, rect.height / height, rect.width / width);
  }, dispose() {
    geometry.dispose(); material.dispose(); textures.forEach(texture => texture.dispose());
    scene.remove(mesh);
    if (!shared) renderer.dispose();
  } };
}
