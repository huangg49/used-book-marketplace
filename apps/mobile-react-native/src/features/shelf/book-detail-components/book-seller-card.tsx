import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../../core/ui";
import { router } from "expo-router";

interface BookSellerCardProps {
  sellerName: string;
  sellerId: string;
}

export function BookSellerCard({ sellerName, sellerId }: BookSellerCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.sellerInfo}>
          <View style={styles.avatarBox}>
            <View style={styles.avatarInner}>
              <Icon name="person" size={24} color={stitchTokens.wineDark} />
            </View>
          </View>

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <AppText style={styles.displayName}>{sellerName}</AppText>
              <View style={styles.memberChip}>
                <AppText style={styles.memberChipText}>Chủ sách</AppText>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xem hồ sơ uy tín người bán"
          onPress={() =>
            router.push({ pathname: "/reputation", params: { id: sellerId } })
          }
          style={({ pressed }) => [styles.shelfBtn, pressed && styles.pressed]}
        >
          <AppText style={styles.shelfBtnText}>Hồ sơ uy tín</AppText>
        </Pressable>
      </View>

      {/* Note */}
      <View style={styles.disclaimerBox}>
        <Icon name="info" size={13} color={stitchTokens.wineMid} />
        <AppText style={styles.disclaimerText}>
          Lật lại kiểm duyệt thông tin catalog; ảnh và tình trạng do người đăng
          chịu trách nhiệm.
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
    flexWrap: "wrap",
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
  shelfBtn: {
    minHeight: 44,
    justifyContent: "center",
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
