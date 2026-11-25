import { BundleManifest, BundleAcknowledgment } from "../components/BookBundle";
import { listingTitle } from "../lib/book-bundle";
import { buyNowError } from "../lib/buy-now-error";
import { useQuery } from "@tanstack/react-query";
import { ApiError, buyerSaleFeeText, directOrderHoldNotes, saleFeeAmountsSchema } from "@used-books/session-client";
import { TransactionNotes } from "../components/TransactionReview";
import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { formatVnd } from "../lib/routes";
import { conditions } from "../lib/listing-labels";
import {
  getPublicListing,
  type PublicListing,
} from "../services/public-listings";
import {
  capturePurchaseListing,
  purchaseListingKey,
} from "../lib/purchase-listing";
import { createBuyNowOrder, type BuyNowInput } from "../services/orders";
import { ListingPhoto } from "../components/BookCard";
import { SupportLink } from "../features/support/SupportLink";
import {
  MapPin,
  ArrowRight,
  ArrowLeft,
  ArrowDownLeft,
  Check,
  MessageCircle,
} from "lucide-react";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { PurchaseAddressFields } from "../components/PurchaseAddressFields";
import styles from "./PurchaseFlow.module.css";
import exchangeStyles from "./ExchangeDetailPage.module.css";
import stepStyles from "../components/exchange/ExchangeSteps/ExchangeSteps.module.css";

const addressSchema = z.object({
  id: z.string().uuid(),
  version: z.number(),
  recipientName: z.string(),
  phone: z.string(),
  localityCode: z.string(),
  detail: z.string(),
  isDefault: z.boolean(),
});
const addressBook = z.object({
  version: z.number(),
  items: z.array(addressSchema),
});
const areasSchema = z.object({
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});
const quoteSchema = z.object({
  id: z.string().uuid(),
  version: z.literal(1),
  listingVersion: z.number(),
  listingRevisionId: z.string().uuid(),
  expiresAt: z.string(),
  amounts: z.object({
    bookPrice: z.number(),
    shippingFee: z.number(),
    buyerTotal: z.number(),
    ...saleFeeAmountsSchema.partial().shape,
  }),
});
type Attempt = {
  listing: PublicListing;
  address?: { key: string; body: object; id?: string };
  quoteKey: string;
  quoteBody?: object;
  quoteId?: string;
};
type Prepared = {
  listing: PublicListing;
  body: BuyNowInput;
  amounts: z.infer<typeof quoteSchema>["amounts"];
  expiresAt: string;
  destination: string;
  key: string;
};

const definite = (error: unknown) =>
  error instanceof ApiError &&
  [400, 403, 404, 409, 422, 429].includes(error.status);

const BUY_NOW_STEPS = [
  { id: "address", label: "Địa chỉ nhận" },
  { id: "confirm", label: "Xác nhận đơn" },
  { id: "payment", label: "Thanh toán" },
  { id: "handover", label: "Giao nhận" },
  { id: "result", label: "Kết quả" },
] as const;

export function BuyNowPage() {
  const { listingId = "" } = useParams<{ listingId: string }>();
  const [params] = useSearchParams();
  const auth = useSession();
  if (params.get("legacy") !== "1") {
    return (
      <Navigate
        to={`/chat/start/${listingId}?intent=Negotiation&buyNow=1`}
        replace
      />
    );
  }
  return (
    <BuyNowListing
      key={`${auth.status === "authenticated" ? auth.user.id : "guest"}:${listingId}`}
    />
  );
}

