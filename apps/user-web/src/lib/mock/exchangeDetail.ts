import type { ExchangeStatus, ExchangeBook, ExchangeUser } from './exchangeMine';

export type ViewerRole = 'proposer' | 'recipient';

export interface ShippingConfirm {
  sentAt?: string;      // ISO – đã xác nhận gửi
  receivedAt?: string;  // ISO – đã xác nhận nhận
}

export interface ExchangeDetail {
  id: string;
  transactionCode: string;
  createdAt: string;
  status: ExchangeStatus;
  failedAtStep?: 1 | 2 | 3 | 4 | 5; // chỉ khi REJECTED/CANCELLED/EXPIRED
  viewerRole: ViewerRole;
  viewer: ExchangeUser;
  partner: ExchangeUser & { transactionCount: number };
  receiveBooks: (ExchangeBook & { condition?: string })[];
  giveBooks: (ExchangeBook & { condition?: string })[];
  deliveryMethod: 'meetup' | 'shipping';
  moneyCompensationType: 'none' | 'user_pays' | 'other_pays';
  moneyAmount?: number;
  initialMessage?: string;
  rejectionReason?: string;
  viewerShipping: ShippingConfirm;
  partnerShipping: ShippingConfirm;
  hasViewerReviewed: boolean;
  closedBy?: 'viewer' | 'partner';
}

export interface ChatMessage {
  id: string;
  senderRole: 'viewer' | 'partner' | 'system';
  text: string;
  sentAt: string; // ISO
}

const mockViewer: ExchangeUser = { id: 'u_viewer', username: 'you', rating: 4.5 };
const mockPartner: ExchangeUser & { transactionCount: number } = { id: 'u_partner', username: 'partner', rating: 4.8, transactionCount: 15 };

const mockReceiveBooks: (ExchangeBook & { condition?: string })[] = [
  { id: 'b_1', title: 'The Bell Jar', author: 'Sylvia Plath', coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=200', condition: 'Tốt' }
];

const mockGiveBooks: (ExchangeBook & { condition?: string })[] = [
  { id: 'b_2', title: 'Frankenstein', author: 'Mary Shelley', coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=200', condition: 'Khá' }
];

export const MOCK_EXCHANGE_DETAILS: ExchangeDetail[] = [
  {
    id: 'ex-8492',
    transactionCode: 'EX-8492',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'DELIVERING',
    viewerRole: 'proposer',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'none',
    viewerShipping: { sentAt: '2026-10-14T10:00:00Z' },
    partnerShipping: {},
    hasViewerReviewed: false
  },
  {
    id: 'ex-sent-pending',
    transactionCode: 'EX-8501',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'PENDING',
    viewerRole: 'proposer',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'meetup',
    moneyCompensationType: 'user_pays',
    moneyAmount: 50000,
    initialMessage: 'Chào bạn, mình muốn đổi sách này!',
    viewerShipping: {},
    partnerShipping: {},
    hasViewerReviewed: false
  },
  {
    id: 'ex-recv-pending',
    transactionCode: 'EX-8502',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'PENDING',
    viewerRole: 'recipient',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'other_pays',
    moneyAmount: 20000,
    viewerShipping: {},
    partnerShipping: {},
    hasViewerReviewed: false
  },
  {
    id: 'ex-delivering-2',
    transactionCode: 'EX-8503',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'DELIVERING',
    viewerRole: 'recipient',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'none',
    viewerShipping: {},
    partnerShipping: {},
    hasViewerReviewed: false
  },
  {
    id: 'ex-confirm',
    transactionCode: 'EX-8504',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'WAITING_YOU_CONFIRM',
    viewerRole: 'proposer',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'none',
    viewerShipping: { sentAt: '2026-10-14T10:00:00Z' },
    partnerShipping: { sentAt: '2026-10-15T14:00:00Z', receivedAt: '2026-10-17T09:00:00Z' },
    hasViewerReviewed: false
  },
  {
    id: 'ex-completed',
    transactionCode: 'EX-8505',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'COMPLETED',
    viewerRole: 'proposer',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'meetup',
    moneyCompensationType: 'none',
    viewerShipping: { sentAt: '2026-10-14T10:00:00Z', receivedAt: '2026-10-15T10:00:00Z' },
    partnerShipping: { sentAt: '2026-10-14T10:00:00Z', receivedAt: '2026-10-15T10:00:00Z' },
    hasViewerReviewed: false
  },
  {
    id: 'ex-rejected',
    transactionCode: 'EX-8506',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'REJECTED',
    failedAtStep: 2,
    viewerRole: 'recipient',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'none',
    rejectionReason: 'Xin lỗi, mình đã hứa đổi cuốn này cho người khác rồi.',
    viewerShipping: {},
    partnerShipping: {},
    hasViewerReviewed: false
  },
  {
    id: 'ex-cancelled',
    transactionCode: 'EX-8507',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'CANCELLED',
    failedAtStep: 1,
    viewerRole: 'proposer',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'none',
    viewerShipping: {},
    partnerShipping: {},
    hasViewerReviewed: false
  },
  {
    id: 'ex-expired',
    transactionCode: 'EX-8508',
    createdAt: '2026-10-12T08:00:00Z',
    status: 'EXPIRED',
    failedAtStep: 2,
    viewerRole: 'proposer',
    viewer: mockViewer,
    partner: mockPartner,
    receiveBooks: mockReceiveBooks,
    giveBooks: mockGiveBooks,
    deliveryMethod: 'shipping',
    moneyCompensationType: 'none',
    viewerShipping: {},
    partnerShipping: {},
    hasViewerReviewed: false
  }
];

export const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  'ex-8492': [
    { id: 'm1', senderRole: 'partner', text: 'Chào bạn, đề nghị đổi sách của bạn có vẻ hợp lý.', sentAt: '2026-10-12T08:15:00Z' },
    { id: 'm2', senderRole: 'viewer', text: 'Tuyệt quá, mình sẽ bọc cẩn thận và gửi sớm nhé.', sentAt: '2026-10-12T08:20:00Z' },
    { id: 'm3', senderRole: 'system', text: 'Đề nghị trao đổi đã được chấp nhận.', sentAt: '2026-10-12T08:25:00Z' },
    { id: 'm4', senderRole: 'system', text: 'Bạn đã xác nhận gửi sách.', sentAt: '2026-10-14T10:00:00Z' },
  ],
  'ex-recv-pending': [
    { id: 'm1', senderRole: 'partner', text: 'Bạn xem có đổi được không nhé.', sentAt: '2026-10-12T08:10:00Z' }
  ],
  'ex-rejected': [
    { id: 'm1', senderRole: 'partner', text: 'Xin lỗi, mình đã hứa đổi cuốn này cho người khác rồi.', sentAt: '2026-10-13T09:00:00Z' },
    { id: 'm2', senderRole: 'system', text: 'Đề nghị trao đổi đã bị từ chối.', sentAt: '2026-10-13T09:00:00Z' }
  ]
};
