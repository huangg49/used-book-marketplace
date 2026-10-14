import type { PaperOrigin, StormMode } from './paper-storm'
import styles from './PaperStormLayout.module.css'

const ns = 'http://www.w3.org/2000/svg'
let lightId = 0
function svgNode(tag: string, attrs: Record<string, string>) {
  const node = document.createElementNS(ns, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}
// Small baked radial lights, never an animated blur over the whole viewport.
function light(svg: Element, cream: string, gold: string, x: number, y: number, radius: number, strength: number) {
  const id = `paper-breeze-light-${++lightId}`
  const defs = svgNode('defs', {})
  const gradient = svgNode('radialGradient', { id })
  gradient.append(svgNode('stop', { offset: '0', 'stop-color': cream, 'stop-opacity': String(strength) }),
    svgNode('stop', { offset: '.32', 'stop-color': gold, 'stop-opacity': String(strength * .45) }),
    svgNode('stop', { offset: '1', 'stop-color': gold, 'stop-opacity': '0' }))
  defs.append(gradient)
  const glow = svgNode('g', { 'data-breeze-light': '' })
  glow.append(svgNode('circle', { cx: String(x), cy: String(y), r: String(radius), fill: `url(#${id})` }))
  svg.append(defs, glow)
  return glow
}
// Fine filaments and a hanging seed; all motion lives on the containing element.
function seed(cream: string, ink: string, gold?: string) {
  const svg = svgNode('svg', { viewBox: '0 0 32 48', fill: 'none', 'aria-hidden': 'true' })
  if (gold) light(svg, cream, gold, 16, 15, 14, .45)
  const hairs = svgNode('g', { stroke: cream, 'stroke-width': '.85', 'stroke-linecap': 'round' })
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (1.05 + i * .1125)
    const x = 16 + Math.cos(angle) * 13, y = 16 + Math.sin(angle) * 12
    hairs.append(svgNode('path', { d: `M16 19Q${(16 + x) / 2} 10 ${x} ${y}` }))
    hairs.append(svgNode('path', { d: `M${x - 1.5} ${y + 1}l1.5 -2 1.5 1.5`, 'stroke-width': '.6', opacity: '.7' }))
  }
  // A faint printed edge keeps the cream filaments readable on the large pages.
  const edge = hairs.cloneNode(true) as SVGGElement
  edge.setAttribute('stroke', ink); edge.setAttribute('stroke-width', '1.8'); edge.setAttribute('opacity', '.16')
  svg.append(edge, hairs, svgNode('path', { d: 'M16 19Q13 28 17 37', stroke: cream, 'stroke-width': '.85' }),
    svgNode('path', { d: 'M17 35Q13 40 18 44Q21 40 17 35Z', fill: ink, opacity: '.65' }))
  return svg
}
function dust(cream: string, gold: string) {
  const svg = svgNode('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  light(svg, cream, gold, 8, 8, 8, .9)
  svg.append(svgNode('circle', { cx: '8', cy: '8', r: '.8', fill: cream, opacity: '.8' }))
  return svg
}

export type PaperBreeze = { settle: () => void; dispose: () => void }

/** The departing stack starts a gust across the full-screen paper field. */
export function createPaperBreeze(root: HTMLElement, origin: PaperOrigin, mode: StormMode, palette: string[], startDelay = 0): PaperBreeze | null {
  if (typeof root.animate !== 'function') return null
  const doc = root.ownerDocument, view = doc.defaultView!
  const width = view.innerWidth, height = view.innerHeight
  const container = doc.createElement('div')
  container.className = styles.breezeContent!
  root.append(container); root.hidden = false; root.dataset.phase = 'gust'
  let disposed = false, settling = false
  const animations: Animation[] = []
  const play = (node: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = node.animate(frames, { fill: 'both', ...options, delay: (options.delay ?? 0) + (settling ? 0 : startDelay) })
    animations.push(animation); void animation.finished.catch(() => {})
    return animation
  }
  const x = origin.x + origin.width * .5, y = origin.y + origin.height * .48
  const strokes = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: styles.windLines! })
  for (let i = 0; i < 2; i++) {
    const d = i === 0 ? `M${x - 110} ${y + 85}C${x - 20} ${y + 105} ${x + 110} ${y - 140} ${x + 210} ${y - 130}`
      : `M${-width * .08} ${height * .88}C${width * .32} ${height * .98} ${width * .38} ${height * .12} ${width * .95} ${height * .20}`
    const line = svgNode('path', { d,
      fill: 'none', stroke: palette[0]!, 'stroke-width': i ? '.8' : '1.2', 'stroke-linecap': 'round', pathLength: '100', 'stroke-dasharray': '35 100' })
    strokes.append(line)
    play(line, [{ strokeDashoffset: '100', opacity: 0 }, { strokeDashoffset: '45', opacity: i ? .28 : .45, offset: .25 },
      { strokeDashoffset: '-100', opacity: 0 }], { delay: i ? 450 : 160, duration: i ? 900 : 720, easing: 'cubic-bezier(.2,.6,.35,1)' })
  }
  container.append(strokes)
  const seedCount = mode === 'mobile' ? 16 : 26, dustCount = mode === 'mobile' ? 8 : 14
  const particles = Array.from({ length: seedCount + dustCount }, (_, index) => {
    const isDust = index >= seedCount
    const node = doc.createElement('div')
    node.className = styles.dandelion!
    node.dataset.breezeKind = isDust ? 'dust' : 'seed'
    node.append(isDust ? dust(palette[0]!, palette[2]!) : seed(palette[0]!, palette[3]!, index % 4 === 3 ? palette[2] : undefined))
    const depth = index % 4 / 3
    const size = isDust ? 5 + depth * 6 : (mode === 'mobile' ? 12 : 14) + depth * (mode === 'mobile' ? 12 : 16)
    node.style.width = `${size}px`; node.style.height = `${size * (isDust ? 1 : 1.5)}px`
    container.append(node)
    // Low-discrepancy lanes span the pages, without a visible grid or central plume.
    const targetX = width * (.06 + (index * .618034 % 1) * .88)
    const targetY = height * (.09 + ((index * .754877 + .13) % 1) * .84)
    const driftX = width * (.22 + depth * .13), driftY = -height * (.20 + depth * .13)
    const startX = targetX - driftX, startY = targetY - driftY
    const delay = 420 + index % 5 * 28, duration = 950 + (1 - depth) * 270
    play(node, Array.from({ length: 25 }, (_, k) => {
      const u = k / 24, travel = 1 - (1 - u) ** 3
      // Both displacement and angular velocity settle gently at the gust's end.
      const ripple = (Math.sin(u * Math.PI * 1.3 + index) - Math.sin(index)) * Math.sin(Math.PI * u) ** 2
      const arrival = Math.min(1, u * 4), opacity = arrival ** 2 * (3 - 2 * arrival)
      return { transform: `translate3d(${startX + driftX * travel + ripple * (6 + depth * 8)}px,${startY + driftY * travel + ripple * (9 + depth * 9)}px,0) rotate(${-22 + index % 7 * 7 + ripple * 7}deg)`,
        opacity: opacity * (.32 + depth * .40) }
    }), { delay, duration, easing: 'linear' })
    // The same gentle air current runs from birth to fade, with no handoff/reset.
    // Periodic harmonics match position and velocity at the loop boundary.
    const period = 5100 + index % 7 * 370, phase = index * 2.399963
    play(node.firstElementChild!, Array.from({ length: 65 }, (_, k) => {
      const t = k / 64 * Math.PI * 2
      const sx = Math.sin(t + phase) - Math.sin(phase)
      const sy = Math.cos(t + phase) - Math.cos(phase)
      const flutter = Math.sin(t * 2 + phase * .7) - Math.sin(phase * .7)
      return { transform: `translate(${sx * (5 + depth * 4) + flutter * 2}px,${sy * (8 + depth * 5) + flutter * 3}px) rotate(${sx * 5 + flutter * 2}deg)` }
    }), { duration: period, iterations: Infinity, easing: 'linear' })
    const glow = node.querySelector('[data-breeze-light]')
    if (glow) play(glow, [{ opacity: .35 }, { opacity: .72, offset: .5 }, { opacity: .35 }],
      { duration: 2800 + index % 5 * 310, delay: index % 6 * 90, iterations: Infinity, easing: 'ease-in-out' })
    return node
  })
  const dispose = () => {
    if (disposed) return
    disposed = true
    animations.forEach(animation => animation.cancel()); container.remove()
    doc.removeEventListener('visibilitychange', onVisibility)
    if (!root.childElementCount) { root.hidden = true; delete root.dataset.phase }
  }
  const onVisibility = () => { if (doc.hidden) dispose() }
  doc.addEventListener('visibilitychange', onVisibility)
  return {
    settle() {
      if (disposed || settling) return
      settling = true
      root.dataset.phase = 'lingering'; strokes.remove()
      // Only opacity changes at reveal. Flight and flutter keep their native clocks.
      const fades = particles.map((node, index) => {
        const opacity = Number(getComputedStyle(node).opacity)
        const delay = 180 + (index * .754877 % 1) * 320
        const duration = 2500 - delay - index % 5 * 85
        return play(node, Array.from({ length: 33 }, (_, k) => {
          const u = k / 32, dissolve = u ** 3 * (10 - 15 * u + 6 * u ** 2)
          return { opacity: opacity * (1 - dissolve) }
        }), { delay, duration, easing: 'linear' }).finished
      })
      // A timer can cancel the compositor before its last transparent frame.
      void Promise.all(fades).then(dispose, dispose)
    },
    dispose,
  }
}
