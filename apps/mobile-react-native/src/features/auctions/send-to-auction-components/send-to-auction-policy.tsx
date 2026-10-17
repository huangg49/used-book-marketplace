import { StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { stitchTokens } from "../../../core/ui/theme";

export function SendToAuctionPolicy() {
  return (
    <View style={styles.cardContainer}>
      <View style={styles.titleRow}>
        <Icon name="book" size={18} color={stitchTokens.wineDark} />
        <AppText kind="bold" style={styles.titleText}>
          Quy trình ký gửi đấu giá
        </AppText>
      </View>

      <AppText style={styles.descText}>
        Mang sách tới điểm tiếp nhận trong <AppText kind="bold" style={styles.boldSpan}>72 giờ</AppText>. Nhân viên kiểm tra tình trạng thực tế theo bài đăng đã duyệt; đạt tiêu chuẩn thì mở phiên đấu giá 24 giờ. Không đạt hoặc không có người mua, bạn nhận lại sách tại điểm.
      </AppText>

      <View style={styles.footerRow}>
        <View style={styles.featurePill}>
          <Icon name="clock" size={13} color={stitchTokens.subtleGray} />
          <AppText kind="small" style={styles.featureText}>
            Thời gian giám định: 4–8h
          </AppText>
        </View>
        <View style={styles.featurePill}>
          <Icon name="shield" size={13} color={stitchTokens.subtleGray} />
          <AppText kind="small" style={styles.featureText}>
            Niêm phong bảo quản
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: stitchTokens.roseWarmSurface, // #FFF8F6
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 14,
    gap: 8,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titleText: {
    fontSize: 15,
    color: stitchTokens.wineDark,
  },
  descText: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.deepCocoa,
  },
  boldSpan: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(222, 192, 187, 0.4)",
  },
  featurePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  featureText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
});
