import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AuthMailService } from './auth-mail.service.js';
import type { MongoService } from '../../database/mongo/mongo.service.js';
import type { AuthMailJobDoc } from '../../database/mongo/documents.js';

describe('account email delivery', () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = {
    AUTH_MAIL_PROVIDER: 'local',
    AUTH_WEB_ORIGIN: 'http://127.0.0.1:5186',
    AUTH_MAIL_ENCRYPTION_KEY: 'test-key-only-for-account-mail-0000000',
  };
  const service = (extra = {}) =>
    new AuthMailService(
      {} as MongoService,
      new ConfigService({ ...config, ...extra }),
    );
  it('authenticates ciphertext, rejects corruption and separates keys', () => {
    const mail = service();
    const payload = {
      to: 'synthetic@example.test',
      kind: 'VerifyEmail' as const,
      token: 'a'.repeat(43),
    };
    const encrypted = mail.encrypt(payload);
    expect(mail.decrypt(encrypted)).toEqual(payload);
    const bytes = Buffer.from(encrypted, 'base64');
    bytes[15] ^= 1;
    expect(() => mail.decrypt(bytes.toString('base64'))).toThrow();
    expect(() =>
      service({
        AUTH_MAIL_ENCRYPTION_KEY: 'another-test-only-key-0000000000000',
      }).decrypt(encrypted),
    ).toThrow();
  });
  it('renders links with configured origin and fragment; never includes passwords', () => {
    const mail = service();
    const token = 'a'.repeat(43);
    expect(
      mail.render({ to: 'synthetic@example.test', kind: 'VerifyEmail', token })
        .text,
    ).toContain('/register#verify=' + token);
    expect(
      mail.render({
        to: 'synthetic@example.test',
        kind: 'ResetPassword',
        token,
      }).text,
    ).toContain('/forgot-password#reset=' + token);
    expect(
      mail.render({ to: 'synthetic@example.test', kind: 'PasswordChanged' })
        .text,
    ).toContain('phiên đăng nhập cũ');
  });
  it('writes a real UTF-8 demo message locally without an external request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'latlai-mail-test-'));
    try {
      const mail = service({ AUTH_MAIL_LOCAL_DIR: directory });
      const id = randomUUID();
      await mail.deliver({ _id: id } as AuthMailJobDoc, {
        to: 'synthetic@example.test',
        kind: 'VerifyEmail',
        token: 'b'.repeat(43),
      });
      expect(await readdir(directory)).toEqual([id + '.html']);
      const html = await readFile(join(directory, id + '.html'), 'utf8');
      expect(html).toContain('Xác minh email');
      expect(html).toContain('/register#verify=');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('renders a legible one-time code without a token link', () => {
    const rendered = service().render({
      to: 'synthetic@example.test',
      kind: 'VerifyEmail',
      code: '012345',
      challengeId: randomUUID(),
    });
    expect(rendered.text).toContain('012345');
    expect(rendered.text).toContain('5 phút');
    expect(rendered.html).not.toContain('#verify=');
    expect(rendered.html).toContain('letter-spacing:8px');
  });
  it('sends Brevo JSON with a stable replay key and accepts a duplicate acknowledgement', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'duplicate_parameter' }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'invalid_parameter' }), {
          status: 400,
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const mail = service({
      AUTH_MAIL_PROVIDER: 'brevo',
      BREVO_API_KEY: 'synthetic-provider-key',
      BREVO_SENDER_EMAIL: 'sender@example.test',
      BREVO_SENDER_NAME: 'Lật Lại',
    });
    const job = { _id: randomUUID() } as AuthMailJobDoc;
    const payload = {
      to: 'synthetic@example.test',
      kind: 'ResetPassword' as const,
      code: '012345',
    };
    await mail.deliver(job, payload);
    await mail.deliver(job, payload);
    await expect(mail.deliver(job, payload)).rejects.toThrow(
      'Auth mail delivery failed',
    );
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.brevo.com/v3/smtp/email',
    );
    const options = fetcher.mock.calls[0][1];
    expect(options.headers['api-key']).toBe('synthetic-provider-key');
    const body = JSON.parse(options.body);
    expect(body.headers.idempotencyKey).toBe(job._id);
    expect(body.sender).toEqual({
      email: 'sender@example.test',
      name: 'Lật Lại',
    });
    expect(body.textContent).toContain('012345');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).headers).toEqual(
      body.headers,
    );
  });
});
