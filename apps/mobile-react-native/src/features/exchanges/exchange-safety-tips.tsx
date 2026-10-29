import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../core/ui";

const TIPS = [
  {
    id: "camera",
    icon: "camera" as const,
    title: "Chụp ảnh trước khi gửi:",
    desc: "Luôn chụp lại tình trạng sách, bìa, gáy sách trước khi đóng gói để làm bằng chứng đối chiếu khi cần.",
  },
  {
    id: "box",
    icon: "bag" as const,
    title: "Đóng gói cẩn thận:",
    desc: "Bọc sách bằng màng xốp bong bóng chống sốc hoặc bìa carton cứng tránh gãy góc trong khi vận chuyển.",
  },
  {
    id: "receipt",
    icon: "ticket" as const,
    title: "Lưu giữ mã vận đơn:",
    desc: "Giữ biên lai bưu cục và điền mã vận đơn vào đơn trao đổi. Khung chat chỉ dùng để trao đổi thêm.",
  },
  {
    id: "shield",
    icon: "shield" as const,
    title: "Đồng kiểm 72 giờ:",
    desc: "Chỉ bấm xác nhận khi đã nhận và kiểm tra sách thực tế. Dùng nút 'Báo sự cố' nếu sách không đúng mô tả.",
  },
];

export function ExchangeSafetyTips() {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mẹo an toàn khi trao đổi sách"
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.header}
      >
        <View style={styles.iconCircle}>
          <Icon name="shield" size={18} color={stitchTokens.wineDark} />
        </View>
        <View style={styles.headerText}>
          <AppText style={styles.title}>Mẹo An Toàn Khi Trao Đổi</AppText>
          <AppText style={styles.subtitle}>
            {expanded ? "Bấm để thu gọn hướng dẫn" : "Bấm để xem 4 lưu ý bảo vệ quyền lợi"}
          </AppText>
        </View>
        <Icon
          name={expanded ? "close" : "arrow"}
          size={16}
          color={stitchTokens.roseBrown}
        />
      </Pressable>

      {expanded && (
        <View style={styles.content}>
          {TIPS.map((tip) => (
            <View key={tip.id} style={styles.tipRow}>
              <View style={styles.tipIconBox}>
                <Icon name={tip.icon} size={15} color={stitchTokens.wineDark} />
              </View>
              <View style={styles.tipTextCol}>
                <AppText style={styles.tipTitle}>{tip.title}</AppText>
                <AppText style={styles.tipDesc}>{tip.desc}</AppText>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: space.md,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  subtitle: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
  },
  content: {
    paddingTop: 4,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.peachBorder,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  tipIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  tipTextCol: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  tipDesc: {
    fontSize: 11,
    lineHeight: 15,
    color: stitchTokens.roseBrown,
  },
});
