import { Injectable } from '@nestjs/common';
import type { Document, Filter } from 'mongodb';
import type { BoundCollection } from '../../database/mongo/collections.js';
import {
  MongoCommandService,
  member,
  reviewer,
  admin,
  type Actor,
  type Tx,
} from '../commands/mongo-command.service.js';
import { MongoPageService } from '../commands/mongo-page.service.js';
import {
  DomainError,
  invalidField,
  type Wire,
} from '../commands/domain-error.js';
import {
  atReadTime,
  directGuidance,
  exchangeGuidance,
  intakeGuidance,
  pointGuidance,
} from './work-policy.js';
import {
  hasExchangeDispute,
  participantInspectionDeadlineExpression,
} from '../exchanges/exchange-inspection.js';

type Query = Record<string, string | number>;
type Item = Wire['WorkItem'];
type Lane = Wire['WorkItemsPage']['lane'];
const item = (
  id: string,
  target: Item['target'],
  sourceState: string,
  version: number,
  title: string,
  targetId = id,
) => ({
  id,
  target,
  targetId,
  sourceState,
  version,
  title: `${title} #${id.slice(0, 8)}`,
});
const participant = (id: string) => ({
  $or: [{ buyerId: id }, { sellerId: id }],
});
// oxlint-disable unicorn/no-thenable -- MongoDB $switch expressions, not promises.
const clockKey = (field: string, branches: [string, string | Document][]) => ({
  $set: {
    due: {
      $switch: {
        branches: branches.map(([state, deadline]) => ({
          case: { $eq: [field, state] },
          then: deadline,
        })),
        default: null,
      },
    },
  },
});

