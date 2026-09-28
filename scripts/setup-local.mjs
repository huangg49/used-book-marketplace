import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
for (const path of ['.env', 'apps/api/.env', 'apps/admin-web/.env', 'apps/mobile-react-native/.env']) {
  const target = new URL(path, root);
  const example = await readFile(new URL(`${path}.example`, root), 'utf8');
  const content = example
    .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`)
    .replace(/^PAYMENT_SIMULATOR_SECRET=.*$/m, `PAYMENT_SIMULATOR_SECRET=${randomBytes(48).toString('hex')}`);
  try {
    await writeFile(target, content, { flag: 'wx' });
    console.log(`Created ${path}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Kept existing ${path}`);
  }
}
console.log('Next: start PostgreSQL, then pnpm db:generate, pnpm db:migrate, pnpm db:seed.');
console.log('For a physical phone, set EXPO_PUBLIC_API_BASE_URL to your computer LAN IP.');
