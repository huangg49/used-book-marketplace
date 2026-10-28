import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  AppText,
  Button,
  Icon,
  Notice,
  StatePanel,
  TopNavbar,
  colorRoles,
  colors,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { exchangeSchema } from "./contracts";
import { publicListing } from "../shelf/contracts";
import { ExchangeProposalCard } from "./exchange-proposal-card";
import { ExchangeActionsCard } from "./exchange-actions-card";
import { ExchangeChatBox } from "./exchange-chat-box";
import { MemberNavigation } from "../navigation/member-navigation";

export function ExchangeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const initialTab = params.tab === "chat" ? "chat" : "proposal";

  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const foreground = useForeground();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [activePanel, setActivePanel] = useState<"proposal" | "chat">(initialTab);

  // 1. Fetch Exchange Data
  const exchangeQuery = useQuery({
    queryKey: ["exchange", id],
    queryFn: () => client.request(`/exchanges/${id}`, exchangeSchema),
    enabled: Boolean(id) && state.status === "authenticated" && foreground,
    refetchInterval: 5000,
  });

  const exchange = exchangeQuery.data;

  // 2. Fetch Initiator & Recipient Public Listings to get cover photos and metadata
  const primaryInitiatorId =
    exchange?.initiatorListingIds?.[0] ?? exchange?.initiatorListingId;

  const initiatorListingQuery = useQuery({
    queryKey: ["public-listing", primaryInitiatorId],
    queryFn: () => client.publicRequest(`/listings/${primaryInitiatorId}`, publicListing),
    enabled: Boolean(primaryInitiatorId) && foreground,
    staleTime: 60000,
  });

  const recipientListingQuery = useQuery({
    queryKey: ["public-listing", exchange?.recipientListingId],
    queryFn: () => client.publicRequest(`/listings/${exchange!.recipientListingId}`, publicListing),
    enabled: Boolean(exchange?.recipientListingId) && foreground,
    staleTime: 60000,
  });

  if (state.status !== "authenticated") {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <TopNavbar
          subtitle="CHI TIẾT TRAO ĐỔI"
          onNotificationsPress={() => router.push("/")}
          onMessagesPress={() => router.push("/chat-inbox")}
        />
        <View style={styles.subHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>
          <AppText style={styles.subHeaderTitle}>Yêu cầu đăng nhập</AppText>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StatePanel
            title="Yêu cầu đăng nhập"
            message="Vui lòng đăng nhập để xem chi tiết và tham gia đơn trao đổi sách."
            action={{
              label: "Đăng nhập",
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

  if (exchangeQuery.isPending) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <TopNavbar
          subtitle="CHI TIẾT TRAO ĐỔI"
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
          <AppText style={styles.subHeaderTitle}>Đang tải cuộc trao đổi…</AppText>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StatePanel loading title="Đang mở đơn trao đổi sách…" />
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

  if (exchangeQuery.error || !exchange) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="light-content" />
        <TopNavbar
          subtitle="CHI TIẾT TRAO ĐỔI"
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
        <View style={styles.errorContainer}>
          <Notice tone="error">
            {exchangeQuery.error
              ? presentError(exchangeQuery.error).message
              : "Không tìm thấy giao dịch trao đổi này."}
          </Notice>
          <Button
            title="Quay lại danh sách tin nhắn"
            secondary
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/chat-inbox");
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

  const isInitiator = exchange.initiatorId === currentUserId;
  const partnerAddressName = isInitiator
    ? exchange.recipientAddress?.recipientName
    : exchange.initiatorAddress?.recipientName;
  const partnerName = isInitiator
    ? recipientListingQuery.data?.seller.displayName ?? partnerAddressName ?? "Đối tác"
    : initiatorListingQuery.data?.seller.displayName ?? partnerAddressName ?? "Đối tác trao đổi";

  const isReadOnly = ["Completed", "Cancelled"].includes(exchange.status);

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" />

      {/* 1. Header Đỉnh Đỏ Rượu Vang TopNavbar */}
      <TopNavbar
        subtitle="CHI TIẾT TRAO ĐỔI"
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
            Trao đổi cùng @{partnerName}
          </AppText>
          <AppText numberOfLines={1} style={styles.subHeaderSubtitle}>
            Mã giao dịch: #{exchange.id.slice(0, 8).toUpperCase()}
          </AppText>
        </View>

        <View style={{ width: 60 }} />
      </View>

      {/* 3. Thanh chuyển đổi 2 Panel (Segmented Tabs Bar) */}
      <View style={styles.segmentedTabBar} role="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Xem Phiếu trao đổi"
          accessibilityState={{ selected: activePanel === "proposal" }}
          style={[
            styles.segmentTab,
            activePanel === "proposal" && styles.segmentTabActive,
          ]}
          onPress={() => setActivePanel("proposal")}
        >
          <Icon
            name="ticket"
            size={16}
            color={
              activePanel === "proposal"
                ? stitchTokens.wineDark
                : colors.muted
            }
          />
          <AppText
            style={[
              styles.segmentTabText,
              activePanel === "proposal" && styles.segmentTabTextActive,
            ]}
          >
            Phiếu trao đổi
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Xem Trò chuyện"
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
            Trò chuyện
          </AppText>
        </Pressable>
      </View>

      {/* 4. Panel Nội dung */}
      {activePanel === "proposal" ? (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* PHẦN TRÊN: ĐƠN TRAO ĐỔI (Proposal & Books Matching) */}
          <ExchangeProposalCard
            exchange={exchange}
            isInitiator={isInitiator}
            initiatorListing={initiatorListingQuery.data}
            recipientListing={recipientListingQuery.data}
          />

          {exchange.status==='Completed'?<Button wine secondary title="Xem hoặc viết đánh giá" onPress={()=>router.push({pathname:'/reviews',params:{type:'Exchange',id:exchange.id}})}/>:null}
          {/* HÀNH ĐỘNG TIẾP THEO (Accept, Reject, Cancel, Fund, Ship, Receive) */}
          <ExchangeActionsCard
            exchange={exchange}
            isInitiator={isInitiator}
          />
        </ScrollView>
      ) : (
        <View style={styles.chatContainer}>
          <ExchangeChatBox
            exchangeId={exchange.id}
            partnerName={partnerName}
            isReadOnly={isReadOnly}
          />
        </View>
      )}

      {/* 5. Bottom Navbar chuẩn nền trắng */}
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
    backgroundColor: stitchTokens.parchment,
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
  tabContent: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.section,
    gap: space.md,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  errorContainer: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
    justifyContent: "center",
  },
  footerContainer: {
    backgroundColor: colorRoles.navigationBackground,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  pressed: {
    opacity: 0.7,
  },
});
