import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  AppText,
  AppTextInput,
  Button,
  Icon,
  StatePanel,
  TopNavbar,
  colorRoles,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import { useSession } from "../../core/session/session-provider";
import { publicListing } from "../shelf/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  formatDateTimeVi,
  getPurchaseConversations,
  statusLabels,
} from "./purchase-conversation-service";
import type { PurchaseConversation } from "./contracts";
import type { Exchange } from "../exchanges/contracts";
import { exchangePageSchema, mapExchangeStatusInfo } from "../exchanges/contracts";

type InboxFilterTab = "all" | "exchange" | "action_needed" | "active" | "order_created";

const FILTER_TABS: { key: InboxFilterTab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "exchange", label: "Trao đổi sách" },
  { key: "action_needed", label: "Cần phản hồi" },
  { key: "active", label: "Đang thương lượng" },
  { key: "order_created", label: "Đã tạo đơn" },
];

function ConversationInboxItem({
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

  // Fetch listing details for book identity
  const listingQuery = useQuery({
    queryKey: ["public-listing", room.listingId],
    queryFn: () =>
      client.publicRequest(`/listings/${room.listingId}`, publicListing),
    staleTime: 60000,
  });

  const listing = listingQuery.data;
  const bookTitle = listing?.book.title ?? "Đang tải thông tin sách…";
  const primaryPhoto = listing?.photos?.[0];
  const revisionId = listing?.revisionId;

  const proposal = room.terms?.pendingProposal;
  const isActionNeeded =
    Boolean(proposal) && proposal?.proposedById !== currentUserId;
  const isWaitingPartner =
    Boolean(proposal) && proposal?.proposedById === currentUserId;

  // Snippet text & tone
  let snippet = "Chưa có tin nhắn mới";
  let snippetHighlight = false;

  if (isActionNeeded) {
    snippet =
      proposal?.kind === "Price"
        ? `⚡ Đối tác đề nghị giá ${formatVnd(proposal.amount ?? 0)} - Cần bạn phản hồi`
        : "⚡ Đối tác đề nghị đổi sách - Cần bạn phản hồi";
    snippetHighlight = true;
  } else if (isWaitingPartner) {
    snippet = "Đang chờ đối tác phản hồi đề xuất của bạn…";
  } else if (room.status === "OrderCreated") {
    snippet = isBuyer
      ? "📦 Người bán đã tạo đơn - Bấm để thanh toán"
      : "📦 Bạn đã tạo đơn - Chờ người mua thanh toán";
    snippetHighlight = true;
  } else if (room.terms?.agreedPrice != null) {
    snippet = `Đã thống nhất giá: ${formatVnd(room.terms.agreedPrice)}`;
  } else if (room.terms?.mode === "Exchange") {
    snippet = "Đang trao đổi về sách và phương thức giao nhận";
  } else {
    snippet = "Đang trao đổi về tình trạng sách và giá";
  }

  const isExchange = room.terms?.mode === "Exchange";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cuộc trò chuyện với ${partner.displayName}`}
      style={({ pressed }) => [
        styles.itemCard,
        isActionNeeded && styles.itemCardActionNeeded,
        pressed && styles.itemPressed,
      ]}
      onPress={onPress}
    >
      {/* 1. Partner Avatar */}
      <View style={styles.avatarCol}>
        <View style={styles.avatarCircle}>
          <AppText style={styles.avatarText}>
            {partner.displayName.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        {isActionNeeded && <View style={styles.unreadBadgeDot} />}
      </View>

      {/* 2. Main Conversation Content */}
      <View style={styles.contentCol}>
        {/* Top: Partner Name + Role Tag + Timestamp */}
        <View style={styles.nameRow}>
          <View style={styles.nameGroup}>
            <AppText numberOfLines={1} style={styles.partnerName}>
              {partner.displayName}
            </AppText>
            <View
              style={[
                styles.roleTag,
                isBuyer ? styles.roleTagSeller : styles.roleTagBuyer,
              ]}
            >
              <AppText
                style={[
                  styles.roleTagText,
                  isBuyer
                    ? styles.roleTagTextSeller
                    : styles.roleTagTextBuyer,
                ]}
              >
                {isBuyer ? "Người bán" : "Người mua"}
              </AppText>
            </View>
          </View>

          <AppText style={styles.timeText}>
            {formatDateTimeVi(room.createdAt)}
          </AppText>
        </View>

        {/* Middle: Associated Book Badge (Shopee Chat style) */}
        <View style={styles.bookSnippetRow}>
          <View style={styles.bookMiniCover}>
            {primaryPhoto && revisionId ? (
              <PublicPhoto
                listingId={room.listingId}
                revisionId={revisionId}
                mediaId={primaryPhoto.id}
                label={bookTitle}
                active={true}
                compact
              />
            ) : (
              <Icon name="book" size={14} color={stitchTokens.wineDark} />
            )}
          </View>
          <AppText numberOfLines={1} style={styles.bookMiniTitle}>
            {bookTitle}
          </AppText>
          <View style={styles.modePill}>
            <AppText style={styles.modePillText}>
              {isExchange ? "Đổi" : "Mua"}
            </AppText>
          </View>
        </View>

        {/* Bottom: Latest Status Snippet */}
        <View style={styles.snippetRow}>
          <AppText
            numberOfLines={1}
            style={[
              styles.snippetText,
              snippetHighlight && styles.snippetTextHighlight,
            ]}
          >
            {snippet}
          </AppText>
          <View
            style={[
              styles.statusPill,
              room.status === "Active"
                ? styles.statusActive
                : room.status === "OrderCreated"
                  ? styles.statusOrder
                  : styles.statusClosed,
            ]}
          >
            <AppText
              style={[
                styles.statusText,
                room.status === "Active"
                  ? styles.statusTextActive
                  : room.status === "OrderCreated"
                    ? styles.statusTextOrder
                    : styles.statusTextClosed,
              ]}
            >
              {statusLabels[room.status] ?? room.status}
            </AppText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ExchangeInboxItem({
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

  const targetListingId = isInitiator
    ? exchange.recipientListingId
    : (exchange.initiatorListingIds?.[0] ?? exchange.initiatorListingId);

  const listingQuery = useQuery({
    queryKey: ["public-listing", targetListingId],
    queryFn: () =>
      client.publicRequest(`/listings/${targetListingId}`, publicListing),
    staleTime: 60000,
    enabled: Boolean(targetListingId),
  });

  const listing = listingQuery.data;
  const partnerName =
    listing?.seller.displayName ?? (isInitiator ? "Đối tác" : "Người đề nghị");
  const bookTitle = listing?.book.title ?? "Đang tải thông tin sách…";
  const primaryPhoto = listing?.photos?.[0];
  const revisionId = listing?.revisionId;

  const statusInfo = mapExchangeStatusInfo(exchange.status, isInitiator);

  const isActionNeeded =
    (exchange.status === "Proposed" && !isInitiator) ||
    (exchange.status === "AcceptedAwaitingFunding" &&
      !(isInitiator ? exchange.initiatorFundedAt : exchange.recipientFundedAt)) ||
    (exchange.status === "Preparing" &&
      !(isInitiator ? exchange.initiatorShippedAt : exchange.recipientShippedAt));

  let snippet = "Đang trao đổi về sách và phương thức giao nhận";
  let snippetHighlight = false;

  if (exchange.status === "Proposed") {
    if (isInitiator) {
      snippet = "Đang chờ đối tác duyệt đề nghị đổi sách của bạn…";
    } else {
      snippet = `⚡ Đối tác gửi đề nghị đổi sách ${
        exchange.diffAmount > 0
          ? "(Bù " + formatVnd(exchange.diffAmount) + ")"
          : "(Ngang giá)"
      } - Cần bạn phản hồi`;
      snippetHighlight = true;
    }
  } else if (exchange.status === "AcceptedAwaitingFunding") {
    snippet = "Đã đồng ý trao đổi · Chờ đặt cọc bảo chứng";
    snippetHighlight = isActionNeeded;
  } else if (exchange.status === "Preparing") {
    snippet = "Đã cọc bảo chứng · Đang chuẩn bị gửi sách trong 72h";
    snippetHighlight = isActionNeeded;
  } else if (exchange.status === "InTransit") {
    snippet = "Sách đang được vận chuyển tới bạn";
  } else if (exchange.status === "Completed") {
    snippet = "Giao dịch trao đổi sách đã hoàn tất thành công";
  } else if (exchange.status === "Cancelled") {
    snippet = "Giao dịch trao đổi đã kết thúc/hủy";
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cuộc trao đổi sách với ${partnerName}`}
      style={({ pressed }) => [
        styles.itemCard,
        isActionNeeded && styles.itemCardActionNeeded,
        pressed && styles.itemPressed,
      ]}
      onPress={onPress}
    >
      {/* 1. Partner Avatar */}
      <View style={styles.avatarCol}>
        <View
          style={[
            styles.avatarCircle,
            { backgroundColor: stitchTokens.amberBg },
          ]}
        >
          <AppText
            style={[styles.avatarText, { color: stitchTokens.wineDark }]}
          >
            {partnerName.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        {isActionNeeded && <View style={styles.unreadBadgeDot} />}
      </View>

      {/* 2. Main Content */}
      <View style={styles.contentCol}>
        <View style={styles.nameRow}>
          <View style={styles.nameGroup}>
            <AppText numberOfLines={1} style={styles.partnerName}>
              {partnerName}
            </AppText>
            <View
              style={[
                styles.roleTag,
                { backgroundColor: stitchTokens.tagExchangeBg },
              ]}
            >
              <AppText
                style={[
                  styles.roleTagText,
                  { color: stitchTokens.tagExchangeText },
                ]}
              >
                Trao đổi sách
              </AppText>
            </View>
          </View>

          <AppText style={styles.timeText}>
            {formatDateTimeVi(exchange.updatedAt ?? exchange.createdAt)}
          </AppText>
        </View>

        {/* Middle: Book Snippet */}
        <View style={styles.bookSnippetRow}>
          <View style={styles.bookMiniCover}>
            {primaryPhoto && revisionId && targetListingId ? (
              <PublicPhoto
                listingId={targetListingId}
                revisionId={revisionId}
                mediaId={primaryPhoto.id}
                label={bookTitle}
                active={true}
                compact
              />
            ) : (
              <Icon name="swap" size={14} color={stitchTokens.wineDark} />
            )}
          </View>
          <AppText numberOfLines={1} style={styles.bookMiniTitle}>
            {bookTitle}
          </AppText>
          <View
            style={[
              styles.modePill,
              { backgroundColor: stitchTokens.amberBg },
            ]}
          >
            <AppText
              style={[
                styles.modePillText,
                { color: stitchTokens.wineDark },
              ]}
            >
              {exchange.diffAmount > 0
                ? (isInitiator
                    ? exchange.diffPayerId === exchange.initiatorId
                      ? "Bù "
                      : "Nhận "
                    : exchange.diffPayerId === exchange.recipientId
                      ? "Bù "
                      : "Nhận ") + formatVnd(exchange.diffAmount)
                : "Ngang giá"}
            </AppText>
          </View>
        </View>

        {/* Bottom: Latest Status Snippet */}
        <View style={styles.snippetRow}>
          <AppText
            numberOfLines={1}
            style={[
              styles.snippetText,
              snippetHighlight && styles.snippetTextHighlight,
            ]}
          >
            {snippet}
          </AppText>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusInfo.badgeBg },
            ]}
          >
            <AppText
              style={[
                styles.statusText,
                { color: statusInfo.badgeColor },
              ]}
            >
              {statusInfo.label}
            </AppText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

