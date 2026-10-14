import type { Listing } from "./contracts";

export interface FlashDealItem {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly price: number;
  readonly originalPrice: number;
  readonly discountPercent: number;
  readonly soldCount: number;
  readonly totalStock: number;
  readonly statusText: string;
  readonly coverUrl: string;
}

export interface LiveAuctionItem {
  readonly id: string;
  // The book's listing. Absent on placeholder cards, which have no real
  // auction or listing to open.
  readonly listingId?: string;
  readonly title: string;
  readonly currentBid: number;
  readonly startPrice: number;
  readonly bidderCount: number;
  readonly endAt: string;
  readonly statusText: string;
  readonly coverUrl: string;
  readonly conditionLabel?: string;
  readonly buyNowPrice?: number | null;
}

export interface CuratedVoucher {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly minOrder: number;
  readonly expiry: string;
  readonly isCollected?: boolean;
}

export interface HomeNotificationItem {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly time: string;
  readonly read: boolean;
  readonly type: "order" | "auction" | "voucher" | "system";
}

export const FALLBACK_FLASH_DEALS: readonly FlashDealItem[] = [
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e21",
    title: "Số Đỏ (1938) - Vũ Trọng Phụng",
    author: "Vũ Trọng Phụng",
    price: 220000,
    originalPrice: 340000,
    discountPercent: 35,
    soldCount: 8,
    totalStock: 10,
    statusText: "Đã bán 8/10",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBCPA40o2VI0MCvsnyEV7Am43FaD_aFuiE45kzUCm0zjLairQk9p2v5sY6LfjBT4nCLG6LMTXTCidRV2mCel1P-eaMUs-MMGffh4Ot0tC7KlSFEmie2qW5VQ75WdFKe2ppy6OCFh5bBiRbuhx8r5fGPZf-okPvoCvK-l7eYUcgL5uZVTP4emnNilUKCUJ3AmCTFbZcfHMQP6AbiKMoMj8HRISzh_QgY-Sol4XJUSxCsxWjpvVi92JNZzA",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e22",
    title: "Thi Nhân Việt Nam (1942)",
    author: "Hoài Thanh & Hoài Chân",
    price: 350000,
    originalPrice: 450000,
    discountPercent: 22,
    soldCount: 9,
    totalStock: 10,
    statusText: "Sắp cháy hàng",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAxeQlbXMk95s5TrwA3De-vaAu7UE6qefn1VRGBinxuGMr_IGdfQ2Z5x2RG2V2jAs2QWkLO_hGdU-jk__XTMFRoa0G9eMD3rpvbkfJShYIaKTw902TrOH4wWQv71-A9sNa37dV123cvj_PONJa8NoK3ZDZc3uxZHV-7pNzW7ohFUeTvqJah_OCxSlmZM-lLVufIOfz-I7Lo6vyiNPZvVY4Ye3NE85zOrCO2J7Zau1G73QilI-s878kqwA",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e23",
    title: "Nỗi Buồn Chiến Tranh (1991)",
    author: "Bảo Ninh",
    price: 108000,
    originalPrice: 180000,
    discountPercent: 40,
    soldCount: 6,
    totalStock: 10,
    statusText: "Đã bán 6/10",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCByYXdbIS-ZTPQg-q17NSQehjNAESbWueIInYlRd6x3PSkBw7vlqE6v6gosfKsBGksRljpN8Uo8NcfYc4TPZVUbbl59VMeTuuu5IWlukp6mpAKfjITlANu-IQ91-lIV-i8KLfy7zJQ0GVnX2jwbmG9a9P6cywSQUcjaDE_YsK82bq6rjtQyEbXocN9cYKdveyIQwi_kVTzxj73jCkiYwkIEV0iRat-iQn9Pw1MKx6PeOj9ypcsCX9cMg",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e24",
    title: "Hương Rừng Cà Mau (1962)",
    author: "Sơn Nam",
    price: 75000,
    originalPrice: 150000,
    discountPercent: 50,
    soldCount: 9,
    totalStock: 10,
    statusText: "Còn 1 cuốn",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAHWHoPnL5BGe2IsQhE3RgDbILlbJ_3VGGxG_q4qpiGSig2Au-nfvyGSzJXkeIDvR1gwxHWrOEd4HiMGmwADbWYDP5e5BQIi7mwQRxj7Fl_fwLy2ofVpMzfMJcXDInP7XIvqj-fy15vK8RluNiYUmXDxecveRH2X2lBdGTWEqNnPQg-cDsYs2BHKKRiF4WZQeJYSR76Bpj-r9mgzCZl_9TC0lOdMnWEqEB-DVD8cbancMj0ZbyjIHXGbQ",
  },
];

