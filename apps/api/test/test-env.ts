import { e2eRootUrl } from './mongo-global-setup.js';
import {
  TEST_APP_PASSWORD,
  TEST_MIGRATOR_PASSWORD,
  withCredentials,
} from './mongo/harness.js';

// Only dedicated test databases may be used (the E2E database name must end in
// _test, see mongo-global-setup.ts); suites remove their own fixtures.
const mongo = process.env.MONGO_TEST_URL;
if (!mongo)
  throw new Error('MONGO_TEST_URL is required (QA replica set root URL).');
const root = e2eRootUrl(mongo);
process.env.NODE_ENV = 'test';
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
