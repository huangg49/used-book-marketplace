import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountErrorMessage,
  changeCart,
  pendingCartCommand,
} from "@used-books/session-client";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { ArrowRight, Check, Loader2, ShoppingBag } from "lucide-react";
import styles from "./AddToCart.module.css";
export function AddToCart({
  listingId,
  listingVersion,
  disabled = false,
}: {
  listingId: string;
  listingVersion: number;
  disabled?: boolean;
}) {
  const state = useSession(),
    cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (state.status === "loading")
    return <button className={styles.button} type="button" disabled>Đang kiểm tra phiên…</button>;
  if (state.status !== "authenticated")
    return (
      <Link
        className={styles.button}
        to={`/login?returnUrl=${encodeURIComponent("/books/" + listingId)}`}
        aria-disabled={disabled || undefined}
        onClick={(event) => { if (disabled) event.preventDefault(); }}
      >
        <ShoppingBag size={18} aria-hidden="true" /> Thêm vào giỏ sách
      </Link>
    );
  const owner = state.user.id,
    pending = pendingCartCommand(session);
  async function add() {
    if (busy || (!pending && disabled)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeCart(
        session,
        pending ? null : { action: "add", listingId, listingVersion },
        () => crypto.randomUUID(),
      );
      const current = session.getSnapshot();
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
    <div className={styles.add}>
      <button
        className={styles.button}
        type="button"
        disabled={busy || (!pending && (disabled || state.user.status !== "ACTIVE"))}
        aria-busy={busy || undefined}
        onClick={() => void add()}
      >
        {busy ? <Loader2 className={styles.spinner} size={18} aria-hidden="true" /> : <ShoppingBag size={18} aria-hidden="true" />}
        {busy
          ? "Đang xác nhận…"
          : pending
            ? "Xác minh thao tác giỏ trước"
            : "Thêm vào giỏ sách"}
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && (
        <div className={styles.result} role="status">
          <p><Check size={16} aria-hidden="true" />{message}</p>
          <Link to="/cart">Xem giỏ sách <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      )}
    </div>
  );
}
