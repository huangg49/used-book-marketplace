import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const deferredPages = [
  'dashboard/DashboardPage', 'review/queue', 'review/detail', 'users/directory',
  'operations/queues', 'operations/points', 'operations/incidents',
  'operations/escalations', 'operations/simulator', 'operations/simulator-events',
].map(name => `src/features/${name}.tsx`);

// Count the whole static dependency graph, including modulepreloads. Measuring
// just index.js would disguise moving the same startup cost into another file.
export function bundlePlan(manifest, pages = deferredPages) {
  const entries = Object.keys(manifest).filter(key => manifest[key].isEntry);
  if (entries.length !== 1 || entries[0] !== 'index.html') {
    throw new Error('Expected exactly one Admin HTML entry.');
  }
  const closure = (keys) => {
    const seen = new Set();
    const visit = key => {
      if (seen.has(key)) return;
      if (!manifest[key]) throw new Error(`Missing bundle dependency: ${key}`);
      seen.add(key);
      for (const dependency of manifest[key].imports ?? []) visit(dependency);
    };
    keys.forEach(visit);
    return seen;
  };
  const initial = closure(entries);
  const files = keys => [...new Set([...keys].flatMap(key => [
    manifest[key].file, ...(manifest[key].css ?? []),
  ]))];
  const routes = pages.map(key => {
    if (!manifest[key]?.isDynamicEntry || initial.has(key)) {
      throw new Error(`Admin page is no longer deferred: ${key}`);
    }
    const dependencies = closure([key]);
    return { source: key, files: files([...dependencies].filter(key => !initial.has(key))) };
  });
  return {
    initial: files(initial),
    routes,
    javascript: [...new Set(Object.values(manifest).map(value => value.file).filter(file => file.endsWith('.js')))],
  };
}

export function checkBundleBudget(report) {
  // Decimal bytes, matching Vite's displayed kB. Separate startup and file
  // limits: neither splitting startup into shared files nor merging pages
  // into one oversized deferred chunk should silently evade this check.
  if (report.initial.javascript.bytes > 500_000) {
    throw new Error('Admin startup JavaScript exceeds the 500 kB budget.');
  }
  if (report.largestChunk.bytes > 300_000) {
    throw new Error('An Admin JavaScript chunk exceeds the 300 kB budget.');
  }
}

export async function reportAdminBundle(dist) {
  const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
  const plan = bundlePlan(manifest);
  const measured = new Map();
  const measure = async file => {
    if (!measured.has(file)) {
      const buffer = await readFile(path.join(dist, file));
      measured.set(file, { bytes: buffer.length, gzip: gzipSync(buffer).length });
    }
    return measured.get(file);
  };
  const total = async files => {
    const sizes = await Promise.all(files.map(measure));
    return sizes.reduce((sum, value) => ({ bytes: sum.bytes + value.bytes, gzip: sum.gzip + value.gzip }), { bytes: 0, gzip: 0 });
  };
  const chunks = await Promise.all(plan.javascript.map(async file => ({ file, ...await measure(file) })));
  const report = {
    initial: {
      javascript: await total(plan.initial.filter(file => file.endsWith('.js'))),
      css: await total(plan.initial.filter(file => file.endsWith('.css'))),
    },
    totalJavascript: await total(plan.javascript),
    largestChunk: chunks.reduce((max, chunk) => chunk.bytes > max.bytes ? chunk : max, { file: '', bytes: 0, gzip: 0 }),
    routes: await Promise.all(plan.routes.map(async route => ({
      source: route.source,
      additionalJavascript: await total(route.files.filter(file => file.endsWith('.js'))),
      additionalCss: await total(route.files.filter(file => file.endsWith('.css'))),
    }))),
  };
  checkBundleBudget(report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dist = fileURLToPath(new URL('../apps/admin-web/dist/', import.meta.url));
    console.log(JSON.stringify(await reportAdminBundle(dist), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