export const FALLBACK_AUCTIONS: readonly LiveAuctionItem[] = [
  {
    id: "auc-01",
    title: "Số Đỏ (1938) - Vũ Trọng Phụng [Bản in đầu]",
    currentBid: 580000,
    startPrice: 200000,
    bidderCount: 14,
    endAt: new Date(Date.now() + 6322000).toISOString(),
    statusText: "14 lượt đấu",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBCPA40o2VI0MCvsnyEV7Am43FaD_aFuiE45kzUCm0zjLairQk9p2v5sY6LfjBT4nCLG6LMTXTCidRV2mCel1P-eaMUs-MMGffh4Ot0tC7KlSFEmie2qW5VQ75WdFKe2ppy6OCFh5bBiRbuhx8r5fGPZf-okPvoCvK-l7eYUcgL5uZVTP4emnNilUKCUJ3AmCTFbZcfHMQP6AbiKMoMj8HRISzh_QgY-Sol4XJUSxCsxWjpvVi92JNZzA",
    conditionLabel: "Hiếm · 1938",
    buyNowPrice: 900000,
  },
  {
    id: "auc-02",
    title: "Thi Nhân Việt Nam (1942) - Hoài Thanh",
    currentBid: 720000,
    startPrice: 350000,
    bidderCount: 21,
    endAt: new Date(Date.now() + 8400000).toISOString(),
    statusText: "21 lượt đấu",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAxeQlbXMk95s5TrwA3De-vaAu7UE6qefn1VRGBinxuGMr_IGdfQ2Z5x2RG2V2jAs2QWkLO_hGdU-jk__XTMFRoa0G9eMD3rpvbkfJShYIaKTw902TrOH4wWQv71-A9sNa37dV123cvj_PONJa8NoK3ZDZc3uxZHV-7pNzW7ohFUeTvqJah_OCxSlmZM-lLVufIOfz-I7Lo6vyiNPZvVY4Ye3NE85zOrCO2J7Zau1G73QilI-s878kqwA",
    conditionLabel: "Kèm thủ bút",
    buyNowPrice: null,
  },
  {
    id: "auc-03",
    title: "Nỗi Buồn Chiến Tranh (1991) - Bảo Ninh",
    currentBid: 310000,
    startPrice: 100000,
    bidderCount: 9,
    endAt: new Date(Date.now() + 10800000).toISOString(),
    statusText: "9 lượt đấu",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCByYXdbIS-ZTPQg-q17NSQehjNAESbWueIInYlRd6x3PSkBw7vlqE6v6gosfKsBGksRljpN8Uo8NcfYc4TPZVUbbl59VMeTuuu5IWlukp6mpAKfjITlANu-IQ91-lIV-i8KLfy7zJQ0GVnX2jwbmG9a9P6cywSQUcjaDE_YsK82bq6rjtQyEbXocN9cYKdveyIQwi_kVTzxj73jCkiYwkIEV0iRat-iQn9Pw1MKx6PeOj9ypcsCX9cMg",
    conditionLabel: "Bản NXB Hội Nhà Văn",
    buyNowPrice: 450000,
  },
  {
    id: "auc-04",
    title: "Hương Rừng Cà Mau (1962) - Sơn Nam",
    currentBid: 290000,
    startPrice: 80000,
    bidderCount: 16,
    endAt: new Date(Date.now() + 14400000).toISOString(),
    statusText: "16 lượt đấu",
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAHWHoPnL5BGe2IsQhE3RgDbILlbJ_3VGGxG_q4qpiGSig2Au-nfvyGSzJXkeIDvR1gwxHWrOEd4HiMGmwADbWYDP5e5BQIi7mwQRxj7Fl_fwLy2ofVpMzfMJcXDInP7XIvqj-fy15vK8RluNiYUmXDxecveRH2X2lBdGTWEqNnPQg-cDsYs2BHKKRiF4WZQeJYSR76Bpj-r9mgzCZl_9TC0lOdMnWEqEB-DVD8cbancMj0ZbyjIHXGbQ",
    conditionLabel: "Bản Phù Sa",
    buyNowPrice: null,
  },
];

