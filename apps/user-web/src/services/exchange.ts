import { MOCK_EXCHANGES } from '../lib/mock/exchangeMine';
import type { ExchangeTab, ExchangeItem } from '../lib/mock/exchangeMine';

export async function getExchangeTransactions(tab: ExchangeTab, page: number): Promise<{ data: ExchangeItem[], total: number }> {
    // Giả lập network delay
    await new Promise(resolve => setTimeout(resolve, 600));

    // Lọc theo tab
    let filtered = MOCK_EXCHANGES.filter(ex => ex.tab === tab);

    // Để test phân trang (tab done), clone thêm dữ liệu
    if (tab === 'done') {
        filtered = Array.from({ length: 12 }).map((_, i) => ({
            ...filtered[0],
            id: `ex_done_${i}`,
            createdAt: `2026-10-${String(Math.max(1, 30 - i)).padStart(2, '0')}T08:00:00Z`
        }));
    }

    const PAGE_SIZE = 5;
    const total = filtered.length;
    const start = (page - 1) * PAGE_SIZE;
    const data = filtered.slice(start, start + PAGE_SIZE);

    return { data, total };
}

export async function getExchangeCounts(): Promise<Record<ExchangeTab, number>> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
        sent: MOCK_EXCHANGES.filter(ex => ex.tab === 'sent').length,
        received: MOCK_EXCHANGES.filter(ex => ex.tab === 'received').length,
        active: MOCK_EXCHANGES.filter(ex => ex.tab === 'active').length,
        done: 12 // test data
    };
}
