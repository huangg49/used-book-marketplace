import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundlePlan, checkBundleBudget } from './admin-bundle.mjs';

const fixture = () => ({
  'index.html': { file: 'entry.js', isEntry: true, imports: ['shared'], dynamicImports: ['page'], css: ['common.css'] },
  shared: { file: 'shared.js', imports: ['index.html'], css: ['common.css'] },
  page: { file: 'page.js', isDynamicEntry: true, imports: ['shared', 'helper'], css: ['page.css'] },
  helper: { file: 'helper.js', imports: ['shared'] },
});
test('counts shared startup imports once, handles cycles, and excludes lazy pages', () => {
  const plan = bundlePlan(fixture(), ['page']);
  assert.deepEqual(plan.initial, ['entry.js', 'common.css', 'shared.js']);
  assert.deepEqual(plan.routes[0].files, ['page.js', 'page.css', 'helper.js']);
  assert.equal(plan.javascript.length, 4);
});
test('fails when a deferred page becomes an eager dependency', () => {
  const manifest = fixture();
  manifest.shared.imports.push('page');
  assert.throws(() => bundlePlan(manifest, ['page']), /no longer deferred/);
});
test('fails if a page was removed or not emitted as a dynamic entry', () => {
  assert.throws(() => bundlePlan(fixture(), ['missing']), /no longer deferred/);
  const manifest = fixture();
  manifest.page.isDynamicEntry = false;
  assert.throws(() => bundlePlan(manifest, ['page']), /no longer deferred/);
});
test('fails on broken dependency references instead of undercounting startup', () => {
  const manifest = fixture();
  manifest.shared.imports.push('missing');
  assert.throws(() => bundlePlan(manifest, ['page']), /Missing bundle dependency/);
});
test('rejects missing or ambiguous HTML entries', () => {
  assert.throws(() => bundlePlan({}, []), /exactly one/);
  assert.throws(() => bundlePlan({ ...fixture(), other: { file: 'other.js', isEntry: true } }, []), /exactly one/);
});
test('checks startup sum and largest chunk as independent limits', () => {
  const report = { initial: { javascript: { bytes: 500_000 } }, largestChunk: { bytes: 300_000 } };
  assert.doesNotThrow(() => checkBundleBudget(report));
  assert.throws(() => checkBundleBudget({ ...report, initial: { javascript: { bytes: 500_001 } } }), /startup/);
  assert.throws(() => checkBundleBudget({ ...report, largestChunk: { bytes: 300_001 } }), /chunk exceeds/);
});
