import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AuthMailService } from './auth-mail.service.js';
import type { MongoService } from '../../database/mongo/mongo.service.js';
import type { AuthMailJobDoc } from '../../database/mongo/documents.js';

describe('account email delivery', () => {
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
});
