import { StyleSheet, View } from "react-native";
import { AppText, Button, Icon, Sheet, space, stitchTokens } from "../../../core/ui";

const STEPS = [
  {
    icon: "book" as const,
    title: "Chọn sách đấu giá đã duyệt",
    body: "Sách đấu giá dùng bài đăng riêng (không chung kệ bán thường). Chọn sách đã duyệt, điểm tiếp nhận tại TP.HCM và cấu hình giá.",
  },
  {
    icon: "pin" as const,
    title: "Mang sách tới điểm trong 72 giờ",
    body: "Nhân viên tiếp nhận kiểm tra tình trạng thực tế đối chiếu với mô tả của bạn.",
  },
  {
    icon: "gavel" as const,
    title: "Hẹn giờ mở phiên & nhận thanh toán",
    body: "Khi sách đạt kiểm định, bạn chọn giờ mở và thời lượng (1–168 giờ). Tiền bán quyết toán qua ví Lật Lại sau khi đơn hoàn tất.",
  },
];

export function SendToAuctionPolicySheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Quy trình gửi sách đấu giá"
      visible={visible}
      onClose={onClose}
      footer={<Button wine title="Đã hiểu" onPress={onClose} />}
    >
      <View style={styles.list}>
        {STEPS.map((s, idx) => (
          <View key={s.title} style={[styles.item, idx > 0 && styles.itemBorder]}>
            <View style={styles.iconWrap}>
              <Icon name={s.icon} size={17} color={stitchTokens.wine} />
            </View>
            <View style={styles.textCol}>
              <AppText kind="bold" style={styles.title}>{s.title}</AppText>
              <AppText kind="small" color={stitchTokens.brownMuted} style={styles.body}>{s.body}</AppText>
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/** Kept exported for compatibility; compact inline summary if rendered directly. */
export function SendToAuctionPolicy() {
  return (
    <View style={styles.inlineCard}>
      <Icon name="shield" size={16} color={stitchTokens.wine} />
      <AppText kind="small" color={stitchTokens.deepCocoa} style={styles.inlineText}>
        Mang sách tới điểm TP.HCM trong 72 giờ để kiểm định trước khi hẹn giờ mở phiên.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  itemBorder: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, gap: 4 },
  title: { fontSize: 15, color: stitchTokens.wineDark },
  body: { lineHeight: 19 },
  inlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 12,
    padding: 12,
  },
  inlineText: { flex: 1, lineHeight: 18 },
});
