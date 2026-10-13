import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon, type IconName, stitchTokens } from "../../../core/ui";

export interface HomeShortcutsProps {
  readonly onAuctionPress: () => void;
  readonly onExchangePress: () => void;
  readonly onNewestPress: () => void;
  readonly onRarePress: () => void;
}

interface ShortcutItem {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly iconColor: string;
  readonly bgColor: string;
  readonly borderColor: string;
  readonly badge?: {
    readonly text: string;
    readonly bg: string;
    readonly color: string;
  };
  readonly onPress: () => void;
}

export function HomeShortcuts({
  onAuctionPress,
  onExchangePress,
  onNewestPress,
  onRarePress,
}: HomeShortcutsProps) {
  const items: readonly ShortcutItem[] = [
    {
      id: "sc-auction",
      title: "Đấu Giá",
      icon: "gavel",
      iconColor: stitchTokens.wine,
      bgColor: stitchTokens.amberBg,
      borderColor: stitchTokens.amberBorder,
      badge: {
        text: "HOT",
        bg: stitchTokens.flashRed,
        color: stitchTokens.white,
      },
      onPress: onAuctionPress,
    },
    {
      id: "sc-exchange",
      title: "Góc Trao Đổi",
      icon: "sync",
      iconColor: stitchTokens.likeNewGreen,
      bgColor: stitchTokens.likeNewGreenBg,
      borderColor: stitchTokens.mintGreen,
      onPress: onExchangePress,
    },
    {
      id: "sc-newest",
      title: "Sách Mới Đăng",
      icon: "flame",
      iconColor: stitchTokens.tagExchangeText,
      bgColor: stitchTokens.amberBg,
      borderColor: stitchTokens.amberBorder,
      badge: {
        text: "MỚI",
        bg: stitchTokens.orangeDeep,
        color: stitchTokens.white,
      },
      onPress: onNewestPress,
    },
    {
      id: "sc-rare",
      title: "Ấn Bản Hiếm",
      icon: "diamond",
      iconColor: stitchTokens.goldBronze,
      bgColor: stitchTokens.lemonLight,
      borderColor: stitchTokens.lemonBg,
      onPress: onRarePress,
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.itemCell,
              pressed && styles.cellPressed,
            ]}
          >
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: item.bgColor,
                  borderColor: item.borderColor,
                },
              ]}
            >
              <Icon name={item.icon} size={24} color={item.iconColor} />
              {item.badge ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: item.badge.bg },
                  ]}
                >
                  <AppText
                    kind="small"
                    style={[styles.badgeText, { color: item.badge.color }]}
                  >
                    {item.badge.text}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText kind="small" style={styles.label} numberOfLines={1}>
              {item.title}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: stitchTokens.white,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: stitchTokens.canvasWhite,
    elevation: 2,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemCell: {
    width: "25%",
    alignItems: "center",
  },
  cellPressed: {
    transform: [{ scale: 0.94 }],
  },
  iconBox: {
    position: "relative",
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "700",
    lineHeight: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.inkBrown,
    marginTop: 6,
    textAlign: "center",
  },
});
