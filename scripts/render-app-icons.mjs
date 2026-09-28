// Raster outputs of the existing brand vectors for Expo; no new logo geometry.
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "apps/api/package.json"));
const sharp = require("sharp");
const { palette } = JSON.parse(
  await readFile(
    path.join(root, "packages/brand/v1.1/identity.tokens.json"),
    "utf8",
  ),
);
const output = path.join(root, "apps/mobile-react-native/assets/brand");
await mkdir(output, { recursive: true });
async function render(name, variant, size, symbolSize, background) {
  const source = await readFile(
    path.join(root, `packages/brand/logos/lat-lai-symbol-${variant}.svg`),
    "utf8",
  );
  const geometry = source.slice(
    source.indexOf("<g "),
    source.lastIndexOf("</svg>"),
  );
  const offset = (size - symbolSize) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ""}<g transform="translate(${offset} ${offset}) scale(${symbolSize / 128})">${geometry}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, name));
}
await render("icon.png", "primary", 1024, 720, palette.paper);
// Foreground stays inside the centered safe circle, including the turning page.
await render("adaptive-foreground.png", "primary", 1024, 512);
await render("adaptive-monochrome.png", "mono", 1024, 512);
await render("splash.png", "primary", 256, 256);
await render("favicon.png", "primary", 64, 56, palette.paper);
console.log("Rendered five Expo assets from the existing Lật lại symbol.");
