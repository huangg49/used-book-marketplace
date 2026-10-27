import React, { useState } from "react";
import {
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  AppText,
  Icon,
  StatePanel,
  TopNavbar,
  colorRoles,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { publicListing } from "../shelf/contracts";
import {
  getPurchaseConversation,
} from "./purchase-conversation-service";
import { BookIdentityCard } from "./components/book-identity-card";
import { AgreementSheetPanel } from "./components/agreement-sheet-panel";
import { ChatMessagesPanel } from "./components/chat-messages-panel";
import { MemberNavigation } from "../navigation/member-navigation";

interface ConversationScreenProps {
  id: string;
}

export function ConversationScreen({ id }: ConversationScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const [activePanel, setActivePanel] = useState<"sheet" | "chat">("sheet");

  const conversationQuery = useQuery({
    queryKey: ["purchase-conversation", id],
    queryFn: () => getPurchaseConversation(client, id),
    enabled: Boolean(id) && state.status === "authenticated",
    refetchInterval: 5000,
  });

  const room = conversationQuery.data;

  const listingQuery = useQuery({
    queryKey: ["public-listing", room?.listingId],
    queryFn: () =>
      client.publicRequest(`/listings/${room!.listingId}`, publicListing),
    enabled: Boolean(room?.listingId),
  });

  const isExchange = room?.terms?.mode === "Exchange";
  const otherName =
    room && state.status === "authenticated"
      ? room.buyer.id === state.user.id
        ? room.seller.displayName
        : room.buyer.displayName
      : "Đối tác";

  if (conversationQuery.isLoading) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <TopNavbar
          subtitle="HỘI THOẠI"
          onNotificationsPress={() => router.push("/")}
          onMessagesPress={() => router.push("/chat-inbox")}
        />
        <View style={styles.subHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/chat-inbox");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>
          <AppText style={styles.subHeaderTitle}>Đang tải cuộc trò chuyện…</AppText>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StatePanel loading title="Đang mở cuộc trò chuyện & phiếu thỏa thuận…" />
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

  if (conversationQuery.isError || !room) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <TopNavbar
          subtitle="HỘI THOẠI"
          onNotificationsPress={() => router.push("/")}
          onMessagesPress={() => router.push("/chat-inbox")}
        />
        <View style={styles.subHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/chat-inbox");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>
          <AppText style={styles.subHeaderTitle}>Lỗi kết nối</AppText>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StatePanel
            title="Không tìm thấy cuộc trao đổi"
            message="Cuộc trao đổi này không tồn tại hoặc bạn không có quyền truy cập."
            action={{
              label: "Quay lại danh sách tin nhắn",
              onPress: () => router.push("/chat-inbox"),
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

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" />

      {/* 1. Header Đỉnh Đỏ Rượu Vang TopNavbar */}
      <TopNavbar
        subtitle={isExchange ? "TRAO ĐỔI SÁCH" : "THƯƠNG LƯỢNG MUA"}
        onNotificationsPress={() => router.push("/")}
        onMessagesPress={() => router.push("/chat-inbox")}
      />

      {/* 2. Subheader điều hướng Quay lại & Đối tác */}
      <View style={styles.subHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/chat-inbox");
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon name="back" size={18} color={stitchTokens.wineDark} />
          <AppText style={styles.backLabel}>Quay lại</AppText>
        </Pressable>

        <View style={styles.subHeaderCenter}>
          <AppText numberOfLines={1} style={styles.subHeaderTitle}>
            {isExchange ? "Trao đổi sách" : "Thương lượng mua"}
          </AppText>
          <AppText numberOfLines={1} style={styles.subHeaderSubtitle}>
            Cùng {otherName}
          </AppText>
        </View>

        <View style={{ width: 60 }} />
      </View>

      {/* 2. Banner nhận diện ấn phẩm sách */}
      <BookIdentityCard
        listing={listingQuery.data}
        room={room}
        isExchange={isExchange}
      />

      {/* 3. Thanh chuyển đổi 2 Panel (Segmented Tabs Bar) */}
      <View style={styles.segmentedTabBar} role="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Xem Phiếu thỏa thuận"
          accessibilityState={{ selected: activePanel === "sheet" }}
          style={[
            styles.segmentTab,
            activePanel === "sheet" && styles.segmentTabActive,
          ]}
          onPress={() => setActivePanel("sheet")}
        >
          <Icon
            name="ticket"
            size={16}
            color={
              activePanel === "sheet"
                ? stitchTokens.wineDark
                : colors.muted
            }
          />
          <AppText
            style={[
              styles.segmentTabText,
              activePanel === "sheet" && styles.segmentTabTextActive,
            ]}
          >
            Phiếu thỏa thuận
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Xem Hội thoại chat"
          accessibilityState={{ selected: activePanel === "chat" }}
          style={[
            styles.segmentTab,
            activePanel === "chat" && styles.segmentTabActive,
          ]}
          onPress={() => setActivePanel("chat")}
        >
          <Icon
            name="message"
            size={16}
            color={
              activePanel === "chat"
                ? stitchTokens.wineDark
                : colors.muted
            }
          />
          <AppText
            style={[
              styles.segmentTabText,
              activePanel === "chat" && styles.segmentTabTextActive,
            ]}
          >
            Hội thoại
          </AppText>
          <View style={styles.liveIndicator} />
        </Pressable>
      </View>

      {/* 4. Nội dung Panel hiển thị tương ứng */}
      <View style={styles.bodyWrapper}>
        {activePanel === "sheet" ? (
          <AgreementSheetPanel
            room={room}
            listing={listingQuery.data}
            onRefresh={() => {
              void conversationQuery.refetch();
              void listingQuery.refetch();
            }}
          />
        ) : (
          <ChatMessagesPanel
            room={room}
            listing={listingQuery.data}
            onRefresh={() => {
              void conversationQuery.refetch();
              void listingQuery.refetch();
            }}
            onRefreshEvents={() => void conversationQuery.refetch()}
          />
        )}
      </View>

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
  segmentedTabBar: {
    flexDirection: "row",
    backgroundColor: stitchTokens.parchment,
    marginHorizontal: space.md,
    marginTop: space.xs,
    marginBottom: space.xs,
    borderRadius: radius.card,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  segmentTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.small,
  },
  segmentTabActive: {
    backgroundColor: colors.surface,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  segmentTabTextActive: {
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.verifiedGreen,
  },
  bodyWrapper: {
    flex: 1,
  },
});