export const FALLBACK_LISTINGS: (Listing & {
  coverUrl?: string;
  badgeLabel?: string;
  tags?: string[];
  salesCount?: number;
  location?: string;
})[] = [
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e21",
    revisionId: "11111111-2222-4333-8444-555555555555",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      title: "Số Đỏ (1938) - Vũ Trọng Phụng [Bìa gốc nguyên vẹn]",
      authors: ["Vũ Trọng Phụng"],
      publisher: "Lê Cường Xuất Bản",
      publicationYear: 1938,
      language: "vi",
      edition: "Bản in đầu tiên",
      category: "Văn học 1930-1945",
      isbn: null,
    },
    condition: "LikeNew",
    pages: "216",
    coverNote: "Bìa nguyên bản, gáy sách được phục chế archival",
    notes: "Kỳ thư hiện thực trào phúng kinh điển",
    accessories: "Kèm bao thư bảo quản",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description:
      "Tác phẩm đỉnh cao của Vũ Trọng Phụng, bản in cổ hiếm gặp tại TP.HCM.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444444",
      displayName: "Hiệu Sách Cũ Cổ Tân",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444441",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-10T08:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 340000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBCPA40o2VI0MCvsnyEV7Am43FaD_aFuiE45kzUCm0zjLairQk9p2v5sY6LfjBT4nCLG6LMTXTCidRV2mCel1P-eaMUs-MMGffh4Ot0tC7KlSFEmie2qW5VQ75WdFKe2ppy6OCFh5bBiRbuhx8r5fGPZf-okPvoCvK-l7eYUcgL5uZVTP4emnNilUKCUJ3AmCTFbZcfHMQP6AbiKMoMj8HRISzh_QgY-Sol4XJUSxCsxWjpvVi92JNZzA",
    badgeLabel: "Yêu thích+",
    tags: ["Đổi sách"],
    salesCount: 18,
    location: "Q.1, TP.HCM",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e22",
    revisionId: "11111111-2222-4333-8444-555555555556",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e",
      title: "Thi Nhân Việt Nam (1942) - Hoài Thanh & Hoài Chân",
      authors: ["Hoài Thanh", "Hoài Chân"],
      publisher: "Hoa Tiên",
      publicationYear: 1942,
      language: "vi",
      edition: "Ấn bản tuyển tập phong trào Thơ Mới",
      category: "Văn học 1930-1945",
      isbn: null,
    },
    condition: "Good",
    pages: "380",
    coverNote: "Bìa giấy xơ dừa hoài niệm, chữ in mạ nhũ",
    notes: "Một thời đại trong thi ca",
    accessories: "Không",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Cuốn sách phê bình thi ca xuất sắc nhất thế kỷ 20.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444445",
      displayName: "Thư Quán Sài Gòn",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444442",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-10T09:30:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 450000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAxeQlbXMk95s5TrwA3De-vaAu7UE6qefn1VRGBinxuGMr_IGdfQ2Z5x2RG2V2jAs2QWkLO_hGdU-jk__XTMFRoa0G9eMD3rpvbkfJShYIaKTw902TrOH4wWQv71-A9sNa37dV123cvj_PONJa8NoK3ZDZc3uxZHV-7pNzW7ohFUeTvqJah_OCxSlmZM-lLVufIOfz-I7Lo6vyiNPZvVY4Ye3NE85zOrCO2J7Zau1G73QilI-s878kqwA",
    badgeLabel: "Bản hiếm",
    tags: [],
    salesCount: 7,
    location: "Bình Thạnh",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e23",
    revisionId: "11111111-2222-4333-8444-555555555557",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6f",
      title: "Nỗi Buồn Chiến Tranh (1991) - Bảo Ninh (Bản in đầu)",
      authors: ["Bảo Ninh"],
      publisher: "NXB Hội Nhà Văn",
      publicationYear: 1991,
      language: "vi",
      edition: "Bản in đầu",
      category: "Tiểu thuyết miền Nam",
      isbn: null,
    },
    condition: "Fair",
    pages: "294",
    coverNote: "Mép bìa sờn nhẹ, giấy ngả màu thời gian",
    notes: "Giải thưởng Hội Nhà Văn Việt Nam",
    accessories: "Không",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Tiểu thuyết chiến tranh được dịch ra hơn 20 thứ tiếng.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444446",
      displayName: "Mọt Sách Gia Định",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444443",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-11T14:15:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Both",
    salePrice: 180000,
    exchangeValue: 180000,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCByYXdbIS-ZTPQg-q17NSQehjNAESbWueIInYlRd6x3PSkBw7vlqE6v6gosfKsBGksRljpN8Uo8NcfYc4TPZVUbbl59VMeTuuu5IWlukp6mpAKfjITlANu-IQ91-lIV-i8KLfy7zJQ0GVnX2jwbmG9a9P6cywSQUcjaDE_YsK82bq6rjtQyEbXocN9cYKdveyIQwi_kVTzxj73jCkiYwkIEV0iRat-iQn9Pw1MKx6PeOj9ypcsCX9cMg",
    badgeLabel: "Kiểm định",
    tags: ["Đổi sách", "Giảm 20k"],
    salesCount: 32,
    location: "Quận 3",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e24",
    revisionId: "11111111-2222-4333-8444-555555555558",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c70",
      title: "Hương Rừng Cà Mau (1962) - Sơn Nam [Kèm thủ bút]",
      authors: ["Sơn Nam"],
      publisher: "Phù Sa Xuất Bản",
      publicationYear: 1962,
      language: "vi",
      edition: "Ấn bản Sài Gòn xưa",
      category: "Sử học & Khảo cứu",
      isbn: null,
    },
    condition: "Worn",
    pages: "248",
    coverNote: "Bìa ố vàng tự nhiên, có thủ bút lưu niệm của nhà văn Sơn Nam",
    notes: "Hương đất rừng phương Nam",
    accessories: "Thủ bút tác giả",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Tập truyện tiêu biểu cho phong vị Nam Bộ xưa.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444447",
      displayName: "Kệ Sách Cũ Tân Bình",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444444",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-12T10:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 195000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAHWHoPnL5BGe2IsQhE3RgDbILlbJ_3VGGxG_q4qpiGSig2Au-nfvyGSzJXkeIDvR1gwxHWrOEd4HiMGmwADbWYDP5e5BQIi7mwQRxj7Fl_fwLy2ofVpMzfMJcXDInP7XIvqj-fy15vK8RluNiYUmXDxecveRH2X2lBdGTWEqNnPQg-cDsYs2BHKKRiF4WZQeJYSR76Bpj-r9mgzCZl_9TC0lOdMnWEqEB-DVD8cbancMj0ZbyjIHXGbQ",
    badgeLabel: "Có chữ ký",
    tags: [],
    salesCount: 11,
    location: "Tân Bình",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e25",
    revisionId: "11111111-2222-4333-8444-555555555559",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c71",
      title: "Vang Bóng Một Thời (1940) - Nguyễn Tuân",
      authors: ["Nguyễn Tuân"],
      publisher: "Tân Dân Thư Quán",
      publicationYear: 1940,
      language: "vi",
      edition: "Bản in đầu",
      category: "Bản in đầu & Chữ ký",
      isbn: null,
    },
    condition: "LikeNew",
    pages: "186",
    coverNote: "Bìa gỗ ép thủ công tuyệt đẹp",
    notes: "Nghệ thuật thưởng trà, ngâm thơ xưa",
    accessories: "Hộp lụa bảo vệ",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Tuyệt tác phong lưu nho nhã của nhà văn Nguyễn Tuân.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444448",
      displayName: "Văn Uyển Thư Các",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444445",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-12T11:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 280000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBCPA40o2VI0MCvsnyEV7Am43FaD_aFuiE45kzUCm0zjLairQk9p2v5sY6LfjBT4nCLG6LMTXTCidRV2mCel1P-eaMUs-MMGffh4Ot0tC7KlSFEmie2qW5VQ75WdFKe2ppy6OCFh5bBiRbuhx8r5fGPZf-okPvoCvK-l7eYUcgL5uZVTP4emnNilUKCUJ3AmCTFbZcfHMQP6AbiKMoMj8HRISzh_QgY-Sol4XJUSxCsxWjpvVi92JNZzA",
    badgeLabel: "Bản hiếm",
    tags: ["Đổi sách"],
    salesCount: 15,
    location: "Q.5, TP.HCM",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e26",
    revisionId: "11111111-2222-4333-8444-555555555560",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c72",
      title: "Dế Mèn Phiêu Lưu Ký (1954) - Tô Hoài [Minh họa Trương Qua]",
      authors: ["Tô Hoài"],
      publisher: "NXB Kim Đồng",
      publicationYear: 1954,
      language: "vi",
      edition: "Minh họa bản màu",
      category: "Sách tranh & Thơ ca",
      isbn: null,
    },
    condition: "Good",
    pages: "160",
    coverNote: "Bìa màu tươi sáng, nét vẽ xưa",
    notes: "Ký ức tuổi thơ nhiều thế hệ",
    accessories: "Không",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Cuốn sách thiếu nhi Việt Nam nổi tiếng nhất mọi thời đại.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444449",
      displayName: "Tiệm Sách Tuổi Thơ",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444446",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-12T12:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 135000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAxeQlbXMk95s5TrwA3De-vaAu7UE6qefn1VRGBinxuGMr_IGdfQ2Z5x2RG2V2jAs2QWkLO_hGdU-jk__XTMFRoa0G9eMD3rpvbkfJShYIaKTw902TrOH4wWQv71-A9sNa37dV123cvj_PONJa8NoK3ZDZc3uxZHV-7pNzW7ohFUeTvqJah_OCxSlmZM-lLVufIOfz-I7Lo6vyiNPZvVY4Ye3NE85zOrCO2J7Zau1G73QilI-s878kqwA",
    badgeLabel: "Yêu thích+",
    tags: ["Giảm 15k"],
    salesCount: 44,
    location: "Q.10, TP.HCM",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e27",
    revisionId: "11111111-2222-4333-8444-555555555561",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c73",
      title: "Hà Nội 36 Phố Phường - Thạch Lam",
      authors: ["Thạch Lam"],
      publisher: "NXB Đời Nay",
      publicationYear: 1943,
      language: "vi",
      edition: "Bản in Đời Nay xưa",
      category: "Văn học 1930-1945",
      isbn: null,
    },
    condition: "LikeNew",
    pages: "172",
    coverNote: "Bìa giấy cổ, thư pháp thanh nhã",
    notes: "Tùy bút tinh tế về Hà Nội",
    accessories: "Không",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Tập tùy bút nổi tiếng nhất của Thạch Lam.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444450",
      displayName: "Cổ Tân Thư Quán",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444447",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-12T13:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 220000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuABVKf_3j4SxnDNfeYJyzv-DVxN7iPz4XUtZnGYB1jKvHizvoNfoEbjvOajRXsZhsTiWMMlP0YcjbvbmAgjQgaJ5H72MpzuhDJz09cwpuEUlBdZjixduMtPEt_vynHLUpAS6_SY69xpGIqE8nVe5ywz0PdZ8wHiWju42oXi4E_r14N98YKUvDpFIJ8obHNEqfQuIqav1i32d0MzcRRKs8fRmCQGC2QhEtBsBoogh_WCcTkeVQ_NlBGu8A",
    badgeLabel: "Như mới",
    tags: [],
    salesCount: 23,
    location: "Bình Thạnh",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e28",
    revisionId: "11111111-2222-4333-8444-555555555562",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c74",
      title: "Biển Cả Và Ông Lão (1968)",
      authors: ["Ernest Hemingway"],
      publisher: "NXB Sống Mới",
      publicationYear: 1968,
      language: "vi",
      edition: "Bản dịch Sài Gòn 1968",
      category: "Tiểu thuyết miền Nam",
      isbn: null,
    },
    condition: "Fair",
    pages: "198",
    coverNote: "Bìa ngả màu thời gian, gáy chắc",
    notes: "Bản dịch kinh điển miền Nam trước 1975",
    accessories: "Không",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Tác phẩm kinh điển đoạt giải Nobel Văn Học.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444451",
      displayName: "Thư Các Sài Gòn Xưa",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444448",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-12T14:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Exchange",
    salePrice: null,
    exchangeValue: 150000,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCi26_AKzEx9ZKOc4dxX9TlKrO70OI8RpskYlCivde5_IVaZUWc0yol_B29tgZ7dnOD80DPGCNNgWDHL_vArHhMbJf6bWrmDgtO4qPz_pgRpO-gepSrd_pIV5P-mwHJjoq157wtSsgADTfZc6fLNLiPsBIcpssIqKxDbUnAg3zxJhK7vyUbp52x_7QEH2lb0gfWKDaYT3d0fdtV-EEV0r_l8Ax5O8O7oX4Tb4NnIGPNnWzUsb1mYxo1Pg",
    badgeLabel: "Khá",
    tags: ["Đổi sách"],
    salesCount: 8,
    location: "Q.3",
  },
  {
    id: "9f8e7d6c-5b4a-4c3d-9e8f-7a6b5c4d3e29",
    revisionId: "11111111-2222-4333-8444-555555555563",
    version: 1,
    book: {
      id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c75",
      title: "Nhà Giả Kim (Bìa cứng kỷ niệm)",
      authors: ["Paulo Coelho"],
      publisher: "NXB Văn Học",
      publicationYear: 2018,
      language: "vi",
      edition: "Bìa cứng ép nhũ",
      category: "Kinh tế & Kỹ năng",
      isbn: null,
    },
    condition: "LikeNew",
    pages: "228",
    coverNote: "Bìa cứng mạ vàng kim, gần như mới nguyên",
    notes: "Khi bạn khao khát một điều gì...",
    accessories: "Áo bìa đầy đủ",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    description: "Cuốn sách gối đầu giường của hàng triệu độc giả.",
    seller: {
      id: "bbbbbbbb-1111-4222-8333-444444444452",
      displayName: "Tủ Sách Tri Thức",
    },
    photos: [
      {
        id: "cccccccc-1111-4222-8333-444444444449",
        width: 600,
        height: 800,
      },
    ],
    publishedAt: "2026-10-12T15:00:00.000Z",
    purchaseAvailability: {
      status: "Available",
      expiresAt: null,
    },
    mode: "Sale",
    salePrice: 120000,
    exchangeValue: null,
    fulfillment: {
      serviceAreaCode: "HCM-DEMO-v1",
      name: "TP.HCM",
      demoOnly: true,
      method: "DirectDelivery",
    },
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBzkJpMc5SENjqhgPMDfqFGY2ldXQli5pT5J21uQba9UJVYQZ3uagkBxe5ews_lFpv3ROcRy47X_RzUXGo3Sfeb-06GmUyngmcG2biiQkoSTI-x-w1u2NTJPPOswFDlo3C3PBvyMfgC4zD9an3P8vPVY_-nRa0d8M-5E25gaM-p7Ggs98H3tfISHMqg-uBk0qjcTZHMygX7DJaasNHE3mXcqA2WSFsmequYc6dsTYYM4xUh2uvloDEDbw",
    badgeLabel: "Như mới",
    tags: ["Giảm 20k"],
    salesCount: 52,
    location: "Q.10",
  },
];

