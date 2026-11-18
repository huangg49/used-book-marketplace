import { useRef, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../core/session/session-provider";
import { AppText, Notice, colors, radius, space, stitchTokens } from "../../../core/ui";
import { auctionErrorText, getDemoSkipStatus } from "../auctions-model";

type Props = {
  label: string;
  note?: string;
  run: (key: string) => Promise<unknown>;
  onDone: () => Promise<unknown>;
};

export function DemoSkipButton({ label, note, run, onDone }: Props) {
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

  const settle = () => {
    keyRef.current = null;
  };

  const skip = async () => {
    const signature = pendingSignature ?? `${label}:${note ?? ""}`;
    setPendingSignature(signature);
    setBusy(true);
    setError(null);
    try {
      await run(keyFor(signature));
      settle();
      setPendingSignature(null);
      await onDone();
    } catch (caught) {
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.card,
        backgroundColor: stitchTokens.roseWarmSurface,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: stitchTokens.wine,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 2,
        }}
      >
        <AppText
          kind="bold"
          color={stitchTokens.wineDark}
          style={{ fontSize: 13 }}
        >
          Công cụ hỗ trợ trình diễn
        </AppText>
        <View
          style={{
            backgroundColor: stitchTokens.wine,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: radius.small,
          }}
        >
          <AppText
            kind="small"
            color={colors.surface}
            style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }}
          >
            DEMO SKIP
          </AppText>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        disabled={busy}
        onPress={() => void skip()}
        style={{
          minHeight: 44,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radius.control,
          backgroundColor: stitchTokens.wine,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          shadowColor: stitchTokens.wine,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 3,
          elevation: 2,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : null}
        <AppText
          kind="bold"
          color={colors.surface}
          style={{ fontSize: 14 }}
        >
          {busy ? "Đang bỏ qua chờ…" : label}
        </AppText>
      </TouchableOpacity>

      {note && !error ? (
        <AppText
          kind="small"
          color={stitchTokens.wineDark}
          style={{ fontSize: 11, lineHeight: 15, opacity: 0.85 }}
        >
          {note}
        </AppText>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

