/**
 * DỮ LIỆU MẪU cho trang chủ.
 * TODO: thay bằng dữ liệu thật từ API (dùng type trong @used-books/api-contract).
 */

export type ListingType = 'sell' | 'exchange' | 'auction'

export interface BookItem {
    id: string
    title: string
    author: string
    year?: string
    genre: string
    condition: string
    conditionTag?: string
    listingType: ListingType
    priceVnd?: number
    priceXu?: number
    location: string
    coverUrl?: string
}

export const SHELF1_BOOKS: BookItem[] = [
    {
        id: 's1-1',
        title: 'Số Đỏ',
        author: 'Vũ Trọng Phụng • NXB Mai Lĩnh 1957',
        genre: 'Tiểu thuyết hiện thực',
        condition: 'Rất tốt (90%)',
        conditionTag: 'normal',
        listingType: 'sell',
        priceVnd: 340000,
        location: 'Hà Nội',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDusyxScyJ91LZYOhmB8VklvaPZoKSjS2zH0yXP2LxAHPd7rs1MX29u1uVqsxDMwzgW-1HpkO-Ph-qYOynpvNrCa7vch-Ux4E99szvd0Crrap9WO-w12Tban3nnoOXMf_a_cgsrHMVSIrAr96T2utyqd0uObaxOc-_kWKILVOA__t61b93-CNyzYisRUMwsOjNLPsSY6Llwvh-5jycU3w_9r9U0kybYRUPzEPOmlWube9NSXji5xSDLlGh3-ABn4pYUaEOkLylQC-Wi',
    },
    {
        id: 's1-2',
        title: 'Thi Nhân Việt Nam',
        author: 'Hoài Thanh, Hoài Điệp • Bản 1988',
        genre: 'Phê bình văn học',
        condition: 'Như mới',
        conditionTag: 'green',
        listingType: 'exchange',
        priceXu: 28,
        location: 'TP. Hồ Chí Minh',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAwc31z7P0FHJQJJDKPytmr88zomLA6eA29LVLsr_h05zPT2HOTYLWN6HMmwgyM7ix26mw8R9Q1v5JEPhV-ebvODtTUveptS2io7NJ7I7wf6JoYtDldnh_yrHmjpLw_MbFuEeF76eqjeLRi0wNIWCwHUOaYs0BO5u5NN-SoEYoSPqRiSl0hcC-s7MO8tdxDhdGcODqJW7lB_8IkIZzLTtAATH_2XjgdVKbqIGgWCmf5mJxdTDi3hPUVzK7J01EzKvez34Y-J6abLMpS',
    },
    {
        id: 's1-3',
        title: 'Nỗi Buồn Chiến Tranh',
        author: 'Bảo Ninh • NXB Hội Nhà Văn 1991',
        genre: 'Văn học đương đại',
        condition: 'Rất tốt (88%)',
        conditionTag: 'normal',
        listingType: 'sell',
        priceVnd: 520000,
        location: 'Đà Nẵng',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTNOxDPDbg_VFBOrLaXjo4zKcQl0OMnn1PKmXSoqomejI0UhQHFzP58WNs9zCXqJIhP3WSKDIwazHuMGtZOAP6oUa02mN1H0OJRjRkyuLsgYE4p6QLcN-eA7a-X6e--qfy7Y0xZw8VoQekvGIBVUWcHpXcntbkxxWBS5HmxpQoapMef9NwMZ0c2Rsl0T5pdKKyuroMiw-jzoRdnjCsgNWpQ7jEvO06JhadB4cZVmms3QJ4w0_rLi7ZmHrNCHsqs0E1rmDnzc8_G-yd',
    },
    {
        id: 's1-4',
        title: 'Vang Bóng Một Thời',
        author: 'Nguyễn Tuân • NXB Tân Dân',
        genre: 'Tập tùy bút kinh điển',
        condition: 'Bản lưu trữ 1952',
        conditionTag: 'archive',
        listingType: 'sell',
        priceVnd: 850000,
        location: 'Huế',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAn_1M2EFMAcaERsS0Rn4lnQ4ueSsNchO0Dyad-7o7p0ZuDfZLdVKWjzDrOn2Pz3AFdh3TH7sfp_z2J2dY2zO6Y5s5zW_abiZ9bPxTo7isCUjwof92Gx5yu9K4fSY1JhrQzH-xhs12xjaQLncAO68WQYWHZ2Nr1JMCZnVv0GzeidsQqPz3ISrdcrqEWL85qQ_gPGgaiL3KSHDcRS0fl5K_IqbulORzFta7sWnAd5IEXu_o0ZcyNtImCZWLT9kpu4mtki1RBvu9X43_h',
    },
]

