/**
 * Đường dẫn dùng chung cho Header, Footer và HomePage.
 * TODO: đối chiếu với src/app/router.tsx và sửa cho khớp.
 */
export const ROUTES = {
  home: '/',
  search: '/books',
  bookDetail: (id: string): string => `/books/${id}`,
  sell: '/sell',
  login: '/login',
  register: '/register',
  exchange: '/exchange',
  exchangeCompose: (bookId: string): string => `/exchange/new?book=${bookId}`,
  exchangeMine: '/exchange/mine',
  exchangeDetail: (id: string): string => `/exchange/${id}`,
  chat: (conversationId?: string): string => conversationId ? `/chat/${conversationId}` : '/chat',
  auctions: '/auctions',
  auctionDetail: (id: string): string => `/auctions/${id}`,
} as const

export function searchUrl(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString()
  return query ? `${ROUTES.search}?${query}` : ROUTES.search
}

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export function formatVnd(amount: number): string {
  return vndFormatter.format(amount)
}
