import { readFile, writeFile, mkdir } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const source = new URL('../openapi.yaml', import.meta.url);
const target = new URL('../src/schema.ts', import.meta.url);
const content = '// Generated from openapi.yaml. Run pnpm contract:generate.\n' +
  astToString(await openapiTS(source));
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8').catch(() => '') !== content) {
    throw new Error('API types are out of date. Run pnpm contract:generate.');
  }
  console.log('OpenAPI parsed successfully; generated types are current.');
} else {
  await mkdir(new URL('../src/', import.meta.url), { recursive: true });
  await writeFile(target, content);
}
