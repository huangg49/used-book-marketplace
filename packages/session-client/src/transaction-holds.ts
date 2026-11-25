export type TransactionNote = { label: string; detail: string };

export function directOrderHoldNotes(purchaseMode?: "BuyNow" | "Negotiated"): TransactionNote[] {
  const held = { label: "Tiền được giữ khi nào?", detail: "Ví giữ toàn bộ tiền đơn ngay khi thanh toán, trong lúc giao nhận và kiểm tra sách." };
  return purchaseMode === "BuyNow"
    ? [held, { label: "Theo dõi", detail: "Xem mốc tiếp theo trong chi tiết đơn." }]
    : [held, { label: "Khi nào được hoàn?", detail: "Nếu người bán từ chối hoặc hết hạn xác nhận bán, hệ thống xử lý hoàn tiền về Ví." }];
}

export const auctionOrderHoldText = "Khi thanh toán, Ví giữ tổng tiền đơn trong lúc giao nhận và trong 72 giờ kiểm tra kể từ lúc bạn nhận sách. Nếu có sự cố, tiền tiếp tục được giữ đến khi xử lý xong.";

export function auctionBidHoldText(hasRegistration: boolean) {
  return hasRegistration
    ? "Khi bạn dẫn giá, Ví giữ mức cam kết, gồm cả cọc đăng ký. Nếu bị vượt giá, phần vượt mức cọc về Ví. Cọc tiếp tục được giữ đến khi phiên chốt."
    : "Khi bạn dẫn giá, Ví giữ mức bạn cam kết. Nếu bị vượt giá hoặc phiên hủy, khoản giữ về Ví.";
}

export const auctionOrderHoldNotes = [
  { label: "Tiền được giữ khi nào?", detail: "Từ lúc thanh toán đến hết 72 giờ kiểm tra kể từ lúc bạn nhận sách." },
  { label: "Nếu có sự cố", detail: "Ví giữ tiền đến khi xử lý xong." },
];

export function auctionBidHoldNotes(hasRegistration: boolean): TransactionNote[] {
  return hasRegistration
    ? [
      { label: "Khi dẫn giá", detail: "Ví giữ mức cam kết, gồm cả cọc đăng ký." },
      { label: "Khi bị vượt giá", detail: "Phần vượt mức cọc về Ví. Cọc được giữ đến lúc chốt phiên." },
    ]
    : [
      { label: "Khi dẫn giá", detail: "Ví giữ mức bạn cam kết." },
      { label: "Khi bị vượt giá hoặc phiên hủy", detail: "Khoản giữ về Ví." },
    ];
}

export function auctionRegistrationNotes(minBidders: number): TransactionNote[] {
  return [
    { label: "Hoàn cọc", detail: "Cọc về Ví nếu bạn không thắng, phiên không đủ người hoặc bị hủy." },
    { label: "Rút đăng ký", detail: `Có thể rút trước khi đủ ${minBidders} người. Khi đã đủ, hạn rút là 72 giờ trước giờ mở.` },
    { label: "Nếu thắng", detail: "Thanh toán trong 24 giờ sau khi phiên kết thúc để tránh mất cọc." },
  ];
}

export const exchangeFundingNotes = [
  { label: "Nếu đối tác quá hạn đặt cọc", detail: "Khoản bạn đã nộp được hoàn về Ví." },
  { label: "Sau khi nhận sách", detail: "Khi hết hạn kiểm tra 72 giờ của cả hai và không có tranh chấp, cọc về Ví và tiền bù (nếu có) chuyển cho bên nhận." },
  { label: "Nếu có tranh chấp", detail: "Tiền vẫn được giữ trong lúc xử lý." },
];

export const withdrawalFundsNotes = [
  { label: "Khi gửi yêu cầu", detail: "Ví giữ khoản tiền rút trong lúc chờ duyệt." },
  { label: "Nếu bị từ chối", detail: "Tiền về lại số dư khả dụng." },
];
