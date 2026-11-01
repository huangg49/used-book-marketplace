import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountErrorMessage,
  changeCart,
  pendingCartCommand,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import { Button, Notice, space } from "../../core/ui";
export function AddToCart({
  listingId,
  listingVersion,
}: {
  listingId: string;
  listingVersion: number;
}) {
  const { state, client } = useSession(),
    cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  if (state.status !== "authenticated")
    return (
      <Button
        secondary
        title="Đăng nhập để thêm vào giỏ"
        onPress={() =>
          router.push({
            pathname: "/account",
            params: { returnBook: listingId },
          })
        }
      />
    );
  const owner = state.user.id,
    pending = pendingCartCommand(client);
  async function add() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeCart(
        client,
        pending ? null : { action: "add", listingId, listingVersion },
        () => Crypto.randomUUID(),
      );
      const current = client.getSnapshot();
      if (current.status !== "authenticated" || current.user.id !== owner)
        return;
      setMessage("Đã cập nhật giỏ sách. Sách chưa được giữ chỗ.");
      void cache.invalidateQueries({ queryKey: ["member-cart", owner] });
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: space.md }}>
      <Button
        secondary
        title={pending ? "Xác minh thao tác giỏ trước" : "Thêm vào giỏ sách"}
        busy={busy}
        disabled={!pending && state.user.status !== "ACTIVE"}
        onPress={() => void add()}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <Button
        secondary
        title="Mở giỏ sách"
        onPress={() => router.push("/cart")}
      />
    </View>
  );
}
