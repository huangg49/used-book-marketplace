import { validateAccountMail, validateEnvironment } from './environment.js';

describe('account email config', () => {
  const key = 'test-mail-key-only-00000000000000000000000';
  it('defaults to local only outside production and disabled in production', () => {
    expect(validateAccountMail({}, 'development', key).AUTH_MAIL_PROVIDER).toBe(
      'local',
    );
    expect(validateAccountMail({}, 'production', key).AUTH_MAIL_PROVIDER).toBe(
      'disabled',
    );
  });
  it('rejects production local delivery, unsafe origins and missing provider credentials', () => {
    expect(() =>
      validateAccountMail({ AUTH_MAIL_PROVIDER: 'local' }, 'production', key),
    ).toThrow('forbidden');
    for (const origin of [
      'http://example.com',
      'https://example.com/path',
      'https://name:password@example.com',
      'javascript:alert(1)',
    ])
      expect(() =>
        validateAccountMail({ AUTH_WEB_ORIGIN: origin }, 'development', key),
      ).toThrow('AUTH_WEB_ORIGIN');
    expect(() =>
      validateAccountMail(
        {
          AUTH_MAIL_PROVIDER: 'resend',
          AUTH_WEB_ORIGIN: 'https://latlai.example',
        },
        'production',
        key,
      ),
    ).toThrow('ENCRYPTION_KEY');
    expect(() =>
      validateAccountMail(
        { AUTH_MAIL_PROVIDER: 'resend', AUTH_MAIL_ENCRYPTION_KEY: key },
        'development',
        key,
      ),
    ).toThrow('Resend requires');
  });
});

describe('environment validation', () => {
  it('requires a valid Brevo sender and rejects header injection', () => {
    const env = {
      AUTH_MAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'synthetic-key',
      BREVO_SENDER_EMAIL: 'sender@example.test',
    };
    const key = 'test-only-encryption-key-0000000000000';
    expect(validateAccountMail(env, 'development', key).BREVO_SENDER_NAME).toBe(
      'Lật Lại',
    );
    for (const override of [
      { BREVO_API_KEY: '' },
      { BREVO_SENDER_EMAIL: 'bad' },
      { BREVO_SENDER_NAME: 'Lật Lại\r\nInjected' },
    ]) {
      expect(() =>
        validateAccountMail({ ...env, ...override }, 'development', key),
      ).toThrow('Brevo requires');
    }
  });
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
