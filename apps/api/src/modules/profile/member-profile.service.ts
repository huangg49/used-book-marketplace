import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { verify } from 'argon2';
import sharp from 'sharp';
import { MongoServerError } from 'mongodb';
import type { Request } from 'express';
import type {
  MemberEmailChangeDoc,
  ProfileAvatarDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import {
  member,
  MongoCommandService,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { AuthMailService } from '../auth/auth-mail.service.js';
import { LoginLimiter } from '../auth/login-limiter.service.js';
import { digest, MediaStorage } from '../media/media-storage.js';
import { processImage } from '../media/image-processor.js';
import { ImageUploadSlots } from '../media/image-upload-slots.js';

const versionOf = (u: UserDoc) => u.version ?? 1;
const fingerprint = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const invalidCode = () =>
  new DomainError(
    400,
    'INVALID_EMAIL_CHANGE',
    'Mã không hợp lệ, đã hết hạn hoặc yêu cầu không còn hiệu lực. Hãy yêu cầu mã mới.',
  );
const accountChange = (
  accountId: string,
  entityType: Wire['AccountCommandReceipt']['entityType'],
  entityId: string,
  version: number,
  state: string,
) => ({ accountId, entityType, entityId, version, state });

@Injectable()
export class MemberProfileService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly storage: MediaStorage,
    private readonly slots: ImageUploadSlots,
    private readonly mail: AuthMailService,
    private readonly limiter: LoginLimiter,
    private readonly config: ConfigService,
  ) {}
  private proof(value: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('AUTH_MAIL_ENCRYPTION_KEY'),
    )
      .update('latlai:member-profile:v1:')
      .update(value)
      .digest('hex');
  }
  read(auth: Actor) {
    return this.commands.readObligation(
      auth,
      async (tx, actor): Promise<Wire['MemberProfile']> => {
        member(actor);
        const now = await tx.now();
        const candidate = await tx.c.member_email_changes.findOne(
          { userId: actor._id, state: 'Pending', expiresAt: { $gt: now } },
          { sort: { createdAt: -1 } },
        );
        const pending =
          candidate && this.validChange(candidate, actor, now)
            ? candidate
            : null;
        return {
          id: actor._id,
          version: versionOf(actor),
          displayName: actor.displayName,
          email: actor.emailNormalized,
          contactPhone: actor.contactPhone ?? null,
          avatarId: actor.avatarId ?? null,
          pendingEmailChange: pending
            ? {
                id: pending._id,
                email: pending.emailNormalized,
                expiresAt: pending.expiresAt.toISOString(),
                resendAt: new Date(
                  pending.createdAt.getTime() + 60_000,
                ).toISOString(),
              }
            : null,
        };
      },
    );
  }
  update(context: CommandContext, body: Wire['UpdateMemberProfile']) {
    return this.commands.runAccount(
      context,
      'updateMemberProfile',
      context.auth.user.id,
      body,
      {
        authorize: async (_tx, actor) => {
          member(actor);
          return actor;
        },
        mutate: async (tx, actor) => {
          if (versionOf(actor) !== body.expectedVersion) throw conflict();
          const now = await tx.now(),
            previous = actor.avatarId ?? null;
          if (body.avatarId !== previous) {
            await tx.lock(
              'profile_avatars',
              [previous, body.avatarId].filter(Boolean) as string[],
            );
            if (body.avatarId) {
              const next = await this.avatar(tx, actor._id, body.avatarId);
              if (next.state !== 'Ready' || !next.gcAt || next.gcAt <= now)
                throw invalidState(
                  'Ảnh chưa sẵn sàng hoặc đã hết hạn. Hãy chọn lại ảnh.',
                );
              await tx.c.profile_avatars.updateOne(
                { _id: next._id },
                { $set: { state: 'Attached', gcAt: null, updatedAt: now } },
              );
            }
            if (previous)
              await tx.c.profile_avatars.updateOne(
                { _id: previous, ownerId: actor._id, state: 'Attached' },
                {
                  $set: {
                    state: 'Retired',
                    gcAt: new Date(now.getTime() + 300_000),
                    updatedAt: now,
                  },
                },
              );
          }
          await tx.c.users.updateOne(
            { _id: actor._id },
            {
              $set: {
                displayName: body.displayName,
                contactPhone: body.contactPhone,
                avatarId: body.avatarId,
                version: versionOf(actor) + 1,
                updatedAt: now,
              },
            },
          );
          return accountChange(
            actor._id,
            'MemberProfile',
            actor._id,
            versionOf(actor) + 1,
            'Updated',
          );
        },
      },
    );
  }
  private async avatar(tx: Tx, ownerId: string, id: string) {
    const row = await tx.c.profile_avatars.findOne({ _id: id, ownerId });
    if (!row) throw notFound();
    return row;
  }
  async createAvatar(
    context: CommandContext,
    body: Wire['CreateProfileAvatar'],
    ip: string,
  ) {
    await this.limiter.consume(context.auth.user.id, ip, 'profile-avatar');
    return this.commands.runAccount(
      context,
      'createProfileAvatar',
      context.auth.user.id,
      body,
      {
        authorize: async (_tx, actor) => {
          member(actor);
        },
        mutate: async (tx, actor) => {
          const now = await tx.now();
          if (
            (await tx.c.profile_avatars.countDocuments({
              ownerId: actor._id,
              state: { $in: ['Pending', 'Ready'] },
              gcAt: { $gt: now },
            })) >= 3
          )
            throw new DomainError(
              429,
              'AvatarQuotaExceeded',
              'Bạn có 3 ảnh đang chờ. Hãy hoàn tất ảnh đã tải hoặc thử lại sau.',
            );
          const row: ProfileAvatarDoc = {
            _id: randomUUID(),
            ownerId: actor._id,
            ...body,
            version: 1,
            state: 'Pending',
            storageKey: '',
            inFlightUntil: null,
            gcAt: new Date(now.getTime() + 86400_000),
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          };
          row.storageKey = `profile-avatars/${row._id}/avatar.webp`;
          await tx.c.profile_avatars.insertOne(row);
          return accountChange(
            actor._id,
            'ProfileAvatar',
            row._id,
            1,
            'Pending',
          );
        },
      },
    );
  }
  async uploadAvatar(context: CommandContext, id: string, req: Request) {
    const row = await this.commands.readObligation(
      context.auth,
      async (tx, actor) => {
        member(actor);
        await tx.lock('profile_avatars', [id]);
        const value = await this.avatar(tx, actor._id, id),
          now = await tx.now();
        if (
          !['Pending', 'Ready', 'Attached'].includes(value.state) ||
          (value.gcAt && value.gcAt <= now)
        )
          throw invalidState();
        if (value.state === 'Pending')
          await tx.c.profile_avatars.updateOne(
            { _id: id },
            { $set: { inFlightUntil: new Date(now.getTime() + 120_000) } },
          );
        return value;
      },
    );
    if (req.header('content-type')?.split(';')[0] !== row.mimeType)
      throw new DomainError(
        415,
        'UnsupportedMediaType',
        'Chọn ảnh JPEG, PNG hoặc WebP.',
      );
    if (Number(req.header('content-length')) > row.byteSize)
      throw new DomainError(
        413,
        'PayloadTooLarge',
        'Ảnh vượt dung lượng đã khai báo.',
      );
    const release = this.slots.claim(),
      timer = setTimeout(() => req.destroy(), 30_000);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const part = Buffer.from(chunk);
        size += part.length;
        if (size > row.byteSize)
          throw new DomainError(
            413,
            'PayloadTooLarge',
            'Ảnh vượt dung lượng đã khai báo.',
          );
        chunks.push(part);
      }
      const bytes = Buffer.concat(chunks);
      if (size !== row.byteSize || digest(bytes) !== row.sha256)
        throw new DomainError(
          422,
          'VALIDATION_ERROR',
          'Ảnh đã thay đổi. Hãy chọn lại ảnh.',
        );
      if (row.state === 'Pending') {
        let processed: Buffer;
        try {
          const image = await processImage(bytes, row);
          processed = await sharp(image.bytes)
            .resize(256, 256, { fit: 'cover', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
        } catch {
          throw new DomainError(
            422,
            'InvalidImage',
            'Ảnh không hợp lệ. Chọn ảnh JPEG, PNG hoặc WebP một khung hình.',
          );
        }
        await this.storage.check();
        await this.storage.put(row.storageKey, processed, 'image/webp');
      }
      return await this.commands.runAccount(
        context,
        'uploadProfileAvatar',
        id,
        { sha256: row.sha256 },
        {
          authorize: async (tx, actor) => {
            member(actor);
            return this.avatar(tx, actor._id, id);
          },
          mutate: async (tx, actor) => {
            await tx.lock('profile_avatars', [id]);
            const current = await this.avatar(tx, actor._id, id),
              now = await tx.now();
            if (
              !['Pending', 'Ready', 'Attached'].includes(current.state) ||
              (current.gcAt && current.gcAt <= now)
            )
              throw invalidState();
            if (current.state === 'Pending')
              await tx.c.profile_avatars.updateOne(
                { _id: id },
                {
                  $set: {
                    state: 'Ready',
                    version: 2,
                    inFlightUntil: null,
                    updatedAt: now,
                  },
                },
              );
            return accountChange(actor._id, 'ProfileAvatar', id, 2, 'Ready');
          },
        },
      );
    } finally {
      clearTimeout(timer);
      release();
    }
  }
  async readAvatar(auth: Actor, id: string) {
    const authorize = (tx: Tx, actor: UserDoc) => {
      member(actor);
      return this.avatar(tx, actor._id, id).then((row) => {
        if (!['Ready', 'Attached'].includes(row.state)) throw notFound();
        return row;
      });
    };
    const row = await this.commands.readObligation(auth, authorize);
    const result = await this.storage.signedRead(row.storageKey);
    await this.commands.readObligation(auth, authorize);
    return result;
  }
  discardAvatar(
    context: CommandContext,
    id: string,
    body: Wire['VersionCommand'],
  ) {
    return this.commands.runAccount(context, 'discardProfileAvatar', id, body, {
      authorize: async (tx, actor) => {
        member(actor);
        return this.avatar(tx, actor._id, id);
      },
      mutate: async (tx, actor) => {
        await tx.lock('profile_avatars', [id]);
        const row = await this.avatar(tx, actor._id, id),
          now = await tx.now();
        if (actor.avatarId === id || !['Pending', 'Ready'].includes(row.state))
          throw invalidState();
        if (row.version !== body.expectedVersion) throw conflict();
        await tx.c.profile_avatars.updateOne(
          { _id: id },
          {
            $set: {
              state: 'Retired',
              version: row.version + 1,
              gcAt: new Date(now.getTime() + 300_000),
              updatedAt: now,
            },
          },
        );
        return accountChange(
          actor._id,
          'ProfileAvatar',
          id,
          row.version + 1,
          'Retired',
        );
      },
    });
  }
  async requestEmail(
    context: CommandContext,
    body: Wire['RequestMemberEmailChange'],
    ip: string,
  ) {
    this.mail.assertAvailable();
    const owner = await this.commands.readObligation(
      context.auth,
      async (_tx, actor) => {
        member(actor);
        return actor;
      },
    );
    await this.limiter.consume(owner._id, ip, 'member-email-change');
    if (!(await verify(owner.passwordHash, body.password)))
      throw new DomainError(
        403,
        'INVALID_CREDENTIALS',
        'Mật khẩu hiện tại chưa đúng.',
      );
    const email = body.email.toLowerCase(),
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    return this.commands.runAccount(
      context,
      'requestMemberEmailChange',
      owner._id,
      { expectedVersion: body.expectedVersion, email },
      {
        authorize: async (_tx, actor) => {
          member(actor);
          if (actor.passwordHash !== owner.passwordHash)
            throw new DomainError(
              403,
              'CREDENTIAL_CHANGED',
              'Mật khẩu đã thay đổi. Hãy nhập lại.',
            );
        },
        mutate: async (tx, actor) => {
          if (versionOf(actor) !== body.expectedVersion) throw conflict();
          if (email === actor.emailNormalized)
            throw invalidState('Email mới cần khác email đăng nhập hiện tại.');
          const now = await tx.now();
          const latest = await tx.c.member_email_changes.findOne(
            { userId: actor._id },
            { sort: { createdAt: -1 } },
          );
          if (latest && now.getTime() - latest.createdAt.getTime() < 60_000)
            throw new DomainError(
              429,
              'EMAIL_CHANGE_COOLDOWN',
              'Đợi 60 giây trước khi yêu cầu mã mới.',
            );
          await tx.c.member_email_changes.updateMany(
            { userId: actor._id, state: 'Pending' },
            { $set: { state: 'Cancelled' } },
          );
          const row: MemberEmailChangeDoc = {
            _id: randomUUID(),
            userId: actor._id,
            emailNormalized: email,
            previousEmailHash: this.proof(actor.emailNormalized),
            passwordFingerprint: fingerprint(actor.passwordHash),
            version: 1,
            state: 'Pending',
            codeHash: '',
            attempts: 0,
            lockSeq: 0,
            createdAt: now,
            expiresAt: new Date(now.getTime() + 300_000),
            gcAt: new Date(now.getTime() + 30 * 86400_000),
          };
          row.codeHash = this.proof(`${row._id}:${code}`);
          await tx.c.member_email_changes.insertOne(row);
          if (!(await tx.c.users.findOne({ emailNormalized: email })))
            await this.mail.enqueue(
              tx,
              actor._id,
              row._id,
              { to: email, kind: 'ChangeEmail', code, challengeId: row._id },
              now,
              row.expiresAt,
            );
          await tx.c.users.updateOne(
            { _id: actor._id },
            { $set: { version: versionOf(actor) + 1, updatedAt: now } },
          );
          return accountChange(
            actor._id,
            'MemberEmailChange',
            row._id,
            1,
            'Pending',
          );
        },
      },
    );
  }
  private async emailChange(tx: Tx, userId: string, id: string) {
    const row = await tx.c.member_email_changes.findOne({ _id: id, userId });
    if (!row) throw notFound();
    return row;
  }
  private validChange(row: MemberEmailChangeDoc, actor: UserDoc, now: Date) {
    return (
      row.state === 'Pending' &&
      row.attempts < 5 &&
      row.expiresAt > now &&
      row.previousEmailHash === this.proof(actor.emailNormalized) &&
      row.passwordFingerprint === fingerprint(actor.passwordHash)
    );
  }
  async confirmEmail(
    context: CommandContext,
    body: Wire['ConfirmMemberEmailChange'],
  ) {
    // Invalid attempts must commit, rather than roll back with the HTTP error.
    const proof = this.proof(`${body.changeId}:${body.code}`);
    const allowed = await this.commands.readObligation(
      context.auth,
      async (tx, actor) => {
        member(actor);
        await tx.lock('member_email_changes', [body.changeId]);
        const row = await this.emailChange(tx, actor._id, body.changeId),
          now = await tx.now();
        const matches = timingSafeEqual(
          Buffer.from(row.codeHash, 'hex'),
          Buffer.from(proof, 'hex'),
        );
        if (row.state === 'Verified') return matches;
        if (!this.validChange(row, actor, now)) return false;
        if (matches) return true;
        const attempts = row.attempts + 1;
        await tx.c.member_email_changes.updateOne(
          { _id: row._id },
          {
            $set: { attempts, state: attempts >= 5 ? 'Exhausted' : 'Pending' },
          },
        );
        return false;
      },
    );
    if (!allowed) throw invalidCode();
    try {
      return await this.commands.runAccount(
        context,
        'confirmMemberEmailChange',
        body.changeId,
        { changeId: body.changeId, proof },
        {
          authorize: async (tx, actor) => {
            member(actor);
            return this.emailChange(tx, actor._id, body.changeId);
          },
          mutate: async (tx, actor) => {
            await tx.lock('member_email_changes', [body.changeId]);
            const row = await this.emailChange(tx, actor._id, body.changeId),
              now = await tx.now();
            if (!this.validChange(row, actor, now) || row.codeHash !== proof)
              throw invalidCode();
            if (
              await tx.c.users.findOne({
                emailNormalized: row.emailNormalized,
                _id: { $ne: actor._id },
              })
            )
              throw new DomainError(
                409,
                'EMAIL_UNAVAILABLE',
                'Chưa thể dùng email này. Hãy yêu cầu đổi sang email khác.',
              );
            await tx.c.users.updateOne(
              { _id: actor._id },
              {
                $set: {
                  emailNormalized: row.emailNormalized,
                  emailVerifiedAt: now,
                  version: versionOf(actor) + 1,
                  updatedAt: now,
                },
              },
            );
            await tx.c.member_email_changes.updateOne(
              { _id: row._id },
              { $set: { state: 'Verified', version: 2 } },
            );
            await tx.c.member_email_changes.updateMany(
              { userId: actor._id, _id: { $ne: row._id }, state: 'Pending' },
              { $set: { state: 'Cancelled' } },
            );
            await tx.c.auth_sessions.updateMany(
              {
                userId: actor._id,
                _id: { $ne: context.auth.sessionId },
                revokedAt: null,
              },
              { $set: { revokedAt: now } },
            );
            await tx.c.auth_action_tokens.updateMany(
              { userId: actor._id, consumedAt: null },
              { $set: { consumedAt: now } },
            );
            await tx.c.auth_otp_challenges.updateMany(
              { userId: actor._id, consumedAt: null },
              { $set: { consumedAt: now } },
            );
            await tx.c.auth_mail_jobs.updateMany(
              { userId: actor._id, status: 'Pending' },
              { $set: { status: 'Cancelled', updatedAt: now } },
            );
            await this.mail.enqueue(
              tx,
              actor._id,
              null,
              { to: actor.emailNormalized, kind: 'EmailChanged' },
              now,
              new Date(now.getTime() + 86400_000),
            );
            return accountChange(
              actor._id,
              'MemberEmailChange',
              row._id,
              2,
              'Verified',
            );
          },
        },
      );
    } catch (error) {
      if (
        error instanceof MongoServerError &&
        error.code === 11000 &&
        error.keyPattern?.emailNormalized
      )
        throw new DomainError(
          409,
          'EMAIL_UNAVAILABLE',
          'Chưa thể dùng email này. Hãy yêu cầu đổi sang email khác.',
        );
      throw error;
    }
  }
}
