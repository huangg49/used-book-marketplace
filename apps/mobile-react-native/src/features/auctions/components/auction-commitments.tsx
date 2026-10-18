import { StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, stitchTokens } from "../../../core/ui";

export function AuctionCommitments() {
  return (
    <View style={styles.footerCommitments}>
      <View style={styles.commitmentItem}>
        <Icon name="truck" size={18} color={stitchTokens.wine} />
        <AppText kind="small" style={styles.commitmentText}>
          Đóng gói 3 lớp chống ẩm
        </AppText>
      </View>
      <View style={styles.commitmentDivider} />
      <View style={styles.commitmentItem}>
        <Icon name="shield" size={18} color={stitchTokens.wine} />
        <AppText kind="small" style={styles.commitmentText}>
          Bảo mật danh tính đấu
        </AppText>
      </View>
      <View style={styles.commitmentDivider} />
      <View style={styles.commitmentItem}>
        <Icon name="sync" size={18} color={stitchTokens.wine} />
        <AppText kind="small" style={styles.commitmentText}>
          Đồng kiểm khi nhận
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerCommitments: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
    marginTop: 12,
  },
  commitmentItem: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  commitmentText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    textAlign: "center",
  },
  commitmentDivider: {
    width: 1,
    height: 24,
    backgroundColor: stitchTokens.cardBorder,
  },
});
