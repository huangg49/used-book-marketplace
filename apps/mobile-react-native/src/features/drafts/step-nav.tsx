import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
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
      {/* SVG Red Ombre 3D Background */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="stepNavOmbre" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={stitchTokens.ombreStop0} />
            <Stop offset="30%" stopColor={stitchTokens.ombreStop30} />
            <Stop offset="70%" stopColor={stitchTokens.ombreStop70} />
            <Stop offset="100%" stopColor={stitchTokens.ombreStop100} />
          </LinearGradient>
          <LinearGradient id="stepNavSpecular" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={stitchTokens.white} stopOpacity={0.16} />
            <Stop offset="45%" stopColor={stitchTokens.white} stopOpacity={0.03} />
            <Stop offset="100%" stopColor={stitchTokens.white} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stepNavOmbre)" />
        <Rect width="100%" height="60%" fill="url(#stepNavSpecular)" />
      </Svg>

      {/* Thanh tiến trình tính theo fill của 5 tab */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <AppText kind="small" style={styles.progressTitle}>
            Tiến độ hoàn thành
          </AppText>
          <View style={styles.progressStatsWrapper}>
            <AppText kind="small" style={styles.progressStats}>
              {`${completedCount}/${totalCount} bước (${Math.round(progressPercent)}%)`}
            </AppText>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${progressPercent}%`,
                backgroundColor:
                  completedCount === totalCount
                    ? stitchTokens.verifiedGreen
                    : stitchTokens.goldAccent,
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
                    (pressed || disabled) && { opacity: disabled ? 0.6 : 0.85 },
                  ]}
                >
                  {isDone ? (
                    <Icon name="check" size={13} color={stitchTokens.white} strokeWidth={2.5} />
                  ) : (
                    <Icon
                      name="close"
                      size={12}
                      color={isSelected ? stitchTokens.goldLight : stitchTokens.whitePinkText}
                      strokeWidth={2.5}
                    />
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
    borderRadius: 18,
    borderWidth: 1.5,
    borderBottomWidth: 3.5,
    borderColor: stitchTokens.peachBorderAlpha40,
    borderBottomColor: stitchTokens.cardBorderShadowBottom,
    paddingVertical: 14,
    paddingHorizontal: 12,
    position: "relative",
    overflow: "hidden",
    shadowColor: stitchTokens.shadowDeepCrimson,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
    fontWeight: "700",
    color: stitchTokens.whitePinkText,
    letterSpacing: 0.2,
  },
  progressStatsWrapper: {
    backgroundColor: stitchTokens.whiteAlpha14,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.whiteAlpha25,
  },
  progressStats: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.goldAccent,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: stitchTokens.blackAlpha45,
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
    backgroundColor: stitchTokens.whiteAlpha25,
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
    backgroundColor: stitchTokens.goldAccent,
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
    backgroundColor: stitchTokens.whiteAlpha15,
    borderColor: stitchTokens.whiteAlpha40,
  },
  circleSelected: {
    borderWidth: 2.5,
    borderColor: stitchTokens.goldAccent,
    backgroundColor: stitchTokens.whiteAlpha25,
    shadowColor: stitchTokens.goldAccent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 10.5,
    textAlign: "center",
  },
  labelSelected: {
    color: stitchTokens.white,
    fontWeight: "800",
  },
  labelDone: {
    color: stitchTokens.goldLight,
    fontWeight: "700",
  },
  labelDefault: {
    color: stitchTokens.whitePinkText,
    fontWeight: "500",
  },
});
