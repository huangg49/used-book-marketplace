import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Button, Icon, Sheet, radius, space, stitchTokens } from "../../../core/ui";
import {
  AUCTION_CONDITIONS,
  AUCTION_ENDING,
  AUCTION_PRICE_RANGES,
  DEFAULT_AUCTION_FILTERS,
  activeFilterCount,
  type AuctionCondition,
  type AuctionEnding,
  type AuctionFilters,
  type AuctionPriceRange,
} from "../auctions-model";
import { conditions as conditionLabels } from "../../shelf/contracts";

export interface AuctionFilterModalProps {
  readonly visible: boolean;
  readonly filters: AuctionFilters;
  readonly availablePoints: string[];
  readonly totalMatchesCount: number;
  readonly countMatches?: (draft: AuctionFilters) => number;
  readonly onClose: () => void;
  readonly onApply: (nextFilters: AuctionFilters) => void;
}

export function AuctionFilterModal({
  visible,
  filters,
  availablePoints,
  totalMatchesCount,
  countMatches,
  onClose,
  onApply,
}: AuctionFilterModalProps) {
  const [draft, setDraft] = useState<AuctionFilters>(filters);
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible && !prevVisible) {
    setPrevVisible(true);
    setDraft(filters);
  } else if (!visible && prevVisible) {
    setPrevVisible(false);
  }

  const toggleCondition = (cond: AuctionCondition) => {
    setDraft((prev) => ({
      ...prev,
      conditions: prev.conditions.includes(cond)
        ? prev.conditions.filter((c) => c !== cond)
        : [...prev.conditions, cond],
    }));
  };

  const resetAll = () => {
    setDraft({ ...DEFAULT_AUCTION_FILTERS, q: draft.q });
  };

  const activeCount = activeFilterCount(draft);
  const liveMatches = countMatches ? countMatches(draft) : totalMatchesCount;

  return (
    <Sheet
      title={activeCount > 0 ? `Bộ lọc phiên (${activeCount})` : "Bộ lọc phiên đấu giá"}
      visible={visible}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button
            wine
            title={`Áp dụng bộ lọc (${liveMatches} phiên)`}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
          {activeCount > 0 ? (
            <Button wine secondary title="Đặt lại bộ lọc" onPress={resetAll} />
          ) : null}
        </View>
      }
    >
      <View style={styles.body}>
        {/* 1. Book Condition */}
        <View style={styles.section}>
          <AppText kind="bold" style={styles.label}>Tình trạng sách</AppText>
          <View style={styles.grid}>
            {AUCTION_CONDITIONS.map((cond) => {
              const selected = draft.conditions.includes(cond);
              return (
                <Pressable
                  key={cond}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleCondition(cond)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {conditionLabels[cond] ?? cond}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2. Current Price Range */}
        <View style={styles.section}>
          <AppText kind="bold" style={styles.label}>Mức giá hiện tại</AppText>
          <View style={styles.grid}>
            {(Object.keys(AUCTION_PRICE_RANGES) as AuctionPriceRange[]).map((key) => {
              const selected = draft.price === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setDraft((prev) => ({ ...prev, price: prev.price === key ? "" : key }))}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {AUCTION_PRICE_RANGES[key].label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 3. Ending Window */}
        <View style={styles.section}>
          <AppText kind="bold" style={styles.label}>Thời gian kết thúc</AppText>
          <View style={styles.grid}>
            {(Object.keys(AUCTION_ENDING) as AuctionEnding[]).map((key) => {
              const selected = draft.ending === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setDraft((prev) => ({ ...prev, ending: prev.ending === key ? "" : key }))}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {AUCTION_ENDING[key].label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 4. Handover Point */}
        {availablePoints.length > 0 ? (
          <View style={styles.section}>
            <AppText kind="bold" style={styles.label}>Điểm giao nhận TP.HCM</AppText>
            <View style={styles.grid}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: !draft.point }}
                onPress={() => setDraft((prev) => ({ ...prev, point: "" }))}
                style={({ pressed }) => [
                  styles.chip,
                  !draft.point && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <AppText style={[styles.chipText, !draft.point && styles.chipTextSelected]}>
                  Tất cả điểm
                </AppText>
              </Pressable>
              {availablePoints.map((pt) => {
                const selected = draft.point === pt;
                return (
                  <Pressable
                    key={pt}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setDraft((prev) => ({ ...prev, point: prev.point === pt ? "" : pt }))}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && styles.chipSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {pt}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* 5. Extra Toggles */}
        <View style={styles.section}>
          <AppText kind="bold" style={styles.label}>Lựa chọn thêm</AppText>
          <View style={styles.toggles}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.buyNow }}
              onPress={() => setDraft((prev) => ({ ...prev, buyNow: !prev.buyNow }))}
              style={({ pressed }) => [
                styles.toggleRow,
                draft.buyNow && styles.toggleRowSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.toggleLeft}>
                <Icon name="bolt" size={16} color={draft.buyNow ? stitchTokens.wine : stitchTokens.brownMuted} />
                <AppText kind="bold" style={styles.toggleText}>Chỉ hiện phiên có Mua ngay</AppText>
              </View>
              <View style={[styles.checkBox, draft.buyNow && styles.checkBoxActive]}>
                {draft.buyNow ? <Icon name="check" size={12} color={stitchTokens.gold} /> : null}
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.noBids }}
              onPress={() => setDraft((prev) => ({ ...prev, noBids: !prev.noBids }))}
              style={({ pressed }) => [
                styles.toggleRow,
                draft.noBids && styles.toggleRowSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.toggleLeft}>
                <Icon name="gavel" size={16} color={draft.noBids ? stitchTokens.wine : stitchTokens.brownMuted} />
                <AppText kind="bold" style={styles.toggleText}>Chưa có người trả giá</AppText>
              </View>
              <View style={[styles.checkBox, draft.noBids && styles.checkBoxActive]}>
                {draft.noBids ? <Icon name="check" size={12} color={stitchTokens.gold} /> : null}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.lg },
  footer: { gap: space.sm },
  section: { gap: space.sm },
  label: { fontSize: 14, color: stitchTokens.wineDark },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  chipText: { fontSize: 13, color: stitchTokens.wineDark, fontWeight: "600" },
  chipTextSelected: { color: stitchTokens.warmIvory },
  toggles: { gap: 8 },
  toggleRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  toggleRowSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  toggleText: { fontSize: 14, color: stitchTokens.deepCocoa },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  pressed: { opacity: 0.78 },
});
