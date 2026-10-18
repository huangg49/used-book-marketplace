import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  BookmarkPlus,
  Library,
  ArrowLeft,
  Send,
  Search,
  FileText,
  PlusCircle,
} from "lucide-react";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { ROUTES, formatVnd } from "../lib/routes";
import { getPublicListing, getPublicPhoto } from "../services/public-listings";
import {
  getMyListings,
  getMyBookIdentity,
  getMyPhoto,
} from "../services/my-listings";
import {
  exchangeCommand,
  exchangeError,
  pendingProposal,
} from "../services/exchange";
import { BookCover } from "../components/BookCover";
import { ConfirmDialog } from "../components/ConfirmDialog";
import styles from "./ExchangeComposePage.module.css";

const addressBookSchema = z.object({
  version: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      recipientName: z.string(),
      phone: z.string(),
      serviceAreaCode: z.string(),
      localityCode: z.string(),
      detail: z.string(),
      isDefault: z.boolean(),
      version: z.number().int(),
    }),
  ),
});

async function inventory() {
  const rows = [];
  let cursor: string | undefined;
  do {
    const page = await getMyListings("Approved", cursor, 50);
    rows.push(
      ...page.items.filter(
        (row) =>
          row.state.trade === "Available" &&
          row.state.visibility === "Visible" &&
          ["Exchange", "Both"].includes(row.currentRevision.content.mode ?? ""),
      ),
    );
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return Promise.all(
    rows.map(async (row) => {
      const bookId =
        row.currentRevision.bookId ?? row.currentRevision.content.bookId;
      if (!bookId) throw new Error("Bài đăng thiếu thông tin sách.");
      const book = await getMyBookIdentity(bookId, row.catalogStatus);
      let coverUrl: string | undefined;
      const photo = row.currentRevision.content.mediaIds?.[0];
      if (photo) {
        try {
          coverUrl = (await getMyPhoto(row.id, photo)).url;
        } catch {
          /* optional cover */
        }
      }
      return {
        id: row.id,
        title: book.title,
        author: book.authors.join(", "),
        value: row.currentRevision.content.exchangeValue ?? 0,
        coverUrl,
      };
    }),
  );
}
export default function ExchangeComposePage() {
  const auth = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const id = pendingProposal()?.recipientListingId ?? params.get("book");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const p = pendingProposal();
    if (p?.initiatorListingIds && p.initiatorListingIds.length > 0) {
      return p.initiatorListingIds;
    }
    if (p?.initiatorListingId) return [p.initiatorListingId];
    return [];
  });
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unresolved, setUnresolved] = useState(() => !!pendingProposal());
  const target = useQuery({
    queryKey: ["exchange-target", id],
    staleTime: 0,
    enabled: !!id && auth.status === "authenticated",
    queryFn: async () => {
      const listing = await getPublicListing(id!);
      let coverUrl: string | undefined;
      if (listing.photos[0]) {
        try {
          coverUrl = (await getPublicPhoto(listing.id, listing.photos[0].id))
            .url;
        } catch {
          /* optional cover */
        }
      }
      return { ...listing, coverUrl };
    },
  });
  const mine = useQuery({
    staleTime: 0,
    queryKey: [
      "exchange-inventory",
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: inventory,
    enabled: auth.status === "authenticated",
  });
  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBookSchema),
    enabled: auth.status === "authenticated",
  });
  const [deliveryAddressId, setDeliveryAddressId] = useState<string>("");
  useEffect(() => {
    if (addresses.data?.items?.length && !deliveryAddressId) {
      const def = addresses.data.items.find((a) => a.isDefault);
      setDeliveryAddressId(def ? def.id : addresses.data.items[0].id);
    }
  }, [addresses.data, deliveryAddressId]);

  const chosenBooks = (mine.data ?? []).filter((book) =>
    selectedIds.includes(book.id),
  );
  const hasChosen = chosenBooks.length > 0;
  const targetBook = target.data;
  const eligible =
    targetBook &&
    auth.status === "authenticated" &&
    targetBook.seller.id !== auth.user.id &&
    ["Exchange", "Both"].includes(targetBook.mode);

  const totalOfferValue = chosenBooks.reduce(
    (sum, book) => sum + (book.value ?? 0),
    0,
  );
  const diff =
    hasChosen && targetBook
      ? (targetBook.exchangeValue ?? 0) - totalOfferValue
      : 0;
  const moneyText =
    diff > 0
      ? `Bạn bù thêm ${formatVnd(diff)}`
      : diff < 0
        ? `Đối tác bù thêm ${formatVnd(-diff)}`
        : "Trao đổi ngang giá";

  const toggleBook = (bookId: string) => {
    setSelectedIds((prev) =>
      prev.includes(bookId)
        ? prev.filter((item) => item !== bookId)
        : [...prev, bookId],
    );
  };

  async function submit() {
    const retained = pendingProposal();
    if (busy || (!retained && (!hasChosen || !eligible))) return;
    setBusy(true);
    setError("");
    try {
      const result = await exchangeCommand(
        "/exchanges",
        retained ?? {
          initiatorListingId: chosenBooks[0].id,
          initiatorListingIds: chosenBooks.map((b) => b.id),
          recipientListingId: targetBook!.id,
          deliveryAddressId: deliveryAddressId || undefined,
        },
      );
      setUnresolved(false);
      navigate(ROUTES.exchangeDetail(result.id), { replace: true });
    } catch (failure) {
      setError(exchangeError(failure));
      setUnresolved(!!pendingProposal());
    } finally {
      setBusy(false);
    }
  }
  if (auth.status === "anonymous") {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }
  if (auth.status !== "authenticated") {
    return (
      <div className={styles.container} role="status">
        <p>Đang kiểm tra đăng nhập…</p>
      </div>
    );
  }
  if (unresolved && (!hasChosen || !eligible || target.isError || mine.isError))
    return (
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Xác nhận đề nghị trước</h1>
        <p>
          Đề nghị trước chưa rõ kết quả. Bản sách có thể đã được giữ; thử lại
          vẫn gửi đúng mã và nội dung đã xác nhận.
        </p>
        {error && (
          <p role="alert" className={styles.errorText}>
            {error}
          </p>
        )}
        <button
          className={styles.btnPrimary}
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "Đang xác nhận…" : "Thử lại đề nghị trước"}
        </button>
      </div>
    );
  if (target.isLoading || mine.isLoading)
    return (
      <div className={styles.container} role="status">
        Đang tải sách để trao đổi…
      </div>
    );
  if (target.isError || mine.isError)
    return (
      <div className={styles.container} role="alert">
        <h2>Chưa tải được sách</h2>
        <p>Kiểm tra kết nối và tải lại. Bài đăng có thể không còn công khai.</p>
        <button
          className={styles.btnSecondary}
          onClick={() => {
            void target.refetch();
            void mine.refetch();
          }}
        >
          Thử lại
        </button>
      </div>
    );
  if (!targetBook || !eligible)
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <h2>Bản sách chưa phù hợp để trao đổi</h2>
          <p>Chọn bài đăng của người khác đang cho phép đổi sách.</p>
          <Link className={styles.emptyStateBtn} to="/books?mode=Exchange">
            Tìm sách để đổi
          </Link>
        </div>
      </div>
    );
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Soạn đề nghị trao đổi</h1>
        <p className={styles.pageSubtitle}>
          Chọn một hoặc nhiều bản sách của bạn để đổi với người đọc tiếp theo.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (hasChosen) {
            setError("");
            setPreview(true);
          } else setError("Chọn ít nhất một bản sách của bạn để gửi đề nghị.");
        }}
      >
        <div className={styles.grid}>
          <div className={styles.leftCol}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <BookmarkPlus className={styles.icon} />
                <h2>Sách bạn muốn nhận</h2>
              </div>
              <div className={styles.targetBookInfo}>
                <div className={styles.targetBookCover}>
                  <BookCover
                    title={targetBook.book.title}
                    index={0}
                    coverUrl={targetBook.coverUrl}
                  />
                </div>
                <h3 className={styles.targetBookTitle}>
                  {targetBook.book.title}
                </h3>
                <p className={styles.targetBookAuthor}>
                  {targetBook.book.authors.join(", ")}
                </p>
              </div>
              <div className={styles.targetBookDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Tình trạng</span>
                  <span className={styles.detailValue}>
                    {targetBook.condition}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Giá trị đổi</span>
                  <span className={styles.detailValue}>
                    {formatVnd(targetBook.exchangeValue ?? 0)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Người đăng</span>
                  <span className={styles.detailValue}>
                    {targetBook.seller.displayName}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={16} /> Quay lại chọn sách khác
            </button>
          </div>
          <div className={styles.rightCol}>
            <div className={`${styles.card} ${styles.cardThemePaper}`}>
              <div className={styles.cardHeader}>
                <Library className={styles.icon} />
                <h2>Chọn sách của bạn để đổi</h2>
                <span className={styles.selectionBadge}>
                  Đã chọn {chosenBooks.length} cuốn
                </span>
              </div>
              <label htmlFor="exchange-search" className={styles.label}>
                <Search size={16} /> Tìm trong kệ của bạn
              </label>
              <input
                id="exchange-search"
                className={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={unresolved || busy}
              />
              {!mine.data?.length && (
                <p>Kệ chưa có bản sách được duyệt và đang cho phép đổi.</p>
              )}
              <div className={styles.bookGrid}>
                {mine.data
                  ?.filter((book) =>
                    `${book.title} ${book.author}`
                      .toLocaleLowerCase("vi")
                      .includes(search.toLocaleLowerCase("vi")),
                  )
                  .map((book) => {
                    const isChecked = selectedIds.includes(book.id);
                    return (
                      <label
                        className={styles.selectableCard}
                        data-selected={isChecked}
                        key={book.id}
                      >
                        <div className={styles.checkboxWrapper}>
                          <input
                            type="checkbox"
                            name="exchange-book"
                            value={book.id}
                            checked={isChecked}
                            disabled={busy || unresolved}
                            onChange={() => toggleBook(book.id)}
                          />
                        </div>
                        <div className={styles.selectBookCover}>
                          <BookCover
                            title={book.title}
                            index={0}
                            coverUrl={book.coverUrl}
                          />
                        </div>
                        <div className={styles.selectBookInfo}>
                          <p className={styles.selectBookTitle}>{book.title}</p>
                          <p className={styles.selectBookAuthor}>{book.author}</p>
                          <p>{formatVnd(book.value)}</p>
                        </div>
                      </label>
                    );
                  })}
                <Link className={styles.addBookCard} to={ROUTES.sell}>
                  <PlusCircle size={32} /> Đăng thêm sách
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.bottomSection}>
          <div className={styles.card}>
            <div className={styles.formSectionHeader}>
              <FileText className={styles.icon} />
              <h2>Chi tiết đề nghị trao đổi</h2>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroupBox}>
                <h3>Bù tiền</h3>
                <p>
                  {hasChosen ? moneyText : "Chọn sách để xem khoản chênh lệch."}
                </p>
                <p className={styles.helpTextDesc}>
                  Máy chủ tính tiền bù từ tổng giá trị đổi của các bản sách hai bên.
                </p>
              </div>
              <div className={styles.formGroupBox}>
                <h3>Địa chỉ nhận sách của bạn (TP.HCM)</h3>
                {addresses.data?.items && addresses.data.items.length > 0 ? (
                  <select
                    className={styles.select}
                    value={deliveryAddressId}
                    onChange={(e) => setDeliveryAddressId(e.target.value)}
                    disabled={busy}
                  >
                    {addresses.data.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.recipientName} · {item.phone} · {item.detail} ({item.localityCode})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.helpTextDesc}>
                    Chưa có địa chỉ lưu sẵn. Bạn có thể thêm địa chỉ nhận hàng tại trang Tài khoản.
                  </p>
                )}
                <p className={styles.helpTextDesc}>
                  Đối tác sẽ thấy địa chỉ này để gửi sách cho bạn sau khi cả hai bên đặt cọc.
                </p>
              </div>
            </div>
            {error && (
              <p role="alert" className={styles.errorText}>
                {error}
              </p>
            )}
            <div className={styles.formActions}>
              <button
                className={styles.btnPrimary}
                type="submit"
                disabled={!hasChosen || busy}
              >
                <Send size={18} />{" "}
                {unresolved ? "Thử lại đề nghị trước" : "Xem lại đề nghị"}
              </button>
            </div>
          </div>
        </div>
      </form>
      <ConfirmDialog
        isOpen={preview}
        onClose={() => setPreview(false)}
        title="Xem lại đề nghị"
        confirmText={unresolved ? "Thử lại đề nghị trước" : "Gửi đề nghị"}
        isBusy={busy}
        onConfirm={() => void submit()}
      >
        <div className={styles.summarySection}>
          <strong>Bạn nhận:</strong> {targetBook.book.title} ({formatVnd(targetBook.exchangeValue ?? 0)})
        </div>
        <div className={styles.summarySection}>
          <strong>Bạn giao ({chosenBooks.length} cuốn):</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {chosenBooks.map((b) => (
              <li key={b.id} style={{ marginBottom: 4 }}>
                {b.title} — {formatVnd(b.value)}
              </li>
            ))}
          </ul>
          {chosenBooks.length > 1 && (
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              Tổng giá trị giao: {formatVnd(totalOfferValue)}
            </div>
          )}
        </div>
        <div className={styles.summarySection}>{moneyText}</div>
        {deliveryAddressId && addresses.data?.items && (
          <div className={styles.summarySection}>
            <strong>Địa chỉ nhận của bạn:</strong>{" "}
            {(() => {
              const a = addresses.data.items.find((item) => item.id === deliveryAddressId);
              return a ? `${a.recipientName} (${a.phone}) - ${a.detail}` : "";
            })()}
          </div>
        )}
        <p>Máy chủ kiểm tra lại tình trạng bài đăng khi gửi.</p>
        {error && (
          <p role="alert" className={styles.errorText}>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