@Injectable()
export class WorkInboxService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
  ) {}

  private async page<T extends Document & { _id: string }>(
    tx: Tx,
    actorId: string,
    lane: Lane,
    query: Query,
    collection: BoundCollection<T>,
    pipeline: Document[],
    project: (row: T, now: Date) => Item,
  ): Promise<Wire['WorkItemsPage']> {
    const now = await tx.now();
    const page = await this.pages.page(
      collection,
      [
        ...pipeline,
        {
          $set: {
            key: {
              $concat: [
                {
                  $cond: [
                    { $eq: [{ $ifNull: ['$due', null] }, null] },
                    '1',
                    { $cond: [{ $gt: ['$due', now] }, '0', '2'] },
                  ],
                },
                {
                  $dateToString: {
                    date: {
                      $ifNull: ['$due', { $ifNull: ['$key', '$createdAt'] }],
                    },
                    timezone: 'UTC',
                    format: '%Y-%m-%dT%H:%M:%S.%LZ',
                  },
                },
              ],
            },
          },
        },
      ],
      {
        kind: 'text',
        ascending: true,
        scope: { operation: 'workInbox', actor: actorId, lane },
        limit: Number(query.limit ?? 20),
        cursor: query.cursor as string | undefined,
      },
    );
    const items: Item[] = [];
    for (const id of page.ids) {
      const row = await collection.findOne({ _id: id } as Filter<T>);
      if (row) items.push(await this.withBookTitle(tx, project(row as T, now)));
    }
    return {
      items,
      lane,
      nextCursor: page.nextCursor,
      serverTime: now.toISOString(),
    };
  }

  private async withBookTitle(tx: Tx, value: Item): Promise<Item> {
    let title: unknown;
    if (['DirectOrder', 'Auction', 'AuctionIntake'].includes(value.target)) {
      const context = await tx.c.workflow_contexts.findOne(
        value.target === 'AuctionIntake'
          ? { kind: 'AuctionIntake', auctionIntakeId: value.id }
          : {
              kind: value.target === 'DirectOrder' ? 'Order' : 'PointOrder',
              orderId: value.id,
            },
      );
      const stored = context
        ? await tx.c.workflow_items.findOne({ contextId: context._id })
        : null;
      const snapshot = stored?.snapshot as
        | {
            title?: unknown;
            metadata?: { title?: unknown };
            bundle?: { title?: unknown };
          }
        | undefined;
      title =
        snapshot?.bundle?.title ?? snapshot?.title ?? snapshot?.metadata?.title;
    } else {
      let bookId = value.target === 'CatalogReview' ? value.id : null;
      let listingId = ['Listing', 'ListingReview'].includes(value.target)
        ? value.id
        : null;
      if (value.target === 'Exchange')
        listingId =
          (await tx.c.exchanges.findOne({ _id: value.id }))
            ?.recipientListingId ?? null;
      if (listingId) {
        const listing = await tx.c.listings.findOne({ _id: listingId });
        const revision = listing?.currentRevisionId
          ? await tx.c.listing_revisions.findOne({
              _id: listing.currentRevisionId,
            })
          : null;
        title = revision?.bundle?.title;
        bookId = revision?.bookId ?? null;
      }
      if (!title && bookId) {
        const book = await tx.c.catalog_books.findOne({ _id: bookId });
        title = book?.currentRevisionId
          ? (
              await tx.c.catalog_revisions.findOne({
                _id: book.currentRevisionId,
              })
            )?.title
          : undefined;
      }
    }
    return typeof title === 'string' && title.trim()
      ? { ...value, title: `${title} · ${value.title}` }
      : value;
  }

  member(auth: Actor, query: Query) {
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const lane = String(query.lane ?? 'DirectOrders'),
        active = actor.status === 'ACTIVE';
      if (
        actor.status === 'LOCKED' &&
        ['Listings', 'AuctionIntakes'].includes(lane)
      )
        throw new DomainError(
          403,
          'FORBIDDEN',
          'Nhóm việc này cần tài khoản được phép xem bài đăng.',
        );
      switch (lane) {
        case 'DirectOrders':
          return this.page(
            tx,
            actor._id,
            lane,
            query,
            tx.c.direct_orders,
            [
              {
                $match: {
                  ...participant(actor._id),
                  state: { $nin: ['Completed', 'Cancelled', 'PaymentExpired'] },
                },
              },
              clockKey('$state', [
                ['AwaitingPayment', '$paymentDeadline'],
                ['PendingSellerConfirmation', '$sellerConfirmationDeadline'],
                ['Inspection', '$inspectionDeadline'],
              ]),
            ],
            (o, now) => ({
              ...item(
                o._id,
                'DirectOrder',
                o.state,
                o.version,
                o.buyerId === actor._id
                  ? 'Đơn mua trực tiếp'
                  : 'Đơn bán trực tiếp',
              ),
              ...atReadTime(
                directGuidance(o, actor._id, actor.status !== 'LOCKED'),
                now,
              ),
            }),
          );
        case 'Exchanges':
          return this.page(
            tx,
            actor._id,
            lane,
            query,
            tx.c.exchanges,
            [
              {
                $match: {
                  $or: [{ initiatorId: actor._id }, { recipientId: actor._id }],
                  status: {
                    $nin: ['Completed', 'Cancelled', 'Rejected', 'Expired'],
                  },
                },
              },
              clockKey('$status', [
                ['Proposed', '$proposalExpiresAt'],
                ['AcceptedAwaitingFunding', '$fundingDeadline'],
                ['Preparing', '$shippingDeadline'],
                [
                  'Delivered',
                  {
                    $cond: [
                      { $eq: ['$initiatorId', actor._id] },
                      participantInspectionDeadlineExpression('initiator'),
                      participantInspectionDeadlineExpression('recipient'),
                    ],
                  },
                ],
              ]),
            ],
            (e, now) => ({
              ...item(
                e._id,
                'Exchange',
                hasExchangeDispute(e) ? 'ResolutionPending' : e.status,
                e.revision,
                'Trao đổi sách',
              ),
              ...atReadTime(exchangeGuidance(e, actor._id, active), now),
            }),
          );
        case 'Listings':
          return this.page(
            tx,
            actor._id,
            lane,
            query,
            tx.c.listings,
            [
              {
                $match: {
                  ownerId: actor._id,
                  deletedAt: null,
                  visibility: { $ne: 'Removed' },
                  trade: 'Available',
                  moderation: { $in: ['Draft', 'Rejected', 'PendingReview'] },
                },
              },
              { $set: { key: '$createdAt' } },
            ],
            (l) => ({
              ...item(
                l._id,
                'Listing',
                l.moderation,
                l.version,
                'Bài đăng sách',
              ),
              dueAt: null,
              attention:
                l.moderation === 'PendingReview'
                  ? 'Waiting'
                  : active
                    ? 'Action'
                    : 'Blocked',
              reason:
                l.moderation === 'PendingReview'
                  ? 'Đang chờ kiểm duyệt. Chưa phải bài đã hiển thị.'
                  : active
                    ? l.moderation === 'Rejected'
                      ? 'Bài bị từ chối. Mở bài để đọc lý do, sửa và gửi duyệt lại.'
                      : 'Bản nháp chưa gửi duyệt. Mở để tiếp tục nội dung và ảnh.'
                    : 'Tài khoản hiện không được gửi duyệt mới. Bạn có thể xem nội dung đã lưu.',
            }),
          );
        case 'AuctionIntakes':
          return this.page(
            tx,
            actor._id,
            lane,
            query,
            tx.c.auction_intakes,
            [
              {
                $match: {
                  sellerId: actor._id,
                  state: {
                    $in: [
                      'AwaitingDropoff',
                      'Received',
                      'NeedsEvidence',
                      'Passed',
                      'ReclaimRequired',
                    ],
                  },
                },
              },
              clockKey('$state', [
                ['AwaitingDropoff', '$dropoffDeadline'],
                ['NeedsEvidence', '$evidenceDeadline'],
              ]),
            ],
            (i, now) => ({
              ...item(
                i._id,
                'AuctionIntake',
                i.state,
                i.version,
                'Sách gửi đấu giá',
              ),
              ...atReadTime(intakeGuidance(i, active), now),
            }),
          );
        case 'AuctionOrders':
          return this.page(
            tx,
            actor._id,
            lane,
            query,
            tx.c.point_orders,
            [
              {
                $match: {
                  ...participant(actor._id),
                  state: { $nin: ['Completed', 'Cancelled', 'PaymentExpired'] },
                },
              },
              clockKey('$state', [
                ['AwaitingPayment', '$paymentDeadline'],
                ['Fulfilling', '$acceptanceDeadline'],
                ['ReadyForCollection', '$collectionDeadline'],
                ['Inspection', '$inspectionDeadline'],
                ['ReturnPending', '$returnDeadline'],
              ]),
            ],
            (o, now) => ({
              ...item(
                o._id,
                'Auction',
                o.state,
                o.version,
                'Đơn đấu giá',
                o.auctionId,
              ),
              ...atReadTime(
                pointGuidance(o, actor._id, actor.status !== 'LOCKED'),
                now,
              ),
            }),
          );
        default:
          throw invalidField('/lane', 'Nhóm việc không hợp lệ.');
      }
    });
  }

  operations(auth: Actor, query: Query) {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const lane = String(query.lane ?? 'ListingReview');
      if (lane === 'ListingReview')
        return this.page(
          tx,
          actor._id,
          lane,
          query,
          tx.c.listings,
          [
            {
              $match: {
                ownerId: { $ne: actor._id },
                deletedAt: null,
                visibility: { $ne: 'Removed' },
                trade: 'Available',
                moderation: 'PendingReview',
              },
            },
            {
              $lookup: {
                from: 'listing_revisions',
                localField: 'currentRevisionId',
                foreignField: '_id',
                as: 'revision',
              },
            },
            { $unwind: '$revision' },
            { $match: { 'revision.submittedAt': { $ne: null } } },
            { $set: { key: '$revision.submittedAt' } },
          ],
          (l) => ({
            ...item(
              l._id,
              'ListingReview',
              l.moderation,
              l.version,
              'Bài đăng chờ duyệt',
            ),
            dueAt: null,
            attention: 'Action',
            reason:
              'Mở đúng bài để kiểm tra nội dung, ảnh và quyết định. Bài của chính bạn không nằm trong danh sách này.',
          }),
        );
      if (lane === 'CatalogReview') {
        admin(actor);
        return this.page(
          tx,
          actor._id,
          lane,
          query,
          tx.c.catalog_books,
          [
            {
              $match: {
                requesterId: { $ne: actor._id },
                status: 'Pending',
                currentRevisionId: { $ne: null },
              },
            },
            { $set: { key: '$createdAt' } },
          ],
          (b) => ({
            ...item(
              b._id,
              'CatalogReview',
              b.status,
              b.version,
              'Đầu sách chờ duyệt',
            ),
            dueAt: null,
            attention: 'Action',
            reason:
              'Mở yêu cầu đầu sách để đối chiếu và xác nhận hoặc từ chối. Không duyệt yêu cầu của chính mình.',
          }),
        );
      }
      throw invalidField('/lane', 'Nhóm việc không hợp lệ.');
    });
  }
}
