import { MOCK_EXCHANGE_DETAILS, MOCK_MESSAGES } from '../lib/mock/exchangeDetail';
import type { ExchangeDetail, ChatMessage } from '../lib/mock/exchangeDetail';

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
    await new Promise(resolve => setTimeout(resolve, 400));
    return getDetailById(id) || null;
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
    await new Promise(resolve => setTimeout(resolve, 600));
    const detail = getDetailById(id);
    if (detail) {
        detail.status = 'CANCELLED';
        detail.failedAtStep = 1;
        addSystemMessage(id, 'Bạn đã hủy đề nghị trao đổi.');
    }
}

export async function acceptExchange(id: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 600));
    const detail = getDetailById(id);
    if (detail) {
        detail.status = 'DELIVERING';
        addSystemMessage(id, 'Bạn đã chấp nhận đề nghị trao đổi.');
    }
}

export async function rejectExchange(id: string, reason?: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 600));
    const detail = getDetailById(id);
    if (detail) {
        detail.status = 'REJECTED';
        detail.failedAtStep = 2;
        if (reason) detail.rejectionReason = reason;
        addSystemMessage(id, `Bạn đã từ chối đề nghị trao đổi.${reason ? ` Lý do: ${reason}` : ''}`);
    }
}

export async function confirmSent(id: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 600));
    const detail = getDetailById(id);
    if (detail) {
        detail.viewerShipping.sentAt = new Date().toISOString();
        // Cập nhật status theo logic đơn giản cho demo
        detail.status = 'DELIVERING';
        addSystemMessage(id, 'Bạn đã xác nhận gửi sách.');
    }
}

export async function confirmReceived(id: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 600));
    const detail = getDetailById(id);
    if (detail) {
        detail.viewerShipping.receivedAt = new Date().toISOString();
        if (detail.partnerShipping.receivedAt) {
            detail.status = 'COMPLETED';
        } else {
            detail.status = 'WAITING_YOU_CONFIRM';
        }
        addSystemMessage(id, 'Bạn đã xác nhận nhận sách.');
    }
}

export async function reportIssue(id: string, type: string, description: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 600));
    addSystemMessage(id, `Bạn đã báo cáo sự cố: [${type}] ${description}`);
}
