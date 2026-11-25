import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import {
  AppText,
  Button,
  Icon,
  Notice,
  SearchField,
  StatePanel,
  colorRoles,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { publicListing } from "../shelf/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  formatDateTimeVi,
  getPurchaseConversations,
  statusLabels,
} from "./purchase-conversation-service";
import type { PurchaseConversation } from "./contracts";
import {
  exchangePageSchema,
  mapExchangeStatusInfo,
  type Exchange,
} from "../exchanges/contracts";
import {
  isOpen,
  isScheduled,
  myAuctionsOptions,
} from "../auctions/auctions-model";
import { AuctionCover } from "../auctions/components/auction-cover";
import type { MyAuctionItem } from "../auctions/contracts";

type TransactionTab = "all" | "buy" | "exchange" | "auction";

const TRANSACTION_TABS: readonly {
  key: TransactionTab;
  label: string;
}[] = [
  { key: "all", label: "Tất cả" },
  { key: "buy", label: "Mua ngay" },
  { key: "exchange", label: "Đổi sách" },
  { key: "auction", label: "Đấu giá" },
];

function doesExchangeNeedAction(
  exchange: Exchange,
  currentUserId: string,
): boolean {
  if (!currentUserId) return false;
  const isInitiator = exchange.initiatorId === currentUserId;
  if (exchange.status === "Proposed") {
    return exchange.lastProposedById
      ? exchange.lastProposedById !== currentUserId
      : !isInitiator;
  }
  if (exchange.status === "AcceptedAwaitingFunding") {
    return isInitiator
      ? !exchange.initiatorFundedAt
      : !exchange.recipientFundedAt;
  }
  if (exchange.status === "Preparing" || exchange.status === "InTransit") {
    const myShipped = isInitiator
      ? Boolean(exchange.initiatorShippedAt || exchange.initiatorShipment)
      : Boolean(exchange.recipientShippedAt || exchange.recipientShipment);
    const partnerShipped = isInitiator
      ? Boolean(exchange.recipientShippedAt)
      : Boolean(exchange.initiatorShippedAt);
    const myReceived = isInitiator
      ? Boolean(exchange.initiatorReceivedAt)
      : Boolean(exchange.recipientReceivedAt);
    return !myShipped || (partnerShipped && !myReceived);
  }
  if (exchange.status === "Delivered") {
    return isInitiator
      ? !exchange.initiatorCompletedAt
      : !exchange.recipientCompletedAt;
  }
  return exchange.status === "ResolutionPending";
}

function getExchangeActionCue(
  exchange: Exchange,
  currentUserId: string,
  awaitingMyReply: boolean,
): string {
  const isInitiator = exchange.initiatorId === currentUserId;
  if (exchange.status === "Proposed") {
    return awaitingMyReply ? "Phản hồi đề nghị" : "Xem phiếu";
  }
  if (exchange.status === "AcceptedAwaitingFunding") {
    const myFunded = isInitiator
      ? Boolean(exchange.initiatorFundedAt)
      : Boolean(exchange.recipientFundedAt);
    return myFunded ? "Xem phiếu" : "Đặt cọc ngay";
  }
  if (exchange.status === "Preparing") {
    const myShipped = isInitiator
      ? Boolean(exchange.initiatorShippedAt || exchange.initiatorShipment)
      : Boolean(exchange.recipientShippedAt || exchange.recipientShipment);
    return myShipped ? "Theo dõi gửi sách" : "Gửi sách ngay";
  }
  if (exchange.status === "InTransit") {
    const partnerShipped = isInitiator
      ? Boolean(exchange.recipientShippedAt)
      : Boolean(exchange.initiatorShippedAt);
    const myReceived = isInitiator
      ? Boolean(exchange.initiatorReceivedAt)
      : Boolean(exchange.recipientReceivedAt);
    return partnerShipped && !myReceived ? "Xác nhận nhận sách" : "Xem hành trình";
  }
  if (exchange.status === "Delivered") {
    const myCompleted = isInitiator
      ? Boolean(exchange.initiatorCompletedAt)
      : Boolean(exchange.recipientCompletedAt);
    return myCompleted ? "Xem phiếu" : "Đồng kiểm sách";
  }
  if (exchange.status === "ResolutionPending") return "Xem khiếu nại";
  return "Xem chi tiết";
}

