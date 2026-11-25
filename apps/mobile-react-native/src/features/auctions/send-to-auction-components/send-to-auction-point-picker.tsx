import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, radius, space, stitchTokens } from "../../../core/ui";
import type { HandoverPoint } from "../contracts";

export interface SendToAuctionPointPickerProps {
  readonly points: HandoverPoint[];
  readonly selectedPointId: string | null;
  readonly onSelectPoint: (id: string) => void;
  readonly disabled?: boolean;
  readonly isLoading?: boolean;
  readonly defaultExpanded?: boolean;
}

export function SendToAuctionPointPicker({
  points,
  selectedPointId,
  onSelectPoint,
  disabled = false,
  isLoading = false,
}: SendToAuctionPointPickerProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.stepIcon}>
          <Icon name="pin" size={16} color={stitchTokens.wine} />
        </View>
        <View style={styles.flexOne}>
          <AppText kind="bold" style={styles.title}>Chọn điểm gửi sách</AppText>
          <AppText kind="small" color={stitchTokens.brownMuted}>
            Điểm giao nhận TP.HCM · mở cửa 09:00 – 18:00
          </AppText>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" color={stitchTokens.brownMuted}>Đang tải danh sách điểm…</AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {points.map((p) => {
            const isSelected = selectedPointId === p.id;
            const isFull = p.status !== "Active" || p.availableSlots < 1;
            const isSelectable = !disabled && !isFull;

            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, selected: isSelected, disabled: !isSelectable }}
                accessibilityLabel={p.name}
                disabled={!isSelectable}
                onPress={() => onSelectPoint(p.id)}
                style={({ pressed }) => [
                  styles.stationRow,
                  isSelected && styles.stationRowSelected,
                  isFull && styles.stationRowDisabled,
                  isSelectable && pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.radio,
                    isSelected && styles.radioSelected,
                    isFull && styles.radioDisabled,
                  ]}
                >
                  {isSelected ? <Icon name="check" size={12} color={stitchTokens.gold} /> : null}
                </View>

                <View style={styles.stationContent}>
                  <View style={styles.stationTopRow}>
                    <AppText
                      kind="bold"
                      numberOfLines={1}
                      style={[styles.stationTitle, isFull && styles.mutedText]}
                    >
                      {p.name}
                    </AppText>
                    <View style={[styles.slotPill, isFull ? styles.slotPillClosed : styles.slotPillOpen]}>
                      <AppText style={[styles.slotPillText, isFull ? styles.slotTextClosed : styles.slotTextOpen]}>
                        {p.status === "Paused"
                          ? "Tạm ngưng"
                          : p.status === "Closed"
                            ? "Đã đóng"
                            : isFull
                              ? "Hết chỗ"
                              : `Còn ${p.availableSlots} chỗ`}
                      </AppText>
                    </View>
                  </View>

                  <AppText kind="small" color={stitchTokens.brownMuted} style={styles.address}>
                    {p.displayAddress}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.lg,
    gap: space.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, color: stitchTokens.wineDark },
  loadingBox: { alignItems: "center", paddingVertical: space.lg, gap: 8 },
  list: { gap: space.sm },
  stationRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  stationRowSelected: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  stationRowDisabled: { opacity: 0.6 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSelected: { borderColor: stitchTokens.wine, backgroundColor: stitchTokens.wine },
  radioDisabled: { borderColor: stitchTokens.cardBorder },
  stationContent: { flex: 1, minWidth: 0, gap: 4 },
  stationTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  stationTitle: { flex: 1, fontSize: 14, color: stitchTokens.wineDark },
  mutedText: { color: stitchTokens.brownMuted },
  slotPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  slotPillOpen: { backgroundColor: stitchTokens.likeNewGreenBg },
  slotPillClosed: { backgroundColor: stitchTokens.flashRedBg },
  slotPillText: { fontSize: 11, lineHeight: 15, fontWeight: "700", includeFontPadding: false },
  slotTextOpen: { color: stitchTokens.likeNewGreen },
  slotTextClosed: { color: stitchTokens.flashRed },
  address: { lineHeight: 18 },
  pressed: { opacity: 0.82 },
});
