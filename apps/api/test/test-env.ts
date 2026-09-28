// Only a dedicated test database may be used; E2E tests remove their own fixtures.
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'TEST_DATABASE_URL is required. Use a dedicated usedbooks_test database.',
  );
const parsed = new URL(url);
if (!decodeURIComponent(parsed.pathname).endsWith('_test'))
  throw new Error('The E2E database name must end in _test.');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.JWT_ACCESS_SECRET =
  'test-only-signing-key-not-for-production-000000000';
