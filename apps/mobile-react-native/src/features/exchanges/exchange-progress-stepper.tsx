import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  let currentStepIndex = 1;
  let isFailed = false;
  let statusBadgeText = "Đang tiến hành";
  let statusBadgeBg: string = stitchTokens.goldAccent;
  let statusBadgeColor: string = stitchTokens.ombreStop100;
  let stageDescription = "Giao dịch đang được xử lý theo quy trình.";

  switch (status) {
    case "Proposed":
      currentStepIndex = 1;
      statusBadgeText = "Chờ phản hồi";
      statusBadgeBg = stitchTokens.goldAccent;
      statusBadgeColor = stitchTokens.ombreStop100;
      stageDescription = "Đề nghị đang chờ đối tác xem xét và phản hồi điều khoản.";
      break;

    case "AcceptedAwaitingFunding":
      currentStepIndex = 2;
      statusBadgeText = "Chờ đặt cọc";
      statusBadgeBg = stitchTokens.goldAccent;
      statusBadgeColor = stitchTokens.ombreStop100;
      stageDescription = "Hai bên cần hoàn tất đặt cọc bảo chứng để kích hoạt gửi sách.";
      break;

    case "Preparing":
      currentStepIndex = 3;
      statusBadgeText = "Chuẩn bị gửi";
      statusBadgeBg = stitchTokens.goldAccent;
      statusBadgeColor = stitchTokens.ombreStop100;
      stageDescription = "Hai bên đã cọc thành công. Vui lòng đóng gói và gửi sách trong 72 giờ.";
      break;

    case "InTransit":
      currentStepIndex = 4;
      statusBadgeText = "Đang vận chuyển";
      statusBadgeBg = stitchTokens.goldVeryLight;
      statusBadgeColor = stitchTokens.ombreStop100;
      stageDescription = "Bưu phẩm đang trên đường giao nhận. Hãy chú ý điện thoại bưu tá.";
      break;

    case "Delivered":
      currentStepIndex = 5;
      statusBadgeText = "Đồng kiểm 72h";
      statusBadgeBg = stitchTokens.greenBorderSoft;
      statusBadgeColor = stitchTokens.forestDeep;
      stageDescription = "Mỗi bên có 72 giờ kiểm tra từ lúc nhận sách. Chỉ tất toán sau cả hai hạn nếu không có tranh chấp.";
      break;

    case "Completed":
      currentStepIndex = 6;
      statusBadgeText = "Hoàn tất";
      statusBadgeBg = stitchTokens.goldMedal;
      statusBadgeColor = stitchTokens.ombreStop100;
      stageDescription = "Trao đổi hoàn tất thành công! Tiền cọc đã hoàn về ví.";
      break;

    case "ResolutionPending":
      isFailed = true;
      currentStepIndex = 5;
      statusBadgeText = "Khiếu nại";
      statusBadgeBg = stitchTokens.lightPink;
      statusBadgeColor = stitchTokens.darkRed;
      stageDescription = "Đang có khiếu nại phát sinh. Tiến trình tạm dừng để giải quyết an toàn.";
      break;

    case "Cancelled":
      isFailed = true;
      currentStepIndex = cancelReason === "DisputeResolvedRefund" ? 5 : 1;
      statusBadgeText =
        cancelReason === "DisputeResolvedRefund"
          ? "Đã giải quyết khiếu nại (Đã hủy)"
          : cancelReason === "MutualAgreement"
            ? "Đồng thuận hủy"
            : rejectionReason
              ? "Bị từ chối"
              : "Đã hủy";
      statusBadgeBg = stitchTokens.lightPink;
      statusBadgeColor = stitchTokens.darkRed;
      stageDescription = cancelReason
        ? `Giao dịch đã hủy: "${formatCancelReason(cancelReason)}"`
        : rejectionReason
        ? `Đề nghị bị từ chối: "${rejectionReason}"`
        : "Giao dịch trao đổi đã bị hủy.";
      break;
  }

  const currentStep = STEPS[currentStepIndex - 1] ?? STEPS[0];

  return (
    <View style={styles.container} onLayout={(e) => setLayout(e.nativeEvent.layout)}>
      {/* 3D Red Ombre SVG Background with Specular Reflection */}
      <Svg
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
        width={layout ? layout.width : "100%"}
        height={layout ? layout.height : "100%"}
        viewBox={layout ? `0 0 ${layout.width} ${layout.height}` : undefined}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="stepperOmbre3D" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={stitchTokens.ombreStop0} />
            <Stop offset="30%" stopColor={stitchTokens.ombreStop30} />
            <Stop offset="70%" stopColor={stitchTokens.ombreStop70} />
            <Stop offset="100%" stopColor={stitchTokens.ombreStop100} />
          </LinearGradient>
          <LinearGradient id="stepperSpecular" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={stitchTokens.white} stopOpacity={0.25} />
            <Stop offset="45%" stopColor={stitchTokens.white} stopOpacity={0.04} />
            <Stop offset="100%" stopColor={stitchTokens.white} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect
          width="100%"
          height="100%"
          rx={18}
          ry={18}
          fill="url(#stepperOmbre3D)"
        />
        <Rect
          width="100%"
          height="65%"
          rx={18}
          ry={18}
          fill="url(#stepperSpecular)"
        />
      </Svg>

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

      {/* 2. Stepper Track with Connected Segments (Line connects strictly between circles) */}
      <View style={styles.stepperWrapper}>
        <View style={styles.stepsRow}>
          {STEPS.map((step, idx) => {
            const stepNum = step.id;
            const isCompleted = !isFailed && (stepNum < currentStepIndex || status === "Completed");
            const isCurrent = !isFailed && stepNum === currentStepIndex && status !== "Completed";
            const isFailedStep = isFailed && stepNum === currentStepIndex;
            const isConnectorActive = !isFailed && idx < currentStepIndex - 1;

            return (
              <React.Fragment key={step.id}>
                <View style={styles.stepColumn}>
                  <View style={styles.nodeCircleWrapper}>
                    <View
                      style={[
                        styles.nodeCircle,
                        isCompleted && styles.nodeCircleCompleted,
                        isCurrent && styles.nodeCircleCurrent,
                        isFailedStep && styles.nodeCircleFailed,
                      ]}
                    >
                      {isCompleted ? (
                        <Icon name="check" size={12} color={stitchTokens.white} strokeWidth={2.8} />
                      ) : isCurrent ? (
                        <Icon name={step.iconName} size={13} color={stitchTokens.wineDark} />
                      ) : isFailedStep ? (
                        <Icon name="close" size={12} color={stitchTokens.white} strokeWidth={2.8} />
                      ) : (
                        <AppText style={styles.nodeUpcomingNumber}>{stepNum}</AppText>
                      )}
                    </View>
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

                {idx < STEPS.length - 1 && (
                  <View style={styles.connectorWrapper}>
                    <View
                      style={[
                        styles.connectorLine,
                        isConnectorActive && styles.connectorLineActive,
                      ]}
                    />
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* 3. Stage Description Guidance Callout */}
      <View style={styles.guidanceBox}>
        <Icon
          name={isFailed ? "info" : "bolt"}
          size={14}
          color={isFailed ? stitchTokens.lightPink : stitchTokens.gold}
        />
        <AppText style={styles.guidanceText}>{stageDescription}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    padding: space.md,
    gap: 12,
    borderWidth: 1.5,
    borderColor: stitchTokens.cardBorderHighlightTop,
    borderBottomWidth: 3.5,
    borderBottomColor: stitchTokens.cardBorderShadowBottom,
    shadowColor: stitchTokens.shadowDeepCrimson,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
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
    backgroundColor: stitchTokens.whiteAlpha18,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha32,
  },
  stepCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.white,
    letterSpacing: 0.3,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.white,
    letterSpacing: 0.2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  stepperWrapper: {
    paddingVertical: 4,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepColumn: {
    alignItems: "center",
    width: 44,
  },
  nodeCircleWrapper: {
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteAlpha16,
    borderWidth: 1.5,
    borderColor: stitchTokens.whiteAlpha35,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCircleCompleted: {
    backgroundColor: stitchTokens.verifiedGreen,
    borderColor: stitchTokens.greenLightBorder,
    borderWidth: 2,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  nodeCircleCurrent: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.goldAccent,
    borderColor: stitchTokens.goldLight,
    borderWidth: 2,
    shadowColor: stitchTokens.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.7,
    shadowRadius: 5,
    elevation: 6,
  },
  nodeCircleFailed: {
    backgroundColor: stitchTokens.crimson,
    borderColor: stitchTokens.lightPink,
    borderWidth: 2,
  },
  nodeUpcomingNumber: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.whitePinkTextMuted,
  },
  connectorWrapper: {
    flex: 1,
    height: 26,
    justifyContent: "center",
    paddingHorizontal: 1,
  },
  connectorLine: {
    height: 3,
    backgroundColor: stitchTokens.whiteAlpha22,
    borderRadius: 1.5,
  },
  connectorLineActive: {
    backgroundColor: stitchTokens.goldAccent,
    shadowColor: stitchTokens.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
    elevation: 2,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.whitePinkMutedAlpha65,
    textAlign: "center",
    marginTop: 6,
  },
  stepLabelCompleted: {
    color: stitchTokens.whitePinkText,
    fontWeight: "700",
  },
  stepLabelCurrent: {
    color: stitchTokens.gold,
    fontWeight: "800",
  },
  stepLabelFailed: {
    color: stitchTokens.lightPink,
    fontWeight: "700",
  },
  guidanceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.blackAlpha28,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha15,
  },
  guidanceText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16.5,
    color: stitchTokens.whitePinkText,
    fontWeight: "500",
  },
});
