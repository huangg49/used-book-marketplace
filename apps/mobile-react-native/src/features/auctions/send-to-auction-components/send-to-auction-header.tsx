import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { stitchTokens } from "../../../core/ui/theme";

export interface SendToAuctionHeaderProps {
  readonly onBack: () => void;
  readonly onAvatarPress?: () => void;
}

export function SendToAuctionHeader({ onBack, onAvatarPress }: SendToAuctionHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 14) + 8 }]}>
      <View style={styles.headerContent}>
        <View style={styles.leftGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Về sàn đấu giá"
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
          >
            <Icon name="back" size={20} color="#FFDF97" />
          </Pressable>

          <View style={styles.titleColumn}>
            <View style={styles.categoryBadgeRow}>
              <Icon name="gavel" size={13} color="#FFDF97" />
              <AppText kind="small" style={styles.categoryBadgeText}>
                ĐẤU GIÁ
              </AppText>
            </View>
            <AppText kind="bold" style={styles.titleText}>
              Gửi Sách Đấu Giá
            </AppText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tài khoản cá nhân"
          onPress={onAvatarPress}
          style={({ pressed }) => [styles.avatarCircle, pressed && { opacity: 0.8 }]}
        >
          <Icon name="person" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: stitchTokens.wineDark, // #4A1010
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 50,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 46,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleColumn: {
    flex: 1,
  },
  categoryBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFDF97",
    letterSpacing: 0.8,
  },
  titleText: {
    fontSize: 18,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 223, 151, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
});
