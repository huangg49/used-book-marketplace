import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

const STEPS = [
  {
    step: "01",
    title: "Kiểm định trước khi lên sàn",
    body: "Người bán gửi sách tới điểm giao nhận TP.HCM. Nhân viên kiểm tra đạt chuẩn thì phiên mới được mở hoặc hẹn giờ mở.",
    icon: "shield" as const,
  },
  {
    step: "02",
    title: "Trả giá theo lịch phiên",
    body: "Người bán chọn thời lượng 1–168 giờ. Trả giá theo bước hoặc chọn mua ngay; mức tự động chỉ bạn xem được. Phiên cần đủ người đăng ký (ít nhất 4) và đặt cọc, không đủ trước hạn thì phiên bị hủy và hoàn cọc; ví giữ tiền cọc và mức bạn đang dẫn, hoàn lại khi bạn không thắng.",
    icon: "gavel" as const,
  },
  {
    step: "03",
    title: "Thanh toán & Nhận sách",
    body: "Người thắng thanh toán qua ví trong 24 giờ sau phiên, nhận sách trực tiếp tại điểm giao nhận an tâm.",
    icon: "pin" as const,
  },
];

export function AuctionGuideCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hướng dẫn tham gia đấu giá"
        onPress={() => setExpanded((v) => !v)}
        style={styles.summaryBar}
      >
        <View style={styles.summaryLeft}>
          <View style={styles.iconCircle}>
            <Icon name="info" size={14} color={stitchTokens.wineDark} />
          </View>
          <AppText kind="bold" style={styles.summaryTitle}>
            3 bước tham gia sàn đấu giá Lật Lại
          </AppText>
        </View>
        <View style={styles.summaryRight}>
          <AppText kind="small" style={styles.summaryToggleText}>
            {expanded ? "Thu gọn" : "Xem hướng dẫn"}
          </AppText>
          <Icon
            name={expanded ? "chevronDown" : "chevronRight"}
            size={14}
            color={stitchTokens.wine}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.stepsContainer}>
          {STEPS.map((s, index) => (
            <View
              key={s.step}
              style={[
                styles.stepItem,
                index < STEPS.length - 1 && styles.stepItemBorder,
              ]}
            >
              <View style={styles.stepNumCol}>
                <View style={styles.stepNumCircle}>
                  <AppText kind="bold" style={styles.stepNumText}>
                    {s.step}
                  </AppText>
                </View>
              </View>
              <View style={styles.stepContentCol}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name={s.icon} size={15} color={stitchTokens.wineDark} />
                  <AppText kind="bold" style={styles.stepTitle}>
                    {s.title}
                  </AppText>
                </View>
                <AppText kind="small" style={styles.stepBody}>
                  {s.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    overflow: "hidden",
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  summaryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryToggleText: {
    fontSize: 11,
    color: stitchTokens.wine,
    fontWeight: "600",
  },
  stepsContainer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
  },
  stepItem: {
    flexDirection: "row",
    paddingVertical: 10,
    gap: 12,
  },
  stepItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  stepNumCol: {
    paddingTop: 2,
  },
  stepNumCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  stepNumText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
  },
  stepContentCol: {
    flex: 1,
    gap: 3,
  },
  stepTitle: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
  },
  stepBody: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
});
