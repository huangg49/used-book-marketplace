import React, { useEffect, useState } from "react";
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
import { confirmExchangeRead, readExchange } from "@used-books/session-client";
import {
  AppText,
  Button,
  Icon,
  Notice,
  StatePanel,
  presentError,
  space,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { exchangeSchema } from "./contracts";
import {
  ExchangeBookGroup,
  ExchangeFundingHistoryCard,
  ExchangeInspectionHistoryCard,
  ExchangeProposalCard,
} from "./exchange-proposal-card";
import { ExchangeActionsCard } from "./exchange-actions-card";
import {
  ExchangeProgressStepper,
  getCurrentExchangeStep,
  getExchangeStageHero,
  hasExchangeStepFacts,
  type ExchangeStepId,
} from "./exchange-progress-stepper";
import { ExchangeShippingCard } from "./exchange-shipping-card";
import { ExchangeSettlementCard } from "./exchange-settlement-card";
import { ExchangeSafetyTips } from "./exchange-safety-tips";
import { ExchangeChatBox } from "./exchange-chat-box";
import { ExchangeReturnAndDemoCard } from "./exchange-return-card";
import { ExchangeEvidenceCard } from "./exchange-evidence-card";
import {
  ExchangeRecoveryPanel,
  useExchangeRecovery,
} from "./exchange-recovery";

export function ExchangeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const initialTab = params.tab === "chat" ? "chat" : "proposal";

  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const foreground = useForeground();
  const { identity, ack } = useExchangeRecovery(id);
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [activePanel, setActivePanel] = useState<"proposal" | "chat">(
    initialTab,
  );
  const [historySelection, setHistorySelection] = useState<{
    forLiveStep: ExchangeStepId;
    step: ExchangeStepId | null;
  }>({ forLiveStep: "proposal", step: null });

  const exchangeQuery = useQuery({
    queryKey: ["exchange", id, identity],
    queryFn: () => readExchange(client, id, exchangeSchema),
    enabled: Boolean(id) && state.status === "authenticated" && foreground,
    refetchInterval: 5000,
  });

  const exchange =
    ack && (!exchangeQuery.data || ack.revision > exchangeQuery.data.revision)
      ? ack
      : exchangeQuery.data;

  useEffect(() => {
    if (exchangeQuery.data) {
      confirmExchangeRead(client, id, exchangeQuery.data.revision);
    }
  }, [client, id, exchangeQuery.data, exchangeQuery.dataUpdatedAt, identity]);

  const liveStep = exchange
    ? getCurrentExchangeStep(exchange.status)
    : "proposal";
  const viewedHistoryStep =
    historySelection.forLiveStep === liveStep ? historySelection.step : null;
  const setViewedHistoryStep = (step: ExchangeStepId | null) =>
    setHistorySelection({ forLiveStep: liveStep, step });

  const handleBack = () => {
    if (activePanel === "chat") {
      setActivePanel("proposal");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/exchanges");
  };

  if (state.status !== "authenticated") {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="dark-content" />
        <View
          style={[styles.topBarShell, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.navBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              hitSlop={8}
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="back" size={19} color={stitchTokens.darkWood} />
            </Pressable>
            <AppText style={styles.simpleHeaderTitle}>
              Chi tiết trao đổi
            </AppText>
            <View style={styles.headerSpacer} />
          </View>
        </View>
        <View style={styles.centeredBox}>
          <StatePanel
            title="Yêu cầu đăng nhập"
            message="Đăng nhập để xem chi tiết và thao tác trên phiếu trao đổi sách."
            action={{
              label: "Đăng nhập",
              onPress: () => router.push("/account"),
            }}
          />
        </View>
      </View>
    );
  }

  if (exchangeQuery.isPending && !exchange) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="dark-content" />
        <View
          style={[styles.topBarShell, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.navBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              hitSlop={8}
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="back" size={19} color={stitchTokens.darkWood} />
            </Pressable>
            <AppText style={styles.simpleHeaderTitle}>
              Đang tải phiếu trao đổi…
            </AppText>
            <View style={styles.headerSpacer} />
          </View>
        </View>
        <View style={styles.centeredBox}>
          <StatePanel loading title="Đang mở phiếu trao đổi…" />
        </View>
      </View>
    );
  }

  if (!exchange) {
    return (
      <View style={styles.screenRoot}>
        <StatusBar barStyle="dark-content" />
        <View
          style={[styles.topBarShell, { paddingTop: Math.max(insets.top, 8) }]}
        >
          <View style={styles.navBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              hitSlop={8}
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="back" size={19} color={stitchTokens.darkWood} />
            </Pressable>
            <AppText style={styles.simpleHeaderTitle}>
              Không tìm thấy phiếu
            </AppText>
            <View style={styles.headerSpacer} />
          </View>
        </View>
        <View style={styles.errorContainer}>
          <ExchangeRecoveryPanel
            id={id}
            onRead={async () => {
              const result = await exchangeQuery.refetch();
              if (result.error) throw result.error;
            }}
          />
          <Notice tone="error">
            {exchangeQuery.error
              ? presentError(exchangeQuery.error).message
              : "Không tìm thấy phiếu trao đổi này."}
          </Notice>
          <Button
            title="Về danh sách trao đổi"
            secondary
            onPress={() => router.replace("/exchanges")}
          />
        </View>
      </View>
    );
  }

  const isInitiator = exchange.initiatorId === currentUserId;
  const partnerAddressName = isInitiator
    ? exchange.recipientAddress?.recipientName
    : exchange.initiatorAddress?.recipientName;
  const partnerName =
    (isInitiator
      ? exchange.agreement?.recipientBook.ownerDisplayName
      : exchange.agreement?.initiatorBooks[0]?.ownerDisplayName) ??
    partnerAddressName ??
    "Đối tác";
  const partnerInitial = (partnerName.trim()[0] || "Đ").toUpperCase();

  const isReadOnly = ["Completed", "Cancelled"].includes(exchange.status);
  const selectedStep: ExchangeStepId =
    viewedHistoryStep &&
    viewedHistoryStep !== liveStep &&
    hasExchangeStepFacts(viewedHistoryStep, exchange)
      ? viewedHistoryStep
      : liveStep;
  const isViewingHistory = selectedStep !== liveStep;
  const reload = async () => {
    await exchangeQuery.refetch();
  };

  const stageInfo = getExchangeStageHero(
    exchange,
    isInitiator,
    currentUserId,
    partnerName,
  );

  const receiveBooks = exchange.agreement
    ? isInitiator
      ? [exchange.agreement.recipientBook]
      : exchange.agreement.initiatorBooks
    : [];

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="dark-content" />

      {/* Single Ultra-Clean Slim Top App Bar (~52px) */}
      <View
        style={[styles.topBarShell, { paddingTop: Math.max(insets.top, 8) }]}
      >
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={8}
            onPress={handleBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={19} color={stitchTokens.darkWood} />
          </Pressable>

          <View style={styles.partnerPill}>
            <View style={styles.partnerAvatar}>
              <AppText style={styles.partnerInitial}>{partnerInitial}</AppText>
            </View>
            <View style={styles.partnerTextCol}>
              <AppText numberOfLines={1} style={styles.partnerName}>
                {partnerName}
              </AppText>
              <AppText numberOfLines={1} style={styles.partnerCode}>
                Phiếu #{exchange.id.slice(0, 8).toUpperCase()}
              </AppText>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activePanel === "chat" ? "Xem phiếu trao đổi" : "Mở trò chuyện"
            }
            hitSlop={6}
            onPress={() =>
              setActivePanel((prev) =>
                prev === "proposal" ? "chat" : "proposal",
              )
            }
            style={({ pressed }) => [
              styles.chatPillBtn,
              activePanel === "chat" && styles.chatPillBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name={activePanel === "chat" ? "ticket" : "message"}
              size={14}
              color={
                activePanel === "chat" ? stitchTokens.white : stitchTokens.wine
              }
            />
            <AppText
              style={[
                styles.chatPillText,
                activePanel === "chat" && styles.chatPillTextActive,
              ]}
            >
              {activePanel === "chat" ? "Phiếu" : "Nhắn tin"}
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Main Scrollable Content + Sticky Thumb-Zone Bottom Dock */}
      {activePanel === "proposal" ? (
        <ExchangeActionsCard
          exchange={exchange}
          isInitiator={isInitiator}
          partnerName={partnerName}
          readError={Boolean(exchangeQuery.error)}
          onReload={reload}
          isViewingHistory={isViewingHistory}
          onReturnToLive={() => setViewedHistoryStep(null)}
          onOpenChat={() => setActivePanel("chat")}
          bottomInset={Math.max(insets.bottom, 12)}
          renderScrollBody={(actionsBody) => (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {exchangeQuery.error ? (
                <Notice tone="error">
                  Chưa tải được trạng thái mới nhất. Dữ liệu đã xác nhận được
                  giữ lại.
                </Notice>
              ) : null}

              {/* Hướng 1: Compact 5-Segment Progress Card + Vertical Timeline Bottom Sheet */}
              <ExchangeProgressStepper
                exchange={exchange}
                selectedStep={selectedStep}
                onSelectStep={(step) =>
                  setViewedHistoryStep(step === liveStep ? null : step)
                }
                stageInfo={stageInfo}
                bottomInset={Math.max(insets.bottom, 16)}
              />

              {isViewingHistory ? (
                <View style={styles.workspace}>
                  {selectedStep === "proposal" ? (
                    <ExchangeProposalCard
                      exchange={exchange}
                      isInitiator={isInitiator}
                    />
                  ) : selectedStep === "funding" ? (
                    <ExchangeFundingHistoryCard
                      exchange={exchange}
                      isInitiator={isInitiator}
                    />
                  ) : selectedStep === "handover" ? (
                    <ExchangeShippingCard
                      exchange={exchange}
                      isInitiator={isInitiator}
                      partnerName={partnerName}
                      history
                    />
                  ) : (
                    <>
                      <ExchangeInspectionHistoryCard
                        exchange={exchange}
                        isInitiator={isInitiator}
                      />
                      {receiveBooks.length > 0 ? (
                        <ExchangeBookGroup
                          title="Sách bạn đã nhận"
                          books={receiveBooks}
                          exchangeId={exchange.id}
                          incoming
                        />
                      ) : null}
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.workspace}>
                  {exchange.status === "Completed" ? (
                    <ExchangeSettlementCard
                      exchange={exchange}
                      isInitiator={isInitiator}
                    />
                  ) : null}

                  {actionsBody}

                  {exchange.status === "Proposed" ? (
                    <ExchangeProposalCard
                      exchange={exchange}
                      isInitiator={isInitiator}
                    />
                  ) : null}

                  {exchange.status === "Delivered" &&
                  receiveBooks.length > 0 ? (
                    <ExchangeBookGroup
                      title="Sách bạn đã nhận"
                      subtitle={`Đối chiếu tình trạng gốc từ ${partnerName}`}
                      books={receiveBooks}
                      exchangeId={exchange.id}
                      incoming
                    />
                  ) : null}

                  {exchange.status === "ResolutionPending" ? (
                    <ExchangeEvidenceCard
                      key={identity + ":" + id}
                      id={id}
                      revision={exchange.revision}
                    />
                  ) : null}

                  <ExchangeReturnAndDemoCard
                    exchange={exchange}
                    userId={currentUserId ?? ""}
                    onReload={reload}
                  />

                  <ExchangeSafetyTips />
                </View>
              )}
            </ScrollView>
          )}
        />
      ) : (
        <View
          style={[
            styles.chatContainer,
            { paddingBottom: Math.max(insets.bottom, 6) },
          ]}
        >
          <ExchangeChatBox
            exchangeId={exchange.id}
            partnerName={partnerName}
            isReadOnly={isReadOnly}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  topBarShell: {
    backgroundColor: stitchTokens.whiteSurface,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderParchmentSoft,
  },
  navBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  simpleHeaderTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  headerSpacer: {
    width: 36,
  },
  partnerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
  },
  partnerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerInitial: {
    fontSize: 13.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  partnerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  partnerName: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  partnerCode: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  chatPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  chatPillBtnActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  chatPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  chatPillTextActive: {
    color: stitchTokens.white,
  },
  pressed: {
    opacity: 0.72,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  workspace: {
    gap: 12,
  },
  centeredBox: {
    flex: 1,
    justifyContent: "center",
    padding: space.lg,
  },
  errorContainer: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
    justifyContent: "center",
  },
  chatContainer: {
    flex: 1,
    backgroundColor: stitchTokens.whiteSurface,
  },
});
