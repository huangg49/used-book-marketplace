import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppModal, AppText, Icon, stitchTokens } from "../../core/ui";

export type OrderStepId =
  | "proposal"
  | "payment"
  | "handover"
  | "inspection"
  | "result";

export const ORDER_STEPS: readonly {
  id: OrderStepId;
  number: number;
  label: string;
}[] = [
  { id: "proposal", number: 1, label: "Đề nghị" },
  { id: "payment", number: 2, label: "Thanh toán" },
  { id: "handover", number: 3, label: "Giao nhận" },
  { id: "inspection", number: 4, label: "Kiểm tra" },
  { id: "result", number: 5, label: "Kết quả" },
];

export interface OrderProgressInput {
  state: string;
  role: "Buyer" | "Seller";
  paidAt?: string | null;
  paymentDeadline?: string | null;
  sellerConfirmationDeadline?: string | null;
  preparation?: { pickupDeadline: string } | null;
  deliveredAt?: string | null;
  inspectionDeadline?: string | null;
  deliveryJourney?: {
    trackingCode: string | null;
    pickedUpAt: string | null;
    outForDeliveryAt: string | null;
    acknowledgedAt: string | null;
    issue: { kind: string; openedAt: string; supportCaseId: string } | null;
    actions: string[];
  } | null;
}

export function getCurrentOrderStep(state: string): OrderStepId {
  switch (state) {
    case "AwaitingPayment":
      return "payment";
    case "PendingSellerConfirmation":
    case "Preparing":
    case "InTransit":
      return "handover";
    case "Inspection":
      return "inspection";
    case "Completed":
    case "Cancelled":
    case "PaymentExpired":
    case "SettlementPending":
    case "ResolutionPending":
    default:
      return "result";
  }
}

export function getOrderStepLabel(step: OrderStepId, state: string): string {
  if (step === "result" && state === "ResolutionPending") {
    return "Sự cố";
  }
  return ORDER_STEPS.find((s) => s.id === step)?.label ?? "Kết quả";
}

export function hasOrderStepFacts(
  step: OrderStepId,
  order: OrderProgressInput,
): boolean {
  switch (step) {
    case "proposal":
      return true;
    case "payment":
      return Boolean(order.paidAt || order.paymentDeadline);
    case "handover":
      return Boolean(
        order.preparation ||
          order.deliveryJourney?.trackingCode ||
          order.deliveryJourney?.pickedUpAt ||
          order.deliveredAt ||
          ["PendingSellerConfirmation", "Preparing", "InTransit", "Inspection", "Completed"].includes(
            order.state,
          ),
      );
    case "inspection":
      return Boolean(
        order.deliveredAt ||
          order.inspectionDeadline ||
          order.state === "Inspection" ||
          order.state === "Completed",
      );
    default:
      return false;
  }
}

export interface OrderStageHeroInfo {
  badge: string;
  title: string;
  subtitle: string;
  deadlineLabel?: string;
  deadlineIso?: string | null;
  actionNeeded: boolean;
  tone: "wine" | "success" | "danger" | "neutral";
}

