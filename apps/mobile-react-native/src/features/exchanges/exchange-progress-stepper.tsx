import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Icon, type IconName, radius, space, stitchTokens } from "../../core/ui";
import type { ExchangeStatus } from "./contracts";
import { formatCancelReason } from "./contracts";

interface ExchangeProgressStepperProps {
  status: ExchangeStatus;
  isInitiator: boolean;
  cancelReason?: string | null;
  rejectionReason?: string | null;
  viewerRole?: "proposer" | "recipient";
}

interface StepItem {
  id: number;
  label: string;
  iconName: IconName;
}

const STEPS: StepItem[] = [
  { id: 1, label: "Đề xuất", iconName: "mail" },
  { id: 2, label: "Đặt cọc", iconName: "wallet" },
  { id: 3, label: "Gửi sách", iconName: "bag" },
  { id: 4, label: "Vận chuyển", iconName: "truck" },
  { id: 5, label: "Đồng kiểm", iconName: "shield" },
  { id: 6, label: "Hoàn tất", iconName: "celebration" },
];

export function ExchangeProgressStepper({
  status,
  isInitiator: _isInitiator,
  cancelReason,
  rejectionReason,
  viewerRole: _viewerRole,
}: ExchangeProgressStepperProps) {
  let currentStepIndex = 1;
  let isFailed = false;
  let statusBadgeText = "Đang tiến hành";
  let statusBadgeBg: string = stitchTokens.amberBg;
  let statusBadgeColor: string = stitchTokens.wineDark;
  let stageDescription = "Giao dịch đang được xử lý theo quy trình.";

  switch (status) {
    case "Proposed":
      currentStepIndex = 1;
      statusBadgeText = "Chờ phản hồi";
      statusBadgeBg = stitchTokens.amberBg;
      statusBadgeColor = stitchTokens.wineDark;
      stageDescription = "Đề nghị đang chờ đối tác xem xét và phản hồi điều khoản.";
      break;

    case "AcceptedAwaitingFunding":
      currentStepIndex = 2;
      statusBadgeText = "Chờ đặt cọc";
      statusBadgeBg = stitchTokens.amberBg;
      statusBadgeColor = stitchTokens.terracottaSoft;
      stageDescription = "Hai bên cần hoàn tất đặt cọc bảo chứng để kích hoạt gửi sách.";
      break;

    case "Preparing":
      currentStepIndex = 3;
      statusBadgeText = "Chuẩn bị gửi";
      statusBadgeBg = stitchTokens.amberBg;
      statusBadgeColor = stitchTokens.wineDark;
      stageDescription = "Hai bên đã cọc thành công. Vui lòng đóng gói và gửi sách trong 72 giờ.";
      break;

    case "InTransit":
      currentStepIndex = 4;
      statusBadgeText = "Đang vận chuyển";
      statusBadgeBg = stitchTokens.roseWarmSurface;
      statusBadgeColor = stitchTokens.wineDark;
      stageDescription = "Bưu phẩm đang trên đường giao nhận. Hãy chú ý điện thoại bưu tá.";
      break;

    case "Delivered":
      currentStepIndex = 5;
      statusBadgeText = "Đồng kiểm 72h";
      statusBadgeBg = stitchTokens.likeNewGreenBg;
      statusBadgeColor = stitchTokens.likeNewGreen;
      stageDescription = "Mỗi bên có 72 giờ kiểm tra từ lúc nhận sách. Chỉ tất toán sau cả hai hạn nếu không có tranh chấp.";
      break;

    case "Completed":
      currentStepIndex = 6;
      statusBadgeText = "Hoàn tất";
      statusBadgeBg = stitchTokens.likeNewGreenBg;
      statusBadgeColor = stitchTokens.likeNewGreen;
      stageDescription = "Trao đổi hoàn tất thành công! Tiền cọc đã hoàn về ví.";
      break;

    case "ResolutionPending":
      isFailed = true;
      currentStepIndex = 5;
      statusBadgeText = "Khiếu nại";
      statusBadgeBg = stitchTokens.roseWarmSurface;
      statusBadgeColor = stitchTokens.terracottaSoft;
      stageDescription = "Đang có khiếu nại phát sinh. Tiến trình tạm dừng để giải quyết an toàn.";
      break;

    case "Cancelled":
      isFailed = true;
      currentStepIndex = 1;
      statusBadgeText =
        cancelReason === "MutualAgreement"
          ? "Đồng thuận hủy"
          : rejectionReason
          ? "Bị từ chối"
          : "Đã hủy";
      statusBadgeBg = stitchTokens.roseWarmSurface;
      statusBadgeColor = stitchTokens.terracottaSoft;
      stageDescription = cancelReason
        ? `Giao dịch đã hủy: "${formatCancelReason(cancelReason)}"`
        : rejectionReason
        ? `Đề nghị bị từ chối: "${rejectionReason}"`
        : "Giao dịch trao đổi đã bị hủy.";
      break;
  }

  const currentStep = STEPS[currentStepIndex - 1] ?? STEPS[0];
  const progressPercent = isFailed
    ? 0
    : Math.round(((currentStepIndex - 1) / (STEPS.length - 1)) * 100);

  return (
    <View style={styles.container}>
      {/* 1. Header with Step Counter and Status Pill */}
      <View style={styles.headerRow}>
        <View style={styles.stepInfoGroup}>
          <View style={styles.stepCountBadge}>
            <AppText style={styles.stepCountText}>
              {isFailed ? "Dừng lại" : `Bước ${currentStepIndex}/6`}
            </AppText>
          </View>
          <AppText style={styles.stepTitle}>
            {isFailed ? statusBadgeText : currentStep.label}
          </AppText>
        </View>

        <View style={[styles.statusPill, { backgroundColor: statusBadgeBg }]}>
          <AppText style={[styles.statusPillText, { color: statusBadgeColor }]}>
            {statusBadgeText}
          </AppText>
        </View>
      </View>

      {/* 2. Stepper Track with Milestone Nodes */}
      <View style={styles.stepperWrapper}>
        {/* Background track line */}
        <View style={styles.trackBackground} />
        {/* Active filled line */}
        <View style={[styles.trackProgress, { width: `${progressPercent}%` }]} />

        {/* Milestone Steps */}
        <View style={styles.stepsRow}>
          {STEPS.map((step) => {
            const stepNum = step.id;
            const isCompleted = !isFailed && (stepNum < currentStepIndex || status === "Completed");
            const isCurrent = !isFailed && stepNum === currentStepIndex && status !== "Completed";
            const isFailedStep = isFailed && stepNum === currentStepIndex;

            return (
              <View key={step.id} style={styles.stepColumn}>
                <View
                  style={[
                    styles.nodeCircle,
                    isCompleted && styles.nodeCircleCompleted,
                    isCurrent && styles.nodeCircleCurrent,
                    isFailedStep && styles.nodeCircleFailed,
                  ]}
                >
                  {isCompleted ? (
                    <Icon name="check" size={12} color={stitchTokens.whiteSurface} strokeWidth={2.5} />
                  ) : isCurrent ? (
                    <Icon name={step.iconName} size={12} color={stitchTokens.whiteSurface} />
                  ) : isFailedStep ? (
                    <Icon name="close" size={12} color={stitchTokens.whiteSurface} strokeWidth={2.5} />
                  ) : (
                    <AppText style={styles.nodeUpcomingNumber}>{stepNum}</AppText>
                  )}
                </View>

                <AppText
                  numberOfLines={1}
                  style={[
                    styles.stepLabel,
                    isCompleted && styles.stepLabelCompleted,
                    isCurrent && styles.stepLabelCurrent,
                    isFailedStep && styles.stepLabelFailed,
                  ]}
                >
                  {step.label}
                </AppText>
              </View>
            );
          })}
        </View>
      </View>

      {/* 3. Stage Description Guidance Callout */}
      <View style={styles.guidanceBox}>
        <Icon
          name={isFailed ? "info" : "sparkles" in Icon ? "bolt" : "info"}
          size={14}
          color={isFailed ? stitchTokens.terracottaSoft : stitchTokens.wineDark}
        />
        <AppText style={styles.guidanceText}>{stageDescription}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: space.md,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepInfoGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepCountBadge: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  stepCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  stepperWrapper: {
    position: "relative",
    paddingVertical: 8,
    justifyContent: "center",
  },
  trackBackground: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 19,
    height: 3,
    backgroundColor: stitchTokens.peachBorder,
    borderRadius: 2,
  },
  trackProgress: {
    position: "absolute",
    left: 18,
    top: 19,
    height: 3,
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 2,
  },
  stepsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  stepColumn: {
    alignItems: "center",
    width: 48,
    gap: 6,
  },
  nodeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 2,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCircleCompleted: {
    backgroundColor: stitchTokens.likeNewGreen,
    borderColor: stitchTokens.likeNewGreen,
  },
  nodeCircleCurrent: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  nodeCircleFailed: {
    backgroundColor: stitchTokens.terracottaSoft,
    borderColor: stitchTokens.terracottaSoft,
  },
  nodeUpcomingNumber: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.roseBrown,
    textAlign: "center",
  },
  stepLabelCompleted: {
    color: stitchTokens.likeNewGreen,
    fontWeight: "700",
  },
  stepLabelCurrent: {
    color: stitchTokens.wineDark,
    fontWeight: "800",
  },
  stepLabelFailed: {
    color: stitchTokens.terracottaSoft,
    fontWeight: "700",
  },
  guidanceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  guidanceText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.wineDark,
    fontWeight: "500",
  },
});
