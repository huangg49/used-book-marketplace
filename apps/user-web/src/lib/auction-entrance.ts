import layers from './auction-curtain/layers.json'
import { DURATION, W, H, SIDE_WIDTH, frameOpacity, phase, spritePose, type Layer } from './auction-curtain/model.mjs'
import { MeshRenderer } from './auction-curtain/renderer.mjs'
import { elapsedToCurtainTime, entranceDuration } from './auction-curtain/timing'

const assetRoot = '/illustrations/auction-curtain/'
const valanceHeight = .85 * .95
const artLayers: Layer[] = layers.map(layer => {
  if (!layer.motionAnchor) return layer
  // Tie accessories use the same side compression as their outer-cloth socket.
  const x = layer.id.includes('left') ? layer.x * SIDE_WIDTH : W - (W - layer.x) * SIDE_WIDTH
  return { ...layer, x, width: layer.width * SIDE_WIDTH }
})
const imageCache = new Map<string, Promise<HTMLImageElement>>()
function loadImage(file: string) {
  const name = file.split('/').at(-1)!
  let promise = imageCache.get(name)
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => void img.decode().then(() => resolve(img), reject)
      img.onerror = () => reject(new Error('Curtain art unavailable'))
      img.src = assetRoot + name
    }).catch(error => { imageCache.delete(name); throw error })
    imageCache.set(name, promise)
  }
  return promise
}

