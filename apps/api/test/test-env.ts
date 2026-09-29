import { e2eRootUrl } from './mongo-global-setup.js';
import {
  TEST_APP_PASSWORD,
  TEST_MIGRATOR_PASSWORD,
  withCredentials,
} from './mongo/harness.js';

// Only dedicated test databases may be used; E2E tests remove their own fixtures.
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'TEST_DATABASE_URL is required. Use a dedicated usedbooks_test database.',
  );
const parsed = new URL(url);
if (!decodeURIComponent(parsed.pathname).endsWith('_test'))
  throw new Error('The E2E database name must end in _test.');
const mongo = process.env.MONGO_TEST_URL;
if (!mongo)
  throw new Error('MONGO_TEST_URL is required (QA replica set root URL).');
const root = e2eRootUrl(mongo);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
// The API connects as the least-privilege app user; fixtures use the migrator.
process.env.MONGODB_URL = withCredentials(
  root,
  'latlai_app',
  TEST_APP_PASSWORD,
);
process.env.MONGO_FIXTURE_URL = withCredentials(
  root,
  'latlai_migrator',
  TEST_MIGRATOR_PASSWORD,
);
process.env.JWT_ACCESS_SECRET =
  'test-only-signing-key-not-for-production-000000000';
