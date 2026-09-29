import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// One set of generated secrets shared by the root .env (compose) and the API .env.
const secret = () => randomBytes(24).toString('hex');
const mongo = { root: secret(), app: secret(), migrator: secret() };
for (const path of ['.env', 'apps/api/.env', 'apps/admin-web/.env', 'apps/mobile-react-native/.env']) {
  const target = new URL(path, root);
  const example = await readFile(new URL(`${path}.example`, root), 'utf8');
  const content = example
    .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`)
    .replace(/^PAYMENT_SIMULATOR_SECRET=.*$/m, `PAYMENT_SIMULATOR_SECRET=${randomBytes(48).toString('hex')}`)
    .replaceAll('replace-root-password', mongo.root)
    .replaceAll('replace-app-password', mongo.app)
    .replaceAll('replace-migrator-password', mongo.migrator);
  try {
    await writeFile(target, content, { flag: 'wx' });
    console.log(`Created ${path}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Kept existing ${path}`);
  }
}
console.log('Existing .env files are never overwritten. If only one of .env and apps/api/.env');
console.log('was created now, copy the MongoDB passwords so both files agree.');
console.log('Next: pnpm infra:up, then pnpm db:bootstrap, pnpm db:migrate, pnpm db:seed.');
console.log('For a physical phone, set EXPO_PUBLIC_API_BASE_URL to your computer LAN IP.');
