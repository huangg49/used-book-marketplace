import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { currentUserSchema } from "../../core/api/schemas";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  ActionRow,
  AppText,
  Button,
  Notice,
  Screen,
  StatePanel,
  TopNavbar,
  presentError,
  space,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { useNotifications } from "../notifications/notifications-model";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";
export function AccountScreen() {
  const { client, state } = useSession(),
    foreground = useForeground();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notificationsOpen, setNotificationsOpen] = useState(false);
  const owner = state.status === "authenticated" ? state.user.id : undefined;
  const profile = useQuery({
    queryKey: ["me", owner],
    queryFn: () => client.request("/auth/me", currentUserSchema),
    enabled: foreground && !!owner,
    retry: false,
  });
  const notifications = useNotifications(client, !!owner);
  const user =
    profile.data ?? (state.status === "authenticated" ? state.user : undefined);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await client.logout();
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      appearance="home"
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
    >
      <TopNavbar
        notificationCount={notifications.data?.unreadCount ?? 0}
        hasNotification={(notifications.data?.unreadCount ?? 0) > 0}
        onMessagesPress={() => router.push("/chat-inbox")}
        onNotificationsPress={() => setNotificationsOpen(true)}
      />
      <View style={{ padding: space.lg, gap: space.lg }}>
        <AppText kind="title" accessibilityRole="header">
          Việc của tôi
        </AppText>
        <AppText>
          Chào {user?.displayName ?? "bạn"}. Chọn việc đang làm để tiếp tục từ
          đúng giao dịch.
        </AppText>
        <Button
          wine
          title="Cách mua, bán, đổi và đấu giá"
          onPress={() => router.push("/guide")}
        />
        {profile.isPending ? (
          <StatePanel wine loading title="Đang cập nhật tài khoản…" />
        ) : null}
        {profile.error ? (
          <StatePanel
            wine
            title="Chưa cập nhật được tài khoản"
            message="Bạn đang xem thông tin phiên đăng nhập. Mở giao dịch để kiểm tra trạng thái hiện tại."
            action={{
              label: "Thử lại",
              busy: profile.isFetching,
              onPress: () => void profile.refetch(),
            }}
          />
        ) : null}
        {user && user.status !== "ACTIVE" ? (
          <Notice tone="warning">
            Tài khoản đang bị hạn chế hoặc khóa. Các nghĩa vụ trong giao dịch cũ
            vẫn phụ thuộc quyền hiện tại; bạn không được mở giao dịch mới.
          </Notice>
        ) : null}
        <View>
          <AppText kind="heading" accessibilityRole="header">
            Tiếp tục giao dịch
          </AppText>
          <AppText kind="small">
            Đơn trực tiếp, trao đổi và đơn đấu giá có nơi theo dõi riêng.
          </AppText>
          <ActionRow
            title="Đơn mua/bán trực tiếp"
            description="Thanh toán, xác nhận và theo dõi đơn mua hoặc đơn bán."
            icon="book"
            onPress={() => router.push("/orders")}
          />
          <ActionRow
            title="Trao đổi của tôi"
            description="Đề nghị đã gửi, nhận được và giao dịch đang đổi."
            icon="swap"
            onPress={() => router.push("/exchanges")}
          />
          <ActionRow
            title="Đấu giá của tôi"
            description="Phiên đã tham gia, sách gửi đấu giá và đơn thắng đấu giá."
            icon="gavel"
            onPress={() => router.push("/my-auctions")}
          />
          <ActionRow
            title="Trò chuyện"
            description="Thương lượng và trao đổi trong đúng hội thoại giao dịch."
            icon="message"
            onPress={() => router.push("/chat-inbox")}
          />
        </View>
        <View>
          <AppText kind="heading" accessibilityRole="header">
            Tìm hoặc đăng sách
          </AppText>
          <ActionRow
            title="Tìm sách"
            description="Xem sách để mua hoặc đổi; mở từng bản sách để chọn thao tác."
            icon="search"
            onPress={() => router.push("/search")}
          />
          <ActionRow
            title="Kệ sách của tôi"
            description="Bản nháp, bài chờ duyệt, bài cần sửa và sách đang hiển thị. Chọn tạo bản nháp để đăng sách mới."
            icon="book"
            onPress={() => router.push("/drafts")}
          />
        </View>
        <View style={{ gap: space.md }}>
          <AppText kind="heading" accessibilityRole="header">
            Thông tin và đánh giá
          </AppText>
          <Button
            wine
            secondary
            title="Ví của tôi"
            onPress={() => router.push("/wallet")}
          />
          <Button
            wine
            secondary
            title="Địa chỉ của tôi"
            onPress={() => router.push("/addresses")}
          />
          <Button
            wine
            secondary
            title="Sách yêu thích"
            onPress={() => router.push("/wishlist")}
          />
          <Button
            wine
            secondary
            title="Đánh giá giao dịch & hồ sơ uy tín"
            onPress={() => router.push("/reviews")}
          />
          <AppText kind="small">
            Số dư và trạng thái thật được hiển thị trong từng mục. Chỉ đánh giá
            được giao dịch đã hoàn tất và đủ điều kiện.
          </AppText>
        </View>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          secondary
          title="Đăng xuất"
          busy={busy}
          onPress={() => void logout()}
        />
      </View>
      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </Screen>
  );
}
