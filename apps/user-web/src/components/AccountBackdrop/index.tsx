import styles from './AccountBackdrop.module.css'

// Falling leaves: [left %, start top %, size px, duration s, delay s, colour 0-4].
// Fixed values so the scene is the same on every render and device. Every leaf
// starts near the top of the window; negative delays put some mid-fall on load,
// so the whole screen has leaves from the first frame.
const LEAVES: [number, number, number, number, number, number][] = [
  [3, -6, 22, 16, 0, 0], [11, 2, 16, 19, -7, 1], [19, -4, 26, 17, -13, 2], [27, 6, 18, 21, -4, 3], [35, -2, 24, 18, -10, 4],
  [43, 4, 18, 20, -16, 0], [51, -6, 28, 17, -2, 2], [59, 8, 16, 22, -12, 1], [67, -3, 20, 19, -6, 3], [75, 3, 14, 16, -9, 4],
  [83, -5, 22, 21, -15, 0], [91, 5, 18, 18, -3, 2], [97, -1, 24, 20, -11, 1], [7, 10, 18, 17, -14, 3], [23, -8, 26, 22, -5, 2],
  [39, 12, 16, 18, -8, 0], [55, 1, 20, 21, -18, 4], [71, -7, 22, 19, -1, 1], [87, 9, 18, 16, -10, 3], [15, 14, 24, 20, -17, 2],
  [47, -4, 16, 17, -11, 0], [63, 11, 20, 22, -7, 4], [79, -2, 22, 18, -14, 1], [95, 7, 18, 19, -4, 3],
]

/**
 * The member account backdrop: a warm gradient room behind the sidebar and
 * every account page, fixed to the window so it always fills the screen.
 * Drifting wine/gold light, a breathing lamp and autumn leaves falling; made
 * only of gradients. Decorative, so hidden from assistive tech.
 */
export function AccountBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <span className={styles.light} />
      <span className={styles.lamp} />
      {LEAVES.map(([x, y, size, duration, delay, colour], i) => (
        <span
          key={i}
          className={styles.leaf}
          data-c={colour}
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  )
}
