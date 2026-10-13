import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Button, Icon, stitchTokens } from "../../../core/ui";

export interface HomeInspectionModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function HomeInspectionModal({
  visible,
  onClose,
}: HomeInspectionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Đóng thông tin thẩm định"
        />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Icon name="shield" size={22} color={stitchTokens.wine} />
              <AppText kind="bookHeading" style={styles.headerTitle}>
                Quy Trình Thẩm Định 24h
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <Icon name="close" size={20} color="#786B67" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* Banner overview */}
            <View style={styles.highlightCard}>
              <View style={styles.shieldIconBig}>
                <Icon name="check" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.highlightText}>
                <AppText kind="bold" style={styles.highlightTitle}>
                  Cam Kết Chuẩn Thẩm Định Lật Lại
                </AppText>
                <AppText kind="small" style={styles.highlightSub}>
                  Mọi cuốn sách cổ, bản in đầu và kỳ thư đấu giá đều được kiểm
                  duyệt trực tiếp tại 2 trạm ViaPoint TP.HCM trước khi giao tới tay
                  bạn.
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
                    Tiếp Nhận Tại ViaPoint
                  </AppText>
                  <AppText kind="small" style={styles.stepDesc}>
                    Người bán gửi sách tại ViaPoint Quận 1 hoặc Bình Thạnh. Chuyên
                    viên lập biên bản tiếp nhận vật lý.
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
                    Kiểm Tra Tình Trạng Trong 24 Giờ
                  </AppText>
                  <AppText kind="small" style={styles.stepDesc}>
                    Đối chiếu số trang, gáy sách, vết ố, chữ ký tác giả và bản in
                    đầu. Ghi chép chi tiết vào báo cáo giám định.
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
                    Dán Tem & Bàn Giao
                  </AppText>
                  <AppText kind="small" style={styles.stepDesc}>
                    Dán tem niêm phong Lật Lại Certified. Người mua được đồng kiểm
                    100% khi nhận hàng tại TP.HCM.
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(30, 20, 18, 0.55)",
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: "#FAF7F2",
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
    borderColor: "#EAE5DC",
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
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    borderRadius: 10,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  shieldIconBig: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2E7D32",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightText: {
    flex: 1,
  },
  highlightTitle: {
    fontSize: 13,
    color: "#1B5E20",
  },
  highlightSub: {
    fontSize: 11,
    color: "#388E3C",
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
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    color: "#271813",
  },
  stepDesc: {
    fontSize: 11,
    color: "#786B67",
    marginTop: 2,
    lineHeight: 16,
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
