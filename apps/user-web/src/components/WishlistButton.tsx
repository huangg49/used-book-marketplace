import { useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@used-books/session-client";
import { Heart } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { getSavedListingIds, setListingSaved } from "../services/wishlist";
import styles from "./BookCard.module.css";

export function WishlistButton({
  listingId,
  title,
}: {
  listingId: string;
  title: string;
}) {
  const auth = useSession();
  const navigate = useNavigate();
  if (auth.status !== "authenticated")
    return (
      <button
        type="button"
        className={styles.wishlist}
        aria-label={`Đăng nhập để lưu ${title}`}
        disabled={auth.status === "loading"}
        onClick={() =>
          navigate(
            `/login?returnUrl=${encodeURIComponent(`/books/${listingId}`)}`,
          )
        }
      >
        <Heart size={21} aria-hidden="true" />
      </button>
    );
  return (
    <MemberWishlistButton
      key={`${auth.user.id}:${listingId}`}
      listingId={listingId}
      title={title}
      ownerId={auth.user.id}
      active={auth.user.status === "ACTIVE" && auth.user.roles.includes("MEMBER")}
    />
  );
}

function MemberWishlistButton({
  listingId,
  title,
  ownerId,
  active,
}: {
  listingId: string;
  title: string;
  ownerId: string;
  active: boolean;
}) {
  const cache = useQueryClient();
  const queryKey = ["saved-listings", ownerId];
  const savedQuery = useQuery({
    queryKey,
    queryFn: getSavedListingIds,
    enabled: active,
  });
  const saved = savedQuery.data?.includes(listingId) ?? false;
  const pending = useRef<boolean | undefined>(undefined);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const errorId = useId();
  async function toggle() {
    if (lock.current || !active) return;
    if (savedQuery.isError || !savedQuery.data) {
      void savedQuery.refetch();
      return;
    }
    const desired = pending.current ?? !saved;
    pending.current = desired;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await setListingSaved(listingId, desired);
      await cache.cancelQueries({ queryKey });
      const currentSession = session.getSnapshot();
      if (
        currentSession.status !== "authenticated" ||
        currentSession.user.id !== ownerId
      )
        return;
      cache.setQueryData<string[]>(queryKey, (current = []) =>
        desired
          ? [...new Set([...current, listingId])]
          : current.filter((id) => id !== listingId),
      );
      pending.current = undefined;
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 401, 403, 404, 422, 429].includes(cause.status)
      )
        pending.current = undefined;
      setError("Chưa xác nhận được thay đổi. Bấm trái tim để thử lại.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const label = !active
    ? "Tài khoản hiện chưa thể lưu sách"
    : savedQuery.isError
      ? `Thử tải trạng thái lưu ${title}`
      : error
        ? `Thử lại thay đổi lưu ${title}`
        : `${saved ? "Bỏ lưu" : "Lưu"} ${title}`;
  return (
    <>
      <button
        type="button"
        className={styles.wishlist}
        aria-label={label}
        title={label}
        aria-pressed={saved}
        aria-busy={busy || savedQuery.isFetching}
        aria-describedby={error ? errorId : undefined}
        disabled={
          !active || busy || savedQuery.isPending || savedQuery.isFetching
        }
        onClick={() => void toggle()}
      >
        <Heart
          size={21}
          fill={saved ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
      {error && (
        <p id={errorId} className={styles.saveError} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
