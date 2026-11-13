import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { ApiError } from "@used-books/session-client";
import { categoryPath, foldCatalogText } from "@used-books/api-contract/catalog-taxonomy";
import { z } from "zod";
import { BookCover } from "../components/BookCover";
import { useExchangeRecovery } from "../hooks/useExchangeRecovery";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { ROUTES, formatVnd } from "../lib/routes";
import { conditions } from "../lib/listing-labels";
import { getPublicListing, getPublicPhoto } from "../services/public-listings";
import { getMyListings, getMyBookIdentity } from "../services/my-listings";
import { getPurchaseConversations } from "../services/purchase-conversations";
import { exchangeCommand, exchangeError, pendingProposal, createdExchange, exchangeIdentity } from "../services/exchange";
import styles from "./ExchangeComposePage.module.css";

const addressBookSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    detail: z.string(),
    isDefault: z.boolean(),
  })),
});

async function inventory() {
  const books = [];
  let cursor: string | undefined;
  do {
    const page = await getMyListings("Approved", cursor, 50);
    books.push(...page.items.filter(({ state, currentRevision, catalogStatus }) => {
      const content = currentRevision.content;
      return state.trade === "Available" && state.visibility === "Visible" &&
        catalogStatus === "Confirmed" && !content.bundle &&
        (content.exchangeValue ?? 0) > 0 && (content.mediaIds?.length ?? 0) > 0 &&
        (content.mode === "Exchange" || content.mode === "Both");
    }));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return Promise.all(books.map(async (row) => {
    const revision = row.currentRevision;
    const book = await getMyBookIdentity((revision.bookId ?? revision.content.bookId)!, row.catalogStatus);
    const photo = await getPublicPhoto(row.id, revision.content.mediaIds![0]).catch(() => undefined);
    return {
      id: row.id,
      title: book.title,
      author: book.authors.join(", "),
      authors: book.authors,
      category: book.category,
      value: revision.content.exchangeValue ?? 0,
      coverUrl: photo?.url,
    };
  }));
}

function OfferBook({ title, author, coverUrl, value, match }: {
  title: string;
  author: string;
  coverUrl?: string;
  value: number;
  match?: { id: string; label: string };
}) {
  return (
    <div className={styles.book}>
      <div className={styles.cover} aria-hidden="true"><BookCover title={title} coverUrl={coverUrl} /></div>
      <div className={styles.bookText}>
        <strong className={styles.bookTitle} title={title}>{title}</strong>
        {author && <span>{author}</span>}
        <span className={styles.value}>{formatVnd(value)}</span>
        {match && <span id={match.id} className={styles.matchLabel}>{match.label}</span>}
      </div>
    </div>
  );
}

function preferenceKey(value?: string | null) {
  return foldCatalogText(value ?? "").trim().replace(/\s+/g, " ");
}

function ExchangeCompose({ listingId }: { listingId: string | null }) {
  const auth = useSession();
  const actorId = auth.status === "authenticated" ? auth.user.id : undefined;
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const retained = pendingProposal();
  const id = retained?.recipientListingId ?? listingId;
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    retained?.initiatorListingIds ?? (retained?.initiatorListingId ? [retained.initiatorListingId] : []));
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deliveryAddressId, setDeliveryAddressId] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const sending = useRef(false);
  useEffect(() => {
    if (moveFocus.current) {
      heading.current?.focus();
      moveFocus.current = false;
    }
  }, [review]);

  const target = useQuery({
    queryKey: ["exchange-target", id],
    enabled: Boolean(id && actorId),
    retry: false,
    queryFn: async () => {
      const book = await getPublicListing(id!);
      const photo = book.photos[0] ? await getPublicPhoto(book.id, book.photos[0].id).catch(() => undefined) : undefined;
      return { ...book, coverUrl: photo?.url };
    },
  });
  const mine = useQuery({
    queryKey: ["exchange-inventory", actorId],
    queryFn: inventory,
    enabled: Boolean(id && actorId),
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["exchange-compose-addresses", actorId],
    queryFn: () => session.request("/me/addresses", addressBookSchema),
    enabled: Boolean(id && actorId),
    retry: false,
  });
  const conversations = useQuery({
    queryKey: ["purchase-conversations", actorId],
    queryFn: getPurchaseConversations,
    enabled: Boolean(id && actorId && !retained),
    retry: false,
  });
  const book = target.data;
  const activeRoom = conversations.data?.find(room =>
    room.status === "Active" && room.listingId === id && room.buyer.id === actorId);
  const chosen = (mine.data ?? []).filter(item => selectedIds.includes(item.id));
  const ownValue = chosen.reduce((total, item) => total + item.value, 0);
  const targetValue = book?.exchangeValue ?? 0;
  const difference = targetValue - ownValue;
  const addressId = deliveryAddressId ?? addresses.data?.items.find(item => item.isDefault)?.id ??
    addresses.data?.items[0]?.id ?? "";
  const bookPath = id ? ROUTES.bookDetail(id) : ROUTES.exchange;
  const created = id && createdExchange(id);
  const available = book && book.seller.id !== actorId && !book.bundle && book.photos.length > 0 &&
    (book.mode === "Exchange" || book.mode === "Both") && targetValue > 0 &&
    (book.purchaseAvailability.status === "Available" ||
      (book.purchaseAvailability.status === "InNegotiation" && Boolean(activeRoom)));

  async function submit() {
    const previous = pendingProposal();
    if (sending.current || (!previous && (!available || !book || !chosen.length))) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const identity = exchangeIdentity();
    try {
      const result = await exchangeCommand("/exchanges", previous ?? {
        initiatorListingId: chosen[0].id,
        initiatorListingIds: chosen.map(item => item.id),
        recipientListingId: book!.id,
        ...(addressId ? { deliveryAddressId: addressId } : {}),
      });
      if (exchangeIdentity() !== identity) return;
      void queryClient.invalidateQueries({ queryKey: ["exchangeTransactions", actorId] });
      void queryClient.invalidateQueries({ queryKey: ["exchangeCounts", actorId] });
      navigate(ROUTES.exchangeDetail(result.id), { replace: true });
    } catch (failure) {
      if (exchangeIdentity() === identity) {
        setError(exchangeError(failure));
        if (!pendingProposal()) {
          void target.refetch();
          void mine.refetch();
        }
      }
    } finally {
      sending.current = false;
      if (exchangeIdentity() === identity) setBusy(false);
    }
  }

  function changeStep(next: boolean) {
    moveFocus.current = true;
    setError("");
    setReview(next);
  }

  if (auth.status === "anonymous") {
    return <Navigate replace to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} />;
  }
  if (!actorId) return <div className={styles.page} role="status">Đang kiểm tra đăng nhập…</div>;
  if (retained?.conversationId) {
    return <Navigate replace to={ROUTES.chat(retained.conversationId)} />;
  }
  if (retained && (!busy || !review)) {
    return (
      <div className={styles.page}>
        <h1>Kiểm tra đề nghị vừa gửi</h1>
        <p role="status">Chưa nhận được kết quả. Thử lại để kiểm tra đúng đề nghị này.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primary} disabled={busy} onClick={() => void submit()}>
          {busy ? "Đang kiểm tra…" : "Thử lại đề nghị"}
        </button>
      </div>
    );
  }
  if (created) return <Navigate replace to={ROUTES.exchangeDetail(created)} />;

  const missing = target.error instanceof ApiError && target.error.status === 404;
  const failed = !missing && (target.isError || mine.isError || conversations.isError);
  if (failed || missing || !id || (book && !conversations.isPending && !available)) {
    return (
      <div className={styles.page}>
        <h1>{failed ? "Chưa tải được thông tin đổi sách" : "Cuốn sách này chưa thể đổi"}</h1>
        {failed && <button className={styles.primary} onClick={() => {
          void target.refetch();
          void mine.refetch();
          void conversations.refetch();
        }}>Thử lại</button>}
        <Link className={styles.back} to={ROUTES.exchange}>Tìm sách khác</Link>
      </div>
    );
  }
  if (target.isPending || mine.isPending || conversations.isPending || !book) {
    return <div className={styles.page} role="status">Đang tải sách…</div>;
  }
  if (activeRoom) {
    return (
      <div className={styles.page}>
        <Link className={styles.back} to={bookPath}><ArrowLeft size={17} aria-hidden="true" /> Về trang sách</Link>
        <h1>Bạn đã có hội thoại với {book.seller.displayName}</h1>
        <p>Mở hội thoại để tiếp tục đổi cuốn <strong>{book.book.title}</strong>.</p>
        <Link className={styles.primary} to={activeRoom.terms?.mode === "Exchange"
          ? ROUTES.chat(activeRoom.id)
          : `/chat/start/${book.id}?intent=Exchange`}>Mở hội thoại <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    );
  }

  const targetBook = <OfferBook title={book.book.title} author={book.book.authors.join(", ")} coverUrl={book.coverUrl} value={targetValue} />;
  const preferences = book.exchangePreferences;
  const wants = [preferences?.targetCategory, preferences?.targetAuthor, preferences?.targetDescription].filter(Boolean);
  const wantedAuthor = preferenceKey(preferences?.targetAuthor);
  const wantedCategory = preferenceKey(preferences?.targetCategory);
  const options = (mine.data ?? []).map(item => {
    const authorMatch = !!wantedAuthor && item.authors.some(author => preferenceKey(author) === wantedAuthor);
    const categoryMatch = !!wantedCategory && (preferenceKey(item.category) === wantedCategory ||
      (!!item.category && categoryPath(item.category).some(category =>
        category.id === wantedCategory || preferenceKey(category.label) === wantedCategory)));
    const label = authorMatch && categoryMatch ? "Khớp tác giả và thể loại"
      : authorMatch ? "Khớp tác giả" : categoryMatch ? "Khớp thể loại" : undefined;
    return { item, label, priority: Number(authorMatch) + Number(categoryMatch) };
  }).sort((a, b) => b.priority - a.priority);
  return (
    <div className={styles.page}>
      {review ? (
        <button className={styles.back} type="button" disabled={busy} onClick={() => changeStep(false)}><ArrowLeft size={17} aria-hidden="true" /> Đổi lựa chọn</button>
      ) : (
        <Link className={styles.back} to={bookPath}><ArrowLeft size={17} aria-hidden="true" /> Về trang sách</Link>
      )}
      <h1 ref={heading} tabIndex={-1}>{review ? "Xem lại đề nghị" : "Chọn sách để đổi"}</h1>
      <div className={styles.layout}>
        <section className={styles.target} aria-labelledby="target-book">
          <h2 id="target-book">Bạn muốn nhận</h2>
          {targetBook}
          <p className={styles.meta}>Của {book.seller.displayName} · {conditions[book.condition]}</p>
          {wants.length > 0 && (
            <details className={styles.disclosure}>
              <summary>{book.seller.displayName} đang tìm <ChevronDown size={16} aria-hidden="true" /></summary>
              <p>{wants.join(" · ")}</p>
            </details>
          )}
        </section>
        <section className={styles.work} aria-labelledby="own-books">
          <h2 id="own-books">{review ? "Bạn đề nghị gửi" : "Sách của bạn"}</h2>
          {review ? (
            <>
              <ul className={styles.bookList}>
                {chosen.map(item => <li key={item.id}><OfferBook {...item} /></li>)}
              </ul>
              {chosen.length > 0 && (
                <section className={styles.amounts} aria-labelledby="proposal-money">
                  <h2 id="proposal-money">Nếu hai bên đồng ý</h2>
                  <dl>
                    <div><dt>Cọc của bạn</dt><dd>{formatVnd(targetValue)}</dd></div>
                    <div><dt>{difference < 0 ? `Tiền bù của ${book.seller.displayName}` : "Tiền bù của bạn"}</dt><dd>{formatVnd(Math.abs(difference))}</dd></div>
                    <div className={styles.total}><dt>Bạn cần nộp</dt><dd>{formatVnd(targetValue + Math.max(0, difference))}</dd></div>
                    <div><dt>{book.seller.displayName} cần nộp</dt><dd>{formatVnd(ownValue + Math.max(0, -difference))}</dd></div>
                  </dl>
                  <p>Gửi đề nghị chưa giữ sách hay trừ tiền.</p>
                </section>
              )}
              {addresses.isError && (
                <p role="status">Chưa tải được địa chỉ nhận sách. <button className={styles.textButton} onClick={() => void addresses.refetch()}>Tải lại địa chỉ</button></p>
              )}
              {addresses.data && addresses.data.items.length > 0 && (
                <details className={styles.disclosure}>
                  <summary>Địa chỉ nhận sách <ChevronDown size={16} aria-hidden="true" /></summary>
                  <select aria-label="Địa chỉ nhận sách" value={addressId} onChange={e => setDeliveryAddressId(e.target.value)} disabled={busy}>
                    {addresses.data.items.map(item => <option key={item.id} value={item.id}>{item.detail}</option>)}
                  </select>
                </details>
              )}
              {chosen.length !== selectedIds.length && (
                <p className={styles.error} role="alert">Sách đã chọn vừa thay đổi. Hãy quay lại và chọn sách còn khả dụng.</p>
              )}
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button type="button" className={styles.primary} disabled={busy || addresses.isPending || chosen.length !== selectedIds.length || !chosen.length} onClick={() => void submit()}>
                {busy ? "Đang gửi…" : "Gửi đề nghị"} <ArrowRight size={17} aria-hidden="true" />
              </button>
            </>
          ) : mine.data?.length ? (
            <>
              <div className={styles.options} role="group" aria-labelledby="own-books">
                {options.map(({ item, label }) => (
                  <label className={styles.option} key={item.id} data-selected={selectedIds.includes(item.id)}
                    data-matched={label ? true : undefined}>
                    <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={event => {
                      const checked = event.target.checked;
                      setSelectedIds(previous => checked ? [...previous, item.id] : previous.filter(value => value !== item.id));
                    }} aria-label={item.title} aria-describedby={label ? `match-${item.id}` : undefined} />
                    <OfferBook {...item} match={label ? { id: `match-${item.id}`, label } : undefined} />
                  </label>
                ))}
              </div>
              <div className={styles.footer}>
                <span role="status">{chosen.length ? `Đã chọn ${chosen.length} cuốn` : "Chọn ít nhất một cuốn."}</span>
                <button className={styles.primary} type="button" disabled={!chosen.length} onClick={() => changeStep(true)}>
                  Xem lại đề nghị <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Bạn chưa có sách đã duyệt và đang mở đổi.</p>
              <Link className={styles.primary} to={ROUTES.sell}>Đăng sách</Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ExchangeComposePage() {
  const identity = useExchangeRecovery();
  const [params] = useSearchParams();
  const id = params.get("book");
  return <ExchangeCompose key={identity + ":" + id} listingId={id} />;
}
