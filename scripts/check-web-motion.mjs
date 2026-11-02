// CSS-only browser fixtures: authored styles from both apps, no API or DB calls.
import assert from "node:assert/strict";
import { mkdir, writeFile, readdir, readFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(root, ".tmp/web-motion/browser");
await mkdir(artifacts, { recursive: true });
const require = createRequire(path.join(root, "apps/admin-web/package.json"));
const { chromium } = require("playwright");
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
const results = [];
async function sourcePolicy(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await sourcePolicy(file);
    else if (entry.name.endsWith(".css")) {
      const css = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
      assert(!/@media[^{}]*prefers-reduced-motion/.test(css), `Preference-specific motion CSS: ${path.relative(root, file)}`);
    }
  }
}
const browser = await chromium.launch({ headless: true });
try {
  for (const [app, port] of [["user-web", 5199], ["admin-web", 5294]]) {
    await sourcePolicy(path.join(root, "apps", app, "src"));
    const origin = `http://127.0.0.1:${port}`;
    const fixtureDirectory = path.join(root, "apps", app, ".tmp/web-motion");
    await mkdir(fixtureDirectory, { recursive: true });
    const html = path.join(fixtureDirectory, "index.html");
    await writeFile(html, `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Motion CSS QA</title><body>
      <script type="module">
        const modules = import.meta.glob('/src/**/*.css', { eager: true });
        const c = file => modules['/src/' + file].default;
        const isMember = ${JSON.stringify(app)} === 'user-web';
        if (isMember) {
          const journey = c('components/BookJourneyStates.module.css');
          const exchange = c('pages/ExchangePage.module.css');
          const search = c('pages/BookSearchPage.module.css');
          const home = c('pages/HomePage.module.css');
          document.body.innerHTML = '<div data-probe="pending-book" class="' + journey.pendingArt + '"></div>' +
            '<div data-probe="exchange-card" class="' + exchange.card + '">QA</div>' +
            '<div class="' + search.page + '"><button data-probe="search-button">QA</button></div>' +
            '<div data-probe="hero-cover" class="' + home.heroCover + '"><img alt="" /></div>';
        } else {
          const gallery = c('features/review/ReviewGallery.module.css');
          const select = c('core/PaperSelect.module.css');
          document.body.innerHTML = '<button class="button" data-probe="admin-button"><span class="animate-spin" data-probe="busy-spinner">QA</span></button>' +
            '<p class="field-error" data-probe="field-feedback">QA</p>' +
            '<div class="' + select.select + '"><button data-probe="paper-select">QA</button></div>' +
            '<div class="' + gallery.preview + '"><img data-probe="gallery-image" alt="" /></div>' +
            '<dialog><button>QA</button></dialog>';
          document.querySelector('dialog').showModal();
        }
        window.motionFixtureReady = true;
      </script></body></html>`);
    const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: path.join(root, "apps", app), windowsHide: true, stdio: "ignore",
    });
    let page;
    try {
      for (let n = 0; n < 100; n++) {
        try { if ((await fetch(origin)).ok) break; } catch { /* Vite startup */ }
        assert.equal(vite.exitCode, null, "QA port occupied or Vite failed");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      page = await browser.newPage({ reducedMotion: "no-preference" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}/.tmp/web-motion/index.html`);
      await page.waitForFunction(() => window.motionFixtureReady);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const snapshots = [];
        for (const preference of ["no-preference", "reduce"]) {
          await page.emulateMedia({ reducedMotion: preference });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), preference === "reduce");
          snapshots.push(await page.evaluate(() => [...document.querySelectorAll("[data-probe]")].map(el => {
            const s = getComputedStyle(el);
            return { probe: el.dataset.probe, animation: s.animationName, duration: s.animationDuration,
              iterations: s.animationIterationCount, transition: s.transitionProperty, transitionDuration: s.transitionDuration };
          })));
        }
        assert.deepEqual(snapshots[1], snapshots[0], `${app}: OS preference changed authored motion at ${width}px`);
        const animationProbe = app === "user-web" ? "pending-book" : "busy-spinner";
        const animated = snapshots[1].find(s => s.probe === animationProbe);
        assert(animated && animated.animation !== "none" && parseFloat(animated.duration) > .05 && animated.iterations === (app === "user-web" ? "1" : "infinite"), `${app}: preserve the authored duration and iteration count`);
        const progress = await page.locator(`[data-probe="${animationProbe}"]`).evaluate(async el => {
          const animation = el.getAnimations()[0];
          if (!animation) return false;
          // Replay the finite 560ms submission illustration to observe its clock;
          // never turn that authored one-shot into a loop.
          animation.currentTime = 0;
          animation.play();
          const before = animation.currentTime;
          await new Promise(resolve => setTimeout(resolve, 120));
          return animation.playState === "running" && animation.currentTime > before;
        });
        assert(progress, `${app}: animation clock must advance with reduced motion enabled`);
        results.push({ app, width, preferenceParity: "PASS", liveAnimationClock: "PASS", styles: snapshots[1] });
      }
      assert.deepEqual(errors, []);
    } finally {
      await page?.close();
      await unlink(html);
      vite.kill();
      if (vite.exitCode === null) await new Promise(resolve => { vite.once("exit", resolve); setTimeout(resolve, 2000); });
    }
  }
  // Exercise the real RN-web platform adapter and hook, without booting the app
  // or changing native behavior. Expo export is a separate compilation check.
  const expoRoot = path.join(root, "apps/mobile-react-native");
  const expoRequire = createRequire(path.join(expoRoot, "package.json"));
  const expoConfig = path.join(artifacts, "expo-vite.config.mjs");
  const expoDirectory = path.join(expoRoot, ".tmp/web-motion");
  await mkdir(expoDirectory, { recursive: true });
  const expoHtml = path.join(expoDirectory, "index.html");
  await writeFile(expoConfig, `export default { resolve: { alias: { 'react-native': ${JSON.stringify(expoRequire.resolve("react-native-web"))} } } };`);
  await writeFile(expoHtml, `<!doctype html><html><meta charset="utf-8"><body><div id="root"></div><script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AccessibilityInfo } from 'react-native';
    import { useReducedMotion } from '/src/core/ui/motion.ts';
    window.readPlatformPreference = () => AccessibilityInfo.isReduceMotionEnabled();
    function Probe() { const reduced = useReducedMotion(); window.webMotionReduced = reduced; return React.createElement('p', null, reduced ? 'reduced' : 'full'); }
    createRoot(document.getElementById('root')).render(React.createElement(Probe));
  </script></body></html>`);
  const expoVite = spawn(process.execPath, [viteBin, "--config", expoConfig, "--host", "127.0.0.1", "--port", "5295", "--strictPort"], { cwd: expoRoot, windowsHide: true, stdio: "ignore" });
  let expoPage;
  try {
    for (let n = 0; n < 100; n++) {
      try { if ((await fetch("http://127.0.0.1:5295/.tmp/web-motion/index.html")).ok) break; } catch { /* startup */ }
      assert.equal(expoVite.exitCode, null, "Expo hook QA Vite failed");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expoPage = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    expoPage.on("pageerror", error => errors.push(error.message));
    await expoPage.goto("http://127.0.0.1:5295/.tmp/web-motion/index.html");
    await expoPage.waitForFunction(() => typeof window.webMotionReduced === "boolean");
    for (const reducedMotion of ["reduce", "no-preference", "reduce"]) {
      await expoPage.emulateMedia({ reducedMotion });
      await expoPage.waitForFunction(async expected => await window.readPlatformPreference() === expected, reducedMotion === "reduce");
      assert.equal(await expoPage.evaluate(() => window.readPlatformPreference()), reducedMotion === "reduce", "RN-web must see the emulated OS preference");
      assert.equal(await expoPage.evaluate(() => window.webMotionReduced), false, "Expo-web hook must keep authored motion enabled");
    }
    assert.deepEqual(errors, []);
    results.push({ app: "Expo web", preferenceChanges: "reduce → no-preference → reduce", authoredMotion: "PASS", adapter: "real react-native-web + React hook" });
  } finally {
    await expoPage?.close();
    await unlink(expoHtml);
    expoVite.kill();
    if (expoVite.exitCode === null) await new Promise(resolve => { expoVite.once("exit", resolve); setTimeout(resolve, 2000); });
  }
  await writeFile(path.join(artifacts, "result.json"), JSON.stringify({ status: "PASS", scope: "real source CSS, synthetic style fixtures; no API/DB", results }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: results.length, apps: ["Member web", "Admin/Staff", "Expo web"], preferences: ["reduce", "no-preference"], apiDatabaseCalls: false }));
} finally { await browser.close(); }