function BuyNowListing() {
  const [acknowledgedRevision, setAcknowledgedRevision] = useState<string>();
  const { listingId = "" } = useParams<{ listingId: string }>();
  const auth = useSession();
  const navigate = useNavigate();
  const book = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => getPublicListing(listingId),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBook),
    enabled: auth.status === "authenticated",
    retry: false,
  });
  const bundleAcknowledged =
    !!book.data && acknowledgedRevision === purchaseListingKey(book.data);
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", areasSchema),
    enabled: auth.status === "authenticated",
    retry: false,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    recipientName: "",
    phone: "",
    localityCode: "",
    detail: "",
  });
  const [prepared, setPrepared] = useState<Prepared>();
  const [pendingListing, setPendingListing] = useState<PublicListing>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<Attempt | undefined>(undefined);
  const [createPending, setCreatePending] = useState(false);
  const existing = addresses.data?.items ?? [];
  const selectedAddress =
    selected === "new"
      ? undefined
      : (existing.find((a) => a.id === selected) ??
        existing.find((a) => a.isDefault) ??
        existing[0]);

  async function prepare(event?: React.FormEvent) {
    event?.preventDefault();
    if (
      busy ||
      (book.isFetching && !attempt.current) ||
      !book.data ||
      !addresses.data ||
      !areas.data
    )
      return;
    if (!attempt.current && book.data.bundle && !bundleAcknowledged) {
      setError("Xem danh sách và xác nhận mua toàn bộ các cuốn trong bộ.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const intent = attempt.current ?? {
      listing: capturePurchaseListing(book.data, acknowledgedRevision),
      quoteKey: crypto.randomUUID(),
    };
    attempt.current = intent;
    setPendingListing(intent.listing);
    try {
      let address = selectedAddress;
      if (!address || intent.address) {
        intent.address ??= {
          key: crypto.randomUUID(),
          body: {
            expectedBookVersion: addresses.data.version,
            address: { ...form, serviceAreaCode: "HCM-DEMO-v1" },
            makeDefault: existing.length === 0,
          },
        };
        if (!intent.address.id) {
          const saved = await session.request(
            "/me/addresses",
            z.object({ addressId: z.string().uuid() }),
            {
              method: "POST",
              headers: { "Idempotency-Key": intent.address.key },
              body: JSON.stringify(intent.address.body),
            },
          );
          intent.address.id = saved.addressId;
        }
        const refreshed = await addresses.refetch();
        address = refreshed.data?.items.find(
          (a) => a.id === intent.address!.id,
        );
        if (!address) throw new Error("Unconfirmed address");
        setSelected(address.id);
      }
      intent.quoteBody ??= {
        expectedListingVersion: intent.listing.version,
        expectedListingRevisionId: intent.listing.revisionId,
        ...(intent.listing.bundle ? { acknowledgeWholeBundle: true } : {}),
        destinationAddressId: address.id,
        expectedDestinationAddressVersion: address.version,
        method: "DirectDelivery",
      };
      if (!intent.quoteId) {
        const result = await session.request(
          `/listings/${listingId}/quotes`,
          z.object({ entityId: z.string().uuid() }),
          {
            method: "POST",
            headers: { "Idempotency-Key": intent.quoteKey },
            body: JSON.stringify(intent.quoteBody),
          },
        );
        intent.quoteId = result.entityId;
      }
      const quote = await session.request(
        `/me/quotes/${intent.quoteId}`,
        quoteSchema,
      );
      setPrepared({
        listing: intent.listing,
        body: {
          quoteId: quote.id,
          expectedQuoteVersion: quote.version,
          expectedListingVersion: quote.listingVersion,
          expectedListingRevisionId: quote.listingRevisionId,
        },
        amounts: quote.amounts,
        expiresAt: quote.expiresAt,
        destination: `${address.recipientName} · ${address.phone} · ${address.detail}`,
        key: crypto.randomUUID(),
      });
      setUncertain(false);
      setDialogOpen(false);
    } catch (cause) {
      if (definite(cause)) {
        attempt.current = undefined;
        setPendingListing(undefined);
        setUncertain(false);
      } else setUncertain(true);
      setError(buyNowError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function place() {
    if (!prepared || busy) return;
    setBusy(true);
    setError(undefined);
    setCreatePending(true);
    try {
      const receipt = await createBuyNowOrder(prepared.body, prepared.key);
      navigate(`/orders/${receipt.entityId}`, { replace: true });
    } catch (cause) {
      if (definite(cause)) setCreatePending(false);
      setUncertain(!definite(cause));
      setError(buyNowError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (auth.status !== "authenticated")
    return (
      <div className={exchangeStyles.exchangeSheet}>
        <h1>Mua ngay</h1>
        <p>
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để mua sách theo giá niêm yết."}
        </p>
        {auth.status !== "loading" && (
          <Link
            to={`/login?returnUrl=${encodeURIComponent(`/buy-now/${listingId}`)}`}
          >
            Đăng nhập
          </Link>
        )}
      </div>
    );
  if (book.isPending)
    return (
      <div className={exchangeStyles.exchangeSheet} role="status">
        Đang tải sách…
      </div>
    );
  if (!book.data)
    return (
      <div className={exchangeStyles.exchangeSheet}>
        <h1>Chưa tải được sách</h1>
        <p role="alert">Sách có thể đã được gỡ hoặc kết nối đang gián đoạn.</p>
        <button onClick={() => void book.refetch()}>Thử lại</button>
        <Link to="/books">Về kệ sách</Link>
      </div>
    );

  const item = prepared?.listing ?? pendingListing ?? book.data;
  const unavailable =
    item.seller.id === auth.user.id ||
    item.salePrice === null ||
    item.purchaseAvailability.status !== "Available" ||
    !item.fulfillment;

  const resetQuote = () => {
    setPrepared(undefined);
    setPendingListing(undefined);
    attempt.current = undefined;
    setError(undefined);
    setUncertain(false);
    setAcknowledgedRevision(undefined);
    void book.refetch();
  };

  const disabled =
    busy ||
    book.isFetching ||
    uncertain ||
    unavailable ||
    addresses.isPending ||
    areas.isPending ||
    addresses.isError ||
    areas.isError;

  const currentStepIdx = prepared ? 1 : 0;

  return (
    <div
      className={exchangeStyles.exchangeSheet}
      aria-labelledby="buy-now-title"
    >
      <nav
        className={exchangeStyles.handoverNav}
        aria-label="Điều hướng phiếu đặt mua"
      >
        <Link className={exchangeStyles.proposalBack} to={`/books/${listingId}`}>
          <ArrowLeft size={18} aria-hidden="true" />
          Xem lại bản sách
        </Link>
        <span className={exchangeStyles.proposalCode}>
          Phiếu #{listingId.slice(0, 8).toUpperCase()}
        </span>
      </nav>

      <header className={exchangeStyles.handoverHeader}>
        <div>
          <h1 id="buy-now-title">
            {prepared ? "Xác nhận đơn mua" : "Mua ngay"}
          </h1>
          <p>
            Mua sách từ{" "}
            <strong dir="auto" title={item.seller.displayName}>
              {item.seller.displayName}
            </strong>
          </p>
        </div>
        {item.seller.id !== auth.user.id && (
          <Link
            className={exchangeStyles.chatLink}
            to={`/chat/start/${item.id}?intent=Negotiation&openChat=1`}
            style={{ gap: 8, textDecoration: "none" }}
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span>Nhắn cho {item.seller.displayName}</span>
          </Link>
        )}
      </header>

      <nav className={stepStyles.steps} aria-label="Các bước mua sách">
        <ol>
          {BUY_NOW_STEPS.map(({ id, label }, index) => {
            const active = index === currentStepIdx;
            const completed = index < currentStepIdx;
            return (
              <li
                key={id}
                data-current={active || undefined}
                data-selected={active || undefined}
                data-completed={completed || undefined}
              >
                <span
                  className={stepStyles.step}
                  aria-current={active ? "step" : undefined}
                >
                  <span className={stepStyles.marker} aria-hidden="true">
                    {completed ? <Check size={15} strokeWidth={2.6} /> : index + 1}
                  </span>
                  <span className={stepStyles.label}>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className={exchangeStyles.proposalWorkspace}>
        <div className={exchangeStyles.proposalControls}>
          <div className={exchangeStyles.proposalActions}>
            <strong style={{ display: "block", fontSize: "1rem", marginBottom: 6 }}>
              {prepared
                ? "Đã sẵn sàng xác nhận đơn mua"
                : selectedAddress
                  ? "Xác nhận địa chỉ giao nhận"
                  : "Thêm địa chỉ nhận sách"}
            </strong>
            <p
              style={{
                margin: "0 0 14px",
                color: "var(--shop-muted)",
                fontSize: "0.875rem",
                lineHeight: 1.45,
              }}
            >
              {prepared
                ? `Hạn báo giá: ${new Date(prepared.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${new Date(prepared.expiresAt).toLocaleDateString("vi-VN")}`
                : selectedAddress
                  ? `Giao đến: ${selectedAddress.recipientName} (${selectedAddress.phone})`
                  : "Chọn hoặc thêm địa chỉ nhận sách trong khu vực TP.HCM để tính tổng thanh toán."}
            </p>

            {error && (
              <p role="alert" className={styles.error} style={{ marginBottom: 12 }}>
                {error}
                {!busy && !uncertain && !createPending && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={resetQuote}
                    style={{ marginLeft: 8 }}
                  >
                    Tải lại nội dung
                  </button>
                )}
              </p>
            )}

            {unavailable && !prepared && (
              <p role="alert" className={styles.error} style={{ marginBottom: 12 }}>
                {item.seller.id === auth.user.id
                  ? "Bạn không thể tự mua bản sách của chính mình."
                  : !item.fulfillment
                    ? "Bản sách này chưa cấu hình nơi gửi nên chưa thể mua ngay. Hãy nhắn tin với người bán để trao đổi."
                    : "Bản sách này hiện chưa thể mua ngay. Kiểm tra nơi gửi và trạng thái trên bài đăng."}
              </p>
            )}

            {prepared ? (
              <div style={{ display: "grid", gap: 10 }}>
                <button
                  type="button"
                  className={styles.primary}
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={busy}
                  onClick={() => void place()}
                >
                  {busy
                    ? "Đang tạo đơn…"
                    : uncertain
                      ? "Thử lại cùng đơn mua"
                      : "Đặt mua và đến thanh toán"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
                {!createPending && (
                  <button
                    type="button"
                    className={styles.secondary}
                    style={{ width: "100%", justifyContent: "center" }}
                    disabled={busy}
                    onClick={() => {
                      resetQuote();
                      setDialogOpen(true);
                    }}
                  >
                    Đổi địa chỉ / lấy báo giá mới
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {selectedAddress && !item.bundle ? (
                  <button
                    type="button"
                    className={styles.primary}
                    style={{ width: "100%", justifyContent: "center" }}
                    disabled={disabled}
                    onClick={() => void prepare()}
                  >
                    {busy ? "Đang xác nhận…" : "Xác nhận địa chỉ & Tiếp tục"}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={
                    selectedAddress && !item.bundle
                      ? styles.secondary
                      : styles.primary
                  }
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={unavailable}
                  onClick={() => setDialogOpen(true)}
                >
                  Chọn địa chỉ nhận sách
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className={exchangeStyles.proposalContact}>
            <SupportLink type="Listing" id={item.id} />
          </div>
        </div>

        <div className={exchangeStyles.proposalLayout}>
          <section
            aria-labelledby="buy-now-facts"
            className={exchangeStyles.fundingBooks}
          >
            <h2 id="buy-now-facts">Phiếu đặt mua sách</h2>

            <div className={exchangeStyles.proposalBooks} data-receive="true">
              <h3>
                <ArrowDownLeft size={18} aria-hidden="true" />
                Sách bạn nhận
              </h3>
              <div className={exchangeStyles.proposalBook}>
                <div aria-hidden="true">
                  <div>
                    <ListingPhoto book={item} />
                  </div>
                </div>
                <div>
                  <strong className={exchangeStyles.proposalBookTitle}>
                    {listingTitle(item)}
                  </strong>
                  <span className={exchangeStyles.proposalBookAuthor}>
                    {item.book.authors.join(", ")}
                  </span>
                  <span className={exchangeStyles.proposalBookPrice}>
                    {formatVnd(item.salePrice ?? 0)}
                  </span>
                  <details>
                    <summary>Tình trạng sách</summary>
                    <p>
                      {conditions[item.condition]} · {item.description}
                    </p>
                    <p>
                      Bìa và gáy: {item.coverNote || "Chưa ghi rõ"} · Ruột sách:{" "}
                      {item.pages || "Chưa ghi rõ"}
                    </p>
                    <p>
                      {item.hasMissingPages
                        ? "Có trang thiếu theo mô tả người bán."
                        : "Không có trang thiếu theo người bán."}
                    </p>
                  </details>
                </div>
              </div>
            </div>

            <div className={exchangeStyles.proposalBooks}>
              <h3>
                <MapPin size={18} aria-hidden="true" />
                Địa chỉ & Giao nhận
              </h3>
              <div
                className={exchangeStyles.proposalBook}
                style={{ paddingBlock: 12 }}
              >
                <div style={{ display: "none" }} aria-hidden="true" />
                <div style={{ gridColumn: "1 / -1", gap: 6 }}>
                  {prepared ? (
                    <>
                      <strong>Người nhận đã xác nhận</strong>
                      <span>{prepared.destination}</span>
                    </>
                  ) : selectedAddress ? (
                    <>
                      <strong>
                        {selectedAddress.recipientName} · {selectedAddress.phone}
                      </strong>
                      <span>{selectedAddress.detail}</span>
                    </>
                  ) : (
                    <>
                      <strong>Chưa có địa chỉ nhận sách</strong>
                      <span>
                        Bấm &quot;Chọn địa chỉ nhận sách&quot; để thêm nơi nhận.
                      </span>
                    </>
                  )}
                  <span style={{ marginTop: 4 }}>
                    Phương thức: Giao trực tiếp (TP.HCM · Bình Dương · Vũng Tàu)
                  </span>
                  <span style={{ marginTop: 2 }}>
                    Người bán: <strong>{item.seller.displayName}</strong> (cam
                    kết giao trong 48 giờ)
                  </span>
                  <details>
                    <summary>Quy định bảo chứng Mua ngay</summary>
                    <p>
                      Đặt mua giữ sách 15 phút để bạn thanh toán qua ví bảo
                      chứng. Tiền chỉ giải ngân cho người bán sau khi bạn nhận
                      và kiểm tra sách trong 72 giờ.
                    </p>
                  </details>
                </div>
              </div>
            </div>
          </section>

          <section
            className={exchangeStyles.proposalAmounts}
            aria-label="Tóm tắt đơn mua"
          >
            <h2>Nếu xác nhận đặt mua</h2>
            <dl>
              <div>
                <dt>Tiền sách</dt>
                <dd>
                  {formatVnd(
                    prepared?.amounts.bookPrice ?? item.salePrice ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Phí giao hàng</dt>
                <dd>
                  {prepared
                    ? prepared.amounts.shippingFee > 0 ? formatVnd(prepared.amounts.shippingFee) : "Miễn phí"
                    : "Chờ báo giá"}
                </dd>
              </div>
              <div>
                <dt>Bạn cần nộp</dt>
                <dd>
                  <strong>
                    {formatVnd(
                      prepared?.amounts.buyerTotal ?? item.salePrice ?? 0,
                    )}
                  </strong>
                </dd>
              </div>
            </dl>
            <p className={exchangeStyles.proposalAmountNote}>
              {prepared
                ? "Bấm Đặt mua để tạo đơn và chuyển sang bước thanh toán."
                : "Chưa giữ sách hay trừ tiền."}
            </p>
          </section>
        </div>
      </div>

      <PurchaseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        busy={busy}
        className={styles.flow}
        title={prepared ? "Xác nhận đơn mua" : "Địa chỉ nhận sách"}
        description={
          prepared
            ? "Kiểm tra thông tin trước khi chuyển sang thanh toán."
            : "Chọn địa chỉ đã lưu hoặc thêm nơi nhận trong khu vực luân chuyển sách."
        }
      >
        <div className={styles.miniBook}>
          <div className={styles.miniCover}>
            <ListingPhoto book={item} />
          </div>
          <div>
            <strong>{listingTitle(item)}</strong>
            <span>
              {formatVnd(item.salePrice ?? 0)} · {conditions[item.condition]}
            </span>
          </div>
        </div>
        <BundleManifest bundle={item.bundle} />
        {item.bundle && (
          <BundleAcknowledgment
            bundle={item.bundle}
            checked={!!prepared || !!pendingListing || bundleAcknowledged}
            onChange={(checked) =>
              setAcknowledgedRevision(
                checked ? purchaseListingKey(item) : undefined,
              )
            }
            disabled={busy || uncertain || !!prepared}
          />
        )}
        {(addresses.isError || areas.isError) && (
          <div role="alert" className={styles.error}>
            Chưa tải được thông tin giao nhận.{" "}
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                void addresses.refetch();
                void areas.refetch();
              }}
            >
              Thử lại
            </button>
          </div>
        )}
        {(addresses.isPending || areas.isPending) && (
          <p role="status">Đang tải thông tin giao nhận…</p>
        )}
        {unavailable && !prepared && (
          <div className={styles.error}>
            <p>
              {item.seller.id === auth.user.id
                ? "Bạn không thể tự mua bản sách của chính mình."
                : !item.fulfillment
                  ? "Bản sách này người bán chưa cấu hình nơi gửi nên chưa thể xác nhận giao hàng."
                  : "Bản sách này hiện chưa thể mua ngay. Hãy xem lại bài đăng."}
            </p>
            {item.seller.id !== auth.user.id && (
              <Link
                to={`/chat/start/${item.id}`}
                className={styles.textButton}
                style={{ marginTop: "8px", display: "inline-flex" }}
              >
                Nhắn tin với người bán →
              </Link>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
            {!busy && !uncertain && !createPending && (
              <button
                type="button"
                className={styles.textButton}
                onClick={resetQuote}
              >
                Tải lại nội dung bài đăng
              </button>
            )}
          </p>
        )}
        {prepared ? (
          <>
            <div className={styles.destination}>
              <MapPin size={20} aria-hidden="true" />
              <div>
                <h3>Giao đến</h3>
                <p>{prepared.destination}</p>
              </div>
            </div>
            <dl className={styles.receipt}>
              <div>
                <dt>Tiền sách</dt>
                <dd>{formatVnd(prepared.amounts.bookPrice)}</dd>
              </div>
              <div>
                <dt>Phí giao hàng</dt>
                <dd>{prepared.amounts.shippingFee > 0 ? formatVnd(prepared.amounts.shippingFee) : "Miễn phí"}</dd>
              </div>
              <div className={styles.total}>
                <dt>Tổng thanh toán</dt>
                <dd>{formatVnd(prepared.amounts.buyerTotal)}</dd>
              </div>
            </dl>
            <p className={styles.note}>{buyerSaleFeeText(prepared.amounts.commissionBps)}</p>
            <TransactionNotes notes={[
              { label: "Hạn thanh toán", detail: "Sách được giữ 15 phút sau khi đặt mua." },
              ...directOrderHoldNotes("BuyNow"),
              { label: "Sau khi thanh toán", detail: "Người bán chuẩn bị gửi sách trong 48 giờ." },
            ]} />
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() => void place()}
              >
                {busy
                  ? "Đang tạo đơn…"
                  : uncertain
                    ? "Thử lại cùng đơn mua"
                    : "Đặt mua và đến thanh toán"}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              {!createPending && (
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={resetQuote}
                >
                  Đổi địa chỉ / lấy báo giá mới
                </button>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void prepare(event)}>
            <fieldset disabled={disabled}>
              <PurchaseAddressFields
                addresses={existing}
                selected={selectedAddress?.id ?? "new"}
                onSelect={setSelected}
                form={form}
                onChange={setForm}
                localities={areas.data?.localities ?? []}
              />
              <p className={styles.note}>
                Xem tổng thanh toán chưa giữ sách hoặc trừ tiền. Địa chỉ mới
                được lưu vào sổ địa chỉ.
              </p>
              <div className={styles.actions}>
                <button className={styles.primary} type="submit">
                  {busy ? "Đang xác nhận…" : "Xem tổng thanh toán"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </fieldset>
            {uncertain && (
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() =>
                  void prepare({ preventDefault() {} } as React.FormEvent)
                }
              >
                Thử lại bước xác nhận địa chỉ
              </button>
            )}
          </form>
        )}
      </PurchaseDialog>
    </div>
  );
}