function getAuctionStatusMeta(
  item: MyAuctionItem,
  nowMs: number,
): {
  label: string;
  badgeBg: string;
  badgeColor: string;
  needsAction: boolean;
  actionCue: string;
} {
  const { auction } = item;
  if (item.needsPayment) {
    return {
      label: "Chờ bạn thanh toán",
      badgeBg: stitchTokens.terracottaSoft,
      badgeColor: stitchTokens.wineDark,
      needsAction: true,
      actionCue: "Thanh toán ngay",
    };
  }
  if (auction.state === "SecondChanceOffered" && item.role === "Bidder") {
    return {
      label: "Có lời mời mua lại",
      badgeBg: stitchTokens.amberBg,
      badgeColor: stitchTokens.orangeDeep,
      needsAction: true,
      actionCue: "Xem lời mời",
    };
  }
  if (auction.state === "OnHold") {
    return {
      label: "Đang tạm dừng",
      badgeBg: stitchTokens.amberBg,
      badgeColor: stitchTokens.goldBronze,
      needsAction: false,
      actionCue: "Xem phiên",
    };
  }
  if (auction.state === "Sold") {
    return {
      label: item.won
        ? "Bạn đã thắng phiên"
        : item.role === "Seller"
          ? "Đã bán thành công"
          : "Phiên đã kết thúc",
      badgeBg: stitchTokens.likeNewGreenBg,
      badgeColor: stitchTokens.verifiedGreen,
      needsAction: false,
      actionCue: "Xem kết quả",
    };
  }
  if (
    auction.state === "Unsold" ||
    auction.state === "Cancelled" ||
    auction.state === "PaymentExpired"
  ) {
    return {
      label:
        auction.state === "PaymentExpired"
          ? "Quá hạn thanh toán"
          : auction.state === "Cancelled"
            ? "Phiên đã hủy"
            : "Chưa có người mua",
      badgeBg: stitchTokens.canvasMuted,
      badgeColor: colors.muted,
      needsAction: false,
      actionCue: "Xem phiên",
    };
  }
  if (auction.state === "AwaitingWinnerPayment") {
    return {
      label: item.role === "Seller" ? "Chờ người thắng thanh toán" : "Chờ thanh toán",
      badgeBg: stitchTokens.amberBg,
      badgeColor: stitchTokens.goldBronze,
      needsAction: false,
      actionCue: "Xem phiên",
    };
  }
  if (isScheduled(auction, nowMs)) {
    return {
      label: "Sắp mở phiên",
      badgeBg: stitchTokens.blueLightBg,
      badgeColor: stitchTokens.blueTextDeep,
      needsAction: false,
      actionCue: "Xem lịch mở",
    };
  }
  if (isOpen(auction, nowMs) || auction.state === "BuyNowPending") {
    if (item.role === "Bidder") {
      return item.leading
        ? {
            label: "Bạn đang dẫn giá",
            badgeBg: stitchTokens.likeNewGreenBg,
            badgeColor: stitchTokens.likeNewGreen,
            needsAction: false,
            actionCue: "Theo dõi phiên",
          }
        : {
            label: "Đã bị vượt giá",
            badgeBg: stitchTokens.tagExchangeBg,
            badgeColor: stitchTokens.tagExchangeText,
            needsAction: true,
            actionCue: "Trả giá tiếp",
          };
    }
    return {
      label: "Đang diễn ra",
      badgeBg: stitchTokens.likeNewGreenBg,
      badgeColor: stitchTokens.likeNewGreen,
      needsAction: false,
      actionCue: "Theo dõi phiên",
    };
  }
  return {
    label: "Đang cập nhật",
    badgeBg: stitchTokens.canvasMuted,
    badgeColor: colors.muted,
    needsAction: false,
    actionCue: "Xem phiên",
  };
}

