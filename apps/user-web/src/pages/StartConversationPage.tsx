import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useSession } from "../hooks/useSession";
import { getPublicListing } from "../services/public-listings";
import {
  changeConversationTerms,
  getPurchaseConversation,
  startPurchaseConversation,
  type TermsProposalBody,
} from "../services/purchase-conversations";
import styles from "../components/conversation/Conversation.module.css";

export function StartConversationPage() {
  const { listingId = "" } = useParams(),
    [params] = useSearchParams(),
    auth = useSession(),
    navigate = useNavigate();
  const intent =
    params.get("intent") === "Exchange" ? "Exchange" : "Negotiation";
  // Carry the presentation intent through login, an existing room and a retry.
  const entry = new URLSearchParams();
  if (intent === "Negotiation" && params.get("buyNow") === "1") entry.set("buyNow", "1");
  else if (params.get("openChat") === "1") entry.set("openChat", "1");
  const roomSuffix = entry.size ? `?${entry}` : "";
  const returnUrl = `/chat/start/${listingId}?intent=${intent}${entry.size ? `&${entry}` : ""}`;
  const book = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => getPublicListing(listingId),
    enabled: auth.status === "authenticated",
    refetchOnMount: "always",
    retry: false,
  });
  const createIntent = useRef<{ key: string; version: number } | null>(null),
    modeIntent = useRef<{ key: string; body: TermsProposalBody } | null>(null),
    request = useRef<Promise<string> | null>(null),
    started = useRef(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function open() {
    if (!book.data || auth.status !== "authenticated") return "";
    createIntent.current ??= {
      key: crypto.randomUUID(),
      version: book.data.version,
    };
    const receipt = await startPurchaseConversation(
      listingId,
      createIntent.current.version,
      createIntent.current.key,
      intent,
    );
    if (intent === "Exchange") {
      const room = await getPurchaseConversation(receipt.entityId);
      if (
        (room.terms?.mode ?? "Negotiation") === "Negotiation" &&
        !room.terms?.pendingProposal &&
        !room.terms?.locked &&
        room.status === "Active"
      ) {
        modeIntent.current ??= {
          key: crypto.randomUUID(),
          body: { kind: "RequestExchange", expectedVersion: room.version },
        };
        await changeConversationTerms(
          room.id,
          modeIntent.current.body,
          modeIntent.current.key,
        );
      }
    }
    return receipt.entityId;
  }
  function run() {
    setBusy(true);
    setError("");
    request.current ??= open();
    return request.current;
  }
  function showFailure(cause: unknown) {
    request.current = null;
    setBusy(false);
    const terminal =
      cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.status);
    if (terminal) {
      createIntent.current = null;
      modeIntent.current = null;
      void book.refetch();
    }
    setError(
      terminal
        ? "Chưa mở được cuộc trao đổi. Sách hoặc quyền truy cập vừa thay đổi; kiểm tra lại rồi thử tiếp."
        : "Chưa xác nhận được kết quả. Thử lại sẽ tiếp tục đúng yêu cầu vừa gửi.",
    );
  }
  useEffect(() => {
    if (
      !book.data ||
      auth.status !== "authenticated" ||
      (!request.current && (book.isFetching || book.isError)) ||
      (started.current && !request.current)
    )
      return;
    if (book.data.seller.id === auth.user.id) {
      navigate(`/books/${listingId}`, { replace: true });
      return;
    }
    started.current = true;
    let disposed = false;
    run()
      .then((id) => {
        if (!disposed && id)
          navigate(`/chat/${id}${roomSuffix}`, { replace: true });
      })
      .catch((cause: unknown) => {
        if (!disposed) showFailure(cause);
      });
    return () => {
      disposed = true;
    };
    // One entry intent, including StrictMode effect replay. Manual retry resumes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.data, book.isFetching, book.isError, auth.status, navigate, roomSuffix]);
  async function retry() {
    try {
      const id = await run();
      if (id) navigate(`/chat/${id}${roomSuffix}`, { replace: true });
    } catch (cause) {
      showFailure(cause);
    }
  }
  if (auth.status === "anonymous")
    return (
      <Navigate
        replace
        to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}
      />
    );
  return (
    <section className={styles.empty}>
      <h1>
        {error || book.isError
          ? "Chưa mở được cuộc trao đổi"
          : "Đang mở cuộc trao đổi…"}
      </h1>
      <p>
        {error ||
          (book.isError
            ? "Chưa tải được bài đăng. Kiểm tra kết nối rồi thử lại."
            : "Phiếu thỏa thuận và hội thoại riêng của hai bạn sẽ hiện tại đây. Mở hội thoại chưa giữ sách.")}
      </p>
      {(error || book.isError) && (
        <button
          type="button"
          disabled={busy || (!createIntent.current && book.isFetching)}
          onClick={() => {
            if (book.isError && !createIntent.current) void book.refetch();
            else void retry();
          }}
        >
          Thử lại
        </button>
      )}
      <p>
        <Link to={`/books/${listingId}`}>Về trang sách</Link>
      </p>
    </section>
  );
}
