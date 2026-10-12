import { MOCK_EXCHANGE_DETAILS, MOCK_MESSAGES } from '../lib/mock/exchangeDetail';
import type { ExchangeDetail, ChatMessage } from '../lib/mock/exchangeDetail';
import { session } from './api';
import { exchangeSchema } from './exchange';
import { getPublicListing } from './public-listings';

// In-memory state
let detailsState = [...MOCK_EXCHANGE_DETAILS.map(d => ({ ...d }))];
let messagesState = { ...MOCK_MESSAGES };

function getDetailById(id: string) {
    const detail = detailsState.find(d => d.id === id);
    if (detail) return detail;
    
    if (id === 'ex_1' || id === 'ex_2' || id === 'ex_3') return detailsState.find(d => d.id === 'ex-sent-pending');
    if (id === 'ex_4') return detailsState.find(d => d.id === 'ex-recv-pending');
    
    return detailsState[0];
}

function addSystemMessage(id: string, text: string) {
    if (!messagesState[id]) messagesState[id] = [];
    messagesState[id].push({
        id: `sys-${Date.now()}-${Math.random()}`,
        senderRole: 'system',
        text,
        sentAt: new Date().toISOString()
    });
}

export async function getExchangeDetail(id: string): Promise<ExchangeDetail | null> {
    try {
        const ex = await session.request(`/exchanges/${id}`, exchangeSchema);
        const myUserId = session.session?.user.id;
        const isInitiator = ex.initiatorId === myUserId;
        
        let initListing, recListing;
        try { initListing = await getPublicListing(ex.initiatorListingId); } catch(e) {}
        try { recListing = await getPublicListing(ex.recipientListingId); } catch(e) {}

        const myListing = isInitiator ? initListing : recListing;
        const theirListing = isInitiator ? recListing : initListing;

        return {
            id: ex.id,
            createdAt: ex.createdAt,
            status: ex.status === 'Proposed' ? 'PENDING' : 
                    ex.status === 'Cancelled' ? 'CANCELLED' : 
                    ex.status === 'ResolutionPending' ? 'NEED_REVIEW' : 
                    ex.status === 'Completed' ? 'COMPLETED' : 
                    ex.status === 'AcceptedAwaitingFunding' || ex.status === 'Preparing' ? 'WAITING_YOU_SEND' : 'DELIVERING',
            partner: {
                id: isInitiator ? ex.recipientId : ex.initiatorId,
                username: theirListing?.seller.displayName || 'Người dùng',
                rating: 5,
                joinDate: '2024-01-01',
                completedExchanges: 10
            },
            receiveBooks: theirListing ? [{ id: theirListing.book.id, title: theirListing.book.title, author: theirListing.book.authors.join(', '), coverUrl: theirListing.photos?.[0] ? undefined : undefined, condition: theirListing.condition, exchangeValue: theirListing.exchangeValue }] : [{ id: 'unknown', title: 'Sách', author: 'N/A', condition: 'Good' }],
            giveBooks: myListing ? [{ id: myListing.book.id, title: myListing.book.title, author: myListing.book.authors.join(', '), coverUrl: myListing.photos?.[0] ? undefined : undefined, condition: myListing.condition, exchangeValue: myListing.exchangeValue }] : [{ id: 'unknown', title: 'Sách', author: 'N/A', condition: 'Good' }],
            moneyCompensationType: ex.diffAmount > 0 ? (ex.diffPayerId === myUserId ? 'user_pays' : 'other_pays') : 'none',
            moneyAmount: ex.diffAmount > 0 ? ex.diffAmount : undefined,
            viewerShipping: { address: 'Địa chỉ của tôi', phone: '0901234567', name: 'Tôi' },
            partnerShipping: { address: 'Địa chỉ đối tác', phone: '0909999999', name: 'Đối tác' },
            timeline: [{ title: 'Tạo yêu cầu', description: 'Đã gửi yêu cầu trao đổi', date: ex.createdAt, isCompleted: true }]
        };
    } catch (e) {
        // Fallback for mock IDs
        await new Promise(resolve => setTimeout(resolve, 400));
        return getDetailById(id) || null;
    }
}

export async function getMessages(id: string): Promise<ChatMessage[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return messagesState[id] || [];
}

export async function sendMessage(id: string, text: string): Promise<ChatMessage> {
    await new Promise(resolve => setTimeout(resolve, 500));
    const msg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        senderRole: 'viewer',
        text,
        sentAt: new Date().toISOString()
    };
    if (!messagesState[id]) messagesState[id] = [];
    messagesState[id].push(msg);
    return msg;
}

export async function cancelExchange(id: string): Promise<void> {
    try {
        await session.request(`/exchanges/${id}/cancel`, z.any(), {
            method: 'POST',
            body: JSON.stringify({ expectedVersion: 1 })
        });
    } catch (e) {
        console.error("Failed to call API cancel", e);
    }
}

export async function acceptExchange(id: string): Promise<void> {
    try {
        await session.request(`/exchanges/${id}/accept`, z.any(), {
            method: 'POST',
            body: JSON.stringify({ revision: 1 })
        });
    } catch (e) {
        console.error("Failed to call API", e);
    }
}

export async function rejectExchange(id: string, reason?: string): Promise<void> {
    try {
        await session.request(`/exchanges/${id}/reject`, z.any(), {
            method: 'POST',
            body: JSON.stringify({ expectedVersion: 1, reason: reason || 'Không phù hợp' })
        });
    } catch (e) {
        console.error("Failed to call API reject", e);
    }
}

export async function confirmSent(id: string): Promise<void> {
    try {
        await session.request(`/exchanges/${id}/ship`, z.any(), {
            method: 'POST',
            body: JSON.stringify({ expectedVersion: 1 })
        });
    } catch (e) {
        console.error("Failed to call API ship", e);
    }
}

export async function confirmReceived(id: string): Promise<void> {
    try {
        await session.request(`/exchanges/${id}/receive`, z.any(), {
            method: 'POST',
            body: JSON.stringify({ expectedVersion: 1 })
        });
    } catch (e) {
        console.error("Failed to call API receive", e);
    }
}

export async function reportIssue(id: string, type: string, description: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 600));
    addSystemMessage(id, `Bạn đã báo cáo sự cố: [${type}] ${description}`);
}
