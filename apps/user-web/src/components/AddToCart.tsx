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
import styles from "../pages/CartPage.module.css";
export function AddToCart({
  listingId,
  listingVersion,
}: {
  listingId: string;
  listingVersion: number;
}) {
  const state = useSession(),
    cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (state.status !== "authenticated")
    return (
      <Link
        className={styles.linkButton}
        to={`/login?returnTo=${encodeURIComponent("/books/" + listingId)}`}
      >
        Đăng nhập để thêm vào giỏ
      </Link>
    );
  const owner = state.user.id,
    pending = pendingCartCommand(session);
  async function add() {
    if (busy) return;
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
        type="button"
        disabled={busy || (!pending && state.user.status !== "ACTIVE")}
        onClick={() => void add()}
      >
        {busy
          ? "Đang xác nhận…"
          : pending
            ? "Xác minh thao tác giỏ trước"
            : "Thêm vào giỏ sách"}
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Link to="/cart">Mở giỏ sách</Link>
    </div>
  );
}