type CombinedInboxItem =
  | {
      type: "purchase";
      id: string;
      time: number;
      searchName: string;
      isActionNeeded: boolean;
      room: PurchaseConversation;
    }
  | {
      type: "exchange";
      id: string;
      time: number;
      searchName: string;
      isActionNeeded: boolean;
      exchange: Exchange;
    };

export function ChatInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const [activeTab, setActiveTab] = useState<InboxFilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const currentUserId = state.status === "authenticated" ? state.user.id : "";

  const conversationsQuery = useQuery({
    queryKey: ["purchase-conversations"],
    queryFn: () => getPurchaseConversations(client),
    enabled: state.status === "authenticated",
    refetchInterval: 5000,
  });

  const exchangesQuery = useQuery({
    queryKey: ["my-exchanges"],
    queryFn: () => client.request("/exchanges", exchangePageSchema),
    enabled: state.status === "authenticated",
    refetchInterval: 5000,
  });

  const allRooms = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  const allExchanges = useMemo(
    () => exchangesQuery.data?.items ?? [],
    [exchangesQuery.data],
  );

  const actionNeededCount = useMemo(() => {
    const purchaseCount = allRooms.filter(
      (r) =>
        r.status === "Active" &&
        r.terms?.pendingProposal &&
        r.terms.pendingProposal.proposedById !== currentUserId,
    ).length;
    const exchangeCount = allExchanges.filter((e) => {
      const isInitiator = e.initiatorId === currentUserId;
      return (
        (e.status === "Proposed" && !isInitiator) ||
        (e.status === "AcceptedAwaitingFunding" &&
          !(isInitiator ? e.initiatorFundedAt : e.recipientFundedAt)) ||
        (e.status === "Preparing" &&
          !(isInitiator ? e.initiatorShippedAt : e.recipientShippedAt))
      );
    }).length;
    return purchaseCount + exchangeCount;
  }, [allRooms, allExchanges, currentUserId]);

  const allCombinedItems = useMemo<CombinedInboxItem[]>(() => {
    const pItems: CombinedInboxItem[] = allRooms.map((room) => {
      const isBuyer = room.buyer.id === currentUserId;
      const partner = isBuyer ? room.seller : room.buyer;
      const proposal = room.terms?.pendingProposal;
      const isActionNeeded =
        Boolean(proposal) && proposal?.proposedById !== currentUserId;
      const time = new Date(room.createdAt).getTime();
      return {
        type: "purchase",
        id: `purchase-${room.id}`,
        time: isNaN(time) ? 0 : time,
        searchName: partner.displayName.toLowerCase(),
        isActionNeeded,
        room,
      };
    });

    const eItems: CombinedInboxItem[] = allExchanges.map((exchange) => {
      const isInitiator = exchange.initiatorId === currentUserId;
      const isActionNeeded =
        (exchange.status === "Proposed" && !isInitiator) ||
        (exchange.status === "AcceptedAwaitingFunding" &&
          !(isInitiator ? exchange.initiatorFundedAt : exchange.recipientFundedAt)) ||
        (exchange.status === "Preparing" &&
          !(isInitiator ? exchange.initiatorShippedAt : exchange.recipientShippedAt));
      const time = new Date(exchange.updatedAt ?? exchange.createdAt).getTime();
      return {
        type: "exchange",
        id: `exchange-${exchange.id}`,
        time: isNaN(time) ? 0 : time,
        searchName: "",
        isActionNeeded,
        exchange,
      };
    });

    return [...pItems, ...eItems].sort((a, b) => b.time - a.time);
  }, [allRooms, allExchanges, currentUserId]);

  // Filter and search
  const filteredItems = useMemo(() => {
    let result = allCombinedItems;

    // Filter by tab
    if (activeTab === "exchange") {
      result = result.filter((item) => item.type === "exchange");
    } else if (activeTab === "action_needed") {
      result = result.filter((item) => item.isActionNeeded);
    } else if (activeTab === "active") {
      result = result.filter((item) =>
        item.type === "purchase"
          ? item.room.status === "Active"
          : [
              "Proposed",
              "AcceptedAwaitingFunding",
              "Preparing",
              "InTransit",
            ].includes(item.exchange.status),
      );
    } else if (activeTab === "order_created") {
      result = result.filter((item) =>
        item.type === "purchase"
          ? item.room.status === "OrderCreated"
          : ["Preparing", "InTransit", "Completed"].includes(
              item.exchange.status,
            ),
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        if (item.type === "purchase") {
          return item.searchName.includes(q);
        }
        return true;
      });
    }

    return result;
  }, [allCombinedItems, activeTab, searchQuery]);

  if (state.status !== "authenticated") {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <TopNavbar
          subtitle="HỘP THƯ CHAT"
          onNotificationsPress={() => router.push("/")}
          onMessagesPress={() => {}}
        />
        <View style={styles.subHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/account");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>
          <AppText style={styles.subHeaderTitle}>Hộp thư trò chuyện</AppText>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StatePanel
            title="Đăng nhập để xem tin nhắn"
            message="Bạn cần đăng nhập để xem lịch sử trò chuyện và thương lượng sách cùng người bán."
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
          <MemberNavigation current="/account" />
        </View>
      </View>
    );
  }

  const isRefreshing =
    conversationsQuery.isRefetching || exchangesQuery.isRefetching;
  const isLoading =
    conversationsQuery.isLoading || exchangesQuery.isLoading;

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" />

      {/* 1. Header Đỉnh Đỏ Rượu Vang của Lật Lại (TopNavbar) */}
      <TopNavbar
        subtitle="HỘP THƯ CHAT"
        onNotificationsPress={() => router.push("/")}
        onMessagesPress={() => {}}
      />

      {/* 2. Subheader điều hướng Quay lại & Tiêu đề */}
      <View style={styles.subHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/account");
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon name="back" size={18} color={stitchTokens.wineDark} />
          <AppText style={styles.backLabel}>Quay lại</AppText>
        </Pressable>

        <View style={styles.subHeaderCenter}>
          <AppText style={styles.subHeaderTitle}>Tin nhắn thương lượng</AppText>
          {allCombinedItems.length > 0 && (
            <AppText style={styles.subHeaderSubtitle}>
              {allCombinedItems.length} cuộc hội thoại
            </AppText>
          )}
        </View>

        <View style={{ width: 60 }} />
      </View>

      {/* 3. Ô tìm kiếm cuộc trò chuyện (Shopee Chat Search) */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.muted} />
          <AppTextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm theo tên người bán / người mua…"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
          />
          {Boolean(searchQuery) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa tìm kiếm"
              onPress={() => setSearchQuery("")}
              style={styles.clearSearchBtn}
            >
              <Icon name="close" size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* 4. Thanh tab lọc nhanh Shopee (Pills Bar) */}
      <View style={styles.filterTabsContainer}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const showBadge = tab.key === "action_needed" && actionNeededCount > 0;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <AppText
                style={[
                  styles.filterTabText,
                  isActive && styles.filterTabTextActive,
                ]}
              >
                {tab.label}
              </AppText>
              {showBadge && (
                <View style={styles.tabBadge}>
                  <AppText style={styles.tabBadgeText}>
                    {actionNeededCount}
                  </AppText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* 5. Danh sách các cuộc trò chuyện (Chat List) */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void conversationsQuery.refetch();
              void exchangesQuery.refetch();
            }}
            tintColor={stitchTokens.wineDark}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <StatePanel loading title="Đang tải danh sách cuộc trò chuyện…" />
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Icon name="message" size={32} color={stitchTokens.wineDark} />
              </View>
              <AppText style={styles.emptyTitle}>
                {searchQuery
                  ? "Không tìm thấy cuộc trò chuyện phù hợp"
                  : activeTab === "action_needed"
                    ? "Không có đề xuất nào cần phản hồi"
                    : activeTab === "exchange"
                      ? "Chưa có đề nghị trao đổi sách nào"
                      : "Chưa có cuộc trò chuyện nào"}
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {searchQuery
                  ? "Hãy thử tìm kiếm với tên đối tác khác."
                  : "Mở chi tiết một cuốn sách bất kỳ trên kệ và bấm 'Chat với người bán' hoặc 'Đổi sách' để bắt đầu thương lượng."}
              </AppText>
              {!searchQuery && (
                <View style={styles.emptyBtnWrapper}>
                  <Button
                    title="Khám phá sách ngay"
                    onPress={() => router.push("/")}
                  />
                </View>
              )}
            </View>
          )
        }
        renderItem={({ item }) => {
          if (item.type === "purchase") {
            return (
              <ConversationInboxItem
                room={item.room}
                currentUserId={currentUserId}
                onPress={() => {
                  router.push({
                    pathname: "/conversation",
                    params: { id: item.room.id },
                  });
                }}
              />
            );
          }
          return (
            <ExchangeInboxItem
              exchange={item.exchange}
              currentUserId={currentUserId}
              onPress={() => {
                router.push({
                  pathname: "/exchange",
                  params: { id: item.exchange.id },
                });
              }}
            />
          );
        }}
      />

      {/* 6. Thanh Điều Hướng Đáy Navbar (MemberNavigation 5 tabs) */}
      <View
        style={[
          styles.footerContainer,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <MemberNavigation current="/account" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  subHeader: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  subHeaderCenter: {
    flex: 1,
    alignItems: "center",
  },
  subHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  subHeaderSubtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.7,
  },
  footerContainer: {
    backgroundColor: colorRoles.navigationBackground,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  searchContainer: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    height: 38,
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  filterTabsContainer: {
    flexDirection: "row",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: stitchTokens.parchment,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    gap: space.xs,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  filterTabActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  filterTabTextActive: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
  tabBadge: {
    backgroundColor: stitchTokens.orangeDeep,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  listContainer: {
    paddingVertical: space.xs,
    flexGrow: 1,
  },
  itemCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    gap: space.sm,
  },
  itemCardActionNeeded: {
    backgroundColor: stitchTokens.warmIvory,
  },
  itemPressed: {
    opacity: 0.88,
  },
  avatarCol: {
    position: "relative",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: stitchTokens.white,
    fontWeight: "800",
    fontSize: 16,
  },
  unreadBadgeDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: stitchTokens.orangeDeep,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nameGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    maxWidth: 160,
  },
  roleTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  roleTagSeller: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  roleTagBuyer: {
    backgroundColor: stitchTokens.parchment,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: "600",
  },
  roleTagTextSeller: {
    color: stitchTokens.wineDark,
  },
  roleTagTextBuyer: {
    color: colors.muted,
  },
  timeText: {
    fontSize: 11,
    color: colors.muted,
  },
  bookSnippetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.small,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  bookMiniCover: {
    width: 16,
    height: 22,
    borderRadius: radius.book,
    overflow: "hidden",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bookMiniTitle: {
    flex: 1,
    fontSize: 11,
    color: colors.ink,
    fontWeight: "600",
  },
  modePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  modePillText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  snippetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  snippetText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
  },
  snippetTextHighlight: {
    color: stitchTokens.orangeDeep,
    fontWeight: "600",
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusActive: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  statusOrder: {
    backgroundColor: stitchTokens.amberBg,
  },
  statusClosed: {
    backgroundColor: stitchTokens.canvasMuted,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statusTextActive: {
    color: stitchTokens.likeNewGreen,
  },
  statusTextOrder: {
    color: stitchTokens.orangeDeep,
  },
  statusTextClosed: {
    color: colors.muted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xl * 2,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyBtnWrapper: {
    marginTop: space.sm,
  },
});
