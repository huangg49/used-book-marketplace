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
  const book = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => getPublicListing(listingId),
    enabled: auth.status === "authenticated",
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
  useEffect(() => {
    if (
      !book.data ||
      auth.status !== "authenticated" ||
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
        if (!disposed && id) navigate(`/chat/${id}`, { replace: true });
      })
      .catch((e) => {
        if (disposed) return;
        request.current = null;
        setBusy(false);
        const terminal =
          e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status);
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
      });
    return () => {
      disposed = true;
    };
    // One entry intent, including StrictMode effect replay. Manual retry resumes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.data, auth.status, navigate]);
  async function retry() {
    try {
      const id = await run();
      if (id) navigate(`/chat/${id}`, { replace: true });
    } catch {
      request.current = null;
      setBusy(false);
      setError("Chưa xác nhận được kết quả. Thử lại để tiếp tục cùng yêu cầu.");
    }
  }
  if (auth.status === "anonymous")
    return (
      <Navigate
        replace
        to={`/login?returnUrl=${encodeURIComponent(`/chat/start/${listingId}?intent=${intent}`)}`}
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
          disabled={busy}
          onClick={() => (book.isError ? void book.refetch() : void retry())}
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
