import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import type { AuthMailJobDoc } from '../../database/mongo/documents.js';

export interface AccountMail {
  to: string;
  kind: 'VerifyEmail' | 'ResetPassword' | 'PasswordChanged';
  token?: string;
  code?: string;
  challengeId?: string;
}
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

@Injectable()
export class AuthMailService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
  ) {}
  assertAvailable() {
    if (this.config.get<string>('AUTH_MAIL_PROVIDER') === 'disabled')
      throw new ServiceUnavailableException({
        code: 'MAIL_UNAVAILABLE',
        message: 'Dịch vụ email chưa sẵn sàng. Vui lòng thử lại sau.',
      });
  }
  private key() {
    return createHash('sha256')
      .update('latlai:auth-mail:v1:')
      .update(this.config.getOrThrow<string>('AUTH_MAIL_ENCRYPTION_KEY'))
      .digest();
  }
  encrypt(payload: AccountMail) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    return Buffer.concat([
      iv,
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64');
  }
  decrypt(encrypted: string): AccountMail {
    const bytes = Buffer.from(encrypted, 'base64');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      bytes.subarray(0, 12),
    );
    cipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(
      Buffer.concat([
        cipher.update(bytes.subarray(12, -16)),
        cipher.final(),
      ]).toString('utf8'),
    ) as AccountMail;
  }
  async enqueue(
    tx: Tx,
    userId: string,
    tokenId: string | null,
    payload: AccountMail,
    now: Date,
    expiresAt: Date,
  ) {
    await tx.c.auth_mail_jobs.insertOne({
      _id: randomUUID(),
      userId,
      tokenId,
      encryptedPayload: this.encrypt(payload),
      status: 'Pending',
      attempts: 0,
      nextAttemptAt: now,
      leaseId: null,
      leaseUntil: null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }
  onModuleInit() {
    if (
      this.config.get('NODE_ENV') === 'test' ||
      this.config.get('AUTH_MAIL_PROVIDER') === 'disabled'
    )
      return;
    this.timer = setInterval(() => {
      if (!this.running) {
        this.running = this.drain()
          .catch(() => {
            /* Durable jobs remain for the next poll; no mail content in logs. */
          })
          .finally(() => {
            this.running = undefined;
          });
      }
    }, 2000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }

  render(payload: AccountMail) {
    const changed = payload.kind === 'PasswordChanged';
    const verify = payload.kind === 'VerifyEmail';
    const subject = changed
      ? 'Mật khẩu Lật Lại đã được thay đổi'
      : verify
        ? 'Xác minh email · Lật Lại'
        : 'Đặt lại mật khẩu · Lật Lại';
    if (payload.code) {
      const description =
        'Mã chỉ dùng một lần, có hiệu lực 5 phút. Không chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua thư này.';
      const text = `${subject}\n\nMã xác nhận: ${payload.code}\n\n${description}\n\nLật Lại · Sách cũ. Người đọc mới.`;
      const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><body style="background:#fff8e9;color:#54100e;font-family:Arial,sans-serif;padding:32px"><h1>${subject}</h1><p>Mã xác nhận của bạn</p><p style="font-size:36px;font-weight:bold;letter-spacing:8px">${escapeHtml(payload.code)}</p><p>${description}</p><p>Lật Lại · Sách cũ. Người đọc mới.</p></body></html>`;
      return { subject, text, html };
    }
    const origin = this.config.getOrThrow<string>('AUTH_WEB_ORIGIN');
    const link = changed
      ? `${origin}/forgot-password`
      : `${origin}/${verify ? 'register#verify=' : 'forgot-password#reset='}${encodeURIComponent(payload.token!)}`;
    const description = changed
      ? 'Các phiên đăng nhập cũ đã được thu hồi. Nếu bạn không thực hiện thay đổi này, hãy đặt lại mật khẩu ngay.'
      : `Liên kết này chỉ dùng được một lần và hết hạn sau ${verify ? '30' : '15'} phút. Nếu bạn không yêu cầu, hãy bỏ qua thư này.`;
    const label = changed
      ? 'Khôi phục tài khoản'
      : verify
        ? 'Xác minh email'
        : 'Đặt lại mật khẩu';
    const text = `${subject}\n\n${description}\n\n${label}: ${link}\n\nLật Lại · Sách cũ. Người đọc mới.`;
    const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><body style="background:#fff8e9;color:#54100e;font-family:Arial,sans-serif;padding:32px"><h1>${subject}</h1><p>${description}</p><p><a href="${escapeHtml(link)}">${label}</a></p><p>Lật Lại · Sách cũ. Người đọc mới.</p></body></html>`;
    return { subject, text, html };
  }
  async deliver(job: AuthMailJobDoc, payload: AccountMail) {
    const message = this.render(payload);
    if (this.config.get('AUTH_MAIL_PROVIDER') === 'local') {
      const directory = resolve(
        this.config.getOrThrow<string>('AUTH_MAIL_LOCAL_DIR'),
      );
      await mkdir(directory, { recursive: true });
      await writeFile(
        resolve(directory, `${job._id}.html`),
        message.html.replace(
          '<h1>',
          `<p>Hộp thư demo · Gửi tới: ${escapeHtml(payload.to)}</p><h1>`,
        ),
        { mode: 0o600 },
      );
      return;
    }
    this.assertAvailable();
    if (this.config.get('AUTH_MAIL_PROVIDER') === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: this.config.getOrThrow<string>('BREVO_SENDER_EMAIL'),
            name: this.config.getOrThrow<string>('BREVO_SENDER_NAME'),
          },
          to: [{ email: payload.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
          headers: { idempotencyKey: job._id },
        }),
      });
      // Provider duplicate acknowledgement is a successful replay of this job.
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        if (response.status !== 400 || error?.code !== 'duplicate_parameter')
          throw new Error('Auth mail delivery failed');
      } else await response.body?.cancel();
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `auth-mail/${job._id}`,
      },
      body: JSON.stringify({
        from: this.config.getOrThrow<string>('AUTH_MAIL_FROM'),
        to: [payload.to],
        ...message,
      }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Auth mail delivery failed');
  }
  // Bounded per poll; a lease prevents two API instances sending the same job.
  async drain() {
    // A process can stop during its final attempt. Close expired final leases
    // instead of leaving their encrypted payload stranded in Sending until TTL.
    await this.mongo.c.auth_mail_jobs.updateMany(
      { status: 'Sending', attempts: 8, leaseUntil: { $lte: new Date() } },
      {
        $set: {
          status: 'Failed',
          encryptedPayload: '',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
        },
      },
    );
    for (let i = 0; i < 10 && !this.stopped; i++) {
      const now = new Date();
      const leaseId = randomUUID();
      const job = await this.mongo.c.auth_mail_jobs.findOneAndUpdate(
        {
          expiresAt: { $gt: now },
          nextAttemptAt: { $lte: now },
          attempts: { $lt: 8 },
          $or: [
            { status: 'Pending' },
            { status: 'Sending', leaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            status: 'Sending',
            leaseId,
            leaseUntil: new Date(now.getTime() + 30_000),
            updatedAt: now,
          },
          $inc: { attempts: 1 },
        },
        { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
      );
      if (!job) return;
      try {
        const payload = this.decrypt(job.encryptedPayload);
        if (
          (job.tokenId &&
            !(await this.mongo.c.auth_action_tokens.findOne({
              _id: job.tokenId,
              consumedAt: null,
              expiresAt: { $gt: new Date() },
            }))) ||
          (payload.challengeId &&
            (payload.kind === 'PasswordChanged' ||
              !(await this.mongo.c.auth_otp_challenges.findOne({
                _id: payload.challengeId,
                userId: job.userId,
                purpose: payload.kind,
                consumedAt: null,
                attempts: { $lt: 5 },
                expiresAt: { $gt: new Date() },
              }))))
        ) {
          await this.mongo.c.auth_mail_jobs.updateOne(
            { _id: job._id, leaseId, status: 'Sending' },
            {
              $set: {
                status: 'Cancelled',
                encryptedPayload: '',
                leaseId: null,
                leaseUntil: null,
                updatedAt: new Date(),
              },
            },
          );
          continue;
        }
        await this.deliver(job, payload);
        await this.mongo.c.auth_mail_jobs.updateOne(
          { _id: job._id, leaseId, status: 'Sending' },
          {
            $set: {
              status: 'Sent',
              encryptedPayload: '',
              leaseId: null,
              leaseUntil: null,
              updatedAt: new Date(),
            },
          },
        );
      } catch {
        const failed = job.attempts >= 8;
        await this.mongo.c.auth_mail_jobs.updateOne(
          { _id: job._id, leaseId, status: 'Sending' },
          {
            $set: {
              status: failed ? 'Failed' : 'Pending',
              ...(failed ? { encryptedPayload: '' } : {}),
              leaseId: null,
              leaseUntil: null,
              updatedAt: new Date(),
              nextAttemptAt: new Date(
                Date.now() + Math.min(60_000, 2000 * 2 ** job.attempts),
              ),
            },
          },
        );
      }
    }
  }
}
