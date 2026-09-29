import { mongoDatabaseName } from '../../src/database/mongo/transaction.js';

// Only dedicated MongoDB QA databases may be used; probes drop their own database.
const url = process.env.MONGO_TEST_URL;
if (!url)
  throw new Error(
    'MONGO_TEST_URL is required, e.g. mongodb://127.0.0.1:57017/latlai_probe_test?replicaSet=rs-test',
  );
for (const candidate of [url, process.env.MONGO_FAILOVER_URL])
  if (
    candidate !== undefined &&
    !mongoDatabaseName(candidate).endsWith('_test')
  )
    throw new Error('The MongoDB test database name must end in _test.');
process.env.NODE_ENV = 'test';