export const SHELF2_AUCTION: BookItem[] = [
    {
        id: 'a1',
        title: 'Kim Vân Kiều (Traduction 1942)',
        author: 'Nguyễn Du • Bản dịch Nguyễn Văn Vĩnh',
        genre: 'Bản song ngữ Pháp - Việt',
        condition: 'Ấn bản 1942',
        listingType: 'auction',
        priceVnd: 4200000,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBfXpD8mNRI-rJG-_P4E70OWJS7oFHcCDbjbUTR4g-4E6CgCDqsg93vGG-W7WZoN00gr29glqKrHgEicHEgbMuvDTbfg13P5cLdXPsKOOrL6Tm5v1YSFIz-seUTVKU7AatNc7iozwG3WM9D98CL2PR6U8h0SuTEB5PaNH9Y-sLSCAWqs02aofO3F2Prqr6HStNOwm_9R6I-UkskhJvzOrJOJZbGwTnSIQLWBmv8ZHHs4ltxJlYl97JrpsnRLxTz34UmEQl3-x5fZRaL',
    },
    {
        id: 'a2',
        title: 'Việt Nam Sử Lược (Tập 1 & 2)',
        author: 'Trần Trọng Kim • Bản in Imprimerie Trung-Bac',
        genre: 'Sử học & Khảo cứu',
        condition: 'Ấn bản 1928',
        listingType: 'auction',
        priceVnd: 6500000,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBA2rvuukBXqXrayBHwvcr_7kcstaD37Q78I-9mqHB5FaiVf5IAKJM82O6jbC1pALqRqkoqZfyDWOBbA4E0tf63gICxD6EjVdf7fWy1ABnYM8oieS6a90KSAkGiRViKI-yoD4-SzXI8YYs99LJzbEGH5TH1aL0qbQscPWjHmBkrNbm531SgC48wmapKN7W9gtwaGh6F1sIm6r7glAogBxFztj87ExDUt77jutDDTiwtevjgpAnH41733ytAsk6IXRm6opqFBo4MjJuF',
    },
    {
        id: 'a3',
        title: 'Hoàng Tử Bé (Bản in An Tiêm 1966)',
        author: 'Saint-Exupéry • Dịch giả Bùi Giáng',
        genre: 'Văn học dịch kinh điển',
        condition: 'Ấn bản 1966',
        listingType: 'auction',
        priceVnd: 3150000,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0u8z2L9X9UgZnSPcicubZATbA2dXdcJQSHNKEd6u8AUgKhvOuSXGClgm9tdFTRGXdL-y6LRvkSrNmLoZ2Fio1tMC6MYYliuOtR2VIYhdz9uBiOPZzGrSL2Yu16yVDXQEEwbeyDCRjxcjTYeGIGBEXDWRwwYKARNrlS_R8c68QA4a5MIKeA3cmE4eT5c762V1cM1j2UdW4OcHB_Z_PEhG8dDa6Nf4buCWO9CBKyJ4YV03Z1-hID5VR1GMoPGLdIKxm-3ADTj_XBDdw',
    },
]

