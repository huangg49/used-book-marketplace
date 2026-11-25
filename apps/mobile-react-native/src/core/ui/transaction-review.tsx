import type { TransactionNote } from "@used-books/session-client";
import { StyleSheet, View } from "react-native";
import { AppText } from "./text";
import { colors, radius, space, stitchTokens } from "./theme";

export function TransactionAmount({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.amount}>
      <AppText kind="small" color={stitchTokens.wineDark}>{label}</AppText>
      <AppText kind="price" color={stitchTokens.wine} style={styles.price}>{value}</AppText>
    </View>
  );
}

export function TransactionNotes({ notes }: { notes: readonly TransactionNote[] }) {
  return (
    <View style={styles.notes}>
      {notes.map(({ label, detail }) => (
        <View key={label}>
          <AppText kind="small" style={styles.label}>{label}</AppText>
          <AppText kind="small" color={colors.muted}>{detail}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { backgroundColor: stitchTokens.warmIvory, borderRadius: radius.control, padding: space.md, gap: space.xs },
  price: { fontVariant: ["tabular-nums"] },
  notes: { gap: space.sm },
  label: { fontWeight: "700" },
});
