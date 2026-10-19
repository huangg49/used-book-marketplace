import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { AppText, Button, Icon, Notice, Screen, StatePanel, presentError, space, stitchTokens } from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { exchangeSchema } from "./contracts";
import { publicListing } from "../shelf/contracts";
import { ExchangeProposalCard } from "./exchange-proposal-card";
import { ExchangeActionsCard } from "./exchange-actions-card";
import { ExchangeChatBox } from "./exchange-chat-box";

export function ExchangeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const { client, state } = useSession();
  const foreground = useForeground();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

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
    queryFn: () => client.request(`/listings/${primaryInitiatorId}`, publicListing),
    enabled: Boolean(primaryInitiatorId) && foreground,
  });

  const recipientListingQuery = useQuery({
    queryKey: ["public-listing", exchange?.recipientListingId],
    queryFn: () => client.request(`/listings/${exchange!.recipientListingId}`, publicListing),
    enabled: Boolean(exchange?.recipientListingId) && foreground,
  });

  if (state.status !== "authenticated") {
    return (
      <Screen appearance="browse">
        <StatePanel
          title="Yêu cầu đăng nhập"
          message="Vui lòng đăng nhập để xem chi tiết và tham gia đơn trao đổi sách."
          action={{
            label: "Đăng nhập",
            onPress: () => router.push("/account"),
          }}
        />
      </Screen>
    );
  }

  if (exchangeQuery.isPending) {
    return (
      <Screen appearance="browse">
        <StatePanel loading title="Đang mở đơn trao đổi sách…" />
      </Screen>
    );
  }

  if (exchangeQuery.error || !exchange) {
    return (
      <Screen appearance="browse">
        <View style={styles.errorContainer}>
          <Notice tone="error">
            {exchangeQuery.error
              ? presentError(exchangeQuery.error).message
              : "Không tìm thấy giao dịch trao đổi này."}
          </Notice>
          <Button
            title="Quay lại"
            secondary
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
          />
        </View>
      </Screen>
    );
  }

  const isInitiator = exchange.initiatorId === currentUserId;
  const partnerName = isInitiator
    ? recipientListingQuery.data?.seller.displayName ?? "Đối tác"
    : initiatorListingQuery.data?.seller.displayName ?? "Người đề nghị";

  const isReadOnly = ["Completed", "Cancelled"].includes(exchange.status);

  return (
    <Screen
      appearance="browse"
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={20} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>

          <AppText style={styles.headerTitle}>Chi tiết trao đổi</AppText>

          <View style={{ width: 40 }} />
        </View>
      }
    >
      <View style={styles.scrollContent}>
        {/* PHẦN TRÊN: ĐƠN TRAO ĐỔI (Proposal & Books Matching) */}
        <ExchangeProposalCard
          exchange={exchange}
          isInitiator={isInitiator}
          initiatorListing={initiatorListingQuery.data}
          recipientListing={recipientListingQuery.data}
        />

        {/* HÀNH ĐỘNG TIẾP THEO (Accept, Reject, Cancel, Fund, Ship, Receive) */}
        <ExchangeActionsCard
          exchange={exchange}
          isInitiator={isInitiator}
        />

        {/* PHẦN DƯỚI: HỘP NHẮN TIN TRỰC TIẾP GIỐNG TRÊN WEB */}
        <ExchangeChatBox
          exchangeId={exchange.id}
          partnerName={partnerName}
          isReadOnly={isReadOnly}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.roseWarmBlur,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.section,
    gap: space.md,
  },
  errorContainer: {
    padding: space.lg,
    gap: space.md,
  },
  pressed: {
    opacity: 0.7,
  },
});
