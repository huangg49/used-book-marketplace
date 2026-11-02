import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppModal, Button, Icon, stitchTokens  } from "../../../core/ui";

export interface HomeInspectionModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function HomeInspectionModal({
  visible,
  onClose,
}: HomeInspectionModalProps) {
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
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Icon name="shield" size={22} color={stitchTokens.wine} />
              <AppText kind="bookHeading" style={styles.headerTitle}>
                Kiểm tra sách tại điểm
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <Icon name="close" size={20} color={stitchTokens.stoneMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* Banner overview */}
            <View style={styles.highlightCard}>
              <View style={styles.shieldIconBig}>
                <Icon name="check" size={28} color={stitchTokens.white} />
              </View>
              <View style={styles.highlightText}>
                <AppText kind="bold" style={styles.highlightTitle}>
                  Kiểm tra tình trạng, không chứng nhận chính hãng
                </AppText>
                <AppText kind="small" style={styles.highlightSub}>
                  Sách đấu giá phải được điểm tiếp nhận và kiểm tra trước khi mở phiên. Hai điểm trong dự án là điểm demo mô phỏng, không phải cơ sở đang hoạt động.
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
                    Nhân viên đối chiếu sách với ảnh và checklist. Kết quả chỉ phản ánh phạm vi đã kiểm tra; không bảo đảm đã kiểm mọi trang, chữ ký hay nguồn gốc bản in.
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
            <Button title="Đã hiểu" onPress={onClose} />
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
    backgroundColor: stitchTokens.parchment,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "80%",
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  closeBtn: {
    padding: 4,
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
    borderRadius: 10,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  shieldIconBig: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: stitchTokens.verifiedGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightText: {
    flex: 1,
  },
  highlightTitle: {
    fontSize: 13,
    color: stitchTokens.likeNewGreen,
  },
  highlightSub: {
    fontSize: 11,
    color: stitchTokens.leafGreen,
    marginTop: 2,
    lineHeight: 15,
  },
  timeline: {
    gap: 16,
    paddingLeft: 4,
  },
  stepItem: {
    flexDirection: "row",
    gap: 12,
  },
  stepNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 13,
    color: stitchTokens.charcoalBrown,
  },
  stepDesc: {
    fontSize: 11,
    color: stitchTokens.stoneMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
