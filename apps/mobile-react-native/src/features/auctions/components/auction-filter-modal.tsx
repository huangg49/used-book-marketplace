import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppModal as Modal, Icon, stitchTokens } from "../../../core/ui";
import {
  AUCTION_CONDITIONS,
  AUCTION_ENDING,
  AUCTION_PRICE_RANGES,
  type AuctionCondition,
  type AuctionEnding,
  type AuctionFilters,
  type AuctionPriceRange,
  DEFAULT_AUCTION_FILTERS,
  activeFilterCount,
} from "../auctions-model";
import { conditions as conditionLabels } from "../../shelf/contracts";

export interface AuctionFilterModalProps {
  readonly visible: boolean;
  readonly filters: AuctionFilters;
  readonly availablePoints: string[];
  readonly totalMatchesCount: number;
  readonly onClose: () => void;
  readonly onApply: (nextFilters: AuctionFilters) => void;
}

export function AuctionFilterModal({
  visible,
  filters,
  availablePoints,
  totalMatchesCount,
  onClose,
  onApply,
}: AuctionFilterModalProps) {
  // Local state for the modal until user confirms "Áp dụng"
  const [draftFilters, setDraftFilters] = useState<AuctionFilters>(filters);
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible && !prevVisible) {
    setPrevVisible(true);
    setDraftFilters(filters);
  } else if (!visible && prevVisible) {
    setPrevVisible(false);
  }

  const toggleCondition = (cond: AuctionCondition) => {
    setDraftFilters((prev) => {
      const exists = prev.conditions.includes(cond);
      const nextConditions = exists
        ? prev.conditions.filter((c) => c !== cond)
        : [...prev.conditions, cond];
      return { ...prev, conditions: nextConditions };
    });
  };

  const selectPrice = (key: AuctionPriceRange) => {
    setDraftFilters((prev) => ({
      ...prev,
      price: prev.price === key ? "" : key,
    }));
  };

  const selectEnding = (key: AuctionEnding) => {
    setDraftFilters((prev) => ({
      ...prev,
      ending: prev.ending === key ? "" : key,
    }));
  };

  const selectPoint = (pointName: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      point: prev.point === pointName ? "" : pointName,
    }));
  };

  const resetAll = () => {
    setDraftFilters({
      ...DEFAULT_AUCTION_FILTERS,
      q: draftFilters.q, // keep existing search query
    });
  };

  const handleApply = () => {
    onApply(draftFilters);
    onClose();
  };

  const activeCount = activeFilterCount(draftFilters);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissOverlay} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="tune" size={18} color={stitchTokens.wineDark} />
              <AppText kind="bold" style={styles.headerTitle}>
                Bộ lọc phiên đấu giá
              </AppText>
              {activeCount > 0 && (
                <View style={styles.badgeCount}>
                  <AppText kind="small" style={styles.badgeCountText}>
                    {activeCount}
                  </AppText>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {activeCount > 0 && (
                <Pressable onPress={resetAll} hitSlop={8}>
                  <AppText kind="small" style={styles.resetButtonText}>
                    Đặt lại
                  </AppText>
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Icon name="close" size={18} color={stitchTokens.subtleGray} />
              </Pressable>
            </View>
          </View>

          {/* Filter options body */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Tình trạng sách */}
            <View style={styles.section}>
              <AppText kind="bold" style={styles.sectionLabel}>
                Tình trạng sách
              </AppText>
              <View style={styles.chipGrid}>
                {AUCTION_CONDITIONS.map((cond) => {
                  const selected = draftFilters.conditions.includes(cond);
                  return (
                    <Pressable
                      key={cond}
                      onPress={() => toggleCondition(cond)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <AppText
                        kind="small"
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {conditionLabels[cond] ?? cond}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 2. Mức giá hiện tại */}
            <View style={styles.section}>
              <AppText kind="bold" style={styles.sectionLabel}>
                Mức giá hiện tại
              </AppText>
              <View style={styles.chipGrid}>
                {(
                  Object.keys(AUCTION_PRICE_RANGES) as AuctionPriceRange[]
                ).map((key) => {
                  const selected = draftFilters.price === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => selectPrice(key)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <AppText
                        kind="small"
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {AUCTION_PRICE_RANGES[key].label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 3. Thời gian kết thúc */}
            <View style={styles.section}>
              <AppText kind="bold" style={styles.sectionLabel}>
                Thời gian kết thúc
              </AppText>
              <View style={styles.chipGrid}>
                {(Object.keys(AUCTION_ENDING) as AuctionEnding[]).map(
                  (key) => {
                    const selected = draftFilters.ending === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => selectEnding(key)}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <AppText
                          kind="small"
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {AUCTION_ENDING[key].label}
                        </AppText>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>

            {/* 4. Điểm nhận sách (ViaPoint) */}
            {availablePoints.length > 0 && (
              <View style={styles.section}>
                <AppText kind="bold" style={styles.sectionLabel}>
                  Điểm giao nhận TP.HCM
                </AppText>
                <View style={styles.chipGrid}>
                  <Pressable
                    onPress={() => selectPoint("")}
                    style={[
                      styles.chip,
                      !draftFilters.point && styles.chipSelected,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.chipText,
                        !draftFilters.point && styles.chipTextSelected,
                      ]}
                    >
                      Tất cả điểm nhận
                    </AppText>
                  </Pressable>
                  {availablePoints.map((pt) => {
                    const selected = draftFilters.point === pt;
                    return (
                      <Pressable
                        key={pt}
                        onPress={() => selectPoint(pt)}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <AppText
                          kind="small"
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {pt}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 5. Tùy chọn đặc biệt */}
            <View style={styles.section}>
              <AppText kind="bold" style={styles.sectionLabel}>
                Lựa chọn thêm
              </AppText>
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      buyNow: !prev.buyNow,
                    }))
                  }
                  style={[
                    styles.toggleRow,
                    draftFilters.buyNow && styles.toggleRowSelected,
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon
                      name="bolt"
                      size={16}
                      color={
                        draftFilters.buyNow
                          ? stitchTokens.wineDark
                          : stitchTokens.subtleGray
                      }
                    />
                    <AppText
                      kind="small"
                      style={[
                        styles.toggleRowText,
                        draftFilters.buyNow && styles.toggleRowTextSelected,
                      ]}
                    >
                      {'Có giá "Mua ngay"'}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      draftFilters.buyNow && styles.checkboxActive,
                    ]}
                  >
                    {draftFilters.buyNow && (
                      <Icon name="check" size={12} color={stitchTokens.whiteSurface} />
                    )}
                  </View>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      noBids: !prev.noBids,
                    }))
                  }
                  style={[
                    styles.toggleRow,
                    draftFilters.noBids && styles.toggleRowSelected,
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon
                      name="gavel"
                      size={16}
                      color={
                        draftFilters.noBids
                          ? stitchTokens.wineDark
                          : stitchTokens.subtleGray
                      }
                    />
                    <AppText
                      kind="small"
                      style={[
                        styles.toggleRowText,
                        draftFilters.noBids && styles.toggleRowTextSelected,
                      ]}
                    >
                      Chưa có lượt trả giá nào
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      draftFilters.noBids && styles.checkboxActive,
                    ]}
                  >
                    {draftFilters.noBids && (
                      <Icon name="check" size={12} color={stitchTokens.whiteSurface} />
                    )}
                  </View>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* Footer CTA */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleApply}
              style={({ pressed }) => [
                styles.applyButton,
                pressed && { opacity: 0.9 },
              ]}
            >
              <AppText kind="bold" style={styles.applyButtonText}>
                Áp dụng bộ lọc ({totalMatchesCount} phiên)
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: stitchTokens.blackAlpha45,
    justifyContent: "flex-end",
  },
  dismissOverlay: {
    flex: 1,
  },
  sheet: {
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "82%",
    paddingBottom: 24,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  headerTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  badgeCount: {
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeCountText: {
    color: stitchTokens.whiteSurface,
    fontSize: 11,
    fontWeight: "700",
  },
  resetButtonText: {
    color: stitchTokens.wine,
    fontWeight: "600",
    fontSize: 13,
  },
  closeBtn: {
    padding: 4,
  },
  bodyScroll: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingVertical: 16,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  chipSelected: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  chipText: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
  },
  chipTextSelected: {
    color: stitchTokens.whiteSurface,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  toggleRowSelected: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.peachBorder,
  },
  toggleRowText: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
  },
  toggleRowTextSelected: {
    color: stitchTokens.wineDark,
    fontWeight: "600",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: stitchTokens.subtleGray,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
  },
  applyButton: {
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: {
    color: stitchTokens.whiteSurface,
    fontSize: 14,
  },
});
