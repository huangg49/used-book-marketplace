import type { Tx } from '../../database/mongo/transaction.js';
import { DomainError } from '../commands/domain-error.js';

export const ACTIVE_LISTING_LIMIT = 5;

// Called inside a command after the executor write-locks the owner. Every
// submit/review/archive command shares that lock, serializing count + transition
// even when requests use different listing IDs and idempotency keys.
export async function requireListingSlot(tx: Tx, ownerId: string) {
  const count = await tx.c.listings.countDocuments({
    ownerId,
    deletedAt: null,
    visibility: { $ne: 'Removed' },
    $or: [
      { moderation: 'PendingReview' },
      { moderation: 'Approved', visibility: 'Visible' },
    ],
    trade: { $in: ['Available', 'Reserved'] },
  });
  if (count >= ACTIVE_LISTING_LIMIT)
    throw new DomainError(
      409,
      'ListingLimitReached',
      'Bạn đã có tối đa 5 bài đang hiển thị hoặc chờ admin duyệt. Hãy ẩn hoặc lưu trữ một bài, hoặc chờ bài bị từ chối hay giao dịch hoàn tất trước khi đăng thêm.',
    );
}
