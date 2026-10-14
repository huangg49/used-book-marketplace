import * as THREE from 'three';
import { createPaper, createPaperSurface } from './paper.mjs';
import { createFragmentBurst } from './fragments.mjs';

// Flight only: remove the remaining 249.6ms gust from the previous preview.
export const STACK_GUST_DURATION = 0;
export const STACK_DURATION = 1152;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * t * (10 + t * (-15 + 6 * t)); };

// Each sheet has its own path, angular motion, bend axis and material response.
// There is no opening gust or oscillating sway before departure.
const flights = [
  { controls: [[.24, .28], [.48, .16]], exit: [1.55, 1.35], axis: .16, curl: 1.60,
    turn: [-.42, .74, -.32] },
  { controls: [[-.92, .16], [.95, .84]], exit: [1.60, .62], axis: -.58, curl: -1.80,
    turn: [.46, -2.15, .76] },
  { controls: [[-1.38, -.32], [.24, .68]], exit: [1.48, 1.48], axis: .62, curl: 1.40,
    turn: [-.68, .98, -.72] },
];

export function createStack(canvas, snapshots, diagnostics = true) {
  const surface = createPaperSurface(canvas, diagnostics);
  const fragments = createFragmentBurst(surface);
  const actors = snapshots.map(({ front, back }) => createPaper(canvas, front, back, surface));
  const bounds = actors.map(() => new THREE.Box3()), point = new THREE.Vector3();
  let poses = [], paths = [];
  function render(progress, stamp = null) {
    const p = clamp(progress), spread = smooth(p / .25);
    const motion = [], states = [];
    actors.forEach((actor, index) => {
      const pose = poses[index], flight = flights[index];
      if (!pose) return;
      // Translation begins with the first frame. Curvature follows release,
      // without the old wind attack, flutter or side-to-side oscillations.
      const local = p;
      const travel = local * (.6 + .4 * local);
      const path = paths[index].getPoint(travel);
      const release = smooth(local / .65);
      const roll = smooth(local / .76);
      // Continuous depth lanes precede broad turning. No framewise bbox push.
      const depth = -index * pose.height * 1.30 * spread - index * 2;
      const rotation = [flight.turn[0] * roll, flight.turn[1] * roll, pose.angle + flight.turn[2] * roll];
      const position = [path.x, path.y, depth];
      const bend = flight.curl * release * (.65 + .35 * Math.cos(local * Math.PI * 1.3 + index * .4));
      const state = { axis: flight.axis, bend, flutter: 0, phase: 0,
        position, rotation, lift: spread, release };
      actor.align(pose); motion.push(actor.authored(state));
      states.push({ local, travel, position, rotation, axis: flight.axis, bend, flutter: state.flutter });
      if (diagnostics) {
        actor.mesh.updateMatrixWorld(true); bounds[index].makeEmpty();
        const vertices = actor.mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) bounds[index].expandByPoint(point.fromBufferAttribute(vertices, i).applyMatrix4(actor.mesh.matrixWorld));
      }
    });
    actors[0].setStamp(stamp);
    const fragmentStats = fragments.render(p * STACK_DURATION);
    surface.renderer.render(surface.scene, surface.camera);
    return { ...motion[0], actors: actors.length, localProgress: states.map(state => state.local),
      depthGaps: diagnostics ? [bounds[0].min.z - bounds[1].max.z, bounds[1].min.z - bounds[2].max.z] : [], states,
      profiles: motion.map(value => value.profile), fragments: fragmentStats,
      frontScaleRatio: actors[0].mesh.scale.x / (poses[0].width / snapshots[0].front.rect.width),
      vertices: motion.reduce((sum, value) => sum + value.vertices, 0) };
  }
  return { render, align(nextPoses) {
    poses = nextPoses;
    fragments.align(poses[0]);
    paths = poses.map((pose, index) => {
      const flight = flights[index];
      const controls = flight.controls.map(([x, y]) => new THREE.Vector3(x * pose.width, y * pose.height, 0));
      return new THREE.CubicBezierCurve3(new THREE.Vector3(), ...controls,
        new THREE.Vector3(innerWidth * flight.exit[0], innerHeight * flight.exit[1], 0));
    });
    actors.forEach((actor, index) => actor.align(poses[index]));
  }, dispose() { fragments.dispose(); actors.forEach(actor => actor.dispose()); surface.renderer.dispose(); } };
}
