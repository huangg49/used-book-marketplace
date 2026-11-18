import { useRef, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../core/session/session-provider";
import { AppText, Button, Notice, colors, radius, space, stitchTokens } from "../../../core/ui";
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
        borderRadius: radius.control,
        backgroundColor: stitchTokens.warmIvory,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: stitchTokens.goldDark,
      }}
    >
      <Button
        secondary
        title={busy ? "Đang bỏ qua chờ…" : label}
        busy={busy}
        onPress={() => void skip()}
      />
      {note && !error ? (
        <AppText kind="small" color={colors.muted}>
          {note}
        </AppText>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

