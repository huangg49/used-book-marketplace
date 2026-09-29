import { prepareDatabase } from './mongo/harness.js';

// Prepares the dedicated MongoDB E2E database once per run: drop, recreate the
// least-privilege users, apply migrations. Suites remove their own fixtures.
export default async function setup() {
  const root = process.env.MONGO_TEST_URL;
  if (!root) throw new Error('MONGO_TEST_URL is required for API E2E tests.');
  await prepareDatabase(e2eRootUrl(root));
}

// Parallel runs (e.g. several agents) must each set a distinct *_test name.
export const E2E_DATABASE = process.env.MONGO_E2E_DATABASE ?? 'latlai_e2e_test';
if (!E2E_DATABASE.endsWith('_test'))
  throw new Error('MONGO_E2E_DATABASE must end in _test.');
export const e2eRootUrl = (root: string) =>
  root.replace(/\/[^/?]*(\?|$)/, `/${E2E_DATABASE}$1`);
