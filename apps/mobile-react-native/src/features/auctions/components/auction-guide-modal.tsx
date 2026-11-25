import { StyleSheet, View } from "react-native";
import { AppText, Button, Icon, Sheet, space, stitchTokens } from "../../../core/ui";

const STEPS = [
  {
    icon: "shield" as const,
    title: "Kiểm định tại điểm TP.HCM",
    body: "Mỗi cuốn sách đều được nhân viên tại điểm giao nhận TP.HCM kiểm tra thực tế trước khi người bán hẹn giờ mở phiên.",
  },
  {
    icon: "gavel" as const,
    title: "Đăng ký cọc & trả giá minh bạch",
    body: "Đặt cọc đăng ký trước khi phiên mở. Hỗ trợ trả giá theo bước, đặt giá tự động và mua ngay; tiền cọc và khoản đang dẫn hoàn ngay nếu bạn không thắng.",
  },
  {
    icon: "pin" as const,
    title: "Thanh toán ví & nhận sách an tâm",
    body: "Người thắng thanh toán từ ví trong 24 giờ và chọn tự nhận tại điểm hoặc giao tận nơi có 72 giờ kiểm tra.",
  },
];

export interface AuctionGuideModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function AuctionGuideModal({ visible, onClose }: AuctionGuideModalProps) {
  return (
    <Sheet
      title="Cách tham gia sàn đấu giá"
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
});