export const SHELF3_BOOKS: BookItem[] = [
    {
        id: 's3-1',
        title: 'Kiến Trúc Cổ Việt Nam',
        author: 'Nguyễn Bá Lăng • Viện Khảo Cổ 1972',
        genre: 'Khảo cứu văn hóa',
        condition: 'Tốt (85%)',
        conditionTag: 'normal',
        listingType: 'sell',
        priceVnd: 420000,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHHUvRFj8me4EcFZ0US5HwwX1BXHqDWyWoonVpOvW4d6aOoGtX5jEkhL1Tg4ruseBjkXIRNa8gbqkGYvLkDX9ePRBfqfLEhobo5n6VKHuMnmfipHoVRce-XhAtLUz70gSga1mSuUgpwnkUzgMEP26bwNVvffzRJjUlY5YSkTm-mBG5sv_hsvcIDeNgUdUn51LNuvrM1ZW7jf5v_ux8zUZJvimDHkXJRlW5O-JTsqHSGlGiGyIpxcB9bHgSGnMeY6Kubd5NdK_MDuGH',
    },
    {
        id: 's3-2',
        title: 'Việt Nam Phong Tục',
        author: 'Phan Kế Bính • Bản in 1915',
        genre: 'Nghiên cứu dân gian',
        condition: 'Như mới',
        conditionTag: 'green',
        listingType: 'exchange',
        priceXu: 45,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA8H2Rt-CqaIyWafYZDxkW7h9rBKFkj-sRAfzY0MMK7MWkPiF8m5k81mRpHpvRo3-YbSGr8pB26V4DtnPWPPqjlcQcBT62OFKpYL6aKxUQ3fYdlNLqxI4VGi9FP1X_VCn18MCR4jFxZq0Mez09fA_VDm-xGnrblmXHNqWW64bhcBlKlCTbKlQ7Pu3T1AQ6W31P7A1Uf0Uq91FwqHFJEOSQT4q08fxjGE5JExhgE7mQ6oMCijUBTlwEkbJpuAlQ0M6B5sOBxJyDY',
    },
    {
        id: 's3-3',
        title: 'Nam Quốc Dư Địa Chí',
        author: 'Lê Quang Định • Bản phục dựng 1972',
        genre: 'Địa lý học lịch sử',
        condition: 'Bản lưu trữ 1972',
        conditionTag: 'archive',
        listingType: 'sell',
        priceVnd: 680000,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCtRqC8E3UkjWn4TBimthXV7WipmxuPeUjIq8L4P7-D6QmHGGAVAkM_JN6mZGQSvPSLqiJkKRN6RvG4HlwSqbsVmD3v-Hgqv03dT9pYZO4YfJKQ3sSj0fMRMmD4RLh3h0LsN7-vG5sEINGe6LcFJiQ5V7oe1SajnhLy1OZq2wLz9bk5bxWLUmxXGb4bN-K_bkJ1iDlDJN7tWXLWXxcJmYwIa4EDO1T2h8bgD8bGPFV2x17wkqOlE3a-4QdmkQ8Y07fA_IQGhZJI',
    },
    {
        id: 's3-4',
        title: 'Đại Việt Sử Ký Toàn Thư',
        author: 'Ngô Sĩ Liên • Viện Sử Học 1967',
        genre: 'Lịch sử quốc gia',
        condition: 'Tốt (80%)',
        conditionTag: 'normal',
        listingType: 'sell',
        priceVnd: 1200000,
        location: '',
        coverUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPMNNlWEkCy8Bqt_0bqJqY3F7bR-2AzSPf0v_YlJ0fMSwLGixzFGpw5fDGdAmDpHNZ2kMz8nE77Y3fGAkRdTz8L3fSGdCT7bfNXEiWYGJvGQ3kP4XWtfBa2qV14Bs3rV7bFe-r73vvWh6SJ2xLYxSlr5ZZAIK64MoFqhCgjIMpOA8SFrCLBpYl6Mzp7HnjEwI_IxmVk7qbqpDqU7DVAjFSRZnLl4KkBqUMlVRvzb1mhkLxOZq5TXvGrm19VjXqhlvAqOAmz3Oa4',
    },
]

// Backward compat
export const FEATURED_BOOKS = SHELF1_BOOKS
