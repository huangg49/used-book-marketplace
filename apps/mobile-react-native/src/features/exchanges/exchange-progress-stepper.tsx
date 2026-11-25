import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppModal, AppText, Icon, stitchTokens } from "../../core/ui";
import type { Exchange, ExchangeStatus } from "./contracts";

export type ExchangeStepId =
  | "proposal"
  | "funding"
  | "handover"
  | "inspection"
  | "result";

export const EXCHANGE_STEPS: readonly {
  id: ExchangeStepId;
  number: number;
  label: string;
}[] = [
  { id: "proposal", number: 1, label: "Đề nghị" },
  { id: "funding", number: 2, label: "Đặt cọc" },
  { id: "handover", number: 3, label: "Giao nhận" },
  { id: "inspection", number: 4, label: "Kiểm tra" },
  { id: "result", number: 5, label: "Kết quả" },
];

export function getCurrentExchangeStep(status: ExchangeStatus): ExchangeStepId {
  switch (status) {
    case "Proposed":
      return "proposal";
    case "AcceptedAwaitingFunding":
      return "funding";
    case "Preparing":
    case "InTransit":
      return "handover";
    case "Delivered":
      return "inspection";
    case "Completed":
    case "Cancelled":
    case "ResolutionPending":
    default:
      return "result";
  }
}

export function hasExchangeStepFacts(
  step: ExchangeStepId,
  exchange: Exchange,
): boolean {
  const funded = Boolean(
    exchange.initiatorFundedAt && exchange.recipientFundedAt,
  );
  switch (step) {
    case "proposal":
      return true;
    case "funding":
      return (
        funded ||
        Boolean(
          exchange.initiatorFundedAt ||
            exchange.recipientFundedAt ||
            exchange.fundingDeadline,
        )
      );
    case "handover":
      return (
        funded ||
        Boolean(
          exchange.initiatorShippedAt ||
            exchange.recipientShippedAt ||
            exchange.initiatorShipment ||
            exchange.recipientShipment,
        )
      );
    case "inspection":
      return Boolean(
        exchange.initiatorReceivedAt && exchange.recipientReceivedAt,
      );
    default:
      return false;
  }
}

export function hasExchangeStepCompleted(
  step: ExchangeStepId,
  current: ExchangeStepId,
  exchange: Exchange,
): boolean {
  switch (step) {
    case "proposal":
      return (
        current !== "result" ||
        Boolean(
          exchange.fundingDeadline ||
            exchange.initiatorFundedAt ||
            exchange.recipientFundedAt,
        )
      );
    case "funding":
      return Boolean(exchange.initiatorFundedAt && exchange.recipientFundedAt);
    case "handover":
      return Boolean(
        exchange.initiatorReceivedAt && exchange.recipientReceivedAt,
      );
    case "inspection":
      return exchange.status === "Completed";
    default:
      return false;
  }
}

export function getExchangeStepLabel(
  step: ExchangeStepId,
  status: ExchangeStatus,
): string {
  if (step === "result" && status === "ResolutionPending") {
    return "Tranh chấp";
  }
  return EXCHANGE_STEPS.find((s) => s.id === step)?.label ?? "Kết quả";
}

export interface ExchangeStageHeroInfo {
  badge: string;
  title: string;
  subtitle: string;
  deadlineLabel?: string;
  deadlineIso?: string | null;
  actionNeeded: boolean;
  tone: "wine" | "success" | "danger" | "neutral";
}

