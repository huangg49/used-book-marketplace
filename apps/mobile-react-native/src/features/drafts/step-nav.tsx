import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, stitchTokens } from "../../core/ui";

export type StepState = "done" | "missing" | "review";

const shortLabels = [
  "1. Thông tin",
  "2. Ảnh sách",
  "3. Tình trạng",
  "4. Bán/Đổi",
  "5. Kiểm tra",
];

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
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Thanh tiến trình tính theo fill của 5 tab */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <AppText kind="small" style={styles.progressTitle}>
            Tiến độ hoàn thành
          </AppText>
          <AppText kind="small" style={styles.progressStats}>
            {`${completedCount}/${totalCount} bước (${Math.round(progressPercent)}%)`}
          </AppText>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${progressPercent}%`,
                backgroundColor:
                  completedCount === totalCount ? stitchTokens.verifiedGreen : stitchTokens.wine,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.stepsRow}>
        {labels.map((label, index) => {
          const isSelected = index === current;
          const isDone = states[index] === "done";
          const statusText = isDone
            ? "Đã điền đầy đủ"
            : "Chưa điền thành công";

          const displayLabel = short[index] ?? label;

          return (
            <View key={label} style={styles.stepColumn}>
              {/* Connecting line segments */}
              <View style={styles.nodeWrapper}>
                {index > 0 && (
                  <View
                    style={[
                      styles.connectingLine,
                      styles.connectingLineLeft,
                      (states[index - 1] === "done" || index <= current) &&
                        (states[index - 1] === "done"
                          ? styles.connectingLineDone
                          : styles.connectingLineActive),
                    ]}
                  />
                )}
                {index < labels.length - 1 && (
                  <View
                    style={[
                      styles.connectingLine,
                      styles.connectingLineRight,
                      (isDone || index < current) &&
                        (isDone
                          ? styles.connectingLineDone
                          : styles.connectingLineActive),
                    ]}
                  />
                )}

                {/* Circle Button with Green Check or Red X */}
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={`${label}, ${statusText}${isSelected ? ", đang chọn" : ""}`}
                  accessibilityState={{ selected: isSelected, disabled }}
                  disabled={disabled}
                  onPress={() => onSelect(index)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.circle,
                    isDone ? styles.circleDone : styles.circleMissing,
                    isSelected && styles.circleSelected,
                    (pressed || disabled) && { opacity: disabled ? 0.6 : 0.8 },
                  ]}
                >
                  {isDone ? (
                    <Icon name="check" size={13} color={stitchTokens.white} strokeWidth={2.5} />
                  ) : (
                    <Icon name="close" size={12} color={stitchTokens.flashRed} strokeWidth={2.5} />
                  )}
                </Pressable>
              </View>

              {/* Step Label beneath circle */}
              <Pressable
                disabled={disabled}
                onPress={() => onSelect(index)}
                hitSlop={4}
                style={{ width: "100%", alignItems: "center" }}
              >
                <AppText
                  style={[
                    styles.label,
                    isSelected
                      ? styles.labelSelected
                      : isDone
                        ? styles.labelDone
                        : styles.labelDefault,
                  ]}
                  numberOfLines={1}
                >
                  {displayLabel}
                </AppText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    paddingVertical: 14,
    paddingHorizontal: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  progressSection: {
    width: "100%",
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.warmUmber,
  },
  progressStats: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: stitchTokens.linenLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  stepColumn: {
    flex: 1,
    alignItems: "center",
  },
  nodeWrapper: {
    width: "100%",
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginBottom: 6,
  },
  connectingLine: {
    position: "absolute",
    top: 13,
    height: 3,
    backgroundColor: stitchTokens.linenRose,
    zIndex: 1,
  },
  connectingLineLeft: {
    left: 0,
    right: "50%",
  },
  connectingLineRight: {
    left: "50%",
    right: 0,
  },
  connectingLineDone: {
    backgroundColor: stitchTokens.verifiedGreen,
  },
  connectingLineActive: {
    backgroundColor: stitchTokens.wine,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 1.5,
  },
  circleDone: {
    backgroundColor: stitchTokens.verifiedGreen,
    borderColor: stitchTokens.verifiedGreen,
  },
  circleMissing: {
    backgroundColor: stitchTokens.roseIce,
    borderColor: stitchTokens.coralRed,
  },
  circleSelected: {
    borderWidth: 2.5,
    borderColor: stitchTokens.wine,
    shadowColor: stitchTokens.wine,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
  label: {
    fontSize: 10.5,
    textAlign: "center",
  },
  labelSelected: {
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  labelDone: {
    color: stitchTokens.verifiedGreen,
    fontWeight: "600",
  },
  labelDefault: {
    color: stitchTokens.slateWarm,
    fontWeight: "500",
  },
});
