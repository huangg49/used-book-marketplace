import { useCallback, useState } from "react";
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
import { draftPage } from "../drafts/contracts";
import { useCatalogBook } from "../drafts/catalog-picker";
import { DraftCoverPhoto } from "../drafts/draft-cover-photo";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";
import { useNotifications } from "../notifications/notifications-model";

const roleLabels: Record<string, string> = {
  MEMBER: "Bạn đọc uy tín",
  STAFF: "Thư tịch viên (Nhân viên)",
  ADMIN: "Quản trị thư xã",
  TEST_OPERATOR: "Kiểm thử viên",
};

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
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
                backgroundColor:
                  item.state.moderation === "Approved"
                    ? stitchTokens.likeNewGreenBg
                    : stitchTokens.tagExchangeBg,
              },
            ]}
          >
            <AppText
              kind="small"
              style={{
                fontSize: 9,
                fontWeight: "700",
                color:
                  item.state.moderation === "Approved"
                    ? stitchTokens.likeNewGreen
                    : stitchTokens.tagExchangeText,
              }}
            >
              {item.state.moderation === "Approved"
                ? "ĐÃ DUYỆT"
                : item.state.moderation === "PendingReview"
                  ? "CHỜ DUYỆT"
                  : "BẢN NHÁP"}
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
            ? `${author} · ${item.currentRevision.content.salePrice ? `Giá: ${formatVnd(item.currentRevision.content.salePrice)}` : "Trao đổi tự do"}`
            : item.currentRevision.content.salePrice
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

  // Real Wallet data (Escrow & Available balance)
  const wallet = useQuery({
    ...summaryOptions(client, ownerId),
    enabled: foreground && !!ownerId && internalMemberViewsEnabled,
  });

  // Real Books on Shelf / Drafts count
  const myDrafts = useQuery({
    queryKey: ["drafts", "all-profile-count"],
    queryFn: () => client.request("/me/listings?limit=5", draftPage),
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
  const bookCount = myDrafts.data?.items?.length ?? 0;
  const recentBooks = myDrafts.data?.items?.slice(0, 3) ?? [];

  return (
    <Screen
      key={`${fontScale}:${presentationVersion}`}
      appearance="home"
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      {/* 1. Header Đỉnh Rượu Vang theo phong cách Lật Lại */}
      <TopNavbar
        notificationCount={notificationCount}
        hasNotification={notificationCount > 0}
        onNotificationsPress={() => setNotificationsOpen(true)}
        onMessagesPress={() => router.push("./account")}
        style={{ marginBottom: 8 }}
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 16 }}>
        {/* Profile State Error/Pending */}
        {profile.isPending ? (
          <StatePanel loading title="Đang tải hồ sơ bạn đọc…" />
        ) : null}
        {profile.error ? (
          <View style={{ marginTop: 12 }}>
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
            {/* 2. Thẻ Thông Tin Bạn Đọc (Profile Card) */}
            <View style={styles.profileHeaderCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                {/* Avatar with Verified badge */}
                <View style={{ position: "relative" }}>
                  <View style={styles.avatarCircle}>
                    <AppText
                      style={{
                        fontSize: 24,
                        fontWeight: "700",
                        color: stitchTokens.wine,
                      }}
                    >
                      {profile.data.displayName?.charAt(0)?.toUpperCase() || "B"}
                    </AppText>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <Icon name="verified" size={12} color={stitchTokens.white} />
                  </View>
                </View>

                {/* Name, Roles, Email */}
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <AppText
                    kind="heading"
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: stitchTokens.wineDark,
                    }}
                    numberOfLines={1}
                  >
                    {profile.data.displayName}
                  </AppText>

                  {/* Rating / Badge pill */}
                  <View style={styles.roleBadgePill}>
                    <Icon name="star" size={11} color={stitchTokens.goldDark} filled />
                    <AppText
                      kind="small"
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: stitchTokens.oliveDark,
                      }}
                    >
                      {roleLabels[profile.data.roles[0]] || "Độc giả uy tín"} ★ 4.9
                    </AppText>
                  </View>

                  <AppText
                    kind="small"
                    color={stitchTokens.subtleGray}
                    style={{ fontSize: 12 }}
                    numberOfLines={1}
                  >
                    {profile.data.email}
                  </AppText>
                </View>

                {/* Button Đăng Sách Nhanh */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đăng sách mới"
                  disabled={isLocked}
                  onPress={() => router.push("/drafts")}
                  style={({ pressed }) => [
                    styles.postButton,
                    (pressed || isLocked) && { opacity: isLocked ? 0.5 : 0.8 },
                  ]}
                >
                  <Icon name="plus" size={15} color={stitchTokens.white} strokeWidth={2.4} />
                  <AppText
                    kind="bold"
                    style={{ fontSize: 13, color: stitchTokens.white }}
                  >
                    Đăng sách
                  </AppText>
                </Pressable>
              </View>

              {/* Status Warnings */}
              {isRestricted ? (
                <View style={{ marginTop: 8 }}>
                  <Notice tone="warning">
                    Tài khoản đang bị hạn chế một số hoạt động.
                  </Notice>
                </View>
              ) : null}
              {isLocked ? (
                <View style={{ marginTop: 8 }}>
                  <Notice tone="warning">
                    Tài khoản đang bị khóa. Bạn không thể đăng sách hoặc giao dịch mới.
                  </Notice>
                </View>
              ) : null}
            </View>

            {/* 3. Thẻ Ví Lưu Ký Lật Lại (Tactile Sepia Cardstock) */}
            <View style={styles.walletCard}>
              {/* Header card ví */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={styles.walletIconCircle}>
                    <Icon name="wallet" size={18} color={stitchTokens.wine} />
                  </View>
                  <View>
                    <AppText
                      kind="bold"
                      style={{ fontSize: 14, color: stitchTokens.wineDark }}
                    >
                      Ví Lưu Ký Lật Lại
                    </AppText>
                    <AppText
                      kind="small"
                      color={stitchTokens.roseBrown}
                      style={{ fontSize: 10, textTransform: "uppercase" }}
                    >
                      Ví mô phỏng (Đồ án TP.HCM)
                    </AppText>
                  </View>
                </View>
                <View style={styles.tagLocation}>
                  <AppText
                    kind="small"
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: stitchTokens.wine,
                    }}
                  >
                    Nội bộ TP.HCM
                  </AppText>
                </View>
              </View>

              {/* Balances */}
              <View style={styles.balanceGrid}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                    Số dư khả dụng
                  </AppText>
                  <AppText
                    kind="heading"
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: stitchTokens.wine,
                    }}
                  >
                    {wallet.data?.available != null
                      ? formatVnd(wallet.data.available)
                      : "0 ₫"}
                  </AppText>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                    Tạm giữ Escrow
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={styles.escrowDot} />
                    <AppText
                      kind="bold"
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: stitchTokens.tagFreeshipText,
                      }}
                    >
                      {wallet.data?.transactionHeld != null
                        ? formatVnd(wallet.data.transactionHeld)
                        : "0 ₫"}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Action Buttons for Wallet */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Nạp hoặc rút ví"
                  onPress={() => router.push("./wallet")}
                  style={({ pressed }) => [
                    styles.walletBtnPrimary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Icon name="tag" size={14} color={stitchTokens.white} />
                  <AppText
                    kind="bold"
                    style={{ fontSize: 13, color: stitchTokens.white }}
                  >
                    Nạp / Rút
                  </AppText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lịch sử giao dịch"
                  onPress={() => router.push("./wallet")}
                  style={({ pressed }) => [
                    styles.walletBtnSecondary,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Icon name="clock" size={14} color={stitchTokens.wineDark} />
                  <AppText
                    kind="bold"
                    style={{ fontSize: 13, color: stitchTokens.wineDark }}
                  >
                    Lịch sử ví
                  </AppText>
                </Pressable>
              </View>
            </View>



            {/* 6. Mục Cần Phản Hồi Ngay (Pending Exchanges / Shipments) */}
            <View style={{ gap: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="bell" size={17} color={stitchTokens.wine} />
                  <AppText
                    kind="bold"
                    style={{ fontSize: 15, color: stitchTokens.wineDark }}
                  >
                    Cần Phản Hồi Ngay
                  </AppText>
                </View>
                <View style={styles.unreadDot} />
              </View>

              <View style={{ gap: 8 }}>
                {/* Item 1: Trao đổi sách */}
                <View style={styles.actionItemCard}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={styles.actionBookCoverBox}>
                      <Icon name="book" size={20} color={stitchTokens.wine} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText
                        kind="small"
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: stitchTokens.tagFreeshipText,
                          textTransform: "uppercase",
                        }}
                      >
                        YÊU CẦU TRAO ĐỔI
                      </AppText>
                      <AppText
                        kind="bold"
                        style={{ fontSize: 14, color: stitchTokens.wineDark }}
                        numberOfLines={1}
                      >
                        Đoạn Tuyệt (Nhất Linh)
                      </AppText>
                      <AppText
                        kind="small"
                        color={stitchTokens.subtleGray}
                        style={{ fontSize: 11 }}
                        numberOfLines={1}
                      >
                        Bạn đọc gửi đề nghị đổi lấy cuốn &quot;Gió Đầu Mùa&quot;
                      </AppText>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push("./drafts")}
                      style={({ pressed }) => [
                        styles.btnRespondPrimary,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Icon name="swap" size={13} color={stitchTokens.white} />
                      <AppText
                        kind="bold"
                        style={{ fontSize: 12, color: stitchTokens.white }}
                      >
                        Xem phản hồi
                      </AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => { }}
                      style={({ pressed }) => [
                        styles.btnRespondSecondary,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <AppText
                        kind="small"
                        style={{ fontSize: 12, color: stitchTokens.subtleGray }}
                      >
                        Bỏ qua
                      </AppText>
                    </Pressable>
                  </View>
                </View>

                {/* Item 2: Đơn vận chuyển trạm ViaPoint */}
                <View style={styles.actionItemCard}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <View style={styles.truckIconCircle}>
                        <Icon name="truck" size={18} color={stitchTokens.wine} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <AppText
                            kind="bold"
                            style={{ fontSize: 13, color: stitchTokens.wineDark }}
                          >
                            #DH-8821
                          </AppText>
                          <View style={styles.transitTag}>
                            <AppText
                              kind="small"
                              style={{
                                fontSize: 9,
                                fontWeight: "700",
                                color: stitchTokens.wine,
                              }}
                            >
                              Đang trung chuyển
                            </AppText>
                          </View>
                        </View>
                        <AppText
                          kind="small"
                          color={stitchTokens.subtleGray}
                          style={{ fontSize: 11 }}
                          numberOfLines={1}
                        >
                          Trạm ViaPoint Q.1 (Đường sách Nguyễn Văn Bình)
                        </AppText>
                      </View>
                    </View>

                    <Icon name="chevronRight" size={18} color={stitchTokens.roseBrown} />
                  </View>
                </View>
              </View>
            </View>

            {/* 7. Kệ Sách Cập Nhật Gần Đây */}
            {profile.data.roles.includes("MEMBER") && !isLocked ? (
              <View style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="book" size={17} color={stitchTokens.wine} />
                    <AppText
                      kind="bold"
                      style={{ fontSize: 15, color: stitchTokens.wineDark }}
                    >
                      Kệ Sách Gần Đây
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Xem tất cả sách của tôi"
                    onPress={() => router.push("./drafts")}
                    style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                  >
                    <AppText
                      kind="bold"
                      style={{ fontSize: 12, color: stitchTokens.wine }}
                    >
                      Xem tất cả ({bookCount})
                    </AppText>
                    <Icon name="chevronRight" size={14} color={stitchTokens.wine} />
                  </Pressable>
                </View>

                {recentBooks.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {recentBooks.map((item) => (
                      <RecentBookRow key={item.id} item={item} />
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyBookCard}>
                    <AppText kind="small" color={stitchTokens.subtleGray} style={{ textAlign: "center" }}>
                      Chưa có sách nào trên kệ. Hãy bấm &quot;Đăng sách&quot; để chia sẻ cuốn sách của bạn!
                    </AppText>
                  </View>
                )}
              </View>
            ) : null}

            {/* 8. Lối Tắt Quản Lý Bộ Sưu Tập (Quick Actions List) */}
            {profile.data.roles.includes("MEMBER") && !isLocked ? (
              <View style={{ gap: 10 }}>
                <AppText
                  kind="bold"
                  style={{ fontSize: 15, color: stitchTokens.wineDark }}
                >
                  Quản Lý Bộ Sưu Tập
                </AppText>

                <View style={styles.menuCard}>
                  {/* Row 1: Sách của tôi */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sách của tôi"
                    onPress={() => router.push("./drafts")}
                    style={({ pressed }) => [
                      styles.menuRow,
                      pressed && styles.menuRowPressed,
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="book" size={18} color={stitchTokens.wine} />
                      </View>
                      <AppText
                        kind="bold"
                        style={{ fontSize: 14, color: stitchTokens.wineDark }}
                      >
                        Sách của tôi
                      </AppText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={styles.menuCountBadge}>
                        <AppText
                          kind="small"
                          style={{ fontSize: 11, color: stitchTokens.subtleGray, fontWeight: "600" }}
                        >
                          {bookCount} cuốn
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                    </View>
                  </Pressable>

                  {/* Row 2: Sách đã lưu (Wishlist) */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sách đã lưu"
                    onPress={() => router.push("./wishlist")}
                    style={({ pressed }) => [
                      styles.menuRow,
                      pressed && styles.menuRowPressed,
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="bookmark" size={18} color={stitchTokens.wine} />
                      </View>
                      <AppText
                        kind="bold"
                        style={{ fontSize: 14, color: stitchTokens.wineDark }}
                      >
                        Sách đã lưu
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Row 3: Sổ địa chỉ trạm ViaPoint */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sổ địa chỉ"
                    onPress={() => router.push("./addresses")}
                    style={({ pressed }) => [
                      styles.menuRow,
                      pressed && styles.menuRowPressed,
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="pin" size={18} color={stitchTokens.wine} />
                      </View>
                      <AppText
                        kind="bold"
                        style={{ fontSize: 14, color: stitchTokens.wineDark }}
                      >
                        Sổ địa chỉ
                      </AppText>
                    </View>
                    <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                  </Pressable>

                  {/* Row 4: Ví lưu ký */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ví lưu ký"
                    onPress={() => router.push("./wallet")}
                    style={({ pressed }) => [
                      styles.menuRow,
                      styles.menuRowLast,
                      pressed && styles.menuRowPressed,
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={styles.menuIconBox}>
                        <Icon name="wallet" size={18} color={stitchTokens.wine} />
                      </View>
                      <AppText
                        kind="bold"
                        style={{ fontSize: 14, color: stitchTokens.wineDark }}
                      >
                        Ví lưu ký & Đối soát
                      </AppText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={styles.menuCountBadge}>
                        <AppText
                          kind="small"
                          style={{ fontSize: 11, color: stitchTokens.wine, fontWeight: "700" }}
                        >
                          {wallet.data?.available != null
                            ? formatVnd(wallet.data.available)
                            : "0 ₫"}
                        </AppText>
                      </View>
                      <Icon name="chevronRight" size={16} color={stitchTokens.roseBrown} />
                    </View>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* 9. Nút Đăng Xuất */}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <View style={{ marginTop: 4 }}>
              <Button
                title="Đăng xuất"
                secondary
                busy={busy}
                onPress={() => void logout()}
              />
            </View>

            {/* Micro footer note */}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRoot: {
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerDivider: {
    width: 1,
    height: 18,
    backgroundColor: stitchTokens.goldAlpha40,
    marginHorizontal: 2,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerNotificationDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: stitchTokens.gold,
  },
  profileHeaderCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 2,
    borderColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: stitchTokens.likeNewGreen,
    borderWidth: 1.5,
    borderColor: stitchTokens.white,
    alignItems: "center",
    justifyContent: "center",
  },
  roleBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.canvasMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  walletCard: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 14,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  walletIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmTag,
    alignItems: "center",
    justifyContent: "center",
  },
  tagLocation: {
    backgroundColor: stitchTokens.roseWarmTag,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  balanceGrid: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: stitchTokens.peachMuted,
  },
  escrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: stitchTokens.tagFreeshipText,
  },
  walletBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.wine,
    paddingVertical: 9,
    borderRadius: 8,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  walletBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.white,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    paddingVertical: 9,
    borderRadius: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    justifyContent: "space-between",
    gap: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  coinIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.tagExchangeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  shieldIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardTag: {
    backgroundColor: stitchTokens.tagExchangeBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gradeTag: {
    backgroundColor: stitchTokens.canvasMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  guaranteeCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  guaranteeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: stitchTokens.wine,
  },
  actionItemCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionBookCoverBox: {
    width: 44,
    height: 58,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  truckIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  transitTag: {
    backgroundColor: stitchTokens.roseParchment,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  btnRespondPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: stitchTokens.wine,
    paddingVertical: 7,
    borderRadius: 6,
  },
  btnRespondSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: stitchTokens.parchment,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  recentBookCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  recentCoverBox: {
    width: 40,
    height: 52,
    borderRadius: 4,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  miniStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyBookCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  menuCard: {
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
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: stitchTokens.warmCard,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuRowPressed: {
    backgroundColor: stitchTokens.parchment,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  menuCountBadge: {
    backgroundColor: stitchTokens.canvasMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  microFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 16,
    paddingBottom: 8,
    opacity: 0.8,
  },
});