export function getExchangeStageHero(
  exchange: Exchange,
  isInitiator: boolean,
  currentUserId: string | null,
  partnerName: string,
): ExchangeStageHeroInfo {
  const isFundedByMe = isInitiator
    ? Boolean(exchange.initiatorFundedAt)
    : Boolean(exchange.recipientFundedAt);
  const isShippedByMe = isInitiator
    ? Boolean(exchange.initiatorShippedAt || exchange.initiatorShipment)
    : Boolean(exchange.recipientShippedAt || exchange.recipientShipment);
  const isPartnerShipped = isInitiator
    ? Boolean(exchange.recipientShippedAt || exchange.recipientShipment)
    : Boolean(exchange.initiatorShippedAt || exchange.initiatorShipment);
  const isPartnerPickedUp = isInitiator
    ? Boolean(exchange.recipientShippedAt)
    : Boolean(exchange.initiatorShippedAt);
  const isReceivedByMe = isInitiator
    ? Boolean(exchange.initiatorReceivedAt)
    : Boolean(exchange.recipientReceivedAt);
  const isCompletedByMe = isInitiator
    ? Boolean(exchange.initiatorCompletedAt)
    : Boolean(exchange.recipientCompletedAt);
  const isAwaitingMyResponse = exchange.lastProposedById
    ? exchange.lastProposedById !== currentUserId
    : !isInitiator;

  switch (exchange.status) {
    case "Proposed":
      return isAwaitingMyResponse
        ? {
            badge: "Đến lượt bạn",
            title: "Chờ bạn phản hồi đề nghị",
            subtitle: `Xem sách ${partnerName} đề xuất rồi chọn Đồng ý, Đổi sách hoặc Từ chối.`,
            actionNeeded: true,
            tone: "wine",
          }
        : {
            badge: "Đang chờ",
            title: "Đã gửi đề nghị trao đổi",
            subtitle: `Đang chờ ${partnerName} phản hồi. Sách của bạn chưa bị khóa.`,
            actionNeeded: false,
            tone: "wine",
          };
    case "AcceptedAwaitingFunding":
      return isFundedByMe
        ? {
            badge: "Đã đặt cọc",
            title: "Bạn đã đặt cọc bảo chứng",
            subtitle: `Đang chờ ${partnerName} hoàn tất cọc để mở bước gửi sách.`,
            deadlineLabel: "Hạn cọc",
            deadlineIso: exchange.fundingDeadline,
            actionNeeded: false,
            tone: "wine",
          }
        : {
            badge: "Đến lượt bạn",
            title: "Đặt cọc để mở giao nhận",
            subtitle: "Tiền cọc giữ an toàn trên Ví và hoàn 100% khi hoàn tất.",
            deadlineLabel: "Hạn cọc",
            deadlineIso: exchange.fundingDeadline,
            actionNeeded: true,
            tone: "wine",
          };
    case "Preparing":
    case "InTransit":
      if (!isShippedByMe) {
        return {
          badge: "Đến lượt bạn",
          title: "Chuẩn bị & gửi sách đi",
          subtitle: `Đóng gói, quay chụp bằng chứng rồi bấm Tạo đơn gửi sách cho ${partnerName}.`,
          deadlineLabel: "Hạn gửi",
          deadlineIso: exchange.shippingDeadline,
          actionNeeded: true,
          tone: "wine",
        };
      }
      if (isPartnerPickedUp && !isReceivedByMe) {
        return {
          badge: "Đến lượt bạn",
          title: "Sách đang trên đường tới bạn",
          subtitle: `Xác nhận đã nhận khi bưu kiện từ ${partnerName} tới để mở 72h đồng kiểm.`,
          actionNeeded: true,
          tone: "wine",
        };
      }
      if (isShippedByMe && isPartnerShipped && !isPartnerPickedUp) {
        return {
          badge: "Chờ lấy hàng",
          title: "Hai bên đã tạo vận đơn",
          subtitle: "Cả hai mã vận đơn đã sẵn sàng. Đang chờ đơn vị vận chuyển lấy kiện sách.",
          actionNeeded: false,
          tone: "wine",
        };
      }
      return {
        badge: "Đang giao nhận",
        title: isReceivedByMe
          ? "Bạn đã nhận · Chờ đối tác"
          : "Bạn đã gửi · Chờ đối tác",
        subtitle: isReceivedByMe
          ? `Bạn có 72 giờ kiểm tra từ lúc nhận. Đang chờ ${partnerName} nhận sách.`
          : `Theo dõi vận đơn bên dưới trong khi chờ ${partnerName} gửi sách.`,
        deadlineLabel: !isPartnerShipped ? "Hạn gửi" : undefined,
        deadlineIso: !isPartnerShipped ? exchange.shippingDeadline : null,
        actionNeeded: false,
        tone: "wine",
      };
    case "Delivered": {
      const myDeadline = isInitiator
        ? exchange.initiatorInspectionDeadline
        : exchange.recipientInspectionDeadline;
      return isCompletedByMe
        ? {
            badge: "Đã nghiệm thu",
            title: "Bạn đã xác nhận hài lòng",
            subtitle: "Tiền được giữ đến khi hết hạn kiểm tra của cả hai. Hệ thống tất toán nếu không có tranh chấp.",
            deadlineLabel: "Mốc hết hạn của cả hai",
            deadlineIso: exchange.inspectionDeadline,
            actionNeeded: false,
            tone: "success",
          }
        : {
            badge: "Đến lượt bạn",
            title: "Kiểm tra sách trong 72 giờ",
            subtitle:
              "Đối chiếu sách thực tế với mô tả gốc, xác nhận hài lòng hoặc báo sự cố.",
            deadlineLabel: "Hạn kiểm tra",
            deadlineIso: myDeadline ?? exchange.inspectionDeadline,
            actionNeeded: true,
            tone: "wine",
          };
    }
    case "ResolutionPending":
      return {
        badge: "Đang tranh chấp",
        title: "Hồ sơ đang được thẩm định",
        subtitle:
          "Tiền cọc và tiền bù được giữ an toàn trên sổ cái cho tới khi có phán quyết.",
        actionNeeded: false,
        tone: "danger",
      };
    case "Completed":
      return {
        badge: "Hoàn tất",
        title: "Trao đổi sách thành công",
        subtitle: "Ký quỹ và tiền bù đã được tất toán về ví của cả hai bên.",
        actionNeeded: false,
        tone: "success",
      };
    case "Cancelled":
    default:
      return {
        badge: "Đã đóng",
        title: "Giao dịch trao đổi đã đóng",
        subtitle: "Mở lộ trình để xem lại thông tin các bước trước đó.",
        actionNeeded: false,
        tone: "neutral",
      };
  }
}

