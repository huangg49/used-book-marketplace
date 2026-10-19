import type {
  ListingChannel,
  ListingDoc,
} from '../../database/mongo/documents.js';
import { invalidField, invalidState } from '../commands/domain-error.js';

// ADR 0041: an Auction listing is a Sale whose salePrice is the declared
// (protective) value. It has no delivery origin: the book goes to a point.
export function requireChannelContent(
  channel: ListingChannel,
  content: {
    mode?: string | null;
    exchangeValue?: number | null;
    fulfillment?: unknown;
  },
) {
  if (channel !== 'Auction') return;
  if (content.mode != null && content.mode !== 'Sale')
    invalidField(
      '/content/mode',
      'Sách đấu giá chỉ dùng hình thức Bán với giá trị khai báo.',
    );
  if (content.exchangeValue != null)
    invalidField(
      '/content/exchangeValue',
      'Sách đấu giá không có giá trị đổi sách.',
    );
  if (content.fulfillment)
    invalidField(
      '/content/fulfillment',
      'Sách đấu giá được gửi tới điểm giao nhận, không chọn nơi gửi giao trực tiếp.',
    );
}

// Marketplace commands (quotes, purchases, Buy now, exchanges, wishlist)
// recheck the channel under their own locks; a hidden button is not a guard.
export function requireMarketplace(l: Pick<ListingDoc, 'channel'>) {
  if (l.channel === 'Auction') throw invalidState();
}
