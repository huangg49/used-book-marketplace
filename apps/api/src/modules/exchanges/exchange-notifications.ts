import { randomUUID } from 'node:crypto';
import type {
  ExchangeDoc,
  MemberNotificationDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';

export type ExchangeNotificationKind =
  | 'ExchangeProposed'
  | 'ExchangeAccepted'
  | 'ExchangeFunded'
  | 'ExchangeShipped'
  | 'ExchangeReceived'
  | 'ExchangeCompleted'
  | 'ExchangeCancelled'
  | 'ExchangeRejected'
  | 'ExchangeDisputed';

async function getListingTitle(tx: Tx, listingId: string): Promise<string> {
  const listing = await tx.c.listings.findOne({ _id: listingId });
  if (!listing?.currentRevisionId) return 'Sách';
  const rev = await tx.c.listing_revisions.findOne({ _id: listing.currentRevisionId });
  if (!rev?.bookId) return 'Sách';
  const book = await tx.c.catalog_books.findOne({ _id: rev.bookId });
  if (book?.currentRevisionId) {
    const catRev = await tx.c.catalog_revisions.findOne({ _id: book.currentRevisionId });
    if (catRev?.title) return catRev.title;
  }
  if (book?.titleKey) return book.titleKey;
  return 'Sách';
}

async function exchangeContext(tx: Tx, ex: ExchangeDoc) {
  const [initTitleRaw, recTitleRaw, initiator, recipient] = await Promise.all([
    getListingTitle(tx, ex.initiatorListingId),
    getListingTitle(tx, ex.recipientListingId),
    tx.c.users.findOne({ _id: ex.initiatorId }),
    tx.c.users.findOne({ _id: ex.recipientId }),
  ]);

  const count = ex.initiatorListingIds?.length ?? 1;
  const initTitleFormatted =
    count > 1 ? `${initTitleRaw} (+${count - 1} cuốn)` : initTitleRaw;
  const initTitle = (initTitleFormatted || 'Sách của đối tác').slice(0, 60);
  const recTitle = (recTitleRaw || 'Sách của bạn').slice(0, 60);

  return {
    initiatorName: initiator?.displayName || 'Người dùng',
    recipientName: recipient?.displayName || 'Đối tác',
    initTitle: `“${initTitle}”`,
    recTitle: `“${recTitle}”`,
  };
}

export async function notifyExchange(
  tx: Tx,
  ex: ExchangeDoc,
  kind: ExchangeNotificationKind,
  recipients: (string | null | undefined)[],
  now: Date,
  extra?: { trackingCode?: string; reason?: string },
) {
  const users = [...new Set(recipients.filter((u): u is string => !!u))];
  if (!users.length) return;

  const ctx = await exchangeContext(tx, ex);
  const rows: MemberNotificationDoc[] = [];

  for (const userId of users) {
    const isInitiator = userId === ex.initiatorId;
    let title = '';
    let body = '';

    switch (kind) {
      case 'ExchangeProposed':
        title = 'Bạn có đề xuất trao đổi sách mới';
        body = `${ctx.initiatorName} muốn dùng cuốn ${ctx.initTitle} để đổi lấy cuốn ${ctx.recTitle} của bạn. Hãy vào phản hồi đề xuất!`;
        break;

      case 'ExchangeAccepted':
        title = 'Đề xuất trao đổi đã được chấp thuận';
        body = `Hai bên đã đồng ý trao đổi ${ctx.initTitle} và ${ctx.recTitle}. Vui lòng nạp tiền cọc bảo chứng trong vòng 24 giờ để tiếp tục.`;
        break;

      case 'ExchangeFunded':
        title = 'Đối tác đã nạp cọc bảo chứng';
        body = isInitiator
          ? `Đối tác @${ctx.recipientName} đã nạp cọc bảo chứng cho giao dịch đổi sách. Hãy hoàn tất nạp cọc hoặc chuẩn bị sách để gửi!`
          : `Bạn @${ctx.initiatorName} đã nạp cọc bảo chứng cho giao dịch đổi sách. Hãy hoàn tất nạp cọc hoặc chuẩn bị sách để gửi!`;
        break;

      case 'ExchangeShipped': {
        const tracking = extra?.trackingCode ? ` (Mã vận đơn: ${extra.trackingCode})` : '';
        title = 'Đối tác đã gửi sách cho bạn';
        body = isInitiator
          ? `@${ctx.recipientName} đã gửi gói sách cho bạn${tracking}. Hãy theo dõi hành trình giao nhận!`
          : `@${ctx.initiatorName} đã gửi gói sách cho bạn${tracking}. Hãy theo dõi hành trình giao nhận!`;
        break;
      }

      case 'ExchangeReceived':
        title = 'Đối tác đã nhận được sách';
        body = isInitiator
          ? `@${ctx.recipientName} đã xác nhận nhận được sách từ bạn. Khoảng đệm nghiệm thu 48 giờ bắt đầu!`
          : `@${ctx.initiatorName} đã xác nhận nhận được sách từ bạn. Khoảng đệm nghiệm thu 48 giờ bắt đầu!`;
        break;

      case 'ExchangeCompleted':
        title = 'Giao dịch trao đổi sách đã hoàn tất!';
        body = `Cả 2 bên đã nhận sách và xác nhận đã nhận hàng cuốn ${ctx.initTitle} và ${ctx.recTitle}. Toàn bộ tiền cọc bảo chứng đã được tất toán về ví của bạn.`;
        break;

      case 'ExchangeRejected':
        title = 'Đề xuất trao đổi đã bị từ chối';
        body = `Đối tác đã từ chối đề xuất trao đổi sách.${extra?.reason ? ` Lý do: ${extra.reason}` : ''}`;
        break;

      case 'ExchangeCancelled':
        title = 'Giao dịch trao đổi đã bị hủy';
        body = `Giao dịch trao đổi sách đã kết thúc.${extra?.reason ? ` Lý do: ${extra.reason}` : ''}`;
        break;

      case 'ExchangeDisputed':
        title = 'Giao dịch trao đổi có khiếu nại';
        body = `Giao dịch trao đổi sách đã được tạm dừng tất toán do có khiếu nại.${extra?.reason ? ` Nội dung: ${extra.reason}` : ''}`;
        break;
    }

    if (!title) continue;

    rows.push({
      _id: randomUUID(),
      userId,
      kind,
      title: title.slice(0, 120),
      body: body.slice(0, 400),
      targetType: 'Exchange',
      targetId: ex._id,
      dedupeKey: `${kind}:${ex._id}:${ex.revision}:${userId}`,
      createdAt: now,
      readAt: null,
    });
  }

  if (rows.length) {
    await tx.c.member_notifications.insertMany(rows);
  }
}
