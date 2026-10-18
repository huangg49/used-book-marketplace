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
// Historical suites explicitly exercise the retained zero-fee/unpaid profile.
// wallet-checkout.e2e-spec overrides policy with the default paid profile.
process.env.LISTING_SUBMISSION_FEE_VND = '0';
process.env.ORDER_CHECKOUT_MODE = 'Unpaid';
process.env.VNPAY_SANDBOX_ENABLED = 'false';
// Never send real email when AppModule reads the developer's private .env.
process.env.AUTH_MAIL_PROVIDER = 'local';
process.env.AUTH_MAIL_ENCRYPTION_KEY =
  'qa-only-mail-encryption-key-not-production-00000';
process.env.AUTH_WEB_ORIGIN = 'http://127.0.0.1:5186';
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