function PurchaseTransactionCard({
  room,
  currentUserId,
  onPress,
}: {
  room: PurchaseConversation;
  currentUserId: string;
  onPress: () => void;
}) {
  const { client } = useSession();
  const isBuyer = room.buyer.id === currentUserId;
  const partner = isBuyer ? room.seller : room.buyer;
  const isExchangeRoom = room.terms?.mode === "Exchange";

  const listingQuery = useQuery({
    queryKey: ["public-listing", room.listingId],
    queryFn: () =>
      client.publicRequest(
        `/listings/${room.listingId}?bundleSupport=whole-v1`,
        publicListing,
      ),
    staleTime: 60_000,
    retry: false,
  });

  const listing = listingQuery.data;
  const bookTitle =
    listing?.bundle?.title || listing?.book.title || "Đang tải tên sách…";
  const primaryPhoto = listing?.photos?.[0];
  const revisionId = listing?.revisionId;

  const proposal = room.terms?.pendingProposal;
  const isActionNeeded =
    room.status === "Active" &&
    Boolean(proposal) &&
    proposal?.proposedById !== currentUserId;
  const isWaitingPartner =
    room.status === "Active" &&
    Boolean(proposal) &&
    proposal?.proposedById === currentUserId;

  let statusLabel = statusLabels[room.status] ?? room.status;
  let badgeBg: string = stitchTokens.likeNewGreenBg;
  let badgeColor: string = stitchTokens.likeNewGreen;
  let actionCue = "Mở hội thoại";

  if (isActionNeeded) {
    statusLabel =
      proposal?.kind === "Price"
        ? `Đề nghị ${formatVnd(proposal.amount ?? 0)} · Chờ bạn`
        : "Đề nghị đổi sách · Chờ bạn";
    badgeBg = stitchTokens.terracottaSoft;
    badgeColor = stitchTokens.wineDark;
    actionCue = "Phản hồi ngay";
  } else if (isWaitingPartner) {
    statusLabel = "Đang chờ đối tác phản hồi";
    badgeBg = stitchTokens.amberBg;
    badgeColor = stitchTokens.goldBronze;
  } else if (room.status === "OrderCreated") {
    statusLabel = isBuyer ? "Đã tạo đơn · Chờ thanh toán" : "Đã tạo đơn hàng";
    badgeBg = stitchTokens.amberBg;
    badgeColor = stitchTokens.orangeDeep;
    actionCue = isBuyer ? "Thanh toán" : "Xem hội thoại";
  } else if (room.status !== "Active") {
    badgeBg = stitchTokens.canvasMuted;
    badgeColor = colors.muted;
    actionCue = "Xem lại";
  }

  const listingAmount = listing?.salePrice ?? listing?.exchangeValue ?? null;
  const priceLine =
    room.terms?.agreedPrice != null
      ? `Thống nhất ${formatVnd(room.terms.agreedPrice)}`
      : listingAmount != null
        ? formatVnd(listingAmount)
        : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Hội thoại ${bookTitle} với ${partner.displayName}`}
      style={({ pressed }) => [
        styles.txnCard,
        isActionNeeded && styles.txnCardAttention,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardMainRow}>
        <View style={styles.bookCoverFrame}>
          {primaryPhoto && revisionId ? (
            <PublicPhoto
              listingId={room.listingId}
              revisionId={revisionId}
              mediaId={primaryPhoto.id}
              label={bookTitle}
              active
              compact
            />
          ) : (
            <View style={styles.coverFallback}>
              <Icon
                name={isExchangeRoom ? "swap" : "book"}
                size={22}
                color={stitchTokens.wine}
              />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardMetaRow}>
            <View style={styles.categoryWrap}>
              <Icon
                name={isExchangeRoom ? "swap" : "message"}
                size={13}
                color={stitchTokens.wine}
              />
              <AppText style={styles.categoryText}>
                {isExchangeRoom ? "Thỏa thuận đổi sách" : "Mua ngay"}
              </AppText>
            </View>
            <AppText style={styles.timeText}>
              {formatDateTimeVi(room.createdAt)}
            </AppText>
          </View>

          <AppText numberOfLines={2} style={styles.bookTitle}>
            {bookTitle}
          </AppText>

          <AppText numberOfLines={1} style={styles.partnerLine}>
            {isBuyer ? "Người bán" : "Người mua"} · {partner.displayName}
            {priceLine ? ` · ${priceLine}` : ""}
          </AppText>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
          <AppText
            numberOfLines={1}
            style={[styles.statusBadgeText, { color: badgeColor }]}
          >
            {statusLabel}
          </AppText>
        </View>

        <View style={styles.actionCueRow}>
          <AppText
            style={[
              styles.actionCueText,
              isActionNeeded && styles.actionCueTextUrgent,
            ]}
          >
            {actionCue}
          </AppText>
          <Icon
            name="chevronRight"
            size={15}
            color={isActionNeeded ? stitchTokens.wine : colors.muted}
          />
        </View>
      </View>
    </Pressable>
  );
}

function ExchangeTransactionCard({
  exchange,
  currentUserId,
  onPress,
}: {
  exchange: Exchange;
  currentUserId: string;
  onPress: () => void;
}) {
  const { client } = useSession();
  const isInitiator = exchange.initiatorId === currentUserId;

  const partnerBooks = exchange.agreement
    ? isInitiator
      ? [exchange.agreement.recipientBook]
      : exchange.agreement.initiatorBooks
    : [];
  const myBooks = exchange.agreement
    ? isInitiator
      ? exchange.agreement.initiatorBooks
      : [exchange.agreement.recipientBook]
    : [];

  const partnerSnapshot = partnerBooks[0];
  const mySnapshot = myBooks[0];
  const snapshotCover = partnerSnapshot?.mediaIds?.[0]
    ? {
        listingId: partnerSnapshot.listingId,
        revisionId: partnerSnapshot.revisionId,
        mediaId: partnerSnapshot.mediaIds[0],
      }
    : mySnapshot?.mediaIds?.[0]
      ? {
          listingId: mySnapshot.listingId,
          revisionId: mySnapshot.revisionId,
          mediaId: mySnapshot.mediaIds[0],
        }
      : null;

  const targetListingId = isInitiator
    ? exchange.recipientListingId
    : (exchange.initiatorListingIds?.[0] ?? exchange.initiatorListingId);

  const listingQuery = useQuery({
    queryKey: ["public-listing", targetListingId],
    queryFn: () =>
      client.publicRequest(
        `/listings/${targetListingId}?bundleSupport=whole-v1`,
        publicListing,
      ),
    staleTime: 60_000,
    retry: false,
    enabled: Boolean(targetListingId) && (!partnerSnapshot || !snapshotCover),
  });

  const listing = listingQuery.data;
  const partnerName =
    partnerSnapshot?.ownerDisplayName ||
    listing?.seller.displayName ||
    (isInitiator
      ? exchange.recipientAddress?.recipientName
      : exchange.initiatorAddress?.recipientName) ||
    "Đối tác trao đổi";

  const partnerBookCount = isInitiator
    ? 1
    : Math.max(
        1,
        exchange.agreement?.initiatorBooks?.length ??
          exchange.initiatorListingIds?.length ??
          1,
      );

  const bookTitle = partnerSnapshot
    ? partnerBookCount > 1
      ? `${partnerSnapshot.book.title} (+${partnerBookCount - 1} cuốn)`
      : partnerSnapshot.book.title
    : listing?.bundle?.title || listing?.book.title || "Phiếu trao đổi sách";

  const awaitingMyReply =
    exchange.status === "Proposed" &&
    (exchange.lastProposedById
      ? exchange.lastProposedById !== currentUserId
      : !isInitiator);

  const isActionNeeded = doesExchangeNeedAction(exchange, currentUserId);
  const statusInfo = mapExchangeStatusInfo(
    exchange.status,
    exchange.status === "Proposed" ? !awaitingMyReply : isInitiator,
  );
  const actionCue = getExchangeActionCue(
    exchange,
    currentUserId,
    awaitingMyReply,
  );

  const diffSummary =
    exchange.diffAmount > 0
      ? `${
          (isInitiator && exchange.diffPayerId === exchange.initiatorId) ||
          (!isInitiator && exchange.diffPayerId === exchange.recipientId)
            ? "Bù"
            : "Nhận"
        } ${formatVnd(exchange.diffAmount)}`
      : "Ngang giá";

  const fallbackPhoto = listing?.photos?.[0];
  const fallbackRevision = listing?.revisionId;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Phiếu trao đổi ${bookTitle} với ${partnerName}`}
      style={({ pressed }) => [
        styles.txnCard,
        isActionNeeded && styles.txnCardAttention,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardMainRow}>
        <View style={styles.bookCoverFrame}>
          {snapshotCover ? (
            <PublicPhoto
              exchangeId={exchange.id}
              listingId={snapshotCover.listingId}
              revisionId={snapshotCover.revisionId}
              mediaId={snapshotCover.mediaId}
              label={bookTitle}
              active
              compact
            />
          ) : fallbackPhoto && fallbackRevision && targetListingId ? (
            <PublicPhoto
              listingId={targetListingId}
              revisionId={fallbackRevision}
              mediaId={fallbackPhoto.id}
              label={bookTitle}
              active
              compact
            />
          ) : (
            <View style={styles.coverFallback}>
              <Icon name="swap" size={22} color={stitchTokens.wine} />
            </View>
          )}
          {partnerBookCount > 1 && (
            <View style={styles.coverCountChip}>
              <AppText style={styles.coverCountText}>
                +{partnerBookCount - 1}
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardMetaRow}>
            <View style={styles.categoryWrap}>
              <Icon name="swap" size={13} color={stitchTokens.wine} />
              <AppText style={styles.categoryText}>
                Đổi sách · #{exchange.id.slice(0, 8).toUpperCase()}
              </AppText>
            </View>
            <AppText style={styles.timeText}>
              {formatDateTimeVi(exchange.updatedAt ?? exchange.createdAt)}
            </AppText>
          </View>

          <AppText numberOfLines={2} style={styles.bookTitle}>
            {bookTitle}
          </AppText>

          <AppText numberOfLines={1} style={styles.partnerLine}>
            Với {partnerName} · {diffSummary}
          </AppText>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View
          style={[styles.statusBadge, { backgroundColor: statusInfo.badgeBg }]}
        >
          <AppText
            numberOfLines={1}
            style={[styles.statusBadgeText, { color: statusInfo.badgeColor }]}
          >
            {statusInfo.label}
          </AppText>
        </View>

        <View style={styles.actionCueRow}>
          <AppText
            style={[
              styles.actionCueText,
              isActionNeeded && styles.actionCueTextUrgent,
            ]}
          >
            {actionCue}
          </AppText>
          <Icon
            name="chevronRight"
            size={15}
            color={isActionNeeded ? stitchTokens.wine : colors.muted}
          />
        </View>
      </View>
    </Pressable>
  );
}