export const VOUCHERS_LIST: readonly CuratedVoucher[] = [
  {
    id: "v-01",
    code: "LATLAI20K",
    title: "Giảm 20.000₫ cho đơn từ 150k",
    description: "Áp dụng cho mọi đơn mua sách cũ tuyển chọn tại TP.HCM",
    minOrder: 150000,
    expiry: "Hết hạn sau 3 ngày",
  },
  {
    id: "v-02",
    code: "VIAPOINT0D",
    title: "Miễn phí vận chuyển ViaPoint 0đ",
    description: "Nhận tại 2 điểm tiếp nhận Quận 1 hoặc Bình Thạnh",
    minOrder: 0,
    expiry: "Hiệu lực trong tháng này",
  },
  {
    id: "v-03",
    code: "HOANXU15",
    title: "Hoàn 15% Lật-Xu khi Trao Đổi",
    description: "Tích lũy xu để đổi những ấn bản hiếm trong kỳ tới",
    minOrder: 100000,
    expiry: "Số lượng có hạn",
  },
  {
    id: "v-04",
    code: "DAUGIA50K",
    title: "Ưu đãi 50.000₫ cọc Đấu Giá",
    description: "Áp dụng cho phiên đấu giá kỳ thư cuối tuần",
    minOrder: 300000,
    expiry: "Dành riêng cho thành viên",
  },
];

