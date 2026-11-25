import React, { useState } from "react";
import { Pressable, StatusBar, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, pendingSellerOrder } from "@used-books/session-client";
import {
  AppText,
  Icon,
  StatePanel,
  space,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { useTransactionLive } from "../../core/hooks/use-transaction-live";
import { publicListing } from "../shelf/contracts";
import { getPurchaseConversation, sellerOrderPrice } from "./purchase-conversation-service";
import { BookIdentityCard } from "./components/book-identity-card";
import { BundleManifest } from "../bundles/bundle-manifest";
import { AgreementSheetPanel } from "./components/agreement-sheet-panel";
import { ChatMessagesPanel } from "./components/chat-messages-panel";
import { CreateOrderDialog } from "./components/create-order-dialog";

interface ConversationScreenProps {
  id: string;
}

export function ConversationScreen({ id }: ConversationScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<"sheet" | "chat">("sheet");
  const [orderDialog, setOrderDialog] = useState<{
    key: string;
    afterCreate?: (price: number) => void;
  }>();
  const [confirmedOrder, setConfirmedOrder] = useState<string>();
  const userId = state.status === "authenticated" ? state.user.id : undefined;
  const foreground = useForeground();
  const roomKey = ["purchase-conversation", id, userId] as const;
  const live = useTransactionLive("conversation", id, foreground, () => {
    void queryClient.invalidateQueries({ queryKey: roomKey, exact: true });
  });

  const conversationQuery = useQuery({
    queryKey: roomKey,
    queryFn: () => getPurchaseConversation(client, id),
    enabled: Boolean(id) && Boolean(userId),
    refetchInterval: !foreground ? false : live ? 30_000 : 5_000,
  });

  const room = conversationQuery.data;

  const listingQuery = useQuery({
    queryKey: ["public-listing", room?.listingId],
    queryFn: () =>
      client.publicRequest(
        `/listings/${room!.listingId}?bundleSupport=whole-v1`,
        publicListing,
      ),
    enabled: Boolean(room?.listingId),
  });

  const isExchange = room?.terms?.mode === "Exchange";
  const otherName =
    room && state.status === "authenticated"
      ? room.buyer.id === state.user.id
        ? room.seller.displayName
        : room.buyer.displayName
      : "Đối tác";

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/chat-inbox");
  };

  if (conversationQuery.isLoading) {
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
            <AppText style={styles.headerTitle}>Đang mở cuộc trao đổi</AppText>
            <AppText style={styles.headerSubtitle}>Vui lòng chờ trong giây lát</AppText>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerWrap}>
          <StatePanel
            loading
            title="Đang tải hội thoại và phiếu thỏa thuận…"
          />
        </View>
      </View>
    );
  }

  if (
    !room ||
    !userId ||
    (conversationQuery.error instanceof ApiError &&
      [401, 403, 404].includes(conversationQuery.error.status))
  ) {
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
            <AppText style={styles.headerTitle}>Không mở được hội thoại</AppText>
            <AppText style={styles.headerSubtitle}>Kiểm tra lại kết nối</AppText>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerWrap}>
          <StatePanel
            title="Không tìm thấy cuộc trao đổi"
            message="Cuộc trao đổi này không tồn tại hoặc bạn không có quyền truy cập."
            action={{
              label: "Quay lại danh sách giao dịch",
              onPress: () => router.replace("/chat-inbox"),
            }}
          />
        </View>
      </View>
    );
  }

  const seller = room.seller.id === userId;
  const dialogKey = `${userId}:${room.id}`;
  const canOpenOrder = seller && !room.orderId && confirmedOrder !== dialogKey &&
    (Boolean(pendingSellerOrder(client, room.id)) ||
      sellerOrderPrice(room, listingQuery.data?.revisionId) != null);
  const refresh = () => {
    void conversationQuery.refetch();
    void listingQuery.refetch();
  };
  const openCreateOrder = canOpenOrder
    ? (afterCreate?: (price: number) => void) => setOrderDialog({ key: dialogKey, afterCreate })
    : undefined;

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" />

      {/* 1. Unified Deep-Wine Curved Header */}
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
          <AppText numberOfLines={1} style={styles.headerTitle}>
            {isExchange ? "Trao đổi sách" : "Thương lượng mua"}
          </AppText>
          <AppText numberOfLines={1} style={styles.headerSubtitle}>
            Cùng {otherName}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xem chi tiết bài đăng sách"
          hitSlop={8}
          onPress={() =>
            router.push({
              pathname: "/book",
              params: { id: room.listingId },
            })
          }
          style={({ pressed }) => [
            styles.headerCircleBtn,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="book" size={18} color={stitchTokens.gold} />
        </Pressable>
      </View>

      {/* 2. Segmented Switcher: Phiếu thỏa thuận vs Hội thoại */}
      <View style={styles.segmentedTabBar} role="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Xem Phiếu thỏa thuận"
          accessibilityState={{ selected: activePanel === "sheet" }}
          style={({ pressed }) => [
            styles.segmentTab,
            activePanel === "sheet" && styles.segmentTabActive,
            pressed && styles.pressed,
          ]}
          onPress={() => setActivePanel("sheet")}
        >
          <Icon
            name="ticket"
            size={15}
            color={
              activePanel === "sheet"
                ? stitchTokens.white
                : stitchTokens.deepCocoa
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
          style={({ pressed }) => [
            styles.segmentTab,
            activePanel === "chat" && styles.segmentTabActive,
            pressed && styles.pressed,
          ]}
          onPress={() => setActivePanel("chat")}
        >
          <Icon
            name="message"
            size={15}
            color={
              activePanel === "chat"
                ? stitchTokens.white
                : stitchTokens.deepCocoa
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
          <View
            style={[
              styles.liveIndicator,
              activePanel === "chat" && styles.liveIndicatorActive,
            ]}
          />
        </Pressable>
      </View>

      {/* 3. Book Context Card (compact strip in Chat tab so messages get room) */}
      <BookIdentityCard
        listing={listingQuery.data}
        room={room}
        isExchange={isExchange}
        compact={activePanel === "chat"}
      />
      {activePanel === "sheet" && (
        <BundleManifest bundle={listingQuery.data?.bundle} />
      )}

      {/* 4. Focused Workspace Body (no bottom 5-tab bar blocking keyboard) */}
      <View
        style={[
          styles.bodyWrapper,
          { paddingBottom: Math.max(insets.bottom, 6) },
        ]}
      >
        {activePanel === "sheet" ? (
          <AgreementSheetPanel
            room={room}
            listing={listingQuery.data}
            onRefresh={refresh}
            onOpenCreateOrder={openCreateOrder}
          />
        ) : (
          <ChatMessagesPanel
            room={room}
            listing={listingQuery.data}
            onRefresh={refresh}
            onRefreshEvents={() => void conversationQuery.refetch()}
            onOpenCreateOrder={openCreateOrder}
          />
        )}
      </View>
      {seller && orderDialog?.key === dialogKey ? (
        <CreateOrderDialog
          key={dialogKey}
          visible
          room={room}
          listingRevision={listingQuery.data?.revisionId}
          listingPrice={listingQuery.data?.salePrice ?? undefined}
          onClose={() => setOrderDialog(undefined)}
          onRefresh={refresh}
          onCreated={(price) => {
            setConfirmedOrder(dialogKey);
            refresh();
            void queryClient.invalidateQueries({ queryKey: ["orders"] });
            orderDialog.afterCreate?.(price);
          }}
        />
      ) : null}
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
    paddingBottom: 14,
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
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.gold,
    fontWeight: "600",
    marginTop: 2,
    includeFontPadding: false,
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  pressed: {
    opacity: 0.78,
  },
  segmentedTabBar: {
    flexDirection: "row",
    backgroundColor: stitchTokens.whiteSurface,
    marginHorizontal: space.lg,
    marginTop: space.md,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 4,
  },
  segmentTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 38,
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentTabActive: {
    backgroundColor: stitchTokens.wineDark,
  },
  segmentTabText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  segmentTabTextActive: {
    color: stitchTokens.white,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.verifiedGreen,
  },
  liveIndicatorActive: {
    backgroundColor: stitchTokens.gold,
  },
  bodyWrapper: {
    flex: 1,
  },
});
