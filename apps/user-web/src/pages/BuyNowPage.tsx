import { BundleManifest, BundleAcknowledgment } from "../components/BookBundle";
import { listingTitle } from "../lib/book-bundle";
import { buyNowError } from "../lib/buy-now-error";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { formatVnd } from "../lib/routes";
import { conditions } from "../lib/listing-labels";
import { getPublicListing, type PublicListing } from "../services/public-listings";
import { capturePurchaseListing, purchaseListingKey } from "../lib/purchase-listing";
import { createBuyNowOrder, type BuyNowInput } from "../services/orders";
import { ListingPhoto } from "../components/BookCard";
import { MapPin, ArrowRight, Check, Truck } from "lucide-react";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { PurchaseAddressFields } from "../components/PurchaseAddressFields";
import styles from "./PurchaseFlow.module.css";

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

export function BuyNowPage() {
  const { listingId = "" } = useParams<{ listingId: string }>();
  const auth = useSession();
  return <BuyNowListing key={`${auth.status === 'authenticated' ? auth.user.id : 'guest'}:${listingId}`} />;
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
  });
  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBook),
    enabled: auth.status === "authenticated",
    retry: false,
  });
  const bundleAcknowledged = !!book.data && acknowledgedRevision === purchaseListingKey(book.data);
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", areasSchema),
    enabled: auth.status === "authenticated",
    retry: false,
  });
  const [dialogOpen, setDialogOpen] = useState(true);
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
  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !book.data || !addresses.data || !areas.data) return;
    if (!attempt.current && book.data.bundle && !bundleAcknowledged) {
      setError('Xem danh sách và xác nhận mua toàn bộ các cuốn trong bộ.');
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
      <section className={styles.page}>
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
      </section>
    );
  if (book.isPending)
    return (
      <section className={styles.page} role="status">
        Đang tải sách…
      </section>
    );
  if (!book.data)
    return (
      <section className={styles.page}>
        <h1>Chưa tải được sách</h1>
        <p role="alert">Sách có thể đã được gỡ hoặc kết nối đang gián đoạn.</p>
        <button onClick={() => void book.refetch()}>Thử lại</button>
        <Link to="/books">Về kệ sách</Link>
      </section>
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
  const addressText =
    prepared?.destination ??
    (selectedAddress
      ? `${selectedAddress.recipientName} · ${selectedAddress.phone} · ${selectedAddress.detail}`
      : "Thêm địa chỉ để tính phí giao hàng chính xác.");
  const disabled =
    busy ||
    book.isFetching ||
    uncertain ||
    unavailable ||
    addresses.isPending ||
    areas.isPending ||
    addresses.isError ||
    areas.isError;
  return (
    <section className={styles.page} aria-labelledby="buy-now-title">
      <Link className={styles.back} to={`/books/${listingId}`}>
        ← Xem lại bản sách
      </Link>
      <header className={styles.pageHeader}>
        <h1 id="buy-now-title">Mua ngay</h1>
        <p>
          Chọn địa chỉ, xem tổng thanh toán và xác nhận bản sách bạn muốn mua.
        </p>
      </header>
      <ol className={styles.steps} aria-label="Các bước mua sách">
        <li aria-current={!prepared ? "step" : undefined}>
          <span>{prepared ? <Check size={16} aria-hidden="true" /> : "1"}</span>
          Địa chỉ nhận
        </li>
        <li aria-current={prepared ? "step" : undefined}>
          <span>2</span>Xác nhận đơn
        </li>
        <li>
          <span>3</span>Thanh toán
        </li>
      </ol>
      <div className={styles.columns}>
        <div>
          <section className={styles.book} aria-label="Bản sách bạn chọn">
            <div className={styles.cover}>
              <ListingPhoto book={item} />
            </div>
            <div>
              <h2>{listingTitle(item)}</h2>
              <p>{item.book.authors.join(", ")}</p>
              <span className={styles.condition}>
                {conditions[item.condition]}
              </span>
              <p className={styles.price}>{formatVnd(item.salePrice ?? 0)}</p>
              <p>Người bán: {item.seller.displayName}</p>
            </div>
          </section>
          <section className={styles.delivery}>
            <div className={styles.sectionHeading}>
              <MapPin size={21} aria-hidden="true" />
              <h2>Địa chỉ nhận sách</h2>
            </div>
            <p>{addressText}</p>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setDialogOpen(true)}
            >
              {prepared
                ? "Xem thông tin giao nhận"
                : selectedAddress
                  ? "Chọn / đổi địa chỉ"
                  : "Thêm địa chỉ nhận sách"}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </section>
          <details className={styles.details}>
            <summary>Xem lại tình trạng sách</summary>
            <p>{item.description}</p>
            <p>Bìa và gáy: {item.coverNote || "Chưa ghi rõ"}</p>
            <p>Ruột sách: {item.pages || "Chưa ghi rõ"}</p>
            <p>
              {item.hasMissingPages
                ? "Có trang thiếu theo mô tả người bán."
                : "Không có trang thiếu theo người bán."}
            </p>
          </details>
        </div>
        <aside className={styles.summary} aria-label="Tóm tắt đơn mua">
          <h2>Đơn mua của bạn</h2>
          <dl>
            <div>
              <dt>Tiền sách</dt>
              <dd>
                {formatVnd(prepared?.amounts.bookPrice ?? item.salePrice ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Phí giao hàng</dt>
              <dd>
                {prepared
                  ? formatVnd(prepared.amounts.shippingFee)
                  : "Chờ địa chỉ"}
              </dd>
            </div>
            <div className={styles.total}>
              <dt>Tổng thanh toán</dt>
              <dd>
                {prepared
                  ? formatVnd(prepared.amounts.buyerTotal)
                  : "Chưa tính phí giao"}
              </dd>
            </div>
          </dl>
          <button
            className={styles.primary}
            disabled={unavailable && !prepared}
            onClick={() => setDialogOpen(true)}
          >
            {prepared ? "Tiếp tục đặt mua" : "Chọn địa chỉ nhận sách"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <p className={styles.note}>
            Mua theo giá niêm yết, không cần chat hay chờ người bán duyệt lại.
          </p>
          <p className={styles.note}>
            <Truck size={18} aria-hidden="true" />
            Ví và vận chuyển hiện là mô phỏng của Lật lại.
          </p>
          <Link to="/orders">Đơn hàng của tôi</Link>
        </aside>
      </div>
      {unavailable && !prepared && (
        <p role="alert" className={styles.error}>
          {item.seller.id === auth.user.id
            ? "Bạn không thể tự mua bản sách của chính mình."
            : !item.fulfillment
              ? "Bản sách này chưa cấu hình nơi gửi nên chưa thể mua ngay. Hãy nhắn tin với người bán để trao đổi."
              : "Bản sách này hiện chưa thể mua ngay. Kiểm tra nơi gửi và trạng thái trên bài đăng."}
        </p>
      )}
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
        {item.bundle && <BundleAcknowledgment bundle={item.bundle} checked={!!prepared || !!pendingListing || bundleAcknowledged} onChange={checked => setAcknowledgedRevision(checked ? purchaseListingKey(item) : undefined)} disabled={busy || uncertain || !!prepared} />}
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
                  ? "Bản sách này người bán chưa cấu hình nơi gửi nên chưa thể tính phí giao ngay."
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
            {!busy && !uncertain && !createPending && <button type="button" className={styles.textButton} onClick={resetQuote}>Tải lại nội dung bài đăng</button>}
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
                <dd>{formatVnd(prepared.amounts.shippingFee)}</dd>
              </div>
              <div className={styles.total}>
                <dt>Tổng thanh toán</dt>
                <dd>{formatVnd(prepared.amounts.buyerTotal)}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              Đặt mua sẽ giữ sách 15 phút để bạn thanh toán từ ví. Thanh toán
              thành công là chốt đơn; người bán chuẩn bị gửi trong 48 giờ.
            </p>
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
                Xem phí chưa giữ sách hoặc trừ tiền. Địa chỉ mới được lưu vào sổ
                địa chỉ.
              </p>
              <div className={styles.actions}>
                <button className={styles.primary} type="submit">
                  {busy ? "Đang tính phí…" : "Xem tổng thanh toán"}
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
                Thử lại bước tính phí
              </button>
            )}
          </form>
        )}
      </PurchaseDialog>
    </section>
  );
}
