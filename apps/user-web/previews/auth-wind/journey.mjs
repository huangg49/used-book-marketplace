import { createPaperScene } from '../../src/components/auth/paper-scene';
import { createPaperBreeze } from '../../src/components/auth/paper-breeze';
import styles from '../../src/components/auth/PaperStormLayout.module.css';

import { JOURNEY_TIMING } from './journey-timing.mjs';
export { JOURNEY_TIMING };

// Reuse the existing outside papers and breeze; the mesh owns the intact form
// and little fragments. All preview effects follow the scrubber's one clock.
export function createJourney(sceneRoot, breezeRoot, origin) {
  const mode = innerWidth <= 600 ? 'mobile' : 'desktop';
  const css = getComputedStyle(document.documentElement);
  const palette = ['--shop-cream', '--shop-paper', '--shop-yellow', '--shop-wine'].map(token => css.getPropertyValue(token).trim());
  const scene = createPaperScene(sceneRoot, origin, mode, palette, [], null);
  if (!scene) throw new Error('Trình duyệt chưa hỗ trợ chuyển động giấy.');
  void scene.enter().catch(() => {});
  const pieces = new Set(sceneRoot.querySelectorAll(`.${styles.piece}`));
  const entry = sceneRoot.getAnimations({ subtree: true }).filter(animation => {
    if (!pieces.has(animation.effect.target)) return true;
    animation.cancel(); return false;
  });
  pieces.forEach(piece => piece.remove());
  entry.forEach(animation => {
    const isPage = animation.effect.target.classList.contains(styles.sheet);
    animation.effect.updateTiming(isPage
      ? { delay: JOURNEY_TIMING.coverStart, duration: JOURNEY_TIMING.covered - JOURNEY_TIMING.coverStart }
      : { delay: JOURNEY_TIMING.covered });
    animation.pause(); animation.currentTime = 0;
  });
  void scene.release().catch(() => {});
  const release = sceneRoot.getAnimations({ subtree: true }).filter(animation => !entry.includes(animation));
  release.forEach(animation => {
    animation.effect.updateTiming({ delay: JOURNEY_TIMING.release, duration: JOURNEY_TIMING.arrived - JOURNEY_TIMING.release, fill: 'forwards' });
    animation.pause(); animation.currentTime = 0;
  });

  const breeze = createPaperBreeze(breezeRoot, origin, mode, palette);
  const wind = breezeRoot.getAnimations({ subtree: true });
  // Read settled seed opacity before scheduling the original individual fades.
  wind.forEach(animation => { animation.pause(); animation.currentTime = JOURNEY_TIMING.arrived; });
  const strokes = breezeRoot.querySelector(`.${styles.windLines}`);
  const strokesParent = strokes?.parentElement;
  breeze.settle();
  if (strokes) strokesParent.append(strokes);
  const fades = breezeRoot.getAnimations({ subtree: true }).filter(animation => !wind.includes(animation));
  fades.forEach(animation => {
    animation.effect.updateTiming({ delay: animation.effect.getTiming().delay + JOURNEY_TIMING.arrived, fill: 'forwards' });
    animation.pause(); animation.currentTime = 0;
  });
  wind.forEach(animation => {
    animation.effect.updateTiming({ delay: animation.effect.getTiming().delay + 280 });
    animation.currentTime = 0;
  });
  const animations = [...entry, ...release, ...wind, ...fades];
  return {
    render(time) {
      animations.forEach(animation => { animation.currentTime = time; });
      sceneRoot.hidden = time >= JOURNEY_TIMING.arrived;
      breezeRoot.hidden = time === 0 || time >= JOURNEY_TIMING.end;
      breezeRoot.dataset.phase = time < JOURNEY_TIMING.arrived ? 'gust' : 'lingering';
      sceneRoot.dataset.time = String(time);
      return time >= JOURNEY_TIMING.covered;
    },
    dispose() { scene.dispose(); breeze.dispose(); },
  };
}
