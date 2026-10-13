// Preview only. Own browser/server; no real Login/API/DB writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STACK_DURATION, STACK_GUST_DURATION } from '../previews/auth-wind/stack.mjs';
import { STAMP_DURATION, STAMP_FLIGHT_DURATION } from '../previews/auth-wind/stamp-flight.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const appRoot = path.join(root, 'apps/user-web');
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const webRequire = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
const stack = process.argv.includes('--stack') || process.env.AUTH_WIND_STACK === '1';
const trigger = stack ? 'Đăng nhập' : 'Thổi gió';
const previewURL = `http://127.0.0.1:5199/previews/auth-wind/${stack ? 'stack/' : ''}`;
const evidence = path.join(root, process.argv.includes('--regression') ? '.tmp/auth-wind-single-regression' : `.impeccable/review/${stack ? 'auth-wind-fragments' : 'auth-wind-gust'}`);
const approvedDrift = JSON.parse(await readFile(path.join(root, '.impeccable/review/auth-wind-drift/runtime.json'), 'utf8'));
await mkdir(evidence, { recursive: true });
process.chdir(appRoot);
const server = await createServer({ root: appRoot, server: { host: '127.0.0.1', port: 5199, strictPort: true } });
let browser;
const results = [];
try {
  await server.listen();
  browser = await chromium.launch();
  for (const [name, viewport] of [['desktop', { width: 1366, height: 768 }], ['mobile', { width: 390, height: 844 }]]) {
    const errors = [], api = [];
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', recordVideo: { dir: path.join(root, '.tmp/auth-wind-video'), size: viewport } });
    await context.route('**/api/**', route => { api.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    const seekFlight = value => page.locator('#wind-time').fill(stack
      ? String(Math.round((STAMP_DURATION + Number(value) / 1000 * STACK_DURATION) / STAMP_FLIGHT_DURATION * 1000)) : String(value));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(previewURL);
    await page.getByRole('button', { name: trigger, exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.wind-primary').disabled);
    const domImage = await page.screenshot({ path: path.join(evidence, `${name}-dom.png`) });
    const rect = await page.locator('[data-auth-paper]').boundingBox();
    await page.getByRole('button', { name: 'Đối chiếu: bản trên lưới', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-auth-paper]')).visibility === 'hidden');
    const meshImage = await page.screenshot({ path: path.join(evidence, `${name}-mesh.png`) });
    const difference = await page.evaluate(async ({ before, after, rect }) => {
      const pixels = async data => {
        const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        return context.getImageData(Math.round(rect.x + 3), Math.round(rect.y + 6), Math.round(rect.width - 6), Math.round(rect.height - 9)).data;
      };
      const [a, b] = await Promise.all([pixels(before), pixels(after)]);
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) for (let channel = 0; channel < 3; channel++) sum += Math.abs(a[i + channel] - b[i + channel]);
      return sum / (a.length / 4 * 3);
    }, { before: domImage.toString('base64'), after: meshImage.toString('base64'), rect });
    // Pixel identity is not claimed: resampling/subpixel text differ. This gate
    // catches displaced layout, missing dividers, or a material/color jump.
    assert.ok(difference < 6, `DOM/mesh mean RGB difference ${difference}/255`);
    const profiles = [], bends = [];
    // Sample curvature during flight; the stack no longer has a gust window.
    for (const value of ['140', '300', '440', '500', '580']) {
      await seekFlight(value);
      const sample = await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.profile));
      assert.ok(sample.every(Number.isFinite), 'Every sampled region must remain finite');
      profiles.push(sample);
      bends.push(await page.locator('.paper-canvas').evaluate(element => Number(element.dataset.maxBend)));
    }
    // The owner rejected the hinged half-sheet. These gates now guard whole-
    // body waves and prevent the lower section folding back into a wing.
    assert.ok(bends.every(value => value > 0 && value < 1.2), 'Paper must bend without a doubled-back lower flap');
    if (stack) assert.ok(profiles.some(profile => Math.abs(profile[0]) > .001), 'Flight curvature must include the upper body, not hinge the lower half');
    else {
      assert.ok(Math.max(...profiles.map(profile => profile[0])) - Math.min(...profiles.map(profile => profile[0])) > .02, 'Upper body must participate in the wave');
      assert.ok(profiles.some(profile => profile.some(value => value < -.01) && profile.some(value => value > .01)), 'Wave must curve across the body on both sides of its centre');
    }
    const baseline = approvedDrift.results.find(result => result.name === name);
    if (!stack) assert.deepEqual(profiles.slice(3), baseline.profiles.slice(3), 'Approved single-sheet shape at and after halfway must stay unchanged');
    const gustAngles = [];
    for (let value = 80; value <= 440; value += 10) {
      await seekFlight(value);
      gustAngles.push(await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.angles)[1]));
    }
    const directions = gustAngles.slice(1).map((value, i) => Math.sign(value - gustAngles[i]));
    const turns = directions.slice(1).filter((value, i) => value !== directions[i]).length;
    if (!stack) assert.ok(turns >= 4, 'Opening gust should have several quick flutter reversals');
    else {
      assert.equal(STACK_GUST_DURATION, 0, 'No opening wind phase remains');
      await page.locator('#wind-time').fill(String(Math.round((STAMP_DURATION + 20) / STAMP_FLIGHT_DURATION * 1000)));
      const opening = await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.flightStates));
      assert.ok(opening.every(state => state.travel > 0 && Math.hypot(...state.position.slice(0, 2)) > 1), 'Every sheet must move within 20ms, without a waiting phase');
    }
    const angles = [];
    for (const value of ['140', '200']) {
      await seekFlight(value);
      angles.push(await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.angles)));
    }
    for (const [phase, value] of [['flutter', '220'], ['lift', '380'], ['turn', '550'], ['back', '700']]) {
      await seekFlight(value);
      await page.screenshot({ path: path.join(evidence, `${name}-${phase}.png`) });
    }
    let stackChecks;
    if (stack) {
      // The existing stamp hits while the paper rests, then remains attached
      // to the front texture throughout the flight, including pause/scrub.
      for (const time of [0, 140, 279, 300]) {
        await page.locator('#wind-time').fill(String(Math.round(time / STAMP_FLIGHT_DURATION * 1000)));
        const stamp = await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.stamp));
        const sheets = await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.flightStates));
        const fragments = await page.locator('.paper-canvas').evaluate(element => JSON.parse(element.dataset.fragments));
        if (time < STAMP_DURATION) assert.equal(fragments.visible, 0, 'Fragments wait until the stamp has landed');
        else assert.ok(fragments.visible > 0, 'Small fragments burst as the paper leaves');
        if (time === 0) assert.equal(stamp.opacity, 0, 'Resting form is unstamped');
        else assert.ok(stamp.opacity > 0 && stamp.scale >= 1 && stamp.scale < 1.6, 'Original stamp hit scales down into the paper');
        if (time < STAMP_DURATION) assert.ok(sheets.every(state => state.travel === 0), 'Stamp lands before flight, with no premature motion');
        else assert.ok(sheets.every(state => state.travel > 0), 'Flight begins directly after the stamp');
      }
      await page.locator('#wind-time').fill(String(Math.round(STAMP_DURATION / STAMP_FLIGHT_DURATION * 1000)));
      await page.screenshot({ path: path.join(evidence, `${name}-stamp.png`) });
      const depths = [], flightPixels = [], flightStates = [];
      for (let value = 0; value <= 1000; value += 10) {
        await seekFlight(value);
        const data = await page.locator('.paper-canvas').evaluate(element => ({
          count: Number(element.dataset.actors), gaps: JSON.parse(element.dataset.depthGaps), progress: JSON.parse(element.dataset.localProgress), scale: Number(element.dataset.frontScaleRatio),
          states: JSON.parse(element.dataset.flightStates), profiles: JSON.parse(element.dataset.sheetProfiles), fragments: JSON.parse(element.dataset.fragments),
        }));
        assert.equal(data.count, 3, 'Exactly three full sheets throughout the shot');
        assert.equal(data.fragments.count, name === 'mobile' ? 18 : 30, 'Bounded fragment count for the viewport');
        assert.equal(data.fragments.finite, true, 'All fragment positions, angles and opacities stay finite');
        if (value >= 70 && value <= 350) assert.ok(data.fragments.visible > 0, 'The burst is visible during early flight');
        if (value >= 900) assert.equal(data.fragments.visible, 0, 'Fragments finish smoothly within the existing timeline');
        assert.equal(data.scale, 1, 'The form must keep its natural scale, not expand to cover the viewport');
        assert.ok(data.gaps.every(gap => gap > 0), `Authored flights must not intersect (pose ${value}, gaps ${data.gaps})`);
        assert.ok(data.progress.every(progress => Math.abs(progress - value / 1000) < .001), 'All three flights begin together without departure delays');
        assert.ok(data.states.every(state => state.flutter === 0), 'No gust/flutter should remain at any flight pose');
        flightStates.push({ time: value / 1000, states: data.states, profiles: data.profiles });
        depths.push(Math.min(...data.gaps));
      }
      for (const value of ['550', '700', '1000']) {
        await seekFlight(value);
        const alpha = await page.locator('.paper-canvas').evaluate(element => {
          const canvas = document.createElement('canvas'); canvas.width = element.width; canvas.height = element.height;
          const context = canvas.getContext('2d'); context.drawImage(element, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let opaque = 0, visible = 0;
          for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] >= 254) opaque++; if (pixels[i] > 0) visible++; }
          return { opaque: opaque / (pixels.length / 4), visible: visible / (pixels.length / 4) };
        });
        flightPixels.push({ time: Number(value) / 1000, ...alpha });
        if (value !== '1000') assert.ok(alpha.opaque < .85, 'Auth sheets must fly naturally; external pages will cover navigation');
        else assert.equal(alpha.visible, 0, 'All three sheets must leave at the end');
      }
      for (const [phase, value] of [['burst', '220'], ['fan', '370'], ['flight', '650'], ['exit', '850']]) {
        await seekFlight(value);
        await page.screenshot({ path: path.join(evidence, `${name}-${phase}.png`) });
      }
      // Compare the sheets at equal progress. Shared departure time must not
      // turn independently authored flights into copies of one rig.
      const matching = [];
      for (const [index, start] of [0, 0, 0].entries()) {
        await seekFlight(Math.round((start + .45 * (1 - start)) * 1000));
        matching.push(await page.locator('.paper-canvas').evaluate((element, i) => ({
          state: JSON.parse(element.dataset.flightStates)[i], profile: JSON.parse(element.dataset.sheetProfiles)[i],
        }), index));
      }
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        assert.ok(Math.hypot(...matching[i].state.rotation.map((v, k) => v - matching[j].state.rotation[k])) > .25, 'Orientation must differ at equal flight progress');
        assert.ok(Math.hypot(...matching[i].profile.map((v, k) => v - matching[j].profile[k])) > .01, 'Bending must differ at equal flight progress');
      }
      stackChecks = { fragments: { count: name === 'mobile' ? 18 : 30, noPreStampBurst: true, finite: true, boundedExit: true }, minDepthGap: Math.min(...depths), flightPixels, naturalFormScale: true, matching, flightStates: flightStates.filter((_, i) => i % 10 === 0) };
    }
    await page.getByRole('button', { name: 'Về trạng thái đầu', exact: true }).click();
    await page.getByRole('button', { name: trigger, exact: true }).click();
    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xem lại', exact: true }).waitFor();
    assert.equal(await page.locator('#wind-time').inputValue(), '1000');
    await page.getByRole('checkbox', { name: 'Xem chậm', exact: true }).check();
    await page.getByRole('button', { name: 'Xem lại', exact: true }).click();
    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Xem lại', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Về trạng thái đầu', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-auth-paper]')).visibility === 'visible');
    const data = await page.locator('.paper-canvas').evaluate(element => ({ ...element.dataset }));
    assert.equal(await page.locator('[data-auth-paper]').evaluate(element => getComputedStyle(element).visibility), 'visible');
    assert.deepEqual(errors, []); assert.deepEqual(api, []);
    results.push({ name, viewport, rect, ...data, profiles, bends, angles, gustTurns: turns, preservedLateShape: !stack, stackChecks, durationMs: stack ? STAMP_FLIGHT_DURATION : 2000, ...(stack ? { openingWindMs: STACK_GUST_DURATION, stampMs: STAMP_DURATION, flightMs: STACK_DURATION } : {}), meanRGBDifference: difference, errors, apiRequests: api.length });
    const video = page.video();
    await context.close(); await video.saveAs(path.join(evidence, `${name}.webm`));
  }
  const page = await browser.newPage({ viewport: { width: 446, height: 645 } });
  await page.route('**/api/**', route => route.abort());
  await page.goto(previewURL);
  await page.waitForFunction(() => document.querySelector('.wind-primary')?.disabled === false);
  await page.setViewportSize({ width: 700, height: 700 });
  await page.waitForFunction(() => !document.querySelector('.wind-primary').disabled && document.querySelector('.paper-canvas').width === innerWidth);
  await page.getByRole('button', { name: trigger, exact: true }).click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: trigger, exact: true }).waitFor();
  const pausedAt = await page.locator('#wind-time').inputValue();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#wind-time').inputValue(), pausedAt);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.querySelector('.paper-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  });
  await page.getByRole('button', { name: 'Tải lại bản thử', exact: true }).waitFor();
  assert.equal(await page.locator('[data-auth-paper]').evaluate(element => getComputedStyle(element).visibility), 'visible');
  await page.getByRole('button', { name: 'Tải lại bản thử', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.wind-primary')?.disabled === false);
  await page.close();
  results.push({ lifecycle: 'resize, hidden pause, context loss restores DOM, retry PASS' });
  await writeFile(path.join(evidence, 'runtime.json'), JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
  console.log(JSON.stringify(results.map(({ stackChecks, flightStates: _states, ...result }) => ({ ...result,
    ...(stackChecks ? { stackChecks: { fragments: stackChecks.fragments, minDepthGap: stackChecks.minDepthGap, flightPixels: stackChecks.flightPixels, naturalFormScale: stackChecks.naturalFormScale, distinctAtEqualProgress: true } } : {}),
  })), null, 2));
} finally { await browser?.close(); await server.close(); }
