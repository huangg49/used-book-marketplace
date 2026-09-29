import { validateEnvironment } from './environment.js';

describe('environment validation', () => {
  const valid = {
    MONGODB_URL: 'mongodb://user:password@localhost:27017/books?replicaSet=rs0',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
  };
  it('rejects missing config, example secrets, invalid protocols and ports', () => {
    expect(() => validateEnvironment({})).toThrow('MONGODB_URL');
    expect(() =>
      validateEnvironment({
        ...valid,
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
    for (const MONGODB_URL of [
      '',
      'https://example.com/books',
      'mongodb://localhost',
    ])
      expect(() => validateEnvironment({ ...valid, MONGODB_URL })).toThrow(
        'MONGODB_URL',
      );
    expect(() => validateEnvironment({ ...valid, PORT: 'NaN' })).toThrow(
      'PORT',
    );
    expect(() => validateEnvironment({ ...valid, PORT: '70000' })).toThrow(
      'PORT',
    );
  });
});