function AuctionTransactionCard({
  item,
  nowMs,
  onPress,
}: {
  item: MyAuctionItem;
  nowMs: number;
  onPress: () => void;
}) {
  const { auction } = item;
  const meta = getAuctionStatusMeta(item, nowMs);
  const priceAmount = auction.currentPrice ?? auction.startPrice;
  const priceLabel =
    auction.currentPrice != null ? "Giá hiện tại" : "Giá khởi điểm";
  const coverMediaId = auction.book?.photos?.[0]?.id;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Phiên đấu giá ${auction.title}`}
      style={({ pressed }) => [
        styles.txnCard,
        meta.needsAction && styles.txnCardAttention,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardMainRow}>
        <View style={styles.bookCoverFrame}>
          <AuctionCover
            auctionId={auction.id}
            mediaId={coverMediaId}
            label={auction.title}
            iconSize={22}
          />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardMetaRow}>
            <View style={styles.categoryWrap}>
              <Icon name="gavel" size={13} color={stitchTokens.wine} />
              <AppText style={styles.categoryText}>
                Đấu giá · {item.role === "Seller" ? "Sách bạn bán" : "Tham gia"}
              </AppText>
            </View>
            <AppText style={styles.timeText}>
              {formatDateTimeVi(auction.endAt)}
            </AppText>
          </View>

          <AppText numberOfLines={2} style={styles.bookTitle}>
            {auction.title}
          </AppText>

          <AppText numberOfLines={1} style={styles.partnerLine}>
            {priceLabel}: {formatVnd(priceAmount)} · {auction.pointName}
          </AppText>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={[styles.statusBadge, { backgroundColor: meta.badgeBg }]}>
          <AppText
            numberOfLines={1}
            style={[styles.statusBadgeText, { color: meta.badgeColor }]}
          >
            {meta.label}
          </AppText>
        </View>

        <View style={styles.actionCueRow}>
          <AppText
            style={[
              styles.actionCueText,
              meta.needsAction && styles.actionCueTextUrgent,
            ]}
          >
            {meta.actionCue}
          </AppText>
          <Icon
            name="chevronRight"
            size={15}
            color={meta.needsAction ? stitchTokens.wine : colors.muted}
          />
        </View>
      </View>
    </Pressable>
  );
}

type CombinedTransactionItem =
  | {
      type: "purchase";
      tab: "buy" | "exchange";
      id: string;
      time: number;
      searchText: string;
      needsAction: boolean;
      room: PurchaseConversation;
    }
  | {
      type: "exchange";
      tab: "exchange";
      id: string;
      time: number;
      searchText: string;
      needsAction: boolean;
      exchange: Exchange;
    }
  | {
      type: "auction";
      tab: "auction";
      id: string;
      time: number;
      searchText: string;
      needsAction: boolean;
      item: MyAuctionItem;
    };

export function ChatInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useForeground();
  const { client, state } = useSession();

  const [activeTab, setActiveTab] = useState<TransactionTab>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mountedAt] = useState(() => Date.now());

  const currentUserId = state.status === "authenticated" ? state.user.id : "";
  const isAuthenticated = state.status === "authenticated";
  const queryClient = useQueryClient();
  // Order, exchange, chat and notification commits wake the member inbox;
  // the lists poll only as a backstop while the watch is acknowledged.
  const live = useTransactionLive("inbox", currentUserId, foreground, () => {
    for (const queryKey of [
      ["purchase-conversations", currentUserId],
      ["my-exchanges", currentUserId],
      myAuctionsOptions(client, currentUserId, "all").queryKey,
    ]) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  });

  const conversationsQuery = useQuery({
    queryKey: ["purchase-conversations", currentUserId],
    queryFn: () => getPurchaseConversations(client),
    enabled: isAuthenticated && foreground,
    refetchInterval: live ? 30_000 : 8_000,
    retry: false,
  });

  const exchangesQuery = useQuery({
    queryKey: ["my-exchanges", currentUserId],
    queryFn: () => client.request("/exchanges", exchangePageSchema),
    enabled: isAuthenticated && foreground,
    refetchInterval: live ? 30_000 : 8_000,
    retry: false,
  });

  const auctionsQuery = useInfiniteQuery({
    ...myAuctionsOptions(client, currentUserId, "all"),
    enabled: isAuthenticated && foreground,
    refetchInterval: 20_000,
    retry: false,
  });

  const allRooms = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const allExchanges = useMemo(
    () => exchangesQuery.data?.items ?? [],
    [exchangesQuery.data],
  );
  const allAuctions = useMemo(
    () => auctionsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [auctionsQuery.data],
  );

  const auctionNowMs = useMemo(() => {
    const serverIso = auctionsQuery.data?.pages?.[0]?.serverTime;
    const parsed = serverIso ? Date.parse(serverIso) : NaN;
    return Number.isFinite(parsed) ? parsed : mountedAt;
  }, [auctionsQuery.data, mountedAt]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  // Deduplicate exchange-mode chat rooms that already spawned an Exchange record
  const combinedItems = useMemo<CombinedTransactionItem[]>(() => {
    const exchangeIdSet = new Set(allExchanges.map((ex) => ex.id));

    const purchaseItems: CombinedTransactionItem[] = allRooms
      .filter((room) => {
        if (room.terms?.mode !== "Exchange") return true;
        const hasLinkedExchange =
          (room.terms.activeExchangeId &&
            exchangeIdSet.has(room.terms.activeExchangeId)) ||
          (room.terms.exchangeIds ?? []).some((id) => exchangeIdSet.has(id));
        return !hasLinkedExchange;
      })
      .map((room) => {
        const isBuyer = room.buyer.id === currentUserId;
        const partner = isBuyer ? room.seller : room.buyer;
        const proposal = room.terms?.pendingProposal;
        const needsAction =
          room.status === "Active" &&
          Boolean(proposal) &&
          proposal?.proposedById !== currentUserId;
        const time = Date.parse(room.createdAt);
        const isExchangeRoom = room.terms?.mode === "Exchange";
        return {
          type: "purchase",
          tab: isExchangeRoom ? "exchange" : "buy",
          id: `purchase-${room.id}`,
          time: Number.isFinite(time) ? time : 0,
          searchText: `${partner.displayName} ${room.id}`.toLowerCase(),
          needsAction,
          room,
        };
      });

    const exchangeItems: CombinedTransactionItem[] = allExchanges.map(
      (exchange) => {
        const isInitiator = exchange.initiatorId === currentUserId;
        const partnerBooks = exchange.agreement
          ? isInitiator
            ? [exchange.agreement.recipientBook]
            : exchange.agreement.initiatorBooks
          : [];
        const myBooks = exchange.agreement
          ? isInitiator
            ? exchange.agreement.initiatorBooks
            : [exchange.agreement.recipientBook]
          : [];
        const titles = [...partnerBooks, ...myBooks]
          .map((snap) => snap.book.title)
          .join(" ");
        const partnerName = partnerBooks[0]?.ownerDisplayName ?? "";
        const time = Date.parse(exchange.updatedAt ?? exchange.createdAt);
        return {
          type: "exchange",
          tab: "exchange",
          id: `exchange-${exchange.id}`,
          time: Number.isFinite(time) ? time : 0,
          searchText:
            `${partnerName} ${titles} ${exchange.id.slice(0, 8)}`.toLowerCase(),
          needsAction: doesExchangeNeedAction(exchange, currentUserId),
          exchange,
        };
      },
    );

    const auctionItems: CombinedTransactionItem[] = allAuctions.map((item) => {
      const meta = getAuctionStatusMeta(item, auctionNowMs);
      const time = Date.parse(item.auction.endAt);
      return {
        type: "auction",
        tab: "auction",
        id: `auction-${item.auction.id}`,
        time: Number.isFinite(time) ? time : 0,
        searchText:
          `${item.auction.title} ${item.auction.pointName}`.toLowerCase(),
        needsAction: meta.needsAction,
        item,
      };
    });

    return [...purchaseItems, ...exchangeItems, ...auctionItems].sort(
      (a, b) => {
        if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
        return b.time - a.time;
      },
    );
  }, [allRooms, allExchanges, allAuctions, currentUserId, auctionNowMs]);

  const counts = useMemo<Record<TransactionTab, number>>(
    () => ({
      all: combinedItems.length,
      buy: combinedItems.filter((item) => item.tab === "buy").length,
      exchange: combinedItems.filter((item) => item.tab === "exchange").length,
      auction: combinedItems.filter((item) => item.tab === "auction").length,
    }),
    [combinedItems],
  );

  const attention = useMemo<Record<TransactionTab, number>>(
    () => ({
      all: combinedItems.filter((item) => item.needsAction).length,
      buy: combinedItems.filter((item) => item.tab === "buy" && item.needsAction)
        .length,
      exchange: combinedItems.filter(
        (item) => item.tab === "exchange" && item.needsAction,
      ).length,
      auction: combinedItems.filter(
        (item) => item.tab === "auction" && item.needsAction,
      ).length,
    }),
    [combinedItems],
  );

  const filteredItems = useMemo(() => {
    let result =
      activeTab === "all"
        ? combinedItems
        : combinedItems.filter((item) => item.tab === activeTab);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((item) => item.searchText.includes(q));
    }
    return result;
  }, [combinedItems, activeTab, searchQuery]);

  if (!isAuthenticated) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <View
          style={[
            styles.wineHeader,
            { paddingTop: Math.max(insets.top, 10) + 6 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={8}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.headerCircleBtn,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="back" size={19} color={stitchTokens.white} />
          </Pressable>
          <View style={styles.headerTitleCol}>
            <AppText style={styles.headerTitle}>Giao dịch của bạn</AppText>
            <AppText style={styles.headerSubtitle}>
              Mua ngay, đổi sách và đấu giá
            </AppText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.guestWrap}>
          <StatePanel
            title="Đăng nhập để xem giao dịch"
            message="Theo dõi hội thoại mua ngay, phiếu đổi sách và các phiên đấu giá tại cùng một nơi."
            action={{
              label: "Đăng nhập ngay",
              onPress: () => router.push("/account"),
            }}
          />
        </View>

        <View
          style={[
            styles.footerContainer,
            { paddingBottom: Math.max(insets.bottom, 8) },
          ]}
        >
          <MemberNavigation />
        </View>
      </View>
    );
  }

  const isRefreshing =
    conversationsQuery.isRefetching ||
    exchangesQuery.isRefetching ||
    auctionsQuery.isRefetching;
  const isInitialLoading =
    combinedItems.length === 0 &&
    (conversationsQuery.isPending ||
      exchangesQuery.isPending ||
      auctionsQuery.isPending);

  const failedSources: string[] = [];
  if (conversationsQuery.isError) failedSources.push("mua ngay");
  if (exchangesQuery.isError) failedSources.push("đổi sách");
  if (auctionsQuery.isError) failedSources.push("đấu giá");

  const attentionBreakdown = [
    attention.buy ? `${attention.buy} mua ngay` : "",
    attention.exchange ? `${attention.exchange} đổi sách` : "",
    attention.auction ? `${attention.auction} đấu giá` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const headerSubtitle =
    counts.all > 0
      ? attention.all > 0
        ? `${counts.all} giao dịch · ${attention.all} cần xử lý`
        : `${counts.all} giao dịch đang theo dõi`
      : "Mua ngay, đổi sách và đấu giá";

  const handleRefreshAll = () => {
    void conversationsQuery.refetch();
    void exchangesQuery.refetch();
    void auctionsQuery.refetch();
  };

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" />

      {/* 1. Unified Curved Deep-Wine App Header */}
      <View
        style={[
          styles.wineHeader,
          { paddingTop: Math.max(insets.top, 10) + 6 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          hitSlop={8}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.headerCircleBtn,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="back" size={19} color={stitchTokens.white} />
        </Pressable>

        <View style={styles.headerTitleCol}>
          <AppText style={styles.headerTitle}>Giao dịch của bạn</AppText>
          <AppText style={styles.headerSubtitle} numberOfLines={1}>
            {headerSubtitle}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            searchOpen ? "Đóng tìm kiếm" : "Tìm kiếm giao dịch"
          }
          hitSlop={8}
          onPress={() => {
            setSearchOpen((prev) => {
              if (prev) setSearchQuery("");
              return !prev;
            });
          }}
          style={({ pressed }) => [
            styles.headerCircleBtn,
            searchOpen && styles.headerCircleBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Icon
            name={searchOpen ? "close" : "search"}
            size={18}
            color={stitchTokens.gold}
          />
        </Pressable>
      </View>

      {/* 2. Collapsible Search Bar */}
      {searchOpen && (
        <View style={styles.searchWrap}>
          <SearchField
            label="Tìm kiếm giao dịch"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm tên sách, đối tác hoặc mã phiếu…"
          />
        </View>
      )}

      {/* 3. Scrollable 4-Tab Bar (synced with Member Web TransactionHub) */}
      <View style={styles.tabsOuter}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {TRANSACTION_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key];
            const hasAttention = attention[tab.key] > 0;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label}, ${count} giao dịch`}
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [
                  styles.tabChip,
                  isActive && styles.tabChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  style={[
                    styles.tabChipText,
                    isActive && styles.tabChipTextActive,
                  ]}
                >
                  {tab.label}
                </AppText>
                <View
                  style={[
                    styles.tabCountBadge,
                    isActive && styles.tabCountBadgeActive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.tabCountText,
                      isActive && styles.tabCountTextActive,
                    ]}
                  >
                    {count}
                  </AppText>
                </View>
                {hasAttention && (
                  <View
                    style={[
                      styles.tabAttentionDot,
                      isActive && styles.tabAttentionDotActive,
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 4. Transaction List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshAll}
            tintColor={stitchTokens.wineDark}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeaderStack}>
            {attention.all > 0 && activeTab === "all" && !searchQuery && (
              <View style={styles.attentionStrip}>
                <Icon name="clock" size={16} color={stitchTokens.wine} />
                <AppText style={styles.attentionText}>
                  {attention.all} giao dịch đang chờ bạn xử lý
                  {attentionBreakdown ? ` (${attentionBreakdown})` : ""}.
                </AppText>
              </View>
            )}

            {failedSources.length > 0 && (
              <View style={styles.errorWrap}>
                <Notice tone="error">
                  Chưa cập nhật được mục {failedSources.join(", ")}. Dữ liệu đã
                  tải vẫn được giữ nguyên.
                </Notice>
                <Button
                  title="Tải lại"
                  secondary
                  onPress={handleRefreshAll}
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={styles.centerWrap}>
              <StatePanel loading title="Đang tải danh sách giao dịch…" />
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Icon
                  name={
                    activeTab === "exchange"
                      ? "swap"
                      : activeTab === "auction"
                        ? "gavel"
                        : "message"
                  }
                  size={28}
                  color={stitchTokens.wine}
                />
              </View>
              <AppText style={styles.emptyTitle}>
                {searchQuery
                  ? "Không tìm thấy giao dịch phù hợp"
                  : activeTab === "buy"
                    ? "Chưa có hội thoại mua ngay"
                    : activeTab === "exchange"
                      ? "Chưa có giao dịch đổi sách"
                      : activeTab === "auction"
                        ? "Chưa có phiên đấu giá nào"
                        : "Chưa có giao dịch nào"}
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {searchQuery
                  ? "Thử tìm lại với tên sách, tên đối tác hoặc mã phiếu khác."
                  : activeTab === "auction"
                    ? "Các phiên bạn đang trả giá hoặc mở bán sẽ xuất hiện tại đây cùng mức giá hiện tại."
                    : "Mở một cuốn sách trên kệ để hỏi mua, gửi đề nghị đổi sách hoặc tham gia đấu giá."}
              </AppText>
              {!searchQuery && (
                <View style={styles.emptyActionWrap}>
                  <Button
                    title={
                      activeTab === "auction"
                        ? "Xem phiên đang mở"
                        : "Khám phá kệ sách"
                    }
                    wine
                    onPress={() =>
                      router.push(activeTab === "auction" ? "/auctions" : "/search")
                    }
                  />
                </View>
              )}
            </View>
          )
        }
        renderItem={({ item }) => {
          if (item.type === "purchase") {
            return (
              <PurchaseTransactionCard
                room={item.room}
                currentUserId={currentUserId}
                onPress={() =>
                  router.push({
                    pathname: "/conversation",
                    params: { id: item.room.id },
                  })
                }
              />
            );
          }
          if (item.type === "exchange") {
            return (
              <ExchangeTransactionCard
                exchange={item.exchange}
                currentUserId={currentUserId}
                onPress={() =>
                  router.push({
                    pathname: "/exchange",
                    params: { id: item.exchange.id },
                  })
                }
              />
            );
          }
          return (
            <AuctionTransactionCard
              item={item.item}
              nowMs={auctionNowMs}
              onPress={() =>
                router.push({
                  pathname: "/auction",
                  params: { id: item.item.auction.id },
                })
              }
            />
          );
        }}
        ListFooterComponent={
          !isInitialLoading ? (
            <View style={styles.shortcutsCard}>
              <AppText style={styles.shortcutsTitle}>Quản lý chi tiết</AppText>
              <View style={styles.shortcutsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mở đơn mua ngay"
                  onPress={() => router.push("/orders")}
                  style={({ pressed }) => [
                    styles.shortcutTile,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name="bag" size={18} color={stitchTokens.wine} />
                  <AppText style={styles.shortcutLabel} numberOfLines={1}>
                    Đơn mua
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mở lịch sử đổi sách"
                  onPress={() => router.push("/exchanges")}
                  style={({ pressed }) => [
                    styles.shortcutTile,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name="swap" size={18} color={stitchTokens.wine} />
                  <AppText style={styles.shortcutLabel} numberOfLines={1}>
                    Đổi sách
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mở phiên đấu giá của tôi"
                  onPress={() => router.push("/my-auctions")}
                  style={({ pressed }) => [
                    styles.shortcutTile,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name="gavel" size={18} color={stitchTokens.wine} />
                  <AppText style={styles.shortcutLabel} numberOfLines={1}>
                    Đấu giá
                  </AppText>
                </Pressable>
              </View>
            </View>
          ) : null
        }
      />

      {/* 5. Bottom Navigation Bar (no wrong tab highlighted on global Transaction Hub) */}
      <View
        style={[
          styles.footerContainer,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <MemberNavigation />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  wineHeader: {
    backgroundColor: stitchTokens.wineDark,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  headerCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCircleBtnActive: {
    backgroundColor: stitchTokens.whiteAlpha25,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: stitchTokens.white,
    lineHeight: 24,
  },
  headerSubtitle: {
    fontSize: 12,
    color: stitchTokens.gold,
    fontWeight: "600",
    marginTop: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  searchWrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  tabsOuter: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  tabsRow: {
    paddingHorizontal: space.lg,
    gap: 6,
    alignItems: "center",
    flexGrow: 1,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 5,
  },
  tabChipActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  tabChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  tabChipTextActive: {
    color: stitchTokens.white,
  },
  tabCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: stitchTokens.canvasMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountBadgeActive: {
    backgroundColor: stitchTokens.whiteAlpha20,
  },
  tabCountText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  tabCountTextActive: {
    color: stitchTokens.gold,
  },
  tabAttentionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: stitchTokens.orangeDeep,
  },
  tabAttentionDotActive: {
    backgroundColor: stitchTokens.gold,
  },
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: 12,
    flexGrow: 1,
  },
  listHeaderStack: {
    gap: 10,
  },
  attentionStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attentionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    lineHeight: 19,
  },
  errorWrap: {
    gap: 8,
  },
  txnCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 12,
  },
  txnCardAttention: {
    backgroundColor: stitchTokens.warmIvory,
    borderColor: stitchTokens.peachBorder,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bookCoverFrame: {
    width: 60,
    height: 90,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    position: "relative",
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stitchTokens.parchment,
  },
  coverCountChip: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  coverCountText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  categoryWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  timeText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "500",
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    lineHeight: 21,
  },
  partnerLine: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.warmBorder,
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    includeFontPadding: false,
  },
  actionCueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  actionCueText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  actionCueTextUrgent: {
    color: stitchTokens.wine,
  },
  shortcutsCard: {
    marginTop: 6,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 10,
  },
  shortcutsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  shortcutsRow: {
    flexDirection: "row",
    gap: 10,
  },
  shortcutTile: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  shortcutLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
  },
  centerWrap: {
    paddingVertical: space.section,
  },
  guestWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyActionWrap: {
    marginTop: 8,
    width: "100%",
  },
  footerContainer: {
    backgroundColor: colorRoles.navigationBackground,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
});
