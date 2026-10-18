import type { PublicAuctionSummary } from "./contracts";

export interface ExtendedAuctionItem extends PublicAuctionSummary {
  coverUrl?: string;
  author?: string;
  publisher?: string;
  conditionTag?: string;
  location?: string;
  depositAmount?: number;
  isHot?: boolean;
  viewersCount?: number;
  startingBidLabel?: string;
}

export const CURATED_SAIGON_AUCTIONS: ExtendedAuctionItem[] = [
  {
    id: "e1a2b3c4-d5e6-47a8-9b0c-1d2e3f4a5b6c",
    listingId: "f1a2b3c4-d5e6-47a8-9b0c-1d2e3f4a5b6d",
    title: "Số Đỏ (Bản in đầu 1938)",
    state: "Active",
    startPrice: 2000000,
    step: 50000,
    buyNowPrice: 8500000,
    currentPrice: 5200000,
    minimumBid: 5250000,
    bidderCount: 19,
    startAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    endAt: new Date(Date.now() + 385000).toISOString(), // ~6 min left (Hero Flash)
    pointName: "Chợ Cũ Q.1 · Ký gửi VIP",
    demoOnly: true,
    author: "Vũ Trọng Phụng • Kèm thủ bút",
    publisher: "Lê Cường Xuất Bản 1938",
    conditionTag: "Độc bản 1938",
    location: "Chợ Cũ Q.1 • Ký gửi VIP",
    depositAmount: 200000,
    isHot: true,
    viewersCount: 28,
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAjSEVEP1H0bsRjftSO_K5Vqddr73SlfEQUHZqIcsk5bJZboyXD528mljCsWIuYnRAOCjnDJuIp9gv3gW5OiTdi6m6kd2Bn1awRRG_k1JXfIDVQTzwN_kz9ikxN2l9uLEmbMWDzEfXTV3lyX2rI-sposHgHCPcls5wdwP3_GYkhbbZ5i0hcrUtfiwb5nmstQMV_yZsPITXHwpdap5uUvRsgjEPQ_HDuNNketNBVHYskBFZ2dnAKlTwyog",
  },
  {
    id: "a2b3c4d5-e6f7-48a9-bc0d-2e3f4a5b6c7d",
    listingId: "b2b3c4d5-e6f7-48a9-bc0d-2e3f4a5b6c7e",
    title: "Vang Bóng Một Thời",
    state: "Active",
    startPrice: 800000,
    step: 50000,
    buyNowPrice: 2400000,
    currentPrice: 1850000,
    minimumBid: 1900000,
    bidderCount: 14,
    startAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    endAt: new Date(Date.now() + 860000).toISOString(), // ~14m left
    pointName: "Cà phê Thứ Bảy, Q.1",
    demoOnly: true,
    author: "Nguyễn Tuân",
    publisher: "NXB Tân Dân 1940",
    conditionTag: "Bản in 1940",
    location: "Cà phê Thứ Bảy, Q.1",
    depositAmount: 100000,
    isHot: true,
    viewersCount: 19,
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBxDLMBrTWVlaVOjHtEew2GuQXTAuzUCyU9Obtz45t8y-juufmXHsmdfmS-mm3jX0qZS95VaTMdvp2KtMPV2ThUglt9rXdSfDmRK9GJgeQQwnuP8W7h4dLsLY1MzhVb7ce0lgIzRegi6SlNlRoLtllDzRW1_2Oygwhs2xpRY5CpG4CO4twUQvqVefvUpYUwYoElGEzCheZxw8NV5Q0XTK1uOnKJTWxIZyzth7RyRKQ-I6ZKgpkKUhoJfw",
  },
  {
    id: "b3c4d5e6-f7a8-49bc-8d1e-3f4a5b6c7d8e",
    listingId: "c3c4d5e6-f7a8-49bc-8d1e-3f4a5b6c7d8f",
    title: "Kim Vân Kiều Tân Truyện",
    state: "Active",
    startPrice: 1000000,
    step: 50000,
    buyNowPrice: 6500000,
    currentPrice: 3900000,
    minimumBid: 3950000,
    bidderCount: 27,
    startAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    endAt: new Date(Date.now() + 1925000).toISOString(), // ~32m left
    pointName: "Trạm Thư Viện Nguyễn Gia Trí",
    demoOnly: true,
    author: "Nguyễn Du • Nguyễn Văn Vĩnh dịch chú",
    publisher: "Imprimerie Trung-Bac Tan-Van 1925",
    conditionTag: "Bảo vật 1925",
    location: "Trạm Thư Viện Nguyễn Gia Trí",
    depositAmount: 150000,
    isHot: true,
    viewersCount: 42,
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCaqZ36dIkWub27ZXhQN1ir3ngv36ESABvjZh6R6XBM2pWfzyfYyn-O8Td3fh-3hDUCRM8UsbSX2-__WaDFLep4NnJPmG5QtrgH_JqElRtKL80E2kTbtWF5hmOPDM8kjGrD5NegNcj041qFfAY6dLcvUUOQxZfl6DIu_A4yTP8SJuS0U8suGkW9Whgi-CvVCQ2WjLTHYYUCGOsKsu2F7CChoRz6ThaVbGE9dwtiO8QWsAf8Bvr_atmk3Q",
  },
  {
    id: "c4d5e6f7-a8b9-40cd-9e2f-4a5b6c7d8e9f",
    listingId: "d4d5e6f7-a8b9-40cd-9e2f-4a5b6c7d8ea0",
    title: "Đoạn Tuyệt (Tiểu thuyết)",
    state: "Active",
    startPrice: 400000,
    step: 10000,
    buyNowPrice: 1300000,
    currentPrice: 950000,
    minimumBid: 960000,
    bidderCount: 9,
    startAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    endAt: new Date(Date.now() + 4548000).toISOString(), // ~1h 15m
    pointName: "Cà phê Thứ Bảy, Q.1",
    demoOnly: true,
    author: "Nhất Linh",
    publisher: "Đời Nay Xuất Bản 1935",
    conditionTag: "Bản Tự Lực 1935",
    location: "Cà phê Thứ Bảy, Q.1",
    depositAmount: 50000,
    isHot: false,
    viewersCount: 15,
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAHl8piPIw4bax7rSEBQfE3fWrPQas7dSfOuYOMnk9bHbs8jK-AZ-GIKsabpV9uUwWHgpSDp1XahWOefWHqMUs7Aya-sRw81DSsExTR7UVltNKT8C5b1pBSv4bw7bzQw_Q9qJdwjX4XxMBSFE_-llh_6pxBgKrQrLFgI-oAGM4BVB4-IqRj7XgbaIjFNj-l_FBuQyRJQVXZKKe_EvTsezlYxlp-REsUIRF8DDzWUAKpoOFFTafpgp7tzQ",
  },
  {
    id: "d5e6f7a8-b9c0-41de-8f3a-5b6c7d8e9fa1",
    listingId: "e5e6f7a8-b9c0-41de-8f3a-5b6c7d8e9fa2",
    title: "Nỗi Buồn Chiến Tranh",
    state: "Active",
    startPrice: 500000,
    step: 50000,
    buyNowPrice: 1800000,
    currentPrice: 1200000,
    minimumBid: 1250000,
    bidderCount: 11,
    startAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    endAt: new Date(Date.now() + 9850000).toISOString(), // ~2h 44m
    pointName: "Trạm Thư Viện Nguyễn Gia Trí",
    demoOnly: true,
    author: "Bảo Ninh • Ký tặng 1991",
    publisher: "NXB Hội Nhà Văn 1991",
    conditionTag: "Kèm Chữ Ký Tác Giả",
    location: "Trạm Thư Viện Nguyễn Gia Trí",
    depositAmount: 100000,
    isHot: false,
    viewersCount: 22,
    coverUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBqUHHd1CfnA8X6ditOn-WW1RpiPp0okLL7izKCWtsQLdSMem5jVx0vdfc4deJeQCdb-Om59HNlWqIIe5lR2q6HZKIIH4edzm38_YU7Llk1QG4_MYsdxRM05HcZ62_kegakYtzvlQL8R3GRYhLDBU3Rrv5HgvyGHyXMrLA_ug58jIStitlVMWMKWrau7sIazc3oOT74AptblZtyeTHOl1RalhdDmmJNFG9cbjU86_EMUtzeK21xEnZYiQ",
  },
];

export const LIVE_TICKER_ITEMS = [
  "🔥 1.480.000₫ cho cuốn Việt Nam Sử Lược (3s trước) • Độc giả #SG92 vừa chốt búa!",
  "⚡ Độc giả #Quan1 vừa nâng giá Số Đỏ (1938) lên 5.200.000₫ • 19 lượt đấu",
  "🎯 Độc giả #BinhThanh chốt Mua Ngay cuốn Nhật Ký Trong Tù • 2.800.000₫",
  "⭐ Phiên đấu Kim Vân Kiều (1925) ghi nhận 27 lượt trả giá • Cực kỳ sôi động",
];