export function getOrderStageHero(
  order: OrderProgressInput,
): OrderStageHeroInfo {
  const isBuyer = order.role === "Buyer";
  const tracking = order.deliveryJourney;

  switch (order.state) {
    case "AwaitingPayment":
      return isBuyer
        ? {
            badge: "Đến lượt bạn · Thanh toán",
            title: "Thanh toán để giữ sách",
            subtitle:
              "Tiền thanh toán được giữ an toàn trong Quỹ bảo chứng và chỉ giải ngân sau 72h kiểm tra.",
            deadlineLabel: "Hạn thanh toán",
            deadlineIso: order.paymentDeadline,
            actionNeeded: true,
            tone: "wine",
          }
        : {
            badge: "Chờ thanh toán",
            title: "Đang chờ người mua thanh toán",
            subtitle:
              "Sách đang được giữ cho đơn này cho đến hạn thanh toán.",
            deadlineLabel: "Hạn thanh toán",
            deadlineIso: order.paymentDeadline,
            actionNeeded: false,
            tone: "wine",
          };
    case "PendingSellerConfirmation":
      return !isBuyer
        ? {
            badge: "Đến lượt bạn · Xác nhận",
            title: "Xác nhận nhận đơn bán sách",
            subtitle:
              "Người mua đã thanh toán vào Quỹ bảo chứng. Xác nhận nhận đơn để mở bước đóng gói & giao sách.",
            deadlineLabel: "Hạn xác nhận",
            deadlineIso: order.sellerConfirmationDeadline,
            actionNeeded: true,
            tone: "wine",
          }
        : {
            badge: "Chờ người bán",
            title: "Đã thanh toán · Chờ người bán xác nhận",
            subtitle:
              "Tiền đã khóa an toàn trong Quỹ bảo chứng. Nếu quá hạn chưa xác nhận, tiền tự động hoàn về ví.",
            deadlineLabel: "Hạn xác nhận",
            deadlineIso: order.sellerConfirmationDeadline,
            actionNeeded: false,
            tone: "wine",
          };
    case "Preparing": {
      const hasTracking = Boolean(tracking?.trackingCode);
      if (!isBuyer) {
        return {
          badge: hasTracking ? "Chờ lấy kiện" : "Đến lượt bạn · Gửi sách",
          title: hasTracking
            ? "Đã đăng ký vận đơn · Chờ bàn giao"
            : "Đóng gói & đăng ký vận đơn",
          subtitle: hasTracking
            ? `Mã vận đơn ${tracking?.trackingCode}. Chờ đơn vị vận chuyển tới nhận kiện sách.`
            : "Tải ảnh đóng gói và đăng ký mã vận đơn trước hạn bàn giao.",
          deadlineLabel: "Hạn bàn giao",
          deadlineIso: order.preparation?.pickupDeadline,
          actionNeeded: !hasTracking,
          tone: "wine",
        };
      }
      const canSimulatePickup = Boolean(tracking?.actions.includes("Pickup"));
      return {
        badge: canSimulatePickup
          ? "Chờ lấy kiện · Demo"
          : "Người bán chuẩn bị sách",
        title: hasTracking
          ? "Người bán đã đăng ký vận đơn"
          : "Người bán đang đóng gói sách",
        subtitle: hasTracking
          ? `Mã vận đơn ${tracking?.trackingCode}. Theo dõi mốc lấy hàng và giao nhận bên dưới.`
          : "Tiền đang được giữ an toàn trong Quỹ bảo chứng.",
        deadlineLabel: "Hạn bàn giao",
        deadlineIso: order.preparation?.pickupDeadline,
        actionNeeded: canSimulatePickup,
        tone: "wine",
      };
    }
    case "InTransit": {
      const outForDelivery = Boolean(tracking?.outForDeliveryAt);
      const canDrive = Boolean(
        tracking?.actions.some(
          (a) => a === "OutForDelivery" || a === "Deliver",
        ),
      );
      return {
        badge: outForDelivery ? "Đang giao tới nơi" : "Đang vận chuyển",
        title: outForDelivery
          ? "Shipper đang trên đường giao sách"
          : "Đơn vị vận chuyển đã nhận kiện sách",
        subtitle: isBuyer
          ? "Theo dõi hành trình giao nhận bên dưới. Sau khi giao thành công sẽ mở 72h kiểm tra sách."
          : "Sách đang trên đường tới người mua. Tiền sẽ giải ngân sau khi hết 72h kiểm tra.",
        actionNeeded: canDrive,
        tone: "wine",
      };
    }
    case "Inspection": {
      const acked = Boolean(tracking?.acknowledgedAt);
      return isBuyer
        ? {
            badge: acked ? "Đang kiểm tra · 72h" : "Đến lượt bạn · Nhận sách",
            title: acked
              ? "Đã xác nhận nhận sách · Kiểm tra 72h"
              : "Sách đã giao · Xác nhận đã nhận",
            subtitle: acked
              ? "Nếu sách đúng mô tả, hệ thống tự giải ngân khi hết hạn. Nếu có lỗi, bấm báo sự cố ngay."
              : "Kiểm tra tình trạng sách và xác nhận đã nhận, hoặc báo sự cố nếu chưa nhận được.",
            deadlineLabel: "Hạn kiểm tra",
            deadlineIso: order.inspectionDeadline,
            actionNeeded: true,
            tone: "wine",
          }
        : {
            badge: "Chờ kiểm tra · 72h",
            title: "Người mua đang kiểm tra sách",
            subtitle:
              "Tiền bán sách sẽ tự động giải ngân vào Ví của bạn sau khi hết hạn 72 giờ không có tranh chấp.",
            deadlineLabel: "Hạn kiểm tra",
            deadlineIso: order.inspectionDeadline,
            actionNeeded: false,
            tone: "wine",
          };
    }
    case "ResolutionPending":
      return {
        badge: "Đang xử lý sự cố",
        title: "Hồ sơ sự cố đang được xem xét",
        subtitle:
          "Tiền thanh toán tiếp tục được giữ an toàn trong Quỹ bảo chứng cho đến khi có kết quả.",
        actionNeeded: false,
        tone: "danger",
      };
    case "Completed":
      return {
        badge: "Hoàn tất",
        title: "Đơn hàng đã hoàn tất thành công",
        subtitle:
          "Tiền bán sách đã được giải ngân vào Ví người bán. Bạn có thể ghi nhận đánh giá giao dịch.",
        actionNeeded: false,
        tone: "success",
      };
    case "SettlementPending":
      return {
        badge: "Đang hoàn tiền",
        title: "Đang xử lý hoàn tiền về Ví",
        subtitle: "Hệ thống đang hoàn khoản tiền đã giữ về Ví người mua.",
        actionNeeded: false,
        tone: "neutral",
      };
    case "Cancelled":
    case "PaymentExpired":
    default:
      return {
        badge: "Đã đóng",
        title:
          order.state === "PaymentExpired"
            ? "Đơn quá hạn thanh toán"
            : "Đơn hàng đã đóng",
        subtitle: "Mở lộ trình để xem lại các mốc đã ghi nhận của đơn.",
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

function getOrderStepHint(
  step: OrderStepId,
  isCurrent: boolean,
  isCompleted: boolean,
  isAvailable: boolean,
  order: OrderProgressInput,
): string {
  if (isCurrent) {
    if (order.state === "Completed") return "Đơn hàng đã hoàn tất & giải ngân";
    if (order.state === "Cancelled" || order.state === "PaymentExpired")
      return "Đơn hàng đã đóng";
    if (order.state === "ResolutionPending")
      return "Đang đối chiếu sự cố giao nhận";
    return "Đang thực hiện · Bước hiện tại";
  }
  if (!isAvailable) {
    switch (step) {
      case "payment":
        return "Thanh toán vào Quỹ bảo chứng";
      case "handover":
        return "Đóng gói, vận đơn & giao nhận";
      case "inspection":
        return "72 giờ kiểm tra tình trạng sách";
      case "result":
        return "Giải ngân về Ví người bán";
      default:
        return "Chưa tới bước này";
    }
  }
  if (isCompleted) {
    switch (step) {
      case "proposal":
        return "Đã chốt sách & mức giá đơn hàng";
      case "payment":
        return order.paidAt
          ? `Đã thanh toán lúc ${formatShortDeadline(order.paidAt)}`
          : "Đã hoàn tất bước thanh toán";
      case "handover":
        return order.deliveredAt
          ? `Giao thành công lúc ${formatShortDeadline(order.deliveredAt)}`
          : "Đã hoàn tất giao nhận";
      case "inspection":
        return "Đã hoàn tất đối chiếu 72h";
      default:
        return "Đã hoàn thành";
    }
  }
  return "Có dữ liệu ghi nhận";
}

export function OrderProgressStepper({
  order,
  selectedStep,
  onSelectStep,
  bottomInset = 16,
}: {
  order: OrderProgressInput;
  selectedStep: OrderStepId;
  onSelectStep: (step: OrderStepId) => void;
  bottomInset?: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = getCurrentOrderStep(order.state);
  const currentIndex = ORDER_STEPS.findIndex((s) => s.id === current);
  const selectedMeta = ORDER_STEPS.find((s) => s.id === selectedStep);
  const currentMeta = ORDER_STEPS.find((s) => s.id === current);
  const isViewingHistory = selectedStep !== current;
  const stageInfo = getOrderStageHero(order);

  const historyCount = ORDER_STEPS.filter(
    (s, idx) => idx < currentIndex && hasOrderStepFacts(s.id, order),
  ).length;

  const accentColor =
    stageInfo.tone === "success"
      ? stitchTokens.likeNewGreen
      : stageInfo.tone === "danger"
        ? stitchTokens.crimson
        : stitchTokens.wine;
  const accentBg =
    stageInfo.tone === "success"
      ? stitchTokens.likeNewGreenBg
      : stageInfo.tone === "danger"
        ? stitchTokens.flashRedBg
        : stitchTokens.roseParchment;

  const deadlineShort = formatShortDeadline(stageInfo.deadlineIso);

  const handleChooseStep = (step: OrderStepId) => {
    setSheetOpen(false);
    onSelectStep(step);
  };

  return (
    <>
      {isViewingHistory && selectedMeta ? (
        <View style={styles.historyCard}>
          <View style={styles.segmentsRow}>
            {ORDER_STEPS.map((step, idx) => {
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
                {getOrderStepLabel(selectedStep, order.state)}
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
                Đổi bước ({ORDER_STEPS.length})
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
                {getOrderStepLabel(current, order.state)}
              </AppText>
              <Icon name="arrow" size={13} color={stitchTokens.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          {/* 5-Segment Progress Bar */}
          <View style={styles.segmentsHeader}>
            <View style={styles.segmentsRow}>
              {ORDER_STEPS.map((step, idx) => {
                const isDone = idx < currentIndex || order.state === "Completed";
                const isCur = idx === currentIndex && order.state !== "Completed";
                return (
                  <View
                    key={step.id}
                    style={[
                      styles.segmentBar,
                      isDone && styles.segmentBarDone,
                      isCur && { backgroundColor: accentColor },
                    ]}
                  />
                );
              })}
            </View>
            <AppText style={styles.stepFraction}>
              {currentIndex + 1}/{ORDER_STEPS.length}
            </AppText>
          </View>

          {/* Status Pill + Deadline Chip */}
          <View style={styles.badgesRow}>
            <View style={[styles.statusBadge, { backgroundColor: accentBg }]}>
              {stageInfo.actionNeeded ? (
                <View
                  style={[styles.liveDot, { backgroundColor: accentColor }]}
                />
              ) : null}
              <AppText style={[styles.statusBadgeText, { color: accentColor }]}>
                {stageInfo.badge}
              </AppText>
            </View>

            {deadlineShort ? (
              <View style={styles.deadlineChip}>
                <Icon name="clock" size={11} color={stitchTokens.subtleGray} />
                <AppText style={styles.deadlineChipText}>
                  {stageInfo.deadlineLabel ? `${stageInfo.deadlineLabel}: ` : ""}
                  {deadlineShort}
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Stage Hero Copy */}
          <View style={styles.copyBlock}>
            <AppText style={styles.stageTitle}>{stageInfo.title}</AppText>
            <AppText style={styles.stageSubtitle}>{stageInfo.subtitle}</AppText>
          </View>

          {/* History Timeline Trigger Row */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở lộ trình và lịch sử các bước đơn hàng"
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [
              styles.timelineTrigger,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.timelineTriggerLeft}>
              <Icon name="clock" size={14} color={stitchTokens.wine} />
              <AppText style={styles.timelineTriggerText}>
                {historyCount > 0
                  ? `Lộ trình & lịch sử (${historyCount} bước đã xong)`
                  : "Xem lộ trình 5 bước giao dịch"}
              </AppText>
            </View>
            <View style={styles.timelineTriggerRight}>
              <AppText style={styles.timelineTriggerAction}>Xem</AppText>
              <Icon name="chevronDown" size={14} color={stitchTokens.wine} />
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
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetScrim}
            onPress={() => setSheetOpen(false)}
          />
          <View
            style={[
              styles.sheetCard,
              { paddingBottom: Math.max(bottomInset, 20) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <AppText style={styles.sheetTitle}>
                  Lộ trình đơn mua sách
                </AppText>
                <AppText style={styles.sheetSubtitle}>
                  Chạm bước đã hoàn thành để xem lại chi tiết lịch sử
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng lộ trình"
                hitSlop={8}
                onPress={() => setSheetOpen(false)}
                style={styles.sheetCloseBtn}
              >
                <Icon name="close" size={18} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetTimelineList}
            >
              {ORDER_STEPS.map((step, idx) => {
                const isCur = step.id === current;
                const isCompleted =
                  idx < currentIndex || order.state === "Completed";
                const isSelected = step.id === selectedStep;
                const isAvailable =
                  isCur || (idx < currentIndex && hasOrderStepFacts(step.id, order));
                const isLast = idx === ORDER_STEPS.length - 1;
                const hint = getOrderStepHint(
                  step.id,
                  isCur,
                  isCompleted,
                  isAvailable,
                  order,
                );

                return (
                  <Pressable
                    key={step.id}
                    disabled={!isAvailable}
                    onPress={() => handleChooseStep(step.id)}
                    style={({ pressed }) => [
                      styles.timelineRow,
                      isSelected && styles.timelineRowSelected,
                      pressed && isAvailable && styles.pressed,
                    ]}
                  >
                    <View style={styles.timelineTrackCol}>
                      <View
                        style={[
                          styles.timelineNode,
                          isCompleted && styles.timelineNodeDone,
                          isCur && styles.timelineNodeCurrent,
                        ]}
                      >
                        {isCompleted && !isCur ? (
                          <Icon
                            name="check"
                            size={13}
                            color={stitchTokens.white}
                          />
                        ) : (
                          <AppText
                            style={[
                              styles.timelineNodeNum,
                              (isCur || isCompleted) &&
                                styles.timelineNodeNumLight,
                            ]}
                          >
                            {step.number}
                          </AppText>
                        )}
                      </View>
                      {!isLast ? (
                        <View
                          style={[
                            styles.timelineConnector,
                            isCompleted && styles.timelineConnectorDone,
                          ]}
                        />
                      ) : null}
                    </View>

                    <View style={styles.timelineContentCol}>
                      <View style={styles.timelineTitleRow}>
                        <AppText
                          style={[
                            styles.timelineStepTitle,
                            !isAvailable && styles.timelineStepTitleMuted,
                          ]}
                        >
                          Bước {step.number} ·{" "}
                          {getOrderStepLabel(step.id, order.state)}
                        </AppText>
                        {isCur ? (
                          <View style={styles.currentChip}>
                            <AppText style={styles.currentChipText}>
                              Hiện tại
                            </AppText>
                          </View>
                        ) : isAvailable ? (
                          <View style={styles.viewChip}>
                            <AppText style={styles.viewChipText}>
                              Xem lại ›
                            </AppText>
                          </View>
                        ) : null}
                      </View>
                      <AppText style={styles.timelineHint}>{hint}</AppText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  segmentsHeader: {
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
    borderRadius: 999,
    backgroundColor: stitchTokens.creamParchment,
  },
  segmentBarDone: {
    backgroundColor: stitchTokens.wine,
  },
  segmentBarMutedActive: {
    backgroundColor: stitchTokens.peachBorder,
  },
  segmentBarGold: {
    backgroundColor: stitchTokens.goldBronze,
  },
  stepFraction: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.subtleGray,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
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
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.surfaceSoft,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  deadlineChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  copyBlock: {
    gap: 3,
  },
  stageTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  stageSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.subtleGray,
  },
  timelineTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    marginTop: 2,
  },
  timelineTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  timelineTriggerText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  timelineTriggerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  timelineTriggerAction: {
    fontSize: 12.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  historyCard: {
    backgroundColor: stitchTokens.goldLight,
    borderRadius: 20,
    padding: 15,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
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
    letterSpacing: 0.5,
    color: stitchTokens.goldBronze,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.darkWood,
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
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
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
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: stitchTokens.wine,
  },
  historyPrimaryBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  pressed: {
    opacity: 0.82,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: stitchTokens.modalScrim,
  },
  sheetScrim: {
    flex: 1,
  },
  sheetCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "78%",
    gap: 12,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.borderWarm,
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  sheetSubtitle: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTimelineList: {
    paddingBottom: 8,
    gap: 4,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
  },
  timelineRowSelected: {
    backgroundColor: stitchTokens.roseParchment,
  },
  timelineTrackCol: {
    alignItems: "center",
    width: 26,
  },
  timelineNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.creamParchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineNodeDone: {
    backgroundColor: stitchTokens.likeNewGreen,
    borderColor: stitchTokens.likeNewGreen,
  },
  timelineNodeCurrent: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  timelineNodeNum: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.subtleGray,
  },
  timelineNodeNumLight: {
    color: stitchTokens.white,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: stitchTokens.cardBorder,
    marginTop: 4,
  },
  timelineConnectorDone: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  timelineContentCol: {
    flex: 1,
    gap: 3,
    paddingBottom: 6,
  },
  timelineTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineStepTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    flexShrink: 1,
  },
  timelineStepTitleMuted: {
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  currentChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: stitchTokens.wine,
  },
  currentChipText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  viewChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  viewChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  timelineHint: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
});