function formatShortDeadline(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return null;
  }
}

function getStepTimelineHint(
  step: ExchangeStepId,
  isCurrent: boolean,
  isCompleted: boolean,
  isAvailable: boolean,
  exchange: Exchange,
): string {
  if (isCurrent) {
    if (exchange.status === "Completed") return "Giao dịch đã hoàn tất & tất toán";
    if (exchange.status === "Cancelled") return "Giao dịch đã đóng";
    if (exchange.status === "ResolutionPending")
      return "Quản trị viên đang thẩm định hồ sơ";
    return "Đang thực hiện · Bước hiện tại";
  }
  if (!isAvailable) {
    switch (step) {
      case "funding":
        return "Mở sau khi hai bên đồng ý đề nghị";
      case "handover":
        return "Mở sau khi cả hai đặt cọc bảo chứng";
      case "inspection":
        return "72 giờ đối chiếu sau khi hai bên nhận sách";
      case "result":
        return "Hoàn cọc 100% & kết chuyển tiền bù";
      default:
        return "Chưa tới bước này";
    }
  }
  if (isCompleted) {
    switch (step) {
      case "proposal":
        return "Đã thống nhất sách trao đổi & tiền bù";
      case "funding":
        return "Cả hai bên đã hoàn tất đặt cọc";
      case "handover":
        return "Cả hai bên đã giao và nhận sách";
      case "inspection":
        return "Đã hoàn tất đối chiếu sách";
      default:
        return "Đã hoàn thành";
    }
  }
  return "Có dữ liệu ghi nhận";
}

interface ExchangeProgressStepperProps {
  exchange: Exchange;
  selectedStep: ExchangeStepId;
  onSelectStep: (step: ExchangeStepId) => void;
  stageInfo?: ExchangeStageHeroInfo;
  bottomInset?: number;
}

/**
 * Hướng 1 (Shopee / Grab / MoMo native pattern):
 * - Clean, compact 5-segment progress card right at the top of content
 * - Explicit tactile button to open a native Vertical Timeline Bottom Sheet
 * - Inside the sheet, every past step has a clear "Xem lại ›" button
 */