/** One finite entrance per mounted list route, independent of data and URL filters. */
export function startAuctionEntrance(root: HTMLDivElement, styles: Record<string, string>) {
  const view = root.ownerDocument.defaultView!
  const doc = root.ownerDocument
  const headerSlot = doc.querySelector<HTMLElement>('[data-member-header-slot]')
  const header = headerSlot?.querySelector('header')
  let disposed = false, raf = 0, time = 0, start = 0, started = false
  let ornamentScale = 1
  const renderers: MeshRenderer[] = []
  const sprites: { layer: Layer; img: HTMLImageElement }[] = []
  const art = doc.createElement('div')
  art.className = styles.art!
  root.replaceChildren(art)
  root.hidden = false
  root.dataset.state = 'preparing'
  root.dataset.time = '0'
  root.dataset.duration = String(entranceDuration)
  let initialScroll = view.scrollY
  const stop = () => {
    if (disposed) return
    disposed = true
    view.cancelAnimationFrame(raf)
    view.clearTimeout(deadline)
    observer.disconnect()
    view.removeEventListener('scroll', onScroll)
    view.removeEventListener('pagehide', stop)
    doc.removeEventListener('visibilitychange', onVisibility)
    doc.removeEventListener('pointerdown', stop, true)
    doc.removeEventListener('focusin', stop, true)
    doc.removeEventListener('keydown', stop, true)
    renderers.forEach(renderer => renderer.dispose())
    root.hidden = true
    root.dataset.state = 'finished'
    root.replaceChildren()
  }
  const onVisibility = () => { if (doc.hidden) stop() }
  const onScroll = () => { if (start && Math.abs(view.scrollY - initialScroll) > 24) stop() }
  const draw = () => {
    for (const renderer of renderers) renderer.draw(time)
    for (const { layer, img } of sprites) {
      const { x, y, angle } = spritePose(time, layer)
      const dy = layer.id.startsWith('valance-') || layer.attachment ? y * ornamentScale * valanceHeight : y
      img.style.transform = `translate(${x}px,${dy}px) rotate(${angle}deg)`
    }
    art.style.opacity = String(frameOpacity(time))
    root.dataset.time = String(Math.round(time))
    root.dataset.phase = phase(time)
  }
  const resize = () => {
    if (disposed) return
    if (headerSlot) {
      // Use the stable reserved row rather than following navbar transform
      // animation. A larger actual header (e.g. large text) still reserves room.
      const height = Math.max(headerSlot.getBoundingClientRect().height, header?.getBoundingClientRect().height || 0)
      root.style.setProperty('--auction-nav-height', `${Math.ceil(height)}px`)
    }
    const { width, height } = root.getBoundingClientRect()
    if (width <= 0 || height <= 0) { stop(); return }
    art.style.transform = `scale(${width / W},${height / H})`
    // Portrait cloth still spans the viewport, but the shallow top swags and
    // accessories retain their proportions rather than stretching into tall loops.
    ornamentScale = Math.min(1, (width / W) * 1.5 / (height / H))
    for (const { layer, img } of sprites) {
      const isValance = layer.id.startsWith('valance-') || !!layer.attachment
      const scale = ornamentScale * (isValance ? valanceHeight : 1)
      img.style.height = `${layer.height * scale}px`
      const top = isValance ? layer.y * scale
        : layer.id.startsWith('tassels-') ? 532 + 12 * ornamentScale : layer.y
      img.style.top = `${top}px`
    }
    for (const renderer of renderers) renderer.resize(width, height, view.devicePixelRatio || 1)
    if (started) { try { draw() } catch { stop() } }
  }
  const observer = new ResizeObserver(resize)
  // Slow decoration never becomes a loading gate. A later image completion
  // cannot put curtains back over content after this deadline or navigation.
  const deadline = view.setTimeout(stop, 1200)
  if (doc.hidden) { stop(); return stop }
  observer.observe(root)
  if (headerSlot) observer.observe(headerSlot)
  if (header) observer.observe(header)
  resize()
  view.addEventListener('scroll', onScroll, { passive: true })
  view.addEventListener('pagehide', stop)
  doc.addEventListener('visibilitychange', onVisibility)
  doc.addEventListener('pointerdown', stop, true)
  doc.addEventListener('focusin', stop, true)
  doc.addEventListener('keydown', stop, true)

  const createRenderer = (kind: 'inner' | 'outer', images: HTMLImageElement[], z: number, force = false) => {
    const canvas = doc.createElement('canvas')
    canvas.className = styles.mesh!
    canvas.style.zIndex = String(z)
    art.append(canvas)
    const renderer = new MeshRenderer(canvas, images, kind, force)
    renderers.push(renderer)
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      if (disposed) return
      renderer.dispose()
      renderers.splice(renderers.indexOf(renderer), 1)
      canvas.remove()
      try { createRenderer(kind, images, z, true); resize(); draw() } catch { stop() }
    }, { once: true })
  }
  void Promise.all([
    Promise.all(artLayers.filter(l => !l.id.startsWith('outer-')).map(l => loadImage(l.file))),
    Promise.all(['left', 'right'].map(side => loadImage(`inner-closed-${side}.png`))),
    Promise.all(['left', 'right'].map(side => loadImage(`outer-${side}.png`))),
  ]).then(([staticImages, innerImages, outerImages]) => {
    if (disposed) return
    const staticLayers = artLayers.filter(l => !l.id.startsWith('outer-'))
    staticLayers.forEach((layer, index) => {
      // Clone cached decoded images: each route mount owns its DOM/lifecycle.
      const img = staticImages[index]!.cloneNode() as HTMLImageElement
      img.className = styles.sprite!
      img.alt = ''
      img.dataset.layer = layer.id
      Object.assign(img.style, { left: `${layer.x}px`, top: `${layer.y}px`, width: `${layer.width}px`,
        height: `${layer.height}px`, zIndex: layer.z, clipPath: layer.clip || 'none',
        transformOrigin: `${layer.pivot[0]! * 100}% ${layer.pivot[1]! * 100}%` })
      art.append(img)
      sprites.push({ layer, img })
    })
    try {
      createRenderer('inner', innerImages, 20)
      createRenderer('outer', outerImages, 60)
      started = true
      view.clearTimeout(deadline)
      resize()
      if (disposed) return
      draw()
      root.dataset.renderer = renderers.map(r => r.mode).join(' + ')
      root.dataset.state = 'opening'
      const tick = (now: number) => {
        if (disposed) return
        if (!start) { start = now; initialScroll = view.scrollY }
        time = elapsedToCurtainTime(now - start)
        try { draw() } catch { stop(); return }
        if (time >= DURATION) stop()
        else raf = view.requestAnimationFrame(tick)
      }
      raf = view.requestAnimationFrame(tick)
    } catch { stop() }
  }, stop)
  return stop
}
