import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../../core/ui";

interface BookSellerCardProps {
  sellerName: string;
  sellerId: string;
}

export function BookSellerCard({ sellerName }: BookSellerCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.sellerInfo}>
          <View style={styles.avatarBox}>
            <View style={styles.avatarInner}>
              <Icon name="person" size={24} color={stitchTokens.wineDark} />
            </View>
            <View style={styles.verifiedDot}>
              <Icon name="check" size={10} color={stitchTokens.white} strokeWidth={2.5} />
            </View>
          </View>

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <AppText style={styles.displayName}>{sellerName}</AppText>
              <View style={styles.memberChip}>
                <AppText style={styles.memberChipText}>Chủ sách</AppText>
              </View>
            </View>
            <View style={styles.locationRow}>
              <Icon name="pin" size={13} color={stitchTokens.wineMid} />
              <AppText style={styles.locationText}>Quận 1, TP. Hồ Chí Minh</AppText>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xem tủ sách người này"
          style={({ pressed }) => [styles.shelfBtn, pressed && styles.pressed]}
        >
          <AppText style={styles.shelfBtnText}>Xem tủ sách</AppText>
        </Pressable>
      </View>

      {/* Seller Metrics 3-Col with Warm Accent Background */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <AppText style={styles.ratingVal}>★ 4.9</AppText>
          <AppText style={styles.metricSub}>Uy tín đối soát</AppText>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <AppText style={styles.metricVal}>98%</AppText>
          <AppText style={styles.metricSub}>Phản hồi &lt;15p</AppText>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <AppText style={styles.verifiedVal}>Đã xác minh</AppText>
          <AppText style={styles.metricSub}>Tài khoản thật</AppText>
        </View>
      </View>

      {/* Note */}
      <View style={styles.disclaimerBox}>
        <Icon name="info" size={13} color={stitchTokens.wineMid} />
        <AppText style={styles.disclaimerText}>
          Lật lại kiểm duyệt thông tin catalog; ảnh và tình trạng do người đăng chịu trách nhiệm.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sellerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatarBox: {
    position: "relative",
  },
  avatarInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: stitchTokens.verifiedGreen,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: stitchTokens.white,
  },
  nameBlock: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  displayName: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  memberChip: {
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  memberChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
    fontWeight: "500",
  },
  shelfBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: stitchTokens.wineMid,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  shelfBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  metricsGrid: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: stitchTokens.goldBorderAlpha35,
  },
  ratingVal: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.goldBronze,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  verifiedVal: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  metricSub: {
    fontSize: 10,
    color: stitchTokens.darkWood,
    fontWeight: "600",
  },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: stitchTokens.subtleGray,
    fontStyle: "italic",
  },
  pressed: {
    opacity: 0.8,
  },
});