export const INITIAL_NOTIFICATIONS: readonly HomeNotificationItem[] = [
  {
    id: "notif-01",
    title: "Đơn giao sách đang trên đường tới",
    message: "Cuốn 'Số Đỏ (1938)' của bạn đã rời điểm ViaPoint Quận 1.",
    time: "15 phút trước",
    read: false,
    type: "order",
  },
  {
    id: "notif-02",
    title: "Phiên đấu giá sắp bắt đầu",
    message: "Phiên đấu giá 'Vang Bóng Một Thời - Bản 1940' sẽ mở lúc 20:00 tối nay.",
    time: "1 giờ trước",
    read: false,
    type: "auction",
  },
  {
    id: "notif-03",
    title: "Voucher 20k sắp hết hạn",
    message: "Bạn còn 1 mã giảm giá 20.000₫ chưa sử dụng, hết hạn trong hôm nay.",
    time: "5 giờ trước",
    read: true,
    type: "voucher",
  },
  {
    id: "notif-04",
    title: "Sách mới đăng trong tủ yêu thích",
    message: "Thư Quán Sài Gòn vừa đăng ấn phẩm 'Thi Nhân Việt Nam (1942)'.",
    time: "Hôm qua",
    read: true,
    type: "system",
  },
];

export const CATEGORIES = [
  { id: "", title: "Gợi ý hôm nay" },
  { id: "Văn học 1930-1945", title: "Văn học 1930-1945" },
  { id: "Sử học & Khảo cứu", title: "Sử học & Khảo cứu" },
  { id: "Bản in đầu & Chữ ký", title: "Bản in đầu & Chữ ký" },
  { id: "Tiểu thuyết miền Nam", title: "Tiểu thuyết miền Nam" },
  { id: "Sách tranh & Thơ ca", title: "Sách tranh & Thơ ca" },
  { id: "Kinh tế & Kỹ năng", title: "Kinh tế & Kỹ năng" },
] as const;

