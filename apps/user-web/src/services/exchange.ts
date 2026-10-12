import { z } from 'zod';
import { session } from './api';
import type { ExchangeTab, ExchangeItem, ExchangeStatus as MockExchangeStatus } from '../lib/mock/exchangeMine';
import { getPublicListing } from './public-listings';

export const exchangeSchema = z.object({
  id: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  initiatorListingId: z.string().uuid(),
  recipientListingId: z.string().uuid(),
  status: z.enum(['Proposed', 'AcceptedAwaitingFunding', 'Preparing', 'InTransit', 'Delivered', 'Completed', 'Cancelled', 'ResolutionPending']),
  revision: z.number().int(),
  initiatorDeposit: z.number().int(),
  recipientDeposit: z.number().int(),
  diffAmount: z.number().int(),
  diffPayerId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const exchangePageSchema = z.object({
  items: z.array(exchangeSchema),
  nextCursor: z.string().nullable()
});

export type Exchange = z.infer<typeof exchangeSchema>;

function mapStatus(status: Exchange['status']): MockExchangeStatus {
  switch (status) {
    case 'Proposed': return 'PENDING';
    case 'Cancelled': return 'CANCELLED';
    case 'AcceptedAwaitingFunding': return 'WAITING_YOU_SEND'; // TODO: Needs proper user logic
    case 'Preparing': return 'WAITING_YOU_SEND';
    case 'InTransit': 
    case 'Delivered': return 'DELIVERING';
    case 'Completed': return 'COMPLETED';
    case 'ResolutionPending': return 'NEED_REVIEW';
    default: return 'PENDING';
  }
}

function getTabForStatus(status: Exchange['status']): ExchangeTab {
  if (['Proposed'].includes(status)) return 'active'; // In real app, we need to know if we sent or received it to put in 'sent'/'received'. For now default active.
  if (['AcceptedAwaitingFunding', 'Preparing', 'InTransit', 'Delivered'].includes(status)) return 'active';
  if (['Completed', 'Cancelled', 'ResolutionPending'].includes(status)) return 'done';
  return 'active';
}

export async function getExchangeTransactions(tab: ExchangeTab, page: number): Promise<{ data: ExchangeItem[], total: number }> {
  // Call real API
  const response = await session.request('/exchanges', exchangePageSchema);
  
  const myUserId = session.session?.user.id;
  
  // Filter by tab manually for now (API might need query params in future)
  const filtered = response.items.filter(ex => {
    const isInitiator = ex.initiatorId === myUserId;
    if (ex.status === 'Proposed') {
      if (tab === 'sent' && isInitiator) return true;
      if (tab === 'received' && !isInitiator) return true;
      return false;
    }
    return getTabForStatus(ex.status) === tab;
  });

  const PAGE_SIZE = 5;
  const total = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  const data: ExchangeItem[] = [];

  for (const ex of paginated) {
    // Fetch mock/public listings to populate UI
    // Note: getPublicListing might fail if the listing is no longer Available/Public.
    let initListing, recListing;
    try { initListing = await getPublicListing(ex.initiatorListingId); } catch(e) {}
    try { recListing = await getPublicListing(ex.recipientListingId); } catch(e) {}

    const isInitiator = ex.initiatorId === myUserId;
    const myListing = isInitiator ? initListing : recListing;
    const theirListing = isInitiator ? recListing : initListing;

    data.push({
      id: ex.id,
      createdAt: ex.createdAt,
      tab: tab,
      status: mapStatus(ex.status),
      partner: {
        id: isInitiator ? ex.recipientId : ex.initiatorId,
        username: theirListing?.seller.displayName || 'Người dùng',
      },
      receiveBooks: theirListing ? [{ id: theirListing.book.id, title: theirListing.book.title, author: theirListing.book.authors.join(', '), coverUrl: theirListing.photos?.[0] ? undefined : undefined }] : [{ id: 'unknown', title: 'Sách đã ẩn', author: 'N/A' }],
      giveBooks: myListing ? [{ id: myListing.book.id, title: myListing.book.title, author: myListing.book.authors.join(', ') }] : [{ id: 'unknown', title: 'Sách của bạn', author: 'N/A' }],
      moneyCompensationType: ex.diffAmount > 0 
        ? (ex.diffPayerId === myUserId ? 'user_pays' : 'other_pays') 
        : 'none',
      moneyAmount: ex.diffAmount > 0 ? ex.diffAmount : undefined
    });
  }

  return { data, total };
}

export async function getExchangeCounts(): Promise<Record<ExchangeTab, number>> {
  try {
    const response = await session.request('/exchanges', exchangePageSchema);
    const myUserId = session.session?.user.id;
    
    return {
      sent: response.items.filter(ex => ex.status === 'Proposed' && ex.initiatorId === myUserId).length,
      received: response.items.filter(ex => ex.status === 'Proposed' && ex.initiatorId !== myUserId).length,
      active: response.items.filter(ex => ['AcceptedAwaitingFunding', 'Preparing', 'InTransit', 'Delivered'].includes(ex.status)).length,
      done: response.items.filter(ex => ['Completed', 'Cancelled', 'ResolutionPending'].includes(ex.status)).length
    };
  } catch (err) {
    return { sent: 0, received: 0, active: 0, done: 0 };
  }
}
