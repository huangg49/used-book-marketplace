import { validateEnvironment } from './environment.js';

describe('environment validation', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/books',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
  };
  it('rejects missing config, example secrets, invalid protocols and ports', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
    expect(() =>
      validateEnvironment({
        ...valid,
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
    expect(() =>
      validateEnvironment({ ...valid, DATABASE_URL: 'https://example.com' }),
    ).toThrow('DATABASE_URL');
    expect(() => validateEnvironment({ ...valid, PORT: 'NaN' })).toThrow(
      'PORT',
    );
    expect(() => validateEnvironment({ ...valid, PORT: '70000' })).toThrow(
      'PORT',
    );
  });
});
