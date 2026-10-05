export interface TargetBook {
    id: string
    title: string
    author: string
    condition: string
    edition: string
    ownerName: string
    coverUrl?: string
}

export interface InventoryBook {
    id: string
    title: string
    author: string
    coverUrl?: string
}

export const MOCK_TARGET_BOOKS: Record<string, TargetBook> = {
    'mock-3': {
        id: 'mock-3',
        title: '80 ngày vòng quanh thế giới',
        author: 'Jules Verne',
        condition: 'Mới 90%',
        edition: 'Bìa mềm, Tái bản 2020',
        ownerName: 'Hoàng Nam',
        coverUrl: 'https://cdn1.fahasa.com/media/catalog/product/8/9/8936067595772.jpg',
    }
}

export const MY_BOOKS: InventoryBook[] = [
    {
        id: 'my-1',
        title: 'The call of the wild',
        author: 'Jack London',
        coverUrl: 'https://i.pinimg.com/736x/ae/0c/2e/ae0c2eb1f2deb720890c05b1cc0bf90b.jpg',
    },
    {
        id: 'my-2',
        title: 'Totto-chan',
        author: 'Kuroyanagi Tetsuko',
        coverUrl: 'https://pos.nvncdn.com/298139-130547/ps/20251008_umPXGR1tyT.jpeg?v=1759932825',
    },
    {
        id: 'my-3',
        title: 'Hiệu sách nhỏ Paris',
        author: 'Nina George',
        coverUrl: 'https://cdn.chanhtuoi.com/uploads/2022/10/sach-van-hoc-nuoc-ngoai-2.jpg.webp',
    }
]

export interface ExchangeFormData {
    selectedBookIds: string[]
    message: string
    moneyCompensation: 'none' | 'user_pays' | 'other_pays'
    moneyAmount?: number
    deliveryMethod: 'meetup' | 'shipping'
}

// TODO: Thay bằng gọi API qua session-client/api-contract khi backend có endpoint
export async function submitExchangeRequest(targetBookId: string, data: ExchangeFormData): Promise<{ success: boolean }> {
    console.log('Mock submitting exchange request', { targetBookId, data })
    return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 1500)
    })
}
