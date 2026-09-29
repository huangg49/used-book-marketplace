import { validateEnvironment } from '../src/config/environment.js';
const base = {
  MONGODB_URL: 'mongodb://localhost/unused',
  JWT_ACCESS_SECRET: 'test-only-000000000000000000000000000',
  NODE_ENV: 'development',
};
it('keeps the simulator disabled when its secret is unset', () => {
  expect(validateEnvironment(base).PAYMENT_SIMULATOR_SECRET).toBe('');
});
it.each(['short', 'replace-this-placeholder-00000000000000000000'])(
  'rejects unsafe simulator key %s',
  (key) => {
    expect(() =>
      validateEnvironment({ ...base, PAYMENT_SIMULATOR_SECRET: key }),
    ).toThrow();
  },
);
it('refuses to expose the payment simulator in production', () => {
  expect(() =>
    validateEnvironment({
      ...base,
      NODE_ENV: 'production',
      PAYMENT_SIMULATOR_SECRET: 'test-only-000000000000000000000000000',
    }),
  ).toThrow('disabled in production');
});
