import { useCallback, useMemo, useState } from "react";
import {
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
          }}
        >
          <AppText
            kind="bold"
            style={{ fontSize: 14, color: stitchTokens.wineDark }}
            numberOfLines={1}
          >
            {bookTitle}
          </AppText>
          <View
            style={[
              styles.miniStatusBadge,
              {
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
                fontWeight: "700",
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

  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => client.request("/auth/me", currentUserSchema),
    enabled: foreground,
  });

  const ownerId = profile.data?.id || (state.status === "authenticated" ? state.user.id : "");

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

  // 4. Orders Data
  const ordersQuery = useQuery({
    queryKey: ["my-orders", ownerId],
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

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await client.logout();
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
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      {/* Top Navbar */}
      <TopNavbar
        notificationCount={notificationCount}
        hasNotification={notificationCount > 0}
        onNotificationsPress={() => setNotificationsOpen(true)}
        onMessagesPress={() => router.push("/chat-inbox")}
        style={{ marginBottom: 4 }}
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: 32, gap: 18 }}>
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
                    <Icon name="star" size={11} color={stitchTokens.goldDark} filled />
                    <AppText kind="small" style={styles.roleBadgeText}>
                      {roleLabels[profile.data.roles[0]] || "Độc giả uy tín"} ★ 4.9
                    </AppText>
                  </View>

                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }} numberOfLines={1}>
                    {profile.data.email}
                  </AppText>
                </Pressable>
              </View>

              {/* Quick Action Pills Row */}
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
                  <Icon name="plus" size={13} color={stitchTokens.white} strokeWidth={2.4} />
                  <AppText kind="bold" style={{ fontSize: 12, color: stitchTokens.white }}>
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
                  <Icon name="wallet" size={13} color={stitchTokens.wine} />
                  <AppText kind="bold" style={{ fontSize: 12, color: stitchTokens.wine }}>
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
                  <Icon name="bag" size={13} color={stitchTokens.wine} />
                  <AppText kind="bold" style={{ fontSize: 12, color: stitchTokens.wine }}>
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
                  <Icon name="person" size={13} color={stitchTokens.wine} />
                  <AppText kind="bold" style={{ fontSize: 12, color: stitchTokens.wine }}>
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
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <AppText kind="small" style={styles.statLabelDark}>
                      TẠM GIỮ (ESCROW)
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
                  onPress={() => router.push("./my-auctions")}
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
                  onPress={() => router.push("./my-auctions")}
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
                8. COLLECTION MANAGEMENT & UTILITIES (Lối tắt chức năng)
            ============================================================== */}
            {profile.data.roles.includes("MEMBER") && !isLocked ? (
              <View style={styles.sectionContainer}>
                <SectionHeading
                  title="Quản lý bộ sưu tập & Tiện ích"
                  description="Truy cập nhanh vào các phân mục chuyên biệt của tài khoản."
                  icon="bookmark"
                />

                <View style={styles.menuCard}>
                  {/* Sách của tôi */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sách của tôi"
                    onPress={() => router.push("./drafts")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="book" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Sách của tôi
                      </AppText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={styles.menuCountBadge}>
                        <AppText kind="small" style={styles.menuCountBadgeText}>
                          {totalShelfBooks} cuốn
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                    </View>
                  </Pressable>

                  {/* Đơn hàng của tôi */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đơn hàng của tôi"
                    onPress={() => router.push("./orders")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="bag" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Đơn hàng của tôi
                      </AppText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {unpaidOrdersCount > 0 ? (
                        <View style={styles.menuWarningBadge}>
                          <AppText kind="small" style={styles.menuWarningBadgeText}>
                            {unpaidOrdersCount} chờ thanh toán
                          </AppText>
                        </View>
                      ) : totalOrdersCount > 0 ? (
                        <View style={styles.menuCountBadge}>
                          <AppText kind="small" style={styles.menuCountBadgeText}>
                            {totalOrdersCount} đơn
                          </AppText>
                        </View>
                      ) : null}
                      <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                    </View>
                  </Pressable>

                  {/* Đấu giá của tôi */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đấu giá của tôi"
                    onPress={() => router.push("./my-auctions")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="gavel" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Đấu giá của tôi
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Đề nghị trao đổi */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đề nghị trao đổi"
                    onPress={() => router.push("./exchanges")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="swap" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Đề nghị trao đổi
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Sách đã lưu (Wishlist) */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sách đã lưu"
                    onPress={() => router.push("./wishlist")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="bookmark" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Sách đã lưu
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Sổ địa chỉ trạm ViaPoint */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sổ địa chỉ"
                    onPress={() => router.push("./addresses")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="pin" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Sổ địa chỉ giao nhận
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Ví lưu ký */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ví lưu ký"
                    onPress={() => router.push("./wallet")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="wallet" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Ví lưu ký & Đối soát
                      </AppText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={styles.menuCountBadge}>
                        <AppText kind="small" style={{ fontSize: 11, color: stitchTokens.wine, fontWeight: "700" }}>
                          {formatVnd(availableVnd)}
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                    </View>
                  </Pressable>

                  {/* Đánh giá & uy tín */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đánh giá & uy tín"
                    onPress={() => router.push("./reviews")}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="star" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Đánh giá giao dịch & Uy tín
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Hồ sơ cá nhân & Bảo mật */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Hồ sơ & Bảo mật"
                    onPress={() => router.push("./profile")}
                    style={({ pressed }) => [
                      styles.menuRow,
                      styles.menuRowLast,
                      pressed && styles.menuRowPressed,
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="person" size={17} color={stitchTokens.wine} />
                      </View>
                      <AppText kind="bold" style={styles.menuTitleText}>
                        Hồ sơ bạn đọc & Email
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* ==============================================================
                9. LOGOUT & MICRO FOOTER NOTE
            ============================================================== */}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <View style={{ marginTop: 4 }}>
              <Button
                title="Đăng xuất"
                secondary
                busy={busy}
                onPress={() => void logout()}
              />
            </View>

            <View style={styles.microFooter}>
              <Icon name="book" size={14} color={stitchTokens.roseBrown} />
              <AppText kind="small" color={stitchTokens.roseBrown} style={{ fontSize: 11 }}>
                Lật Lại · Thư xã văn hóa Sài Gòn · Phiên bản 1.2.0
              </AppText>
            </View>
          </>
        ) : null}
      </View>

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
    marginTop: 4,
    flexWrap: "wrap",
  },
  quickCtaBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  quickCtaBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.pillWarmBg,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
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
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
    letterSpacing: 0.4,
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

  // Collection Quick Menu (Section 8)
  menuCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardWarmBeige,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderParchmentSoft,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuRowPressed: {
    backgroundColor: stitchTokens.warmIvorySoft,
  },
  menuIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: stitchTokens.pillWarmBg,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitleText: {
    fontSize: 13.5,
    color: stitchTokens.wineDark,
  },
  menuCountBadge: {
    backgroundColor: stitchTokens.pillWarmBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  menuCountBadgeText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  menuWarningBadge: {
    backgroundColor: stitchTokens.amberWarmBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorderSoft,
  },
  menuWarningBadgeText: {
    fontSize: 10.5,
    color: stitchTokens.goldBronze,
    fontWeight: "700",
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
    marginTop: 8,
  },
});
