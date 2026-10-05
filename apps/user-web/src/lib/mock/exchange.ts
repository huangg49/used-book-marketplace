/**
 * DỮ LIỆU MẪU cho trang Trao đổi.
 * TODO: thay bằng dữ liệu thật từ API (gợi ý khớp, sách đang mở trao đổi).
 */

export interface ExchangeStep {
    title: string
    description: string
}

export interface ExchangeBook {
    id: string
    title: string
    author: string
    /** Giá tham khảo để hai bên cân đối giá trị, không phải giá bán */
    referencePriceVnd: number
    /** Người đăng muốn đổi lấy gì */
    wants: string
    location: string
    listedAt: string
    coverUrl?: string
}

export type MatchKind = 'mutual' | 'oneway'

export interface MatchItem {
    id: string
    kind: MatchKind
    /** Cuốn bạn muốn nhận */
    wanted: { id: string; title: string; coverUrl?: string }
    /** Cuốn của bạn mà người kia quan tâm */
    offered: { id: string; title: string; coverUrl?: string }
}

export const EXCHANGE_STEPS: ExchangeStep[] = [
    {
        title: 'Chọn sách muốn nhận',
        description: 'Tìm cuốn sách bạn mong ước trong tủ sách của cộng đồng Lật lại.',
    },
    {
        title: 'Chọn sách để đổi',
        description:
            'Chọn một hoặc nhiều cuốn từ tủ sách của bạn để đề nghị trao đổi (tối đa 3 cuốn).',
    },
    {
        title: 'Trao đổi và giao nhận',
        description: 'Gặp trực tiếp hoặc gửi qua bưu điện để cuốn sách bắt đầu hành trình mới.',
    },
]

export const MATCHES: MatchItem[] = [
    {
        id: 'match-1',
        kind: 'mutual',
        wanted: { id: 'mock-3', title: 'Nhà giả kim', coverUrl: 'https://cdn1.fahasa.com/media/flashmagazine/images/page_images/nha_gia_kim_tai_ban_2020/2024_03_20_18_29_19_1-390x510.jpg' },
        offered: { id: 'mock-4', title: 'Tuổi thơ dữ dội', coverUrl: 'https://tse2.mm.bing.net/th/id/OIP.NOjh2Pigt_2PsEc_HjLrOQHaLZ?r=0&rs=1&pid=ImgDetMain&o=7&rm=3' },
    },
    {
        id: 'match-2',
        kind: 'oneway',
        wanted: { id: 'mock-2', title: 'Số đỏ', coverUrl: 'https://baokhanhhoa.vn/file/e7837c02857c8ca30185a8c39b582c03/dataimages/202003/original/images5399321_2.jpg' },
        offered: { id: 'mock-1', title: 'Dế Mèn phiêu lưu ký', coverUrl: 'https://3.bp.blogspot.com/-HnUNKe-Keic/WEXymR_Au5I/AAAAAAAAAZo/S0HAikMh1lAsq2xqhPnUCv3ucicIPKxsgCLcB/s1600/123.jpg' },
    },
]

export const EXCHANGE_BOOKS: ExchangeBook[] = [
    {
        id: 'ex-1',
        title: '80 ngày vòng quanh thế giới',
        author: 'Jules Verne',
        referencePriceVnd: 45000,
        wants: 'Sách văn học Nhật\u00A0Bản',
        location: 'Hà Nội',
        listedAt: '2026-10-03T09:00:00Z',
        coverUrl: 'https://cdn1.fahasa.com/media/catalog/product/8/9/8936067595772.jpg',
    },
    {
        id: 'ex-2',
        title: 'The call of the wild',
        author: 'Jack London',
        referencePriceVnd: 80000,
        wants: 'Truyện ngắn Việt\u00A0Nam',
        location: 'TP. Hồ Chí Minh',
        listedAt: '2026-10-02T09:00:00Z',
        coverUrl: 'https://i.pinimg.com/736x/ae/0c/2e/ae0c2eb1f2deb720890c05b1cc0bf90b.jpg',
    },
    {
        id: 'ex-3',
        title: 'Totto-chan',
        author: 'Kuroyanagi Tetsuko',
        referencePriceVnd: 120000,
        wants: 'Mở cho mọi đề nghị',
        location: 'Đà Nẵng',
        listedAt: '2026-10-01T09:00:00Z',
        coverUrl: 'https://pos.nvncdn.com/298139-130547/ps/20251008_umPXGR1tyT.jpeg?v=1759932825',
    },
    {
        id: 'ex-4',
        title: 'Hiệu sách nhỏ Paris',
        author: 'Nina George',
        referencePriceVnd: 35000,
        wants: 'Sách thiếu nhi',
        location: 'Huế',
        listedAt: '2026-09-30T09:00:00Z',
        coverUrl: 'https://cdn.chanhtuoi.com/uploads/2022/10/sach-van-hoc-nuoc-ngoai-2.jpg.webp',
    },
]