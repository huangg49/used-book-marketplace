import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../../../core/ui/text";
import { AppModal, Icon, StatePanel, stitchTokens } from "../../../core/ui";

export interface HomeVouchersModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function HomeVouchersModal({ visible, onClose }: HomeVouchersModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <AppModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng ưu đãi"
        />
        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBox}>
                <Icon name="ticket" size={18} color={stitchTokens.wine} />
              </View>
              <AppText kind="bold" style={styles.headerTitle}>
                Ưu đãi
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng ưu đãi"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.72 }]}
            >
              <Icon name="close" size={18} color={stitchTokens.wineDark} strokeWidth={2.2} />
            </Pressable>
          </View>
          <View style={styles.body}>
            <StatePanel
              wine
              icon="ticket"
              title="Chưa có ưu đãi áp dụng"
              message="Lật lại hiện chưa áp dụng mã giảm giá cho các giao dịch sách."
            />
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: stitchTokens.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.cardBorder,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: stitchTokens.borderParchmentSoft,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    color: stitchTokens.wineDark,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.pillWarmBg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 16,
  },
});
