import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppModal as Modal, Icon, stitchTokens } from "../../../core/ui";

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

export interface AuctionGuideModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function AuctionGuideModal({ visible, onClose }: AuctionGuideModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissOverlay} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <View style={styles.iconCircle}>
                <Icon name="info" size={15} color={stitchTokens.wineDark} />
              </View>
              <AppText kind="bold" style={styles.headerTitle}>
                3 bước tham gia sàn đấu giá Lật Lại
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Icon name="close" size={18} color={stitchTokens.subtleGray} />
            </Pressable>
          </View>

          {/* Steps List */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {STEPS.map((s, index) => (
              <View
                key={s.step}
                style={[
                  styles.stepItem,
                  index < STEPS.length - 1 && styles.stepItemBorder,
                ]}
              >
                <View style={styles.stepNumCircle}>
                  <AppText kind="bold" style={styles.stepNumText}>
                    {s.step}
                  </AppText>
                </View>
                <View style={styles.stepContent}>
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
          </ScrollView>

          {/* Footer CTA */}
          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.confirmBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <AppText kind="bold" style={styles.confirmBtnText}>
                Đã hiểu
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: stitchTokens.blackAlpha45,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dismissOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    maxHeight: "80%",
    paddingBottom: 16,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  closeBtn: {
    padding: 4,
  },
  bodyScroll: {
    paddingHorizontal: 16,
  },
  bodyContent: {
    paddingVertical: 12,
    gap: 12,
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
  stepNumCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    marginTop: 2,
  },
  stepNumText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
  },
  stepContent: {
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
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
  },
  confirmBtn: {
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    color: stitchTokens.whiteSurface,
    fontSize: 13,
  },
});
