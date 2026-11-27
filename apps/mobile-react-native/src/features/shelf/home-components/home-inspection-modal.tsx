import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../../../core/ui/text";
import { AppModal, Button, Icon, stitchTokens } from "../../../core/ui";

export interface HomeInspectionModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function HomeInspectionModal({
  visible,
  onClose,
}: HomeInspectionModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <AppModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Đóng thông tin kiểm tra tại điểm"
        />
        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBox}>
                <Icon name="shield" size={18} color={stitchTokens.wine} />
              </View>
              <AppText kind="bold" style={styles.headerTitle}>
                Kiểm tra sách tại điểm
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.72 }]}
            >
              <Icon name="close" size={18} color={stitchTokens.wineDark} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* Banner overview */}
            <View style={styles.highlightCard}>
              <View style={styles.shieldIconBig}>
                <Icon name="check" size={24} color={stitchTokens.white} />
              </View>
              <View style={styles.highlightText}>
                <AppText kind="bold" style={styles.highlightTitle}>
                  Kiểm tra tình trạng, không chứng nhận chính hãng
                </AppText>
                <AppText kind="small" style={styles.highlightSub}>
                  Sách đấu giá phải được điểm tiếp nhận và kiểm tra trước khi mở phiên. Hai điểm trong dự án là điểm vận hành mô phỏng tại TP.HCM.
                </AppText>
              </View>
            </View>

            {/* 3 Step Timeline */}
            <View style={styles.timeline}>
              <View style={styles.stepItem}>
                <View style={styles.stepNumBadge}>
                  <AppText kind="small" style={styles.stepNumText}>
                    1
                  </AppText>
                </View>
                <View style={styles.stepInfo}>
                  <AppText kind="bold" style={styles.stepTitle}>
                    Tiếp nhận đúng hồ sơ
                  </AppText>
                  <AppText kind="small" style={styles.stepDesc}>
                    Người bán xem điểm được chọn, thời hạn và điều kiện gửi trong hồ sơ đấu giá. Nhân viên ghi nhận việc nhận sách tại điểm.
                  </AppText>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumBadge}>
                  <AppText kind="small" style={styles.stepNumText}>
                    2
                  </AppText>
                </View>
                <View style={styles.stepInfo}>
                  <AppText kind="bold" style={styles.stepTitle}>
                    Đối chiếu tình trạng và mô tả
                  </AppText>
                  <AppText kind="small" style={styles.stepDesc}>
                    Nhân viên đối chiếu sách với ảnh và danh sách tiêu chí kiểm tra. Kết quả chỉ phản ánh phạm vi đã kiểm tra; không bảo đảm đã kiểm mọi trang, chữ ký hay nguồn gốc bản in.
                  </AppText>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumBadge}>
                  <AppText kind="small" style={styles.stepNumText}>
                    3
                  </AppText>
                </View>
                <View style={styles.stepInfo}>
                  <AppText kind="bold" style={styles.stepTitle}>
                    Xem báo cáo trước khi nhận
                  </AppText>
                  <AppText kind="small" style={styles.stepDesc}>
                    Người nhận xem báo cáo và làm bước tiếp theo trong đơn. Trạng thái, mã nhận và thời hạn kiểm tra được ghi riêng trong từng hồ sơ.
                  </AppText>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.bottomArea}>
            <Button wine title="Đã hiểu" onPress={onClose} />
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: stitchTokens.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "84%",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.cardBorder,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: stitchTokens.borderParchmentSoft,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    color: stitchTokens.wineDark,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.pillWarmBg,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  highlightCard: {
    flexDirection: "row",
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.mintGreen,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  shieldIconBig: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: stitchTokens.verifiedGreen,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  highlightText: {
    flex: 1,
  },
  highlightTitle: {
    fontSize: 13.5,
    color: stitchTokens.likeNewGreen,
  },
  highlightSub: {
    fontSize: 12,
    color: stitchTokens.leafGreen,
    marginTop: 2,
    lineHeight: 17,
  },
  timeline: {
    gap: 14,
    paddingLeft: 4,
  },
  stepItem: {
    flexDirection: "row",
    gap: 12,
  },
  stepNumBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepNumText: {
    color: stitchTokens.white,
    fontWeight: "700",
    fontSize: 12,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13.5,
    color: stitchTokens.charcoalBrown,
  },
  stepDesc: {
    fontSize: 12,
    color: stitchTokens.stoneMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: stitchTokens.borderParchmentSoft,
  },
});
