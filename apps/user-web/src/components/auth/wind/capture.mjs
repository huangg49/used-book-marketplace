// Bounded Auth-only snapshot experiment, not a general DOM screenshot library.
// Input values are cleared before serialization (including revealed passwords).
// No field value, event handler or session is copied into the image.
const assets = new Map();
async function embedded(url) {
  const resolved = new URL(url, location.href);
  if (resolved.origin !== location.origin) throw new Error('Snapshot accepts local assets only');
  if (!assets.has(resolved.href)) assets.set(resolved.href, (async () => {
    const response = await fetch(resolved.href);
    if (!response.ok) throw new Error(`Missing snapshot asset: ${resolved.pathname}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  })());
  try { return await assets.get(resolved.href); }
  catch (error) { assets.delete(resolved.href); throw error; }
}
async function inlineUrls(value) {
  const matches = [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
  for (const match of matches) {
    // Local fragment filters must point to the SVG definitions inside the clone.
    const hash = match[1].indexOf('#');
    const replacement = hash >= 0 ? match[1].slice(hash) : await embedded(match[1]);
    value = value.replace(match[0], `url("${replacement}")`);
  }
  return value;
}
async function copy(source) {
  if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent);
  if (!(source instanceof Element)) return document.createTextNode('');
  const input = source instanceof HTMLInputElement;
  const node = source.cloneNode(false);
  if (input) { node.value = ''; node.defaultValue = ''; }
  for (const attribute of [...node.attributes]) {
    if (/^on/i.test(attribute.name) || ['id', 'name', 'value', 'autocomplete', 'href', 'for', 'tabindex'].includes(attribute.name)) node.removeAttribute(attribute.name);
  }
  const style = getComputedStyle(source);
  for (const property of style) node.style.setProperty(property, style.getPropertyValue(property));
  node.style.animation = 'none';
  node.style.transition = 'none';
  if (style.backgroundImage !== 'none') node.style.backgroundImage = await inlineUrls(style.backgroundImage);
  if (style.filter.includes('url(')) node.style.filter = await inlineUrls(style.filter);
  if (input) {
    node.setAttribute('value', '');
  } else {
    if (source instanceof HTMLImageElement) {
      node.src = await embedded(source.currentSrc || source.src);
      node.removeAttribute('srcset');
    }
    const children = await Promise.all([...source.childNodes].map(copy));
    node.replaceChildren(...children);
    for (const position of ['before', 'after']) {
      const pseudo = getComputedStyle(source, `::${position}`);
      if (pseudo.content !== 'none' && pseudo.content !== 'normal') {
        const decoration = document.createElement('span');
        for (const property of pseudo) decoration.style.setProperty(property, pseudo.getPropertyValue(property));
        decoration.textContent = pseudo.content.replace(/^['"]|['"]$/g, '');
        if (position === 'before') node.prepend(decoration); else node.append(decoration);
      }
    }
  }
  return node;
}
async function fontStyles() {
  const fonts = [
    ['Be Vietnam Pro', '/fonts/BeVietnamPro-Regular.ttf', '400'],
    ['Be Vietnam Pro', '/fonts/BeVietnamPro-Bold.ttf', '700'],
    ['Auth Bricolage', '/fonts/auth/BricolageGrotesque.ttf', '200 800'],
    ['Auth Melody', '/fonts/auth/MTD-Fancy-Melody.otf', '400'],
  ];
  return (await Promise.all(fonts.map(async ([family, url, weight]) =>
    `@font-face{font-family:'${family}';src:url('${await embedded(url)}');font-weight:${weight};}`))).join('');
}
export async function snapshotPaper(source, back = false, stampOnly = false) {
  const started = performance.now();
  await document.fonts.ready;
  await Promise.all([...source.querySelectorAll('img')].map(image => image.decode()));
  const rect = source.getBoundingClientRect();
  const width = parseFloat(getComputedStyle(source).width), height = parseFloat(getComputedStyle(source).height);
  const clone = await copy(source);
  if (!stampOnly) clone.querySelectorAll('[data-auth-stamp],[data-preview-stamp]').forEach(node => node.remove());
  Object.assign(clone.style, { width: `${width}px`, height: `${height}px`, minHeight: '0', position: 'relative', inset: 'auto', margin: '0', transform: 'none', boxShadow: 'none', visibility: 'visible' });
  if (back) {
    const ink = document.querySelector('[data-auth-leaf] > [aria-hidden="true"] > div');
    if (!ink) throw new Error('Auth reverse not found');
    clone.replaceChildren(await copy(ink));
    Object.assign(clone.style, { justifyContent: 'center', alignItems: 'center', borderTopColor: 'transparent', backgroundColor: '#f0e2ca' });
  }
  if (stampOnly) {
    const stamp = source.querySelector('[data-preview-stamp]');
    if (!stamp) throw new Error('Preview stamp not found');
    const ink = await copy(stamp);
    ink.style.visibility = 'visible';
    // Computed visibility from the hidden capture source is copied onto the
    // date as well; reveal the whole imprint, not just its outer element.
    ink.querySelectorAll('*').forEach(node => { node.style.visibility = 'visible'; });
    clone.replaceChildren(ink);
    Object.assign(clone.style, { backgroundColor: 'transparent', backgroundImage: 'none', borderTopColor: 'transparent' });
  }
  const definitions = document.getElementById('auth-logo-ink')?.parentElement.outerHTML ?? '';
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${definitions}<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${await fontStyles()}input::placeholder{color:#716157;-webkit-text-fill-color:#716157;opacity:1}</style>${xml}</div></foreignObject></svg>`;
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Throws for a tainted/unsupported capture before the live DOM can be hidden.
  context.getImageData(0, 0, 1, 1);
  return { canvas, rect, milliseconds: Math.round(performance.now() - started) };
}
