import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  AppText, Button, Icon, Notice, Sheet, TextField, formatVnd, radius, space, stitchTokens,
} from "../../../core/ui";
import { amountError, bidOptions, fundsHint, fundsShortfall } from "../auctions-model";
import type { PublicAuctionSummary } from "../contracts";

export function AutoBidSheet({
  auction,
  visible,
  onClose,
  floor,
  currentAutoMax,
  value,
  onChange,
  available,
  heldHere,
  locked,
  error,
  onSubmit,
  onDisable,
}: {
  auction: PublicAuctionSummary;
  visible: boolean;
  onClose: () => void;
  floor: number;
  currentAutoMax: number | null;
  value: string;
  onChange: (value: string) => void;
  available: number | null;
  heldHere: number;
  locked: boolean;
  error: string | null;
  onSubmit: (amount: number) => void;
  onDisable: () => void;
}) {
  const amount = Number(value) || null;
  const shortfall = fundsShortfall(amount, available);
  const validation =
    error ??
    (value.length > 0
      ? amountError(amount, floor, auction.startPrice, auction.step) ??
        (shortfall ? fundsHint(amount, available) : null)
      : null);

  return (
    <Sheet
      title="Đặt giá tự động"
      visible={visible}
      onClose={onClose}
      dismissible={!locked}
      footer={
        <View style={styles.footer}>
          {shortfall > 0 && !locked ? (
            <Button
              wine
              secondary
              title="Nạp tiền vào ví"
              onPress={() => {
                onClose();
                router.push("/wallet");
              }}
            />
          ) : null}
          <Button
            wine
            title={currentAutoMax != null ? "Nâng mức tự động" : "Đặt giá tự động"}
            disabled={locked}
            onPress={() => {
              const target = Number(value) || floor;
              const problem =
                amountError(target, floor, auction.startPrice, auction.step) ??
                (fundsShortfall(target, available) ? fundsHint(target, available) : null);
              if (!problem) onSubmit(target);
              else onChange(value);
            }}
          />
          {currentAutoMax != null ? (
            <Button
              wine
              secondary
              title="Tắt đặt giá tự động"
              disabled={locked}
              onPress={onDisable}
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.summary}>
        {currentAutoMax != null ? (
          <>
            <View style={styles.line}>
              <AppText style={styles.label}>Mức tối đa hiện tại (chỉ bạn thấy)</AppText>
              <AppText style={styles.valueHighlight}>{formatVnd(currentAutoMax)}</AppText>
            </View>
            <View style={styles.divider} />
          </>
        ) : null}
        <View style={styles.line}>
          <AppText style={styles.label}>Mức đặt tối thiểu</AppText>
          <AppText style={styles.value}>{formatVnd(floor)}</AppText>
        </View>
        {available !== null ? (
          <>
            <View style={styles.divider} />
            <View style={styles.line}>
              <AppText style={styles.label}>Ví khả dụng{heldHere > 0 ? " (gồm khoản đang giữ)" : ""}</AppText>
              <AppText style={styles.value}>{formatVnd(available)}</AppText>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.quickSection}>
        <AppText kind="small" style={styles.quickTitle}>Chọn nhanh mức tối đa</AppText>
        <View style={styles.options}>
          {bidOptions(floor, auction.step).map((preset) => {
            const selected = amount === preset;
            return (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: locked }}
                disabled={locked}
                onPress={() => onChange(String(preset))}
                style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
              >
                <AppText style={[styles.optionText, selected && styles.selectedText]}>
                  {formatVnd(preset)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label="Mức tối đa"
        keyboardType="number-pad"
        value={value}
        editable={!locked}
        placeholder={String(floor)}
        onChangeText={(text) => onChange(text.replace(/\D/g, ""))}
        hint={
          amount != null && amount > 0
            ? `${formatVnd(amount)} · Tối thiểu ${formatVnd(floor)}`
            : `Tối thiểu ${formatVnd(floor)} · Bước ${formatVnd(auction.step)}`
        }
        error={validation ?? undefined}
      />

      <View style={styles.rulesBox}>
        <Icon name="info" size={15} color={stitchTokens.wine} />
        <AppText style={styles.note}>
          Khi có người trả cao hơn, hệ thống tự trả hơn họ một bước giá, không vượt mức tối đa bạn chọn. Chỉ bạn thấy mức này và chỉ có thể nâng lên.
        </AppText>
      </View>
      {error && !validation ? <Notice tone="error">{error}</Notice> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space.sm },
  summary: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.md,
    gap: 10,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.md,
    rowGap: space.xs,
  },
  divider: { height: 1, backgroundColor: stitchTokens.borderWarm },
  label: { flexShrink: 1, color: stitchTokens.brownMuted, fontSize: 13 },
  value: { color: stitchTokens.deepCocoa, fontWeight: "700", fontSize: 14, fontVariant: ["tabular-nums"] },
  valueHighlight: { color: stitchTokens.wine, fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] },
  quickSection: { gap: space.xs },
  quickTitle: { color: stitchTokens.brownMuted, fontWeight: "600", fontSize: 13 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    minHeight: 48,
    flexBasis: "30%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
  },
  selected: { borderColor: stitchTokens.wine, backgroundColor: stitchTokens.wine },
  pressed: { opacity: 0.75 },
  optionText: {
    color: stitchTokens.wineDark,
    fontSize: 13,
    textAlign: "center",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  selectedText: { color: stitchTokens.warmIvory },
  rulesBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderRadius: 12,
    padding: 12,
  },
  note: { flex: 1, color: stitchTokens.brownMuted, fontSize: 12, lineHeight: 18 },
});
