import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../core/session/session-provider";
import { AppText, Notice, colors, radius, space, stitchTokens } from "../../../core/ui";
import { auctionErrorText, getDemoSkipStatus, outcomeUnknown } from "../auctions-model";

type Props = {
  label: string;
  note?: string;
  intentKey?: string;
  run: (key: string) => Promise<unknown>;
  onDone: () => Promise<unknown>;
};

export function DemoSkipButton({ label, note, intentKey, run, onDone }: Props) {
  const { client, state } = useSession();
  const status = useQuery({
    queryKey: ["demo-skip"],
    queryFn: () => getDemoSkipStatus(client),
    enabled: state.status === "authenticated",
    staleTime: Infinity,
    retry: false,
  });

  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);

  if (!status.data?.enabled) return null;

  const keyFor = (signature: string) => {
    if (!keyRef.current || keyRef.current.signature !== signature) {
      keyRef.current = { signature, key: Crypto.randomUUID() };
    }
    return keyRef.current.key;
  };

  const skip = async () => {
    const signature = pendingSignature ?? `${intentKey ?? ""}:${label}:${note ?? ""}`;
    setPendingSignature(signature);
    setBusy(true);
    setError(null);
    try {
      await run(keyFor(signature));
      keyRef.current = null;
      setPendingSignature(null);
      await onDone();
    } catch (caught) {
      if (!outcomeUnknown(caught)) {
        keyRef.current = null;
        setPendingSignature(null);
      }
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText kind="bold" style={styles.title}>Công cụ hỗ trợ trình diễn</AppText>
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>DEMO</AppText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={() => void skip()}
        style={({ pressed }) => [styles.action, busy && styles.disabled, pressed && styles.pressed]}
      >
        {busy ? <ActivityIndicator size="small" color={stitchTokens.gold} /> : null}
        <AppText kind="bold" style={styles.actionText}>
          {busy ? "Đang bỏ qua chờ…" : label}
        </AppText>
      </Pressable>

      {note && !error ? (
        <AppText kind="small" color={colors.muted} style={styles.note}>{note}</AppText>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: stitchTokens.peachBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { color: stitchTokens.wineDark, fontSize: 13 },
  badge: {
    backgroundColor: stitchTokens.wineDark,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: stitchTokens.gold,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  action: {
    minHeight: 46,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  actionText: { color: stitchTokens.gold, fontSize: 14 },
  note: { fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
});
