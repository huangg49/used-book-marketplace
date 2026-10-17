import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Icon } from "../../../core/ui/icon";
import { stitchTokens } from "../../../core/ui/theme";
import type { HandoverPoint } from "../contracts";

export interface SendToAuctionPointPickerProps {
  readonly points: HandoverPoint[];
  readonly selectedPointId: string | null;
  readonly onSelectPoint: (id: string) => void;
  readonly disabled?: boolean;
  readonly isLoading?: boolean;
}

export function SendToAuctionPointPicker({
  points,
  selectedPointId,
  onSelectPoint,
  disabled = false,
  isLoading = false,
}: SendToAuctionPointPickerProps) {
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeaderRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="pin" size={17} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={styles.sectionTitle}>
            2. Chọn điểm gửi sách
          </AppText>
        </View>
        <AppText kind="small" style={styles.locationSubtitle}>
          TP. Hồ Chí Minh
        </AppText>
      </View>

      <View style={styles.storefrontRow}>
        <Icon name="clock" size={13} color={stitchTokens.subtleGray} />
        <AppText kind="small" style={styles.storefrontText}>
          Điểm giao nhận tại TP.HCM, mở cửa 09:00 – 18:00 hàng ngày
        </AppText>
      </View>

      {/* Loading state */}
      {isLoading && (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="small" color={stitchTokens.wine} />
          <AppText kind="small" style={{ color: stitchTokens.subtleGray, marginTop: 6 }}>
            Đang tải danh sách điểm tiếp nhận...
          </AppText>
        </View>
      )}

      {/* Points list */}
      {!isLoading && (
        <View style={styles.listContainer}>
          {points.map((p, idx) => {
            const isSelected = selectedPointId === p.id;
            const isFull = p.status !== "Active" || p.availableSlots < 1;
            const isSelectable = !disabled && !isFull;

            // Extra simulated perk for visual fidelity matching Stitch
            const perk =
              idx === 0
                ? "Có tủ hút ẩm chuyên dụng • Gần trung tâm"
                : "Gần trạm xe buýt & quán cà phê";

            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: !isSelectable }}
                accessibilityLabel={p.name}
                disabled={!isSelectable}
                onPress={() => onSelectPoint(p.id)}
                style={({ pressed }) => [
                  styles.stationCard,
                  isSelected && styles.stationCardSelected,
                  isFull && styles.stationCardDisabled,
                  isSelectable && pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
                ]}
              >
                {/* Radio check circle */}
                <View
                  style={[
                    styles.radioCircle,
                    isSelected && styles.radioCircleActive,
                    isFull && styles.radioCircleDisabled,
                  ]}
                >
                  {isSelected && <Icon name="check" size={12} color="#FFDF97" />}
                </View>

                {/* Content */}
                <View style={styles.stationContent}>
                  <View style={styles.stationTitleRow}>
                    <AppText
                      kind="bold"
                      numberOfLines={1}
                      style={[styles.stationTitle, isFull && { color: stitchTokens.subtleGray }]}
                    >
                      {p.name}
                    </AppText>

                    {/* Capacity badge */}
                    <View
                      style={[
                        styles.capacityBadge,
                        p.status === "Active" && p.availableSlots > 0
                          ? styles.capacityBadgeOpen
                          : styles.capacityBadgeClosed,
                      ]}
                    >
                      <AppText
                        kind="small"
                        style={[
                          styles.capacityBadgeText,
                          p.status === "Active" && p.availableSlots > 0
                            ? styles.capacityTextOpen
                            : styles.capacityTextClosed,
                        ]}
                      >
                        {p.status === "Paused"
                          ? "Tạm ngưng nhận"
                          : p.status === "Closed"
                            ? "Đã đóng"
                            : isFull
                              ? "Hết chỗ"
                              : `Còn ${p.availableSlots} chỗ`}
                      </AppText>
                    </View>
                  </View>

                  <AppText style={styles.stationAddress}>{p.displayAddress}</AppText>

                  {!isFull && (
                    <View style={styles.perkRow}>
                      <Icon name="verified" size={12} color={stitchTokens.verifiedGreen} />
                      <AppText kind="small" style={styles.perkText}>
                        {perk}
                      </AppText>
                    </View>
                  )}
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
  sectionContainer: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  locationSubtitle: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  storefrontRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  storefrontText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  centerLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  listContainer: {
    gap: 10,
    marginTop: 2,
  },
  stationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stationCardSelected: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.peachBorder,
    borderWidth: 1.5,
  },
  stationCardDisabled: {
    backgroundColor: "#F8F5F2",
    opacity: 0.65,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1.5,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioCircleActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  radioCircleDisabled: {
    backgroundColor: "#E2DCD5",
    borderColor: "#D0C8BF",
  },
  stationContent: {
    flex: 1,
    gap: 4,
  },
  stationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  stationTitle: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
    flex: 1,
  },
  capacityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  capacityBadgeOpen: {
    backgroundColor: "#E8F5E9",
  },
  capacityBadgeClosed: {
    backgroundColor: "#EEEEEE",
  },
  capacityBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  capacityTextOpen: {
    color: stitchTokens.verifiedGreen,
  },
  capacityTextClosed: {
    color: stitchTokens.subtleGray,
  },
  stationAddress: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 16,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 2,
  },
  perkText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
});
