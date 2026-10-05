/**
 * DỮ LIỆU MẪU cho trang chủ.
 * TODO: thay bằng dữ liệu thật từ API (dùng type trong @used-books/api-contract).
 */

export type ListingType = 'sell' | 'exchange'

export interface BookItem {
    id: string
    title: string
    author: string
    year?: number
    condition: string
    badge?: string
    listingType: ListingType
    priceVnd?: number
    location: string
    coverUrl?: string
}

export interface SellerItem {
    id: string
    name: string
    bio: string
    tradeCount: number
    featured: boolean
}

export interface TestimonialItem {
    id: string
    quote: string
    author: string
}

export interface StepItem {
    title: string
    description: string
}

export const FEATURED_BOOKS: BookItem[] = [
    {
        id: 'mock-1',
        title: 'Dế Mèn phiêu lưu ký',
        author: 'Tô Hoài',
        year: 1941,
        condition: 'Bìa cứng',
        badge: 'Bản cũ đẹp',
        listingType: 'sell',
        priceVnd: 85000,
        location: 'Hà Nội',
        coverUrl: 'https://3.bp.blogspot.com/-HnUNKe-Keic/WEXymR_Au5I/AAAAAAAAAZo/S0HAikMh1lAsq2xqhPnUCv3ucicIPKxsgCLcB/s1600/123.jpg',
    },
    {
        id: 'mock-2',
        title: 'Số đỏ',
        author: 'Vũ Trọng Phụng',
        condition: 'Đã qua sử dụng',
        badge: 'Hiếm',
        listingType: 'sell',
        priceVnd: 120000,
        location: 'TP. Hồ Chí Minh',
        coverUrl: 'https://baokhanhhoa.vn/file/e7837c02857c8ca30185a8c39b582c03/dataimages/202003/original/images5399321_2.jpg',
    },
    {
        id: 'mock-3',
        title: 'Nhà giả kim',
        author: 'Paulo Coelho',
        condition: 'Như mới',
        listingType: 'exchange',
        location: 'Đà Nẵng',
        coverUrl: 'https://cdn1.fahasa.com/media/flashmagazine/images/page_images/nha_gia_kim_tai_ban_2020/2024_03_20_18_29_19_1-390x510.jpg',
    },
    {
        id: 'mock-4',
        title: 'Tuổi thơ dữ dội',
        author: 'Phùng Quán',
        condition: 'Có chút ố vàng',
        badge: 'Sưu tầm',
        listingType: 'sell',
        priceVnd: 95000,
        location: 'Huế',
        coverUrl: 'https://tse2.mm.bing.net/th/id/OIP.NOjh2Pigt_2PsEc_HjLrOQHaLZ?r=0&rs=1&pid=ImgDetMain&o=7&rm=3',
    },
]

export const HOW_IT_WORKS: StepItem[] = [
    {
        title: 'Đăng sách',
        description:
            'Mô tả tình trạng sách, chụp ảnh bìa và các trang bên trong, rồi đặt giá bán hoặc chọn trao đổi.',
    },
    {
        title: 'Kết nối',
        description:
            'Nhắn tin trực tiếp với người mua hoặc người trao đổi để thống nhất giá, địa điểm và cách giao nhận.',
    },
    {
        title: 'Trao tay',
        description:
            'Gửi sách đi hoặc gặp mặt trao đổi. Cuốn sách tiếp tục hành trình trên một kệ sách mới.',
    },
]

export const FEATURED_SELLERS: SellerItem[] = [
    {
        id: 'seller-1',
        name: 'Nguyễn Hoàng Đại',
        bio: 'Chuyên sách văn học Việt Nam trước 1975.',
        tradeCount: 0,
        featured: true,
    },
    {
        id: 'seller-2',
        name: 'Phùng Tuấn Minh',
        bio: 'Sưu tầm sách thiếu nhi và truyện tranh cũ.',
        tradeCount: 0,
        featured: false,
    },
]

export const TESTIMONIALS: TestimonialItem[] = [
    {
        id: 'tm-1',
        quote:
            'Mình tìm được cuốn sách đã tìm suốt nhiều năm. Tình trạng đúng như mô tả, người bán còn kèm một tờ ghi chú viết tay.',
        author: 'Trịnh Trần Phương Tuấn, Hà Nội',
    },
    {
        id: 'tm-2',
        quote:
            'Đăng sách rất nhanh. Biết sách của mình đến tay người thật sự yêu sách, mình thấy yên tâm hơn nhiều.',
        author: 'Phùng Thanh Độ, TP. Hồ Chí Minh',
    },
    {
        id: 'tm-3',
        quote:
            'Sách ở đây có cái hồn mà các nhà sách lớn không có. Mỗi cuốn đều có một câu chuyện riêng.',
        author: 'Trương Tuấn Tú, Đà Nẵng',
    },
]

export const TRENDING_QUERIES: string[] = [
    'Văn học Việt Nam',
    'Sách thiếu nhi',
    'Truyện trinh thám',
]
