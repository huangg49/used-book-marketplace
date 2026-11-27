import type { PublicListing } from "../../services/public-listings";
import type { PurchaseConversation } from "../../services/purchase-conversations";

type Availability = PublicListing["purchaseAvailability"]["status"];

const heldLabels: Record<Exclude<Availability, "Available">, string> = {
  InNegotiation: "Đang giữ sách",
  AwaitingPayment: "Chờ thanh toán",
  InTransaction: "Đang giao dịch",
};

/**
 * Everything the detail page decides about buying, chatting and exchanging,
 * derived from the listing, the viewer and their purchase conversations.
 * Display only: the API still enforces ownership, holds and eligibility.
 */
export function listingPurchaseState(
  book: PublicListing,
  conversations: readonly PurchaseConversation[] | undefined,
  currentUserId: string | undefined,
) {
  const availability = book.purchaseAvailability.status;
  const held = availability !== "Available";
  const heldLabel = held ? heldLabels[availability] : "";
  const isOwner = currentUserId === book.seller.id;
  const forThisBook = (conversations ?? []).filter(
    (conversation) => conversation.listingId === book.id,
  );
  const orderConversation = held
    ? forThisBook.find(
        (conversation) =>
          conversation.status === "OrderCreated" &&
          (conversation.buyer.id === currentUserId ||
            conversation.seller.id === currentUserId),
      )
    : undefined;
  const buyerOrder =
    orderConversation?.buyer.id === currentUserId ? orderConversation : undefined;
  const sellerOrder =
    orderConversation?.seller.id === currentUserId ? orderConversation : undefined;
  const activeConversation = forThisBook.find(
    (conversation) => conversation.status === "Active",
  );
  const offersExchange = book.mode === "Exchange" || book.mode === "Both";
  const canProposeExchange =
    offersExchange &&
    !isOwner &&
    !book.bundle &&
    (!held || (availability === "InNegotiation" && Boolean(activeConversation)));

  const [title, subtitle] = buyerOrder
    ? [
        "Người bán đã tạo đơn cho bạn",
        "Đơn hàng này dành cho bạn. Mở đơn để xem giá đã thỏa thuận và xác nhận thanh toán.",
      ]
    : sellerOrder
      ? [
          "Bạn đã tạo đơn cho người mua",
          "Bạn đã tạo đơn cho người mua này. Mở hội thoại để xem thông tin đơn hàng.",
        ]
      : isOwner
        ? [
            "Đây là bài đăng của bạn",
            "Khi người mua xác nhận giá và địa chỉ nhận sách, bạn có thể tạo đơn trong hội thoại.",
          ]
        : held
          ? [
              heldLabel,
              "Bản sách này đã có đơn giữ chỗ. Bạn vẫn có thể xem bài đăng nhưng chưa thể đặt mua.",
            ]
          : [
              "Chọn cách mua",
              "Mua theo giá niêm yết hoặc nhắn người bán để trao đổi thêm.",
            ];

  const chatLabel = buyerOrder
    ? "Xem đơn hàng của bạn"
    : sellerOrder
      ? "Mở hội thoại giao dịch"
      : isOwner
        ? "Mở chat với người mua"
        : "Mở chat với người bán";

  /** Colour key for the status pill and buy panel; each state has its own tone. */
  const tone: "available" | "yours" | "payment" | "transaction" | "holding" = !held
    ? "available"
    : buyerOrder
      ? "yours"
      : availability === "AwaitingPayment"
        ? "payment"
        : availability === "InTransaction"
          ? "transaction"
          : "holding";

  return {
    tone,
    held,
    heldLabel,
    /** Tag shown beside condition and mode; null while the book is available. */
    statusTag: !held
      ? null
      : buyerOrder && availability === "InTransaction"
        ? "Đang giao dịch với bạn"
        : heldLabel,
    isOwner,
    orderConversation,
    buyerOrder,
    activeConversation,
    conversationToOpen: buyerOrder ?? sellerOrder ?? activeConversation,
    offersExchange,
    canProposeExchange,
    title,
    subtitle,
    chatLabel,
  };
}

export type ListingPurchaseState = ReturnType<typeof listingPurchaseState>;
