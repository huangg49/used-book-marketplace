import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { currentUserSchema } from "../../core/api/schemas";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { internalMemberViewsEnabled } from "../../core/config/internal-member-views";
import {
  AppModal,
  AppText,
  Button,
  Icon,
  type IconName,
  Notice,
  Screen,
  StatePanel,
  TopNavbar,
  formatVnd,
  presentError,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { summaryOptions } from "../wallet/wallet-model";
import { TopupModal } from "../wallet/topup-modal";
import { draftPage } from "../drafts/contracts";
import { useCatalogBook } from "../drafts/catalog-picker";
import { DraftCoverPhoto } from "../drafts/draft-cover-photo";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";
import { useNotifications } from "../notifications/notifications-model";
import { ordersPageSchema } from "../orders/contracts";
import { myAuctionPage } from "../auctions/contracts";

const roleLabels: Record<string, string> = {
  MEMBER: "Bạn đọc uy tín",
  STAFF: "Thư tịch viên (Nhân viên)",
  ADMIN: "Quản trị thư xã",
  TEST_OPERATOR: "Kiểm thử viên",
};

function SectionHeading({
  title,
  description,
  icon,
  actionText,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeadingRoot}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
        {icon && (
          <View style={styles.sectionHeadingIconCircle}>
            <Icon name={icon} size={18} color={stitchTokens.wine} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText kind="bold" style={styles.sectionHeadingTitle}>
            {title}
          </AppText>
          {description && (
            <AppText kind="small" color={stitchTokens.subtleGray} style={styles.sectionHeadingDesc}>
              {description}
            </AppText>
          )}
        </View>
      </View>
      {actionText && onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.sectionHeadingBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppText kind="bold" style={styles.sectionHeadingBtnText}>
            {actionText}
          </AppText>
          <Icon name="chevronRight" size={13} color={stitchTokens.wine} />
        </Pressable>
      )}
    </View>
  );
}

function RecentBookRow({ item }: { item: any }) {
  const bookId = item.currentRevision?.content?.bookId;
  const bookQuery = useCatalogBook(bookId);
  const mediaId = item.currentRevision?.content?.mediaIds?.[0];

  const bookTitle =
    bookQuery.data?.title ||
    (bookQuery.isPending && bookId
      ? "Đang tải tên sách…"
      : item.currentRevision?.content?.description?.slice(0, 30) ||
        "Bản sách đã lưu");

  const author = bookQuery.data?.authors?.join(" · ");
  const isApproved = item.state?.moderation === "Approved";
  const isPending = item.state?.moderation === "PendingReview";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Xem sách: ${bookTitle}`}
      onPress={() => router.push("./drafts")}
      style={styles.recentBookCard}
    >
      <View style={styles.recentCoverBox}>
        {mediaId ? (
          <DraftCoverPhoto
            listingId={item.id}
            mediaId={mediaId}
            label={bookTitle}
          />
        ) : (
          <Icon name="book" size={18} color={stitchTokens.wine} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AppText
            kind="bold"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              color: stitchTokens.wineDark,
            }}
            numberOfLines={1}
          >
            {bookTitle}
          </AppText>
          <View
            style={[
              styles.miniStatusBadge,
              {
                flexShrink: 0,
                backgroundColor: isApproved
                  ? stitchTokens.likeNewGreenBg
                  : isPending
                    ? stitchTokens.amberWarmBg
                    : stitchTokens.tagExchangeBg,
              },
            ]}
          >
            <AppText
              kind="small"
              style={{
                fontSize: 9,
                lineHeight: 13,
                fontWeight: "700",
                includeFontPadding: false,
                color: isApproved
                  ? stitchTokens.likeNewGreen
                  : isPending
                    ? stitchTokens.goldBronze
                    : stitchTokens.tagExchangeText,
              }}
            >
              {isApproved ? "ĐÃ DUYỆT" : isPending ? "CHỜ DUYỆT" : "BẢN NHÁP"}
            </AppText>
          </View>
        </View>
        <AppText
          kind="small"
          color={stitchTokens.subtleGray}
          style={{ fontSize: 11 }}
          numberOfLines={1}
        >
          {author
            ? `${author} · ${item.currentRevision?.content?.salePrice ? `Giá: ${formatVnd(item.currentRevision.content.salePrice)}` : "Trao đổi tự do"}`
            : item.currentRevision?.content?.salePrice
              ? `Giá: ${formatVnd(item.currentRevision.content.salePrice)}`
              : "Trao đổi tự do"}
        </AppText>
      </View>
    </Pressable>
  );
}

export function AccountScreen() {
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";
  const foreground = useForeground();
  const { fontScale } = useWindowDimensions();
  const [presentationVersion, setPresentationVersion] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [topupModalVisible, setTopupModalVisible] = useState(false);

  // Filter tabs for My Books (matches web DashboardMyBooks)
  const [shelfFilter, setShelfFilter] = useState<string>("Approved");


  const notifQuery = useNotifications(client, isAuthenticated);
  const notificationCount = isAuthenticated && notifQuery.data
    ? notifQuery.data.unreadCount
    : 0;

  useFocusEffect(
    useCallback(() => {
      setPresentationVersion((version) => version + 1);
    }, []),
  );

  const ownerId = state.status === "authenticated" ? state.user.id : "";
  const profile = useQuery({
    queryKey: ["me", ownerId],
    queryFn: () => client.request("/auth/me", currentUserSchema),
    enabled: foreground && !!ownerId,
    retry: false,
  });

  // 1. Wallet Data (Escrow & Available balance)
  const wallet = useQuery({
    ...summaryOptions(client, ownerId),
    enabled: foreground && !!ownerId && internalMemberViewsEnabled,
  });

  // 2. Books on Shelf / Drafts count & items
  const myDrafts = useQuery({
    queryKey: ["drafts", "overview", ownerId, shelfFilter],
    queryFn: () => {
      const modParam = shelfFilter !== "All" ? `&moderation=${encodeURIComponent(shelfFilter)}` : "";
      return client.request(`/me/listings?channel=Marketplace&limit=6${modParam}`, draftPage);
    },
    enabled: foreground && !!ownerId,
  });

  // The dashboard preview uses a single page; OrdersScreen caches infinite pages.
  const ordersQuery = useQuery({
    queryKey: ["my-orders", ownerId, "account-preview", 15],
    queryFn: () => client.request("/me/orders?limit=15", ordersPageSchema),
    enabled: foreground && !!ownerId,
    staleTime: 5_000,
  });

  // 5. Auctions Data
  const myAuctionsQuery = useQuery({
    queryKey: ["my-auctions-summary", ownerId],
    queryFn: () => client.request("/me/auctions", myAuctionPage),
    enabled: foreground && !!ownerId,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await client.logout();
      setLogoutConfirmOpen(false);
    } catch (cause) {
      setError(presentError(cause).message);
    } finally {
      setBusy(false);
    }
  };

  const isRestricted = profile.data?.status === "RESTRICTED";
  const isLocked = profile.data?.status === "LOCKED";
  const isActive = profile.data?.status === "ACTIVE";

  // Calculations for Stats
  const availableVnd = wallet.data?.available ?? 0;
  const heldVnd = wallet.data?.transactionHeld ?? 0;
  const latXu = Math.floor(availableVnd / 1000);

  const totalShelfBooks = myDrafts.data?.items?.length ?? 0;
  const totalShelfValue = myDrafts.data?.items?.reduce(
    (sum, item) => sum + (item.currentRevision?.content?.salePrice || 0),
    0
  ) ?? 0;

  const totalOrdersCount = ordersQuery.data?.items?.length ?? 0;
  const unpaidOrdersCount = useMemo(
    () =>
      ordersQuery.data?.items?.filter(
        (o) => o.state === "AwaitingPayment" && o.role === "Buyer",
      ).length ?? 0,
    [ordersQuery.data?.items],
  );



  // Auctions stats
  const auctionItems = myAuctionsQuery.data?.items ?? [];
  const activeAuctionsCount = auctionItems.filter(
    (a) => a.auction.state === "Active" || a.auction.state === "BuyNowPending"
  ).length;
  const needsPaymentAuctionsCount = auctionItems.filter((a) => a.needsPayment).length;
  const totalAuctionsCount = auctionItems.length;


  return (
    <Screen
      key={`${fontScale}:${presentationVersion}`}
      appearance="home"
      header={
        <TopNavbar
          notificationCount={notificationCount}
          onNotificationsPress={() => setNotificationsOpen(true)}
          onMessagesPress={() => router.push("/chat-inbox")}
        />
      }
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 18 }}>
        {profile.isPending ? (
          <StatePanel loading title="Đang tải hồ sơ bạn đọc…" />
        ) : null}
        {profile.error ? (
          <View style={{ marginTop: 8 }}>
            <Notice tone="error">{presentError(profile.error).message}</Notice>
            <Button
              title="Thử lại"
              secondary
              busy={profile.isFetching}
              onPress={() => void profile.refetch()}
            />
          </View>
        ) : null}

        {profile.data ? (
          <>
            {/* ==============================================================
                1. GREETING & IDENTITY BANNER (Tương ứng DashboardGreeting)
            ============================================================== */}
            <View style={styles.greetingCard}>
              {/* Badges Row */}
              <View style={styles.badgeRow}>
                <View style={styles.memberBadge}>
                  <Icon name="verified" size={13} color={stitchTokens.wine} />
                  <AppText kind="small" style={styles.memberBadgeText}>
                    HỘI VIÊN LẬT LẠI
                  </AppText>
                </View>

                {isActive ? (
                  <View style={styles.activeBadge}>
                    <View style={styles.greenPulseDot} />
                    <AppText kind="small" style={styles.activeBadgeText}>
                      Đang hoạt động
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.restrictedBadge}>
                    <Icon name="info" size={12} color={stitchTokens.darkRed} />
                    <AppText kind="small" style={styles.restrictedBadgeText}>
                      {isLocked ? "Đang khóa" : "Hạn chế"}
                    </AppText>
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setNotificationsOpen(true)}
                  style={styles.notifBadge}
                >
                  <Icon name="bell" size={12} color={notificationCount > 0 ? stitchTokens.orangeBurned : stitchTokens.subtleGray} />
                  <AppText
                    kind="small"
                    style={[
                      styles.notifBadgeText,
                      notificationCount > 0 && { color: stitchTokens.orangeBurned, fontWeight: "700" },
                    ]}
                  >
                    {notificationCount > 0 ? `${notificationCount} tin mới` : "Thông báo"}
                  </AppText>
                </Pressable>
              </View>

              {/* Profile Details */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem và sửa hồ sơ"
                  onPress={() => router.push("./profile")}
                  style={styles.avatarCircle}
                >
                  <AppText style={styles.avatarLetter}>
                    {profile.data.displayName?.charAt(0)?.toUpperCase() || "B"}
                  </AppText>
                  <View style={styles.verifiedCheckBadge}>
                    <Icon name="check" size={10} color={stitchTokens.white} />
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem và sửa hồ sơ"
                  onPress={() => router.push("./profile")}
                  style={{ flex: 1, minWidth: 0, gap: 2 }}
                >
                  <AppText kind="heading" style={styles.displayNameText} numberOfLines={1}>
                    {profile.data.displayName}
                  </AppText>

                  <View style={styles.roleBadgePill}>
                    <Icon name="verified" size={11} color={stitchTokens.goldDark} />
                    <AppText kind="small" style={styles.roleBadgeText}>
                      {roleLabels[profile.data.roles[0]] || "Thành viên Lật Lại"}
                    </AppText>
                  </View>

                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }} numberOfLines={1}>
                    {profile.data.email}
                  </AppText>
                </Pressable>
              </View>

              {/* Quick Action Row — 4 equal-width tiles on 1 row */}
              <View style={styles.quickActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isLocked}
                  onPress={() => router.push("./drafts")}
                  style={({ pressed }) => [
                    styles.quickCtaBtnPrimary,
                    (pressed || isLocked) && { opacity: isLocked ? 0.5 : 0.8 },
                  ]}
                >
                  <Icon name="plus" size={15} color={stitchTokens.gold} strokeWidth={2.4} />
                  <AppText
                    kind="bold"
                    numberOfLines={1}
                    style={styles.quickCtaTextPrimary}
                  >
                    Đăng sách
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setTopupModalVisible(true)}
                  style={({ pressed }) => [
                    styles.quickCtaBtnSecondary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Icon name="wallet" size={15} color={stitchTokens.wine} />
                  <AppText
                    kind="bold"
                    numberOfLines={1}
                    style={styles.quickCtaTextSecondary}
                  >
                    Nạp ví
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("./cart")}
                  style={({ pressed }) => [
                    styles.quickCtaBtnSecondary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Icon name="bag" size={15} color={stitchTokens.wine} />
                  <AppText
                    kind="bold"
                    numberOfLines={1}
                    style={styles.quickCtaTextSecondary}
                  >
                    Giỏ sách
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("./profile")}
                  style={({ pressed }) => [
                    styles.quickCtaBtnSecondary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Icon name="person" size={15} color={stitchTokens.wine} />
                  <AppText
                    kind="bold"
                    numberOfLines={1}
                    style={styles.quickCtaTextSecondary}
                  >
                    Hồ sơ
                  </AppText>
                </Pressable>
              </View>

              {isRestricted ? (
                <View style={{ marginTop: 8 }}>
                  <Notice tone="warning">Tài khoản đang bị hạn chế một số hoạt động.</Notice>
                </View>
              ) : null}
              {isLocked ? (
                <View style={{ marginTop: 8 }}>
                  <Notice tone="warning">Tài khoản đang bị khóa. Bạn không thể đăng sách hoặc giao dịch mới.</Notice>
                </View>
              ) : null}
            </View>

            {/* ==============================================================
                2. TOP 4 STATISTIC CARDS (Tương ứng DashboardStats)
            ============================================================== */}
            <View style={{ gap: 10 }}>
              <View style={styles.statsGrid2x2}>
                {/* Stat 1: Số dư khả dụng (Đỏ Vang Hero Card) */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("./wallet")}
                  style={({ pressed }) => [
                    styles.statCardWine,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <AppText kind="small" style={styles.statLabelLight}>
                      SỐ DƯ KHẢ DỤNG
                    </AppText>
                    <View style={styles.statIconBoxLight}>
                      <Icon name="wallet" size={15} color={stitchTokens.roseLightBg} />
                    </View>
                  </View>
                  <AppText kind="heading" style={styles.statValueLight} numberOfLines={1}>
                    {wallet.data?.available != null ? formatVnd(availableVnd) : "0 ₫"}
                  </AppText>
                  <View style={styles.statFooterRow}>
                    <AppText kind="small" style={styles.statBadgeLight}>
                      +{latXu.toLocaleString("vi-VN")} Lật-Xu
                    </AppText>
                    <View style={styles.statLinkLight}>
                      <AppText kind="small" style={{ fontSize: 11, color: stitchTokens.white, fontWeight: "600" }}>
                        Mở ví
                      </AppText>
                      <Icon name="chevronRight" size={12} color={stitchTokens.white} />
                    </View>
                  </View>
                </Pressable>

                {/* Stat 2: Tạm giữ Escrow */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("./wallet")}
                  style={({ pressed }) => [
                    styles.statCardParchment,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <AppText kind="label" style={styles.statLabelDark}>
                      Tiền đang tạm giữ
                    </AppText>
                    <View style={styles.statIconBoxDark}>
                      <Icon name="shield" size={15} color={stitchTokens.wine} />
                    </View>
                  </View>
                  <AppText kind="heading" style={styles.statValueEscrow} numberOfLines={1}>
                    {wallet.data?.transactionHeld != null ? formatVnd(heldVnd) : "0 ₫"}
                  </AppText>
                  <View style={styles.statFooterRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <View style={styles.escrowDot} />
                      <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                        Bảo lưu an toàn
                      </AppText>
                    </View>
                  </View>
                </Pressable>

                {/* Stat 3: Giá trị kệ sách */}
                <Pressable
                  accessibilityRole="button"
                  disabled={isLocked}
                  onPress={() => router.push("./drafts")}
                  style={({ pressed }) => [
                    styles.statCardParchment,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <AppText kind="small" style={styles.statLabelDark}>
                      GIÁ TRỊ KỆ SÁCH
                    </AppText>
                    <View style={styles.statIconBoxDark}>
                      <Icon name="book" size={15} color={stitchTokens.wine} />
                    </View>
                  </View>
                  <AppText kind="heading" style={styles.statValueDark} numberOfLines={1}>
                    {totalShelfValue > 0 ? formatVnd(totalShelfValue) : `${totalShelfBooks} cuốn`}
                  </AppText>
                  <View style={styles.statFooterRow}>
                    <AppText kind="small" style={styles.statBadgeAmber}>
                      {totalShelfBooks} ấn phẩm
                    </AppText>
                    <View style={styles.statLinkDark}>
                      <AppText kind="small" style={{ fontSize: 11, color: stitchTokens.wine, fontWeight: "600" }}>
                        Kệ sách
                      </AppText>
                      <Icon name="chevronRight" size={12} color={stitchTokens.wine} />
                    </View>
                  </View>
                </Pressable>

                {/* Stat 4: Đơn hàng trực tiếp */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("./orders")}
                  style={({ pressed }) => [
                    styles.statCardParchment,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <AppText kind="small" style={styles.statLabelDark}>
                      ĐƠN HÀNG TRỰC TIẾP
                    </AppText>
                    <View style={styles.statIconBoxDark}>
                      <Icon name="truck" size={15} color={stitchTokens.wine} />
                    </View>
                  </View>
                  <AppText kind="heading" style={styles.statValueDark} numberOfLines={1}>
                    {totalOrdersCount} đơn
                  </AppText>
                  <View style={styles.statFooterRow}>
                    {unpaidOrdersCount > 0 ? (
                      <AppText kind="small" style={styles.statBadgeDanger}>
                        {unpaidOrdersCount} chờ thanh toán
                      </AppText>
                    ) : (
                      <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                        Mua & bán
                      </AppText>
                    )}
                    <View style={styles.statLinkDark}>
                      <AppText kind="small" style={{ fontSize: 11, color: stitchTokens.wine, fontWeight: "600" }}>
                        Xem đơn
                      </AppText>
                      <Icon name="chevronRight" size={12} color={stitchTokens.wine} />
                    </View>
                  </View>
                </Pressable>
              </View>
            </View>



            {/* ==============================================================
                5. AUCTIONS FOCUS (Tương ứng DashboardAuctionFocus)
            ============================================================== */}
            <View style={styles.sectionContainer}>
              <SectionHeading
                title="Đấu giá của bạn"
                description="Theo dõi các phiên và khoản cần thanh toán."
                icon="gavel"
                actionText="Khám phá sàn"
                onAction={() => router.push("./auctions")}
              />

              <View style={styles.auctionStatsRow}>
                {/* Cột 1: Đang diễn ra */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: "./my-auctions", params: { view: "active" } })
                  }
                  style={styles.auctionStatBox}
                >
                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                    Đang diễn ra
                  </AppText>
                  <AppText kind="bold" style={styles.auctionStatVal}>
                    {activeAuctionsCount} <AppText kind="small" color={stitchTokens.subtleGray}>phiên</AppText>
                  </AppText>
                </Pressable>

                {/* Cột 2: Cần thanh toán */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: "./my-auctions", params: { view: "payment" } })
                  }
                  style={[
                    styles.auctionStatBox,
                    needsPaymentAuctionsCount > 0 && { backgroundColor: stitchTokens.amberWarmBg },
                  ]}
                >
                  <AppText
                    kind="small"
                    style={{
                      fontSize: 11,
                      color: needsPaymentAuctionsCount > 0 ? stitchTokens.goldBronze : stitchTokens.subtleGray,
                      fontWeight: needsPaymentAuctionsCount > 0 ? "700" : "500",
                    }}
                  >
                    Cần thanh toán
                  </AppText>
                  <AppText
                    kind="bold"
                    style={[
                      styles.auctionStatVal,
                      needsPaymentAuctionsCount > 0 && { color: stitchTokens.goldBronze },
                    ]}
                  >
                    {needsPaymentAuctionsCount} <AppText kind="small" color={needsPaymentAuctionsCount > 0 ? stitchTokens.goldBronze : stitchTokens.subtleGray}>phiên</AppText>
                  </AppText>
                </Pressable>

                {/* Cột 3: Đã tham gia */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("./my-auctions")}
                  style={styles.auctionStatBox}
                >
                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                    Đã tham gia
                  </AppText>
                  <AppText kind="bold" style={styles.auctionStatVal}>
                    {totalAuctionsCount} <AppText kind="small" color={stitchTokens.subtleGray}>phiên</AppText>
                  </AppText>
                </Pressable>
              </View>
            </View>

            {/* ==============================================================
                6. MY BOOKS ON SHELF (Tương ứng DashboardMyBooks)
            ============================================================== */}
            {profile.data.roles.includes("MEMBER") && !isLocked ? (
              <View style={styles.sectionContainer}>
                <SectionHeading
                  title="Kệ sách của tôi"
                  description="Sách đang hiển thị và các bản nháp của bạn."
                  icon="book"
                  actionText="Đăng sách"
                  onAction={() => router.push("./drafts")}
                />

                {/* Filter Tabs */}
                <View style={styles.tabsRow}>
                  {[
                    { id: "Approved", label: "Đang hiển thị" },
                    { id: "PendingReview", label: "Chờ duyệt" },
                    { id: "Draft", label: "Bản nháp" },
                    { id: "All", label: "Tất cả" },
                  ].map((tab) => {
                    const isSelected = shelfFilter === tab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        accessibilityRole="tab"
                        aria-selected={isSelected}
                        onPress={() => setShelfFilter(tab.id)}
                        style={[
                          styles.tabPill,
                          isSelected && styles.tabPillSelected,
                        ]}
                      >
                        <AppText
                          kind="small"
                          style={[
                            styles.tabPillText,
                            isSelected && styles.tabPillTextSelected,
                          ]}
                        >
                          {tab.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Books List */}
                {myDrafts.data?.items && myDrafts.data.items.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {myDrafts.data.items.slice(0, 4).map((item) => (
                      <RecentBookRow key={item.id} item={item} />
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push("./drafts")}
                      style={styles.viewAllBooksBtn}
                    >
                      <AppText kind="bold" style={{ fontSize: 12, color: stitchTokens.wine }}>
                        Xem tất cả sách của tôi ({totalShelfBooks} cuốn)
                      </AppText>
                      <Icon name="chevronRight" size={14} color={stitchTokens.wine} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.emptyCardBox}>
                    <Icon name="book" size={22} color={stitchTokens.roseBrown} />
                    <AppText kind="small" color={stitchTokens.subtleGray} style={{ textAlign: "center" }}>
                      Chưa có sách nào trong mục này. Bấm &quot;Đăng sách&quot; để chia sẻ cuốn sách của bạn!
                    </AppText>
                  </View>
                )}
              </View>
            ) : null}


            {/* ==============================================================
                8. SMART WORKSPACE HUB & GROUPED SETTINGS
            ============================================================== */}
            {profile.data.roles.includes("MEMBER") && !isLocked ? (
              <View style={styles.hubWrapper}>
                {/* Group A: 2x2 Quick Hub for Core Marketplace Workflows */}
                <View style={styles.groupBlock}>
                  <View style={styles.groupHeaderRow}>
                    <AppText kind="small" style={styles.groupOverline}>
                      HOẠT ĐỘNG & GIAO DỊCH
                    </AppText>
                    {unpaidOrdersCount + needsPaymentAuctionsCount > 0 ? (
                      <View style={styles.groupAlertChip}>
                        <View style={styles.groupAlertDot} />
                        <AppText kind="small" style={styles.groupAlertText}>
                          {unpaidOrdersCount + needsPaymentAuctionsCount} cần xử lý
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.hubGrid}>
                    {/* Tile 1: Sách của tôi */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Sách của tôi"
                      onPress={() => router.push("./drafts")}
                      style={({ pressed }) => [
                        styles.hubTile,
                        pressed && styles.hubTilePressed,
                      ]}
                    >
                      <View style={styles.hubTileTop}>
                        <View
                          style={[
                            styles.hubTileIconBox,
                            { backgroundColor: stitchTokens.roseParchment },
                          ]}
                        >
                          <Icon name="book" size={18} color={stitchTokens.wine} />
                        </View>
                        <View style={styles.hubMetricPill}>
                          <AppText kind="small" style={styles.hubMetricPillText}>
                            {totalShelfBooks} cuốn
                          </AppText>
                        </View>
                      </View>
                      <View style={styles.hubTileBody}>
                        <AppText kind="bold" style={styles.hubTileTitle} numberOfLines={1}>
                          Sách của tôi
                        </AppText>
                        <AppText kind="small" style={styles.hubTileSubtitle} numberOfLines={1}>
                          Tin đăng & bản nháp
                        </AppText>
                      </View>
                    </Pressable>

                    {/* Tile 2: Đơn hàng của tôi */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Đơn hàng của tôi"
                      onPress={() => router.push("./orders")}
                      style={({ pressed }) => [
                        styles.hubTile,
                        unpaidOrdersCount > 0 && styles.hubTileHighlight,
                        pressed && styles.hubTilePressed,
                      ]}
                    >
                      <View style={styles.hubTileTop}>
                        <View
                          style={[
                            styles.hubTileIconBox,
                            {
                              backgroundColor:
                                unpaidOrdersCount > 0
                                  ? stitchTokens.amberWarmBg
                                  : stitchTokens.roseParchment,
                            },
                          ]}
                        >
                          <Icon
                            name="bag"
                            size={18}
                            color={
                              unpaidOrdersCount > 0
                                ? stitchTokens.goldBronze
                                : stitchTokens.wine
                            }
                          />
                        </View>
                        {unpaidOrdersCount > 0 ? (
                          <View style={styles.hubAlertPill}>
                            <AppText kind="small" style={styles.hubAlertPillText}>
                              {unpaidOrdersCount} chờ trả
                            </AppText>
                          </View>
                        ) : (
                          <View style={styles.hubMetricPill}>
                            <AppText kind="small" style={styles.hubMetricPillText}>
                              {totalOrdersCount} đơn
                            </AppText>
                          </View>
                        )}
                      </View>
                      <View style={styles.hubTileBody}>
                        <AppText kind="bold" style={styles.hubTileTitle} numberOfLines={1}>
                          Đơn hàng
                        </AppText>
                        <AppText kind="small" style={styles.hubTileSubtitle} numberOfLines={1}>
                          Mua, bán & vận chuyển
                        </AppText>
                      </View>
                    </Pressable>

                    {/* Tile 3: Đấu giá của tôi */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Đấu giá của tôi"
                      onPress={() => router.push("./my-auctions")}
                      style={({ pressed }) => [
                        styles.hubTile,
                        needsPaymentAuctionsCount > 0 && styles.hubTileHighlight,
                        pressed && styles.hubTilePressed,
                      ]}
                    >
                      <View style={styles.hubTileTop}>
                        <View
                          style={[
                            styles.hubTileIconBox,
                            { backgroundColor: stitchTokens.goldLight },
                          ]}
                        >
                          <Icon name="gavel" size={18} color={stitchTokens.goldBronze} />
                        </View>
                        {needsPaymentAuctionsCount > 0 ? (
                          <View style={styles.hubAlertPill}>
                            <AppText kind="small" style={styles.hubAlertPillText}>
                              {needsPaymentAuctionsCount} cần trả
                            </AppText>
                          </View>
                        ) : activeAuctionsCount > 0 ? (
                          <View style={styles.hubActivePill}>
                            <AppText kind="small" style={styles.hubActivePillText}>
                              {activeAuctionsCount} đang mở
                            </AppText>
                          </View>
                        ) : (
                          <View style={styles.hubMetricPill}>
                            <AppText kind="small" style={styles.hubMetricPillText}>
                              {totalAuctionsCount} phiên
                            </AppText>
                          </View>
                        )}
                      </View>
                      <View style={styles.hubTileBody}>
                        <AppText kind="bold" style={styles.hubTileTitle} numberOfLines={1}>
                          Đấu giá
                        </AppText>
                        <AppText kind="small" style={styles.hubTileSubtitle} numberOfLines={1}>
                          Phiên theo dõi & thắng
                        </AppText>
                      </View>
                    </Pressable>

                    {/* Tile 4: Đề nghị trao đổi */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Đề nghị trao đổi"
                      onPress={() => router.push("./exchanges")}
                      style={({ pressed }) => [
                        styles.hubTile,
                        pressed && styles.hubTilePressed,
                      ]}
                    >
                      <View style={styles.hubTileTop}>
                        <View
                          style={[
                            styles.hubTileIconBox,
                            { backgroundColor: stitchTokens.likeNewGreenBg },
                          ]}
                        >
                          <Icon name="swap" size={18} color={stitchTokens.likeNewGreen} />
                        </View>
                        <Icon name="chevronRight" size={15} color={stitchTokens.roseBrown} />
                      </View>
                      <View style={styles.hubTileBody}>
                        <AppText kind="bold" style={styles.hubTileTitle} numberOfLines={1}>
                          Trao đổi sách
                        </AppText>
                        <AppText kind="small" style={styles.hubTileSubtitle} numberOfLines={1}>
                          Đề nghị & đồng kiểm 72h
                        </AppText>
                      </View>
                    </Pressable>
                  </View>
                </View>

                {/* Group B: Tài chính & Bộ sưu tập */}
                <View style={styles.groupBlock}>
                  <AppText kind="small" style={styles.groupOverline}>
                    TÀI CHÍNH & BỘ SƯU TẬP
                  </AppText>
                  <View style={styles.groupedCard}>
                    {/* Ví lưu ký & Đối soát */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Ví lưu ký và Đối soát"
                      onPress={() => router.push("./wallet")}
                      style={({ pressed }) => [
                        styles.groupedRow,
                        pressed && styles.groupedRowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.groupedIconBadge,
                          { backgroundColor: stitchTokens.likeNewGreenBg },
                        ]}
                      >
                        <Icon name="wallet" size={17} color={stitchTokens.likeNewGreen} />
                      </View>
                      <View style={styles.groupedRowContent}>
                        <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                          Ví lưu ký & Đối soát
                        </AppText>
                        <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                          {heldVnd > 0
                            ? `Đang tạm giữ ${formatVnd(heldVnd)}`
                            : "Nạp, rút & sao kê minh bạch"}
                        </AppText>
                      </View>
                      <View style={styles.groupedRowRight}>
                        <View style={styles.walletAmountPill}>
                          <AppText kind="small" style={styles.walletAmountText}>
                            {formatVnd(availableVnd)}
                          </AppText>
                        </View>
                        <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                      </View>
                    </Pressable>

                    {/* Sách đã lưu */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Sách đã lưu"
                      onPress={() => router.push("./wishlist")}
                      style={({ pressed }) => [
                        styles.groupedRow,
                        pressed && styles.groupedRowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.groupedIconBadge,
                          { backgroundColor: stitchTokens.roseWarmTag },
                        ]}
                      >
                        <Icon name="bookmark" size={17} color={stitchTokens.wine} />
                      </View>
                      <View style={styles.groupedRowContent}>
                        <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                          Sách đã lưu
                        </AppText>
                        <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                          Danh mục sách bạn đang quan tâm
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                    </Pressable>

                    {/* Sổ địa chỉ giao nhận */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Sổ địa chỉ giao nhận"
                      onPress={() => router.push("./addresses")}
                      style={({ pressed }) => [
                        styles.groupedRow,
                        pressed && styles.groupedRowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.groupedIconBadge,
                          { backgroundColor: stitchTokens.goldLight },
                        ]}
                      >
                        <Icon name="pin" size={17} color={stitchTokens.goldBronze} />
                      </View>
                      <View style={styles.groupedRowContent}>
                        <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                          Sổ địa chỉ giao nhận
                        </AppText>
                        <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                          Quản lý địa chỉ nhận & gửi sách
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                    </Pressable>

                    {/* Đánh giá & Uy tín */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Đánh giá giao dịch và Uy tín"
                      onPress={() => router.push("./reviews")}
                      style={({ pressed }) => [
                        styles.groupedRow,
                        styles.groupedRowLast,
                        pressed && styles.groupedRowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.groupedIconBadge,
                          { backgroundColor: stitchTokens.amberWarmBg },
                        ]}
                      >
                        <Icon name="star" size={17} color={stitchTokens.goldBronze} />
                      </View>
                      <View style={styles.groupedRowContent}>
                        <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                          Đánh giá giao dịch & Uy tín
                        </AppText>
                        <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                          Nhận xét từ người mua & bạn trao đổi
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                    </Pressable>
                  </View>
                </View>

                {/* Group C: Tài khoản & Hỗ trợ */}
                <View style={styles.groupBlock}>
                  <AppText kind="small" style={styles.groupOverline}>
                    TÀI KHOẢN & HỖ TRỢ
                  </AppText>
                  <View style={styles.groupedCard}>
                    {/* Hồ sơ bạn đọc & Email */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Hồ sơ bạn đọc và Email"
                      onPress={() => router.push("./profile")}
                      style={({ pressed }) => [
                        styles.groupedRow,
                        pressed && styles.groupedRowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.groupedIconBadge,
                          { backgroundColor: stitchTokens.pillWarmBg },
                        ]}
                      >
                        <Icon name="person" size={17} color={stitchTokens.wine} />
                      </View>
                      <View style={styles.groupedRowContent}>
                        <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                          Hồ sơ bạn đọc & Bảo mật
                        </AppText>
                        <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                          {profile.data.email}
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                    </Pressable>

                    {/* Trung tâm hỗ trợ */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Trung tâm hỗ trợ"
                      onPress={() => router.push("./support")}
                      style={({ pressed }) => [
                        styles.groupedRow,
                        styles.groupedRowLast,
                        pressed && styles.groupedRowPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.groupedIconBadge,
                          { backgroundColor: stitchTokens.blueLightBg },
                        ]}
                      >
                        <Icon name="shield" size={17} color={stitchTokens.blueTextDeep} />
                      </View>
                      <View style={styles.groupedRowContent}>
                        <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                          Trung tâm hỗ trợ
                        </AppText>
                        <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                          Tranh chấp, khiếu nại & chính sách
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Policy & contact (shared copy with user-web, accessible to all roles/states). */}
            <View style={styles.groupBlock}>
              <AppText kind="small" style={styles.groupOverline}>
                THÔNG TIN & QUY CHẾ
              </AppText>
              <View style={styles.groupedCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chính sách & quy chế"
                  onPress={() => router.push("/policy")}
                  style={({ pressed }) => [
                    styles.groupedRow,
                    pressed && styles.groupedRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.groupedIconBadge,
                      { backgroundColor: stitchTokens.pillWarmBg },
                    ]}
                  >
                    <Icon name="shield" size={17} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.groupedRowContent}>
                    <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                      Chính sách & quy chế
                    </AppText>
                    <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                      Điều khoản, bảo chứng & quy tắc sàn
                    </AppText>
                  </View>
                  <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Liên hệ Lật lại"
                  onPress={() => router.push("/contact")}
                  style={({ pressed }) => [
                    styles.groupedRow,
                    styles.groupedRowLast,
                    pressed && styles.groupedRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.groupedIconBadge,
                      { backgroundColor: stitchTokens.roseWarmTag },
                    ]}
                  >
                    <Icon name="mail" size={17} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.groupedRowContent}>
                    <AppText kind="bold" style={styles.groupedRowTitle} numberOfLines={1}>
                      Liên hệ Lật lại
                    </AppText>
                    <AppText kind="small" style={styles.groupedRowSubtitle} numberOfLines={1}>
                      Kênh liên hệ, địa chỉ điểm & giờ làm việc
                    </AppText>
                  </View>
                  <Icon name="chevronRight" size={16} color={stitchTokens.softStone} />
                </Pressable>
              </View>
            </View>

            {/* ==============================================================
                9. LOGOUT & MICRO FOOTER NOTE
            ============================================================== */}
            {error ? <Notice tone="error">{error}</Notice> : null}

            <View style={{ gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đăng xuất tài khoản"
                disabled={busy}
                onPress={() => setLogoutConfirmOpen(true)}
                style={({ pressed }) => [
                  styles.logoutCardBtn,
                  pressed && styles.logoutCardBtnPressed,
                  busy && { opacity: 0.65 },
                ]}
              >
                <View style={styles.logoutCardLeft}>
                  <View style={styles.logoutIconCircle}>
                    {busy ? (
                      <ActivityIndicator size="small" color={stitchTokens.crimson} />
                    ) : (
                      <Icon name="logout" size={17} color={stitchTokens.crimson} strokeWidth={2} />
                    )}
                  </View>
                  <View style={{ gap: 1 }}>
                    <AppText kind="bold" style={styles.logoutTitleText}>
                      {busy ? "Đang đăng xuất…" : "Đăng xuất"}
                    </AppText>
                    <AppText kind="small" style={styles.logoutSubText} numberOfLines={1}>
                      Kết thúc phiên đăng nhập trên thiết bị này
                    </AppText>
                  </View>
                </View>
                <Icon name="chevronRight" size={16} color={stitchTokens.crimson} />
              </Pressable>

              <View style={styles.microFooter}>
                <Icon name="book" size={13} color={stitchTokens.softStone} />
                <AppText kind="small" color={stitchTokens.softStone} style={styles.microFooterText}>
                  Lật Lại · Thư xã văn hóa Sài Gòn · v1.2.0
                </AppText>
              </View>
            </View>
          </>
        ) : null}
      </View>

      {/* Logout Confirmation Modal */}
      <AppModal
        visible={logoutConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && setLogoutConfirmOpen(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng hộp thoại đăng xuất"
            style={StyleSheet.absoluteFill}
            onPress={() => !busy && setLogoutConfirmOpen(false)}
          />
          <View
            accessibilityViewIsModal
            style={styles.logoutModalCard}
          >
            <View style={styles.logoutModalIconWrap}>
              <Icon name="logout" size={22} color={stitchTokens.crimson} strokeWidth={2} />
            </View>
            <AppText kind="bold" style={styles.logoutModalTitle}>
              Đăng xuất khỏi Lật Lại?
            </AppText>
            <AppText kind="small" style={styles.logoutModalMessage}>
              Phiên đăng nhập của{" "}
              <AppText kind="bold" style={{ color: stitchTokens.wineDark, fontSize: 13 }}>
                {profile.data?.displayName || "tài khoản này"}
              </AppText>{" "}
              sẽ kết thúc trên thiết bị này. Bạn luôn có thể đăng nhập lại bất cứ lúc nào.
            </AppText>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <View style={styles.logoutModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hủy đăng xuất"
                disabled={busy}
                onPress={() => setLogoutConfirmOpen(false)}
                style={({ pressed }) => [
                  styles.logoutModalCancelBtn,
                  busy && { opacity: 0.5 },
                  pressed && !busy && { opacity: 0.78 },
                ]}
              >
                <AppText kind="bold" style={styles.logoutModalCancelText}>
                  Ở lại
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xác nhận đăng xuất"
                disabled={busy}
                onPress={() => void logout()}
                style={({ pressed }) => [
                  styles.logoutModalConfirmBtn,
                  busy && { opacity: 0.65 },
                  pressed && !busy && { opacity: 0.85 },
                ]}
              >
                <AppText kind="bold" style={styles.logoutModalConfirmText}>
                  {busy ? "Đang đăng xuất…" : "Đăng xuất"}
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </AppModal>

      {/* Notifications Modal */}
      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {/* Topup Modal for Wallet */}
      <TopupModal
        visible={topupModalVisible}
        onClose={() => setTopupModalVisible(false)}
        ownerId={ownerId}
        onSuccess={() => {
          void wallet.refetch();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Section Headings
  sectionHeadingRoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardWarmBeige,
  },
  sectionHeadingIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: stitchTokens.pillWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeadingTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  sectionHeadingDesc: {
    fontSize: 11,
    lineHeight: 14,
  },
  sectionHeadingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: stitchTokens.pillWarmBg,
  },
  sectionHeadingBtnText: {
    fontSize: 11,
    color: stitchTokens.wine,
  },

  // Greeting Card (Section 1)
  greetingCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.cardWarmLight,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.3,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  greenPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.likeNewGreen,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.likeNewGreen,
  },
  restrictedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.flashRedBg,
  },
  restrictedBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.darkRed,
  },
  notifBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.pillWarmBg,
    marginLeft: "auto",
  },
  notifBadgeText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    fontWeight: "500",
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 2,
    borderColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  verifiedCheckBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: stitchTokens.likeNewGreen,
    borderWidth: 1.5,
    borderColor: stitchTokens.white,
    alignItems: "center",
    justifyContent: "center",
  },
  displayNameText: {
    fontSize: 17,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  roleBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.canvasMuted,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  roleBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.oliveDark,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  quickCtaBtnPrimary: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 12,
  },
  quickCtaBtnSecondary: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: stitchTokens.pillWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 12,
  },
  quickCtaTextPrimary: {
    fontSize: 11.5,
    lineHeight: 15,
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  quickCtaTextSecondary: {
    fontSize: 11.5,
    lineHeight: 15,
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },

  // Stats Grid 2x2 (Section 2)
  statsGrid2x2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCardWine: {
    width: "48.5%",
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: stitchTokens.wineCrimsonDark,
  },
  statLabelLight: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.beigeWarmSurface,
    letterSpacing: 0.4,
  },
  statIconBoxLight: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: stitchTokens.whiteAlpha12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValueLight: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  statBadgeLight: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.goldBorderSoft,
  },
  statLinkLight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: stitchTokens.whiteAlpha15,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statCardParchment: {
    width: "48.5%",
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  statLabelDark: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    color: stitchTokens.subtleGray,
  },
  statIconBoxDark: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: stitchTokens.pillWarmBg,
    alignItems: "center",
    justifyContent: "center",
  },
  statValueDark: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  statValueEscrow: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.tagFreeshipText,
  },
  statFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  statBadgeAmber: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.goldBronze,
  },
  statBadgeDanger: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.tagFreeshipText,
  },
  statLinkDark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  escrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.tagFreeshipText,
  },

  // Sections Common Wrapper
  sectionContainer: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 12,
  },

  // Hero Notification Spotlight (Section 3)
  heroNoticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    backgroundColor: stitchTokens.cardWarmLight,
    overflow: "hidden",
  },
  heroNoticeBanner: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pulseDotAmber: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: stitchTokens.goldYellowBadge,
  },
  heroNoticeBannerTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.white,
    letterSpacing: 0.3,
  },
  heroNoticePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unreadTag: {
    backgroundColor: stitchTokens.goldBorderSoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  unreadTagText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: stitchTokens.brownEarth,
  },
  heroNoticeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    lineHeight: 18,
  },
  heroNoticeBody: {
    fontSize: 12,
    lineHeight: 16,
    backgroundColor: stitchTokens.white,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
  },
  heroNoticeCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.wine,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  recentNoticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.cardWarmLight,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
  },
  recentNoticeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },

  // Cashflow Section (Section 4)
  cashflowRow: {
    flexDirection: "row",
    gap: 10,
  },
  cashflowBoxIn: {
    flex: 1,
    backgroundColor: stitchTokens.greenLightPale,
    borderRadius: 10,
    padding: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: stitchTokens.mintGreen,
  },
  cashflowDotIn: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.verifiedGreen,
  },
  cashflowLabelIn: {
    fontSize: 9.5,
    fontWeight: "700",
    color: stitchTokens.verifiedGreen,
    letterSpacing: 0.3,
  },
  cashflowValIn: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  cashflowBoxOut: {
    flex: 1,
    backgroundColor: stitchTokens.peachLightPale,
    borderRadius: 10,
    padding: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: stitchTokens.peachLight,
  },
  cashflowDotOut: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.tagFreeshipText,
  },
  cashflowLabelOut: {
    fontSize: 9.5,
    fontWeight: "700",
    color: stitchTokens.tagFreeshipText,
    letterSpacing: 0.3,
  },
  cashflowValOut: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.darkRed,
  },
  walletActionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.wine,
    paddingVertical: 8,
    borderRadius: 8,
  },
  walletActionBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.pillWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // Auction Section (Section 5)
  auctionStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  auctionStatBox: {
    flex: 1,
    backgroundColor: stitchTokens.cardWarmLight,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
  },
  auctionStatVal: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },

  // My Books Tabs (Section 6)
  tabsRow: {
    flexDirection: "row",
    gap: 6,
  },
  tabPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: stitchTokens.pillWarmBg,
  },
  tabPillSelected: {
    backgroundColor: stitchTokens.wine,
  },
  tabPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  tabPillTextSelected: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
  viewAllBooksBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.pillWarmBg,
    marginTop: 4,
  },

  // Direct Orders Tabs & Cards (Section 7)
  ordersTabToggle: {
    flexDirection: "row",
    backgroundColor: stitchTokens.pillWarmBg,
    borderRadius: 8,
    padding: 3,
    gap: 4,
  },
  orderRoleBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 6,
  },
  orderRoleBtnSelected: {
    backgroundColor: stitchTokens.white,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  orderRoleBtnText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  orderRoleBtnTextSelected: {
    color: stitchTokens.wineDark,
  },
  orderCardItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.cardWarmLight,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
    gap: 8,
  },
  orderStateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orderStateBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },

  // Recent Books Cards
  recentBookCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 9,
    borderRadius: 10,
    backgroundColor: stitchTokens.cardWarmLight,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
  },
  recentCoverBox: {
    width: 44,
    height: 56,
    borderRadius: 6,
    backgroundColor: stitchTokens.cardWarmBeige,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  miniStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Smart Workspace Hub & Grouped Settings (Section 8)
  hubWrapper: {
    gap: 18,
  },
  groupBlock: {
    gap: 8,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  groupOverline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: stitchTokens.subtleGray,
    paddingHorizontal: 4,
  },
  groupAlertChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: stitchTokens.amberWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorderSoft,
  },
  groupAlertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.goldBronze,
  },
  groupAlertText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.goldBronze,
    includeFontPadding: false,
  },
  hubGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  hubTile: {
    width: "48.4%",
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    padding: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  hubTileHighlight: {
    borderColor: stitchTokens.goldBorderSoft,
    backgroundColor: stitchTokens.warmIvory,
  },
  hubTilePressed: {
    backgroundColor: stitchTokens.warmIvorySoft,
    opacity: 0.9,
  },
  hubTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  hubTileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  hubTileBody: {
    gap: 2,
  },
  hubTileTitle: {
    fontSize: 14,
    lineHeight: 19,
    color: stitchTokens.wineDark,
  },
  hubTileSubtitle: {
    fontSize: 11.5,
    lineHeight: 15,
    color: stitchTokens.subtleGray,
  },
  hubMetricPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: stitchTokens.pillWarmBg,
  },
  hubMetricPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.espresso,
    includeFontPadding: false,
  },
  hubAlertPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: stitchTokens.amberWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorderSoft,
  },
  hubAlertPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.goldBronze,
    includeFontPadding: false,
  },
  hubActivePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  hubActivePillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    includeFontPadding: false,
  },

  // Grouped editorial cards
  groupedCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  groupedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderParchmentSoft,
  },
  groupedRowLast: {
    borderBottomWidth: 0,
  },
  groupedRowPressed: {
    backgroundColor: stitchTokens.warmIvorySoft,
  },
  groupedIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  groupedRowContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  groupedRowTitle: {
    fontSize: 14,
    lineHeight: 19,
    color: stitchTokens.wineDark,
  },
  groupedRowSubtitle: {
    fontSize: 11.5,
    lineHeight: 15,
    color: stitchTokens.subtleGray,
  },
  groupedRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  walletAmountPill: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  walletAmountText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    includeFontPadding: false,
  },

  // Logout Action Card (Section 9)
  logoutCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: stitchTokens.white,
    borderWidth: 1,
    borderColor: stitchTokens.errorLightBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
    marginTop: 2,
  },
  logoutCardBtnPressed: {
    backgroundColor: stitchTokens.roseIce,
  },
  logoutCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  logoutIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.flashRedBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoutTitleText: {
    fontSize: 14,
    lineHeight: 19,
    color: stitchTokens.crimson,
  },
  logoutSubText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: stitchTokens.subtleGray,
  },

  // Logout Confirmation Modal
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  logoutModalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: stitchTokens.white,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  logoutModalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: stitchTokens.flashRedBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  logoutModalTitle: {
    fontSize: 17,
    lineHeight: 22,
    color: stitchTokens.wineDark,
    textAlign: "center",
  },
  logoutModalMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.subtleGray,
    textAlign: "center",
  },
  logoutModalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 8,
  },
  logoutModalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: stitchTokens.pillWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutModalCancelText: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  logoutModalConfirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: stitchTokens.crimson,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutModalConfirmText: {
    fontSize: 14,
    color: stitchTokens.white,
  },

  // Empty Box
  emptyCardBox: {
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stitchTokens.cardWarmLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
    gap: 6,
  },

  // Micro footer
  microFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  microFooterText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
