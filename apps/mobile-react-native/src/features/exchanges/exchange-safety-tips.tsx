import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../core/ui";

const TIPS = [
  {
    id: "camera",
    icon: "camera" as const,
    title: "Chụp ảnh & quay video trước khi gửi",
    desc: "Ghi lại tình trạng bìa, gáy sách và quá trình đóng gói để đối chiếu nếu phát sinh sự cố.",
  },
  {
    id: "box",
    icon: "bag" as const,
    title: "Bọc chống sốc cẩn thận",
    desc: "Dùng màng xốp hoặc bìa carton cứng để tránh cong góc, rách bìa khi vận chuyển.",
  },
  {
    id: "receipt",
    icon: "ticket" as const,
    title: "Lưu giữ mã vận đơn",
    desc: "Cập nhật mã vận đơn đúng trên phiếu; trò chuyện chỉ dùng để trao đổi thêm thông tin.",
  },
  {
    id: "shield",
    icon: "shield" as const,
    title: "Đồng kiểm 72 giờ an toàn",
    desc: "Chỉ bấm xác nhận hài lòng khi đã kiểm tra kỹ. Nếu có sai lệch, bấm Báo sự cố trước hạn.",
  },
];

export function ExchangeSafetyTips() {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Hướng dẫn giao nhận và bảo quản"
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconPill}>
            <Icon name="shield" size={14} color={stitchTokens.wine} />
          </View>
          <AppText style={styles.title}>Lưu ý giao nhận & bảo vệ cọc</AppText>
        </View>
        <Icon
          name={expanded ? "chevronUp" : "chevronDown"}
          size={16}
          color={stitchTokens.subtleGray}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.content}>
          {TIPS.map((tip) => (
            <View key={tip.id} style={styles.tipRow}>
              <View style={styles.tipIconBox}>
                <Icon name={tip.icon} size={14} color={stitchTokens.wine} />
              </View>
              <View style={styles.tipTextCol}>
                <AppText style={styles.tipTitle}>{tip.title}</AppText>
                <AppText style={styles.tipDesc}>{tip.desc}</AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(92, 2, 2, 0.05)",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.75,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  content: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.surfaceSoft,
    gap: space.md,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  tipIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tipTextCol: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  tipDesc: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17.5,
  },
});