export function ExchangeProgressStepper({
  exchange,
  selectedStep,
  onSelectStep,
  stageInfo,
  bottomInset = 16,
}: ExchangeProgressStepperProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = getCurrentExchangeStep(exchange.status);
  const currentIndex = EXCHANGE_STEPS.findIndex((s) => s.id === current);
  const selectedMeta = EXCHANGE_STEPS.find((s) => s.id === selectedStep);
  const currentMeta = EXCHANGE_STEPS.find((s) => s.id === current);
  const isViewingHistory = selectedStep !== current;

  const historyCount = EXCHANGE_STEPS.filter(
    (s, idx) => idx < currentIndex && hasExchangeStepFacts(s.id, exchange),
  ).length;

  const accentColor =
    stageInfo?.tone === "success"
      ? stitchTokens.likeNewGreen
      : stageInfo?.tone === "danger"
        ? stitchTokens.crimson
        : stitchTokens.wine;
  const accentBg =
    stageInfo?.tone === "success"
      ? stitchTokens.likeNewGreenBg
      : stageInfo?.tone === "danger"
        ? stitchTokens.flashRedBg
        : stitchTokens.roseParchment;

  const deadlineShort = formatShortDeadline(stageInfo?.deadlineIso);

  const handleChooseStep = (step: ExchangeStepId) => {
    setSheetOpen(false);
    onSelectStep(step);
  };

  return (
    <>
      {isViewingHistory && selectedMeta ? (
        /* Compact History Inspection Card */
        <View style={styles.historyCard}>
          <View style={styles.segmentsRow}>
            {EXCHANGE_STEPS.map((step, idx) => {
              const isReached = idx <= currentIndex;
              const isSelectedSeg = step.id === selectedStep;
              return (
                <View
                  key={step.id}
                  style={[
                    styles.segmentBar,
                    isReached && styles.segmentBarMutedActive,
                    isSelectedSeg && styles.segmentBarGold,
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.historyHeaderRow}>
            <View style={styles.historyTitleCol}>
              <AppText style={styles.historyKicker}>
                ĐANG XEM LẠI LỊCH SỬ
              </AppText>
              <AppText style={styles.historyTitle}>
                Bước {selectedMeta.number}/5 ·{" "}
                {getExchangeStepLabel(selectedStep, exchange.status)}
              </AppText>
            </View>
          </View>

          <View style={styles.historyBtnRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSheetOpen(true)}
              style={({ pressed }) => [
                styles.historyOutlineBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="clock" size={14} color={stitchTokens.wineDark} />
              <AppText style={styles.historyOutlineBtnText}>
                Đổi bước ({EXCHANGE_STEPS.length})
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectStep(current)}
              style={({ pressed }) => [
                styles.historyPrimaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <AppText style={styles.historyPrimaryBtnText}>
                Về Bước {currentMeta?.number} ·{" "}
                {getExchangeStepLabel(current, exchange.status)}
              </AppText>
              <Icon name="arrow" size={13} color={stitchTokens.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        /* Compact Live Progress Card (5-Segment Bar + Status + Tactile Timeline Button) */
        <View style={styles.progressCard}>
          {/* Row 1: 5-Segment Progress Bar + Step Counter */}
          <View style={styles.progressTopRow}>
            <View style={styles.segmentsRow}>
              {EXCHANGE_STEPS.map((step, idx) => {
                const isFilled = idx <= currentIndex;
                return (
                  <View
                    key={step.id}
                    style={[
                      styles.segmentBar,
                      isFilled && { backgroundColor: accentColor },
                    ]}
                  />
                );
              })}
            </View>
            <AppText style={[styles.stepCounter, { color: accentColor }]}>
              {currentIndex + 1}/5
            </AppText>
          </View>

          {/* Row 2: Semantic Badge + Stage Name + Optional Deadline */}
          {stageInfo ? (
            <View style={styles.stageBody}>
              <View style={styles.metaRow}>
                <View
                  style={[styles.statusBadge, { backgroundColor: accentBg }]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: accentColor },
                    ]}
                  />
                  <AppText
                    style={[styles.statusBadgeText, { color: accentColor }]}
                  >
                    {stageInfo.badge} ·{" "}
                    {getExchangeStepLabel(current, exchange.status)}
                  </AppText>
                </View>

                {deadlineShort ? (
                  <View style={styles.deadlineChip}>
                    <Icon
                      name="clock"
                      size={11}
                      color={stitchTokens.subtleGray}
                    />
                    <AppText style={styles.deadlineText}>
                      {stageInfo.deadlineLabel}: {deadlineShort}
                    </AppText>
                  </View>
                ) : null}
              </View>

              <AppText style={styles.stageTitle}>{stageInfo.title}</AppText>
              <AppText style={styles.stageSubtitle}>
                {stageInfo.subtitle}
              </AppText>
            </View>
          ) : null}

          {/* Row 3: Unmistakable Tactile Button to Open Vertical Timeline Sheet */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở lộ trình và lịch sử các bước trao đổi"
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [
              styles.timelineTriggerBtn,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.timelineTriggerLeft}>
              <Icon name="clock" size={14} color={stitchTokens.wine} />
              <AppText style={styles.timelineTriggerLabel} numberOfLines={1}>
                {historyCount > 0
                  ? `Lộ trình & lịch sử (${historyCount} bước đã xong)`
                  : "Xem lộ trình 5 bước trao đổi"}
              </AppText>
            </View>
            <View style={styles.timelineTriggerPill}>
              <AppText style={styles.timelineTriggerPillText}>Xem</AppText>
              <Icon name="chevronDown" size={13} color={stitchTokens.wine} />
            </View>
          </Pressable>
        </View>
      )}

      {/* Native Vertical Timeline Bottom Sheet */}
      <AppModal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSheetOpen(false)}
        >
          <Pressable
            style={[
              styles.sheetCard,
              { paddingBottom: Math.max(bottomInset, 18) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <AppText style={styles.sheetTitle}>
                  Lộ trình trao đổi sách
                </AppText>
                <AppText style={styles.sheetSubtitle}>
                  Chạm vào bước đã hoàn thành để xem lại chi tiết đã lưu
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng lộ trình"
                style={styles.sheetCloseBtn}
                onPress={() => setSheetOpen(false)}
              >
                <Icon name="close" size={18} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timelineList}
            >
              {EXCHANGE_STEPS.map((step, index) => {
                const isCurrent = step.id === current;
                const isAvailable =
                  index < currentIndex &&
                  hasExchangeStepFacts(step.id, exchange);
                const isSelected = selectedStep === step.id;
                const isCompleted =
                  isAvailable &&
                  hasExchangeStepCompleted(step.id, current, exchange);
                const canPress = isCurrent || isAvailable;
                const label = getExchangeStepLabel(step.id, exchange.status);
                const isDisputeNode =
                  step.id === "result" &&
                  exchange.status === "ResolutionPending";
                const isLast = index === EXCHANGE_STEPS.length - 1;
                const hint = getStepTimelineHint(
                  step.id,
                  isCurrent,
                  isCompleted,
                  isAvailable,
                  exchange,
                );

                return (
                  <Pressable
                    key={step.id}
                    disabled={!canPress}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: isSelected,
                      disabled: !canPress,
                    }}
                    onPress={() => handleChooseStep(step.id)}
                    style={({ pressed }) => [
                      styles.timelineRow,
                      isSelected && styles.timelineRowSelected,
                      pressed && canPress && styles.pressed,
                    ]}
                  >
                    {/* Left Vertical Rail + Node */}
                    <View style={styles.railCol}>
                      <View
                        style={[
                          styles.nodeCircle,
                          isCompleted && styles.nodeCircleDone,
                          isCurrent &&
                            (isDisputeNode
                              ? styles.nodeCircleDanger
                              : styles.nodeCircleCurrent),
                          !canPress && styles.nodeCircleLocked,
                        ]}
                      >
                        {isCompleted && !isCurrent ? (
                          <Icon
                            name="check"
                            size={13}
                            color={stitchTokens.likeNewGreen}
                            strokeWidth={2.8}
                          />
                        ) : (
                          <AppText
                            style={[
                              styles.nodeNum,
                              isCurrent && styles.nodeNumCurrent,
                              !canPress && styles.nodeNumLocked,
                            ]}
                          >
                            {step.number}
                          </AppText>
                        )}
                      </View>
                      {!isLast ? (
                        <View
                          style={[
                            styles.railConnector,
                            index < currentIndex && styles.railConnectorDone,
                          ]}
                        />
                      ) : null}
                    </View>

                    {/* Center Label & Hint */}
                    <View style={styles.timelineBody}>
                      <AppText
                        style={[
                          styles.timelineLabel,
                          !canPress && styles.timelineLabelLocked,
                          isSelected && styles.timelineLabelSelected,
                        ]}
                      >
                        Bước {step.number} · {label}
                      </AppText>
                      <AppText style={styles.timelineHint}>{hint}</AppText>
                    </View>

                    {/* Right Explicit Action Badge/Button */}
                    <View style={styles.timelineRight}>
                      {isSelected ? (
                        <View style={styles.rowPillViewing}>
                          <AppText style={styles.rowPillViewingText}>
                            Đang xem
                          </AppText>
                        </View>
                      ) : isCurrent ? (
                        <View style={styles.rowPillReturn}>
                          <AppText style={styles.rowPillReturnText}>
                            Hiện tại
                          </AppText>
                          <Icon
                            name="chevronRight"
                            size={12}
                            color={stitchTokens.wine}
                          />
                        </View>
                      ) : isAvailable ? (
                        <View style={styles.rowPillAction}>
                          <AppText style={styles.rowPillActionText}>
                            Xem lại
                          </AppText>
                          <Icon
                            name="chevronRight"
                            size={12}
                            color={stitchTokens.wine}
                          />
                        </View>
                      ) : (
                        <AppText style={styles.rowLockedText}>Chưa mở</AppText>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    padding: 16,
    gap: 11,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  progressTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  segmentsRow: {
    flex: 1,
    flexDirection: "row",
    gap: 5,
  },
  segmentBar: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: stitchTokens.borderWarmLight,
  },
  segmentBarMutedActive: {
    backgroundColor: stitchTokens.peachBorder,
  },
  segmentBarGold: {
    backgroundColor: stitchTokens.goldBronze,
  },
  stepCounter: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  stageBody: {
    gap: 5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  deadlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: stitchTokens.surfaceSoft,
  },
  deadlineText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  stageTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    lineHeight: 22,
  },
  stageSubtitle: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    lineHeight: 17.5,
  },
  timelineTriggerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
  },
  timelineTriggerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  timelineTriggerLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  timelineTriggerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
  },
  timelineTriggerPillText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  /* History Inspection Card */
  historyCard: {
    backgroundColor: stitchTokens.goldLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: stitchTokens.goldAccent,
    padding: 15,
    gap: 10,
  },
  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyTitleCol: {
    gap: 2,
  },
  historyKicker: {
    fontSize: 10.5,
    fontWeight: "800",
    color: stitchTokens.goldBronze,
    letterSpacing: 0.4,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  historyBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  historyOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.goldAccent,
  },
  historyOutlineBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  historyPrimaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: stitchTokens.wine,
  },
  historyPrimaryBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  pressed: {
    opacity: 0.76,
  },
  /* Vertical Timeline Bottom Sheet */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  sheetCard: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 14,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 18,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.borderWarm,
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderParchmentSoft,
  },
  sheetTitle: {
    fontSize: 16.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineList: {
    paddingBottom: 8,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  timelineRowSelected: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  railCol: {
    alignItems: "center",
    width: 28,
  },
  nodeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stitchTokens.roseParchment,
  },
  nodeCircleDone: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  nodeCircleCurrent: {
    backgroundColor: stitchTokens.wine,
  },
  nodeCircleDanger: {
    backgroundColor: stitchTokens.crimson,
  },
  nodeCircleLocked: {
    backgroundColor: stitchTokens.surfaceSoft,
  },
  nodeNum: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  nodeNumCurrent: {
    color: stitchTokens.white,
  },
  nodeNumLocked: {
    color: stitchTokens.subtleGray,
  },
  railConnector: {
    width: 2,
    height: 28,
    marginTop: 4,
    backgroundColor: stitchTokens.borderWarmLight,
  },
  railConnectorDone: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  timelineLabelSelected: {
    color: stitchTokens.wine,
  },
  timelineLabelLocked: {
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  timelineHint: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 16.5,
  },
  timelineRight: {
    paddingTop: 3,
  },
  rowPillViewing: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: stitchTokens.wine,
  },
  rowPillViewingText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  rowPillAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
  },
  rowPillActionText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  rowPillReturn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
  },
  rowPillReturnText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  rowLockedText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    paddingVertical: 4,
  },
});
