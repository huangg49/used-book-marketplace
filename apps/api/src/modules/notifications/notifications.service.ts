import { Injectable } from '@nestjs/common';
import type { Filter } from 'mongodb';
import type { MemberNotificationDoc } from '../../database/mongo/documents.js';
import {
  DomainError,
  invalidField,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoCommandService,
  type Actor,
} from '../commands/mongo-command.service.js';

const DEFAULT_LIMIT = 20;
const invalidCursor = () =>
  new DomainError(
    400,
    'VALIDATION_ERROR',
    'Trang tiếp theo không hợp lệ. Hãy tải lại danh sách.',
  );

// The cursor only narrows the caller's own rows, so it needs no signature.
const encode = (row: MemberNotificationDoc) =>
  Buffer.from(
    JSON.stringify({ t: row.createdAt.toISOString(), id: row._id }),
  ).toString('base64url');
function decode(cursor: string) {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { t?: unknown; id?: unknown };
    const at = new Date(String(value.t));
    if (
      Number.isNaN(at.getTime()) ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(value.id)
    )
      throw new Error();
    return { at, id: value.id };
  } catch {
    throw invalidCursor();
  }
}

const view = (n: MemberNotificationDoc): Wire['MemberNotification'] => ({
  id: n._id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  targetType: n.targetType,
  targetId: n.targetId,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt?.toISOString() ?? null,
});

// FR-N03/N04 inbox. Reads use the existing-obligation access so a LOCKED
// member still sees notices about auctions and orders they are part of.
@Injectable()
export class NotificationsService {
  constructor(private readonly commands: MongoCommandService) {}

  list(
    auth: Actor,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<Wire['MemberNotificationPage']> {
    return this.commands.readObligation(auth, async (tx, actor) => {
      const filter: Filter<MemberNotificationDoc> = { userId: actor._id };
      if (cursor) {
        const after = decode(cursor);
        filter.$or = [
          { createdAt: { $lt: after.at } },
          { createdAt: after.at, _id: { $lt: after.id } },
        ];
      }
      const rows = await tx.c.member_notifications
        .find(filter, { sort: { createdAt: -1, _id: -1 }, limit: limit + 1 })
        .toArray();
      const page = rows.slice(0, limit);
      return {
        items: page.map(view),
        unreadCount: await tx.c.member_notifications.countDocuments({
          userId: actor._id,
          readAt: null,
        }),
        nextCursor: rows.length > limit ? encode(page[page.length - 1]!) : null,
      };
    });
  }

  /** Only unread rows of the caller change, so repeating it is harmless. */
  markRead(
    auth: Actor,
    body: Wire['MarkNotificationsRead'],
  ): Promise<Wire['NotificationUnreadCount']> {
    if (!!body.ids === !!body.all)
      invalidField('ids', 'Chọn các thông báo cần đánh dấu, hoặc tất cả.');
    return this.commands.readObligation(auth, async (tx, actor) => {
      const now = await tx.now();
      await tx.c.member_notifications.updateMany(
        {
          userId: actor._id,
          readAt: null,
          ...(body.ids ? { _id: { $in: body.ids } } : {}),
        },
        { $set: { readAt: now } },
      );
      return {
        unreadCount: await tx.c.member_notifications.countDocuments({
          userId: actor._id,
          readAt: null,
        }),
      };
    });
  }
}
