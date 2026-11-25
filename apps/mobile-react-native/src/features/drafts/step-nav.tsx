import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, colors, radius, stitchTokens } from "../../core/ui";

export type StepState = "done" | "missing" | "review";

const shortLabels = [
  "Thông tin",
  "Ảnh sách",
  "Tình trạng",
  "Bán/Đổi",
  "Kiểm tra",
];

function stripNumberPrefix(text: string): string {
  return text.replace(/^\d+\.\s*/, "");
}

export function StepNav({
  labels,
  short = shortLabels,
  current,
  states,
  disabled,
  onSelect,
}: {
  labels: readonly string[];
  short?: readonly string[];
  current: number;
  states: readonly StepState[];
  disabled: boolean;
  onSelect: (step: number) => void;
}) {
  const completedCount = states.filter((s) => s === "done").length;
  const totalCount = labels.length;
  const allDone = completedCount === totalCount && totalCount > 0;

  return (
    <View style={styles.container}>
      {/* Compact Header Row: Current Step + Completion Counter */}
      <View style={styles.topRow}>
        <AppText numberOfLines={1} style={styles.stepHeading}>
          Bước {current + 1}/{totalCount} · {labels[current]}
        </AppText>
        <View style={[styles.countPill, allDone && styles.countPillDone]}>
          <AppText
            style={[styles.countText, allDone && styles.countTextDone]}
          >
            {completedCount}/{totalCount} xong
          </AppText>
        </View>
      </View>

      {/* Clean 5-Segment Progress Bar */}
      <View style={styles.segmentsRow}>
        {labels.map((label, index) => {
          const isDone = states[index] === "done";
          const isSelected = index === current;
          return (
            <View
              key={`seg-${label}`}
              style={[
                styles.segment,
                isDone
                  ? styles.segmentDone
                  : isSelected
                    ? styles.segmentCurrent
                    : styles.segmentPending,
              ]}
            />
          );
        })}
      </View>

      {/* 5 Numbered Native Step Tabs (no scary X marks) */}
      <View style={styles.stepsRow}>
        {labels.map((label, index) => {
          const isSelected = index === current;
          const isDone = states[index] === "done";
          const statusText = isDone
            ? "Đã điền đầy đủ"
            : "Chưa điền thành công";
          const displayLabel = stripNumberPrefix(short[index] ?? label);

          return (
            <Pressable
              key={label}
              accessibilityRole="tab"
              accessibilityLabel={`${label}, ${statusText}${isSelected ? ", đang chọn" : ""}`}
              accessibilityState={{ selected: isSelected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(index)}
              hitSlop={4}
              style={({ pressed }) => [
                styles.stepItem,
                disabled && styles.dimmed,
                pressed && !disabled && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.circle,
                  isDone
                    ? styles.circleDone
                    : isSelected
                      ? styles.circleSelected
                      : styles.circlePending,
                ]}
              >
                {isDone ? (
                  <Icon
                    name="check"
                    size={13}
                    color={stitchTokens.white}
                    strokeWidth={2.5}
                  />
                ) : (
                  <AppText
                    style={[
                      styles.circleNumber,
                      isSelected && styles.circleNumberSelected,
                    ]}
                  >
                    {index + 1}
                  </AppText>
                )}
              </View>
              <AppText
                numberOfLines={1}
                style={[
                  styles.label,
                  isSelected
                    ? styles.labelSelected
                    : isDone
                      ? styles.labelDone
                      : styles.labelPending,
                ]}
              >
                {displayLabel}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stepHeading: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  countPillDone: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.mintGreen,
  },
  countText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  countTextDone: {
    color: stitchTokens.likeNewGreen,
  },
  segmentsRow: {
    flexDirection: "row",
    gap: 5,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  segmentDone: {
    backgroundColor: stitchTokens.verifiedGreen,
  },
  segmentCurrent: {
    backgroundColor: stitchTokens.wine,
  },
  segmentPending: {
    backgroundColor: stitchTokens.warmBorder,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 2,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  circleDone: {
    backgroundColor: stitchTokens.verifiedGreen,
    borderColor: stitchTokens.verifiedGreen,
  },
  circleSelected: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  circlePending: {
    backgroundColor: stitchTokens.parchment,
    borderColor: stitchTokens.warmBorder,
  },
  circleNumber: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: colors.muted,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  circleNumberSelected: {
    color: stitchTokens.gold,
  },
  label: {
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: "center",
    includeFontPadding: false,
  },
  labelSelected: {
    color: stitchTokens.wineDark,
    fontWeight: "800",
  },
  labelDone: {
    color: stitchTokens.likeNewGreen,
    fontWeight: "700",
  },
  labelPending: {
    color: colors.muted,
    fontWeight: "600",
  },
  dimmed: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.78,
  },
});
