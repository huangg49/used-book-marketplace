export type ExchangeStatus = 
    | 'FUNDING' | 'RESOLUTION_PENDING'
    | 'PENDING' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' // sent / received
    | 'DELIVERING' | 'WAITING_YOU_SEND' | 'WAITING_YOU_CONFIRM' // active
    | 'COMPLETED' | 'NEED_REVIEW'; // done

export type ExchangeTab = 'sent' | 'received' | 'active' | 'done';

export interface ExchangeUser {
    id: string;
    username: string;
    rating?: number;
}

export interface ExchangeBook {
    id: string;
    title: string;
    author: string;
    coverUrl?: string;
}

export interface ExchangeItem {
    id: string;
    createdAt: string; // ISO
    tab: ExchangeTab;
    status: ExchangeStatus;
    partner: ExchangeUser;
    receiveBooks: ExchangeBook[];
    giveBooks: ExchangeBook[];
    moneyCompensationType: 'none' | 'user_pays' | 'other_pays';
    moneyAmount?: number;
}

export const MOCK_EXCHANGES: ExchangeItem[] = [
    // --- SENT ---
    {
        id: 'ex_1',
        createdAt: '2026-10-12T08:00:00Z',
        tab: 'sent',
        status: 'PENDING',
        partner: { id: 'u_2', username: 'felix_reads', rating: 4.8 },
        receiveBooks: [
            { id: 'b_1', title: 'The Bell Jar', author: 'Sylvia Plath', coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=200' }
        ],
        giveBooks: [
            { id: 'b_2', title: 'Frankenstein', author: 'Mary Shelley', coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=200' }
        ],
        moneyCompensationType: 'none'
    },
    {
        id: 'ex_2',
        createdAt: '2026-10-10T14:30:00Z',
        tab: 'sent',
        status: 'PENDING',
        partner: { id: 'u_3', username: 'clara_books', rating: 5.0 },
        receiveBooks: [
            { id: 'b_3', title: 'Moby Dick', author: 'Herman Melville', coverUrl: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?q=80&w=200' }
        ],
        giveBooks: [
            { id: 'b_4', title: 'Leaves of Grass', author: 'Walt Whitman', coverUrl: 'https://images.unsplash.com/photo-1543004218-ee14110497f9?q=80&w=200' }
        ],
        moneyCompensationType: 'user_pays',
        moneyAmount: 50000
    },
    {
        id: 'ex_3',
        createdAt: '2026-10-05T09:15:00Z',
        tab: 'sent',
        status: 'REJECTED',
        partner: { id: 'u_4', username: 'marcus_history', rating: 3.0 },
        receiveBooks: [
            { id: 'b_5', title: 'The Odyssey', author: 'Homer', coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=200' }
        ],
        giveBooks: [
            { id: 'b_6', title: 'Số Đỏ', author: 'Vũ Trọng Phụng', coverUrl: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?q=80&w=200' },
            { id: 'b_7', title: 'Sách khác', author: 'Tác giả khác' }
        ],
        moneyCompensationType: 'none'
    },
    
    // --- RECEIVED ---
    {
        id: 'ex_4',
        createdAt: '2026-10-11T10:00:00Z',
        tab: 'received',
        status: 'PENDING',
        partner: { id: 'u_5', username: 'alice_wonder', rating: 4.5 },
        receiveBooks: [
            { id: 'b_8', title: '1984', author: 'George Orwell' }
        ],
        giveBooks: [
            { id: 'b_9', title: 'To Kill a Mockingbird', author: 'Harper Lee' }
        ],
        moneyCompensationType: 'other_pays',
        moneyAmount: 20000
    },

    // --- ACTIVE ---
    {
        id: 'ex_5',
        createdAt: '2026-10-01T08:00:00Z',
        tab: 'active',
        status: 'DELIVERING',
        partner: { id: 'u_6', username: 'bob_builder' },
        receiveBooks: [
            { id: 'b_10', title: 'Clean Code', author: 'Robert C. Martin' }
        ],
        giveBooks: [
            { id: 'b_11', title: 'Design Patterns', author: 'GoF' }
        ],
        moneyCompensationType: 'none'
    },
    {
        id: 'ex_6',
        createdAt: '2026-10-02T16:00:00Z',
        tab: 'active',
        status: 'WAITING_YOU_SEND',
        partner: { id: 'u_7', username: 'charlie_chaplin', rating: 4.9 },
        receiveBooks: [
            { id: 'b_12', title: 'The Pragmatic Programmer', author: 'Andrew Hunt' }
        ],
        giveBooks: [
            { id: 'b_13', title: 'Refactoring', author: 'Martin Fowler' }
        ],
        moneyCompensationType: 'none'
    },

    // --- DONE ---
    {
        id: 'ex_7',
        createdAt: '2026-09-15T08:00:00Z',
        tab: 'done',
        status: 'COMPLETED',
        partner: { id: 'u_8', username: 'david_copperfield', rating: 5.0 },
        receiveBooks: [
            { id: 'b_14', title: 'Harry Potter 1', author: 'J.K. Rowling' }
        ],
        giveBooks: [
            { id: 'b_15', title: 'Percy Jackson 1', author: 'Rick Riordan' }
        ],
        moneyCompensationType: 'none'
    }
];
