import { BundleManifest, BundleAcknowledgment } from "../components/BookBundle";
import { listingTitle } from "../lib/book-bundle";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { z } from "zod";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { getPublicListing, type PublicListing } from "../services/public-listings";
import { capturePurchaseListing, purchaseListingKey } from "../lib/purchase-listing";
import { formatVnd } from "../lib/routes";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { PurchaseAddressFields } from "../components/PurchaseAddressFields";
import { ListingPhoto } from "../components/BookCard";
import { MapPin, ArrowRight } from "lucide-react";
import styles from "./PurchaseFlow.module.css";
import {
  attachPurchaseQuote,
  getPurchaseConversations,
} from "../services/purchase-conversations";

const addressBook = z.object({
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
const serviceAreas = z.object({
  code: z.literal("HCM-DEMO-v1"),
  name: z.literal("TP.HCM"),
  demoOnly: z.literal(true),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});
const quoteReceipt = z.object({ entityId: z.string().uuid() });
const quote = z.object({
  id: z.string().uuid(),
  version: z.literal(1),
  listingVersion: z.number().int(),
  listingRevisionId: z.string().uuid(),
  expiresAt: z.string(),
  amounts: z.object({
    buyerTotal: z.number().int(),
    shippingFee: z.number().int(),
    sellerProceedsOnCompletion: z.number().int(),
  }),
});
const uncertainResult = "Chưa xác nhận được kết quả. Hãy thử lại cùng thao tác; thông tin đã nhập được giữ nguyên.";
function errorText(error: unknown, phase: "address" | "quote" | "attach") {
  if (!(error instanceof ApiError))
    return "Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Tài khoản chưa có quyền gửi báo giá.";
  if (error.status === 409)
    return "Thông tin sách hoặc báo giá vừa thay đổi. Hãy tải lại và tạo lại đơn.";
  if (error.status === 422 && phase === "address")
    return "Địa chỉ chưa hợp lệ. Hãy chọn một khu vực phục vụ trong danh sách.";
  if (error.status === 422 && phase === "quote")
    return "Chưa thể báo giá cho địa chỉ này hoặc sách vừa thay đổi. Hãy kiểm tra lại.";
  if (error.status === 429)
    return "Bạn đã thử nhiều lần. Vui lòng đợi một lúc rồi thử lại.";
  return phase === "attach"
    ? "Chưa thể gửi báo giá cho người bán. Vui lòng thử lại."
    : "Máy chủ chưa thể tạo báo giá. Vui lòng thử lại sau.";
}
export function CheckoutPage() {
  const { listingId = "" } = useParams<{ listingId: string }>();
  const [params] = useSearchParams();
  const auth = useSession();
  return <CheckoutListing key={`${auth.status === 'authenticated' ? auth.user.id : 'guest'}:${listingId}:${params.get('conversationId') ?? ''}`} />;
}

function CheckoutListing() {
  const [acknowledgedRevision, setAcknowledgedRevision] = useState<string>();
  const { listingId = "" } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("conversationId") ?? "";
  const auth = useSession();
  const navigate = useNavigate();
  const book = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => getPublicListing(listingId),
    enabled: /^[0-9a-f-]{36}$/i.test(listingId),
  });
  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBook),
    enabled: auth.status === "authenticated",
  });
  const bundleAcknowledged = !!book.data && acknowledgedRevision === purchaseListingKey(book.data);
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", serviceAreas),
    enabled: auth.status === "authenticated",
  });
  const [prepared, setPrepared] = useState<{
    listing: PublicListing;
    body: {
      quoteId: string;
      expectedQuoteVersion: number;
      expectedListingVersion: number;
      expectedListingRevisionId: string;
    };
    shipping: number;
    destination: string;
    key: string;
    attachVersion?: number;
  }>();
  const [dialogOpen, setDialogOpen] = useState(true);
  const [pendingListing, setPendingListing] = useState<PublicListing>();
  const [retryPending, setRetryPending] = useState(false);
  const [attachPending, setAttachPending] = useState(false);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    recipientName: "",
    phone: "",
    localityCode: "",
    detail: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const intent = useRef<
    | {
        listing: PublicListing;
        addressKey: string;
        quoteKey: string;
        attachKey: string;
        addressBody?: string;
        addressId?: string;
        quoteBody?: string;
        quoteId?: string;
      }
    | undefined
  >(undefined);
  if (auth.status !== "authenticated")
    return (
      <main>
        <h1>Gửi địa chỉ và báo giá</h1>
        <p>Đăng nhập để gửi địa chỉ nhận sách cho người bán.</p>
        <Link
          to={`/login?returnUrl=${encodeURIComponent(`/checkout/${listingId}?conversationId=${conversationId}`)}`}
        >
          Đăng nhập
        </Link>
      </main>
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!book.data || !addresses.data || !areas.data || busy) return;
    if (!(intent.current?.listing ?? book.data).fulfillment) {
      setError(
        "Người bán chưa hoàn thiện nơi gửi cho bài đăng này nên chưa thể báo giá. Hãy trao đổi để người bán cập nhật trước.",
      );
      return;
    }
    if (!intent.current && book.data.bundle && !bundleAcknowledged) {
      setError('Xem danh sách và xác nhận mua toàn bộ các cuốn trong bộ.');
      return;
    }
    setBusy(true);
    setError(undefined);
    let phase: "address" | "quote" | "attach" = "address";
    try {
      let address =
        selected === "new"
          ? undefined
          : (addresses.data?.items.find((item) => item.id === selected) ??
            addresses.data?.items.find((item) => item.isDefault) ??
            addresses.data?.items[0]);
      const keys: NonNullable<typeof intent.current> = intent.current ?? {
        listing: capturePurchaseListing(book.data, acknowledgedRevision),
        addressKey: crypto.randomUUID(),
        quoteKey: crypto.randomUUID(),
        attachKey: crypto.randomUUID(),
      };
      intent.current = keys;
      setPendingListing(keys.listing);
      if (!address || keys.addressBody) {
        if (
          !areas.data?.localities.some(
            (item) => item.code === form.localityCode,
          )
        ) {
          setError("Hãy chọn một khu vực phục vụ trong danh sách.");
          if (!keys.addressBody && !keys.quoteBody) {
            intent.current = undefined;
            setPendingListing(undefined);
          }
          return;
        }
        keys.addressBody ??= JSON.stringify({
          expectedBookVersion: addresses.data.version,
          address: { ...form, serviceAreaCode: "HCM-DEMO-v1" },
          makeDefault: true,
        });
        if (!keys.addressId) {
          const saved = await session.request(
            "/me/addresses",
            z.object({
              addressId: z.string().uuid(),
              version: z.number().int(),
            }),
            {
              method: "POST",
              headers: { "Idempotency-Key": keys.addressKey },
              body: keys.addressBody,
            },
          );
          keys.addressId = saved.addressId;
        }
        const refreshed = await addresses.refetch();
        address = refreshed.data?.items.find(
          (item) => item.id === keys.addressId,
        );
        if (!address)
          throw new Error(
            "Địa chỉ vừa lưu chưa thể xác nhận. Hãy tải lại trang trước khi tạo đơn.",
          );
      }
      // A confirmed new address becomes the selection even if quoting fails.
      setSelected(address.id);
      phase = "quote";
      keys.quoteBody ??= JSON.stringify({
        expectedListingVersion: keys.listing.version,
        expectedListingRevisionId: keys.listing.revisionId,
        ...(keys.listing.bundle ? { acknowledgeWholeBundle: true } : {}),
        destinationAddressId: address.id,
        expectedDestinationAddressVersion: address.version,
        method: "DirectDelivery",
      });
      if (!keys.quoteId) {
        const quoted = await session.request(
          `/listings/${listingId}/quotes`,
          quoteReceipt,
          {
            method: "POST",
            headers: { "Idempotency-Key": keys.quoteKey },
            body: keys.quoteBody,
          },
        );
        keys.quoteId = quoted.entityId;
      }
      const current = await session.request(
        `/me/quotes/${keys.quoteId}`,
        quote,
      );
      setRetryPending(false);
      setPrepared({
        listing: keys.listing,
        destination: `${address.recipientName} · ${address.phone} · ${address.detail}`,
        body: {
          quoteId: current.id,
          expectedQuoteVersion: current.version,
          expectedListingVersion: current.listingVersion,
          expectedListingRevisionId: current.listingRevisionId,
        },
        shipping: current.amounts.shippingFee,
        key: keys.attachKey,
      });
    } catch (cause) {
      const definitelyFailed =
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status);
      if (definitelyFailed) {
        intent.current = undefined;
        setPendingListing(undefined);
        setRetryPending(false);
      } else setRetryPending(true);
      setError(definitelyFailed ? errorText(cause, phase) : uncertainResult);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!prepared || busy) return;
    if (!conversationId) {
      setError("Không tìm thấy hội thoại. Hãy quay lại chat với người bán.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const conversations = await getPurchaseConversations();
      const conversation = conversations.find(
        (item) => item.id === conversationId,
      );
      if (!conversation || conversation.status !== "Active") {
        setError(
          "Hội thoại đã đóng. Hãy kiểm tra trạng thái sách rồi thử lại.",
        );
        return;
      }
      const expectedVersion = prepared.attachVersion ?? conversation.version;
      setPrepared({ ...prepared, attachVersion: expectedVersion });
      setAttachPending(true);
      await attachPurchaseQuote(
        conversationId,
        {
          expectedVersion,
          quoteId: prepared.body.quoteId,
          expectedQuoteVersion: prepared.body.expectedQuoteVersion,
          expectedListingVersion: prepared.body.expectedListingVersion,
          expectedListingRevisionId: prepared.body.expectedListingRevisionId,
        },
        prepared.key,
      );
      navigate(`/chat/${conversationId}`, { replace: true });
    } catch (cause) {
      const definitelyFailed = cause instanceof ApiError && [400, 403, 404, 409, 422, 429].includes(cause.status);
      if (definitelyFailed) setAttachPending(false);
      if (cause instanceof ApiError && cause.status === 409) {
        setError("Hội thoại hoặc báo giá vừa thay đổi. Hãy tạo lại báo giá.");
        intent.current = undefined;
        setPrepared(undefined);
        setPendingListing(undefined);
      } else setError(definitelyFailed ? errorText(cause, "attach") : uncertainResult);
    } finally {
      setBusy(false);
    }
  }
  const existing = addresses.data?.items ?? [];
  const displayedListing = prepared?.listing ?? pendingListing ?? book.data;
  function reloadListing() {
    if (busy || retryPending || attachPending) return;
    intent.current = undefined;
    setPrepared(undefined);
    setPendingListing(undefined);
    setAcknowledgedRevision(undefined);
    setError(undefined);
    void book.refetch();
  }
  const selectedAddress =
    selected === "new"
      ? undefined
      : (existing.find((item) => item.id === selected) ??
        existing.find((item) => item.isDefault) ??
        existing[0]);
  const disabled =
    busy ||
    book.isFetching ||
    retryPending ||
    !book.data?.fulfillment ||
    !conversationId ||
    addresses.isPending ||
    addresses.isError ||
    areas.isPending ||
    areas.isError;
  return (
    <section className={styles.page}>
      <Link className={styles.back} to={`/chat/${conversationId}`}>
        ← Quay lại hội thoại
      </Link>
      <header className={styles.pageHeader}>
        <h1>Thông tin giao nhận</h1>
        <p>
          Gửi địa chỉ và phí giao hàng để người bán tạo đơn với giá đã thỏa
          thuận.
        </p>
      </header>
      <div className={styles.columns}>
        <div>
          {displayedListing && (
            <section className={styles.book}>
              <div className={styles.cover}>
                <ListingPhoto book={displayedListing} />
              </div>
              <div>
                <h2>{listingTitle(displayedListing)}</h2>
                <p>{displayedListing.book.authors.join(", ")}</p>
                <p>Người bán: {displayedListing.seller.displayName}</p>
              </div>
            </section>
          )}
          {book.isPending && <p role="status">Đang tải thông tin sách…</p>}
          {book.isError && (
            <p role="alert" className={styles.error}>
              Chưa tải được sách.{" "}
              <button
                className={styles.textButton}
                onClick={() => void book.refetch()}
              >
                Thử lại
              </button>
            </p>
          )}
          <section className={styles.delivery}>
            <div className={styles.sectionHeading}>
              <MapPin size={21} aria-hidden="true" />
              <h2>Địa chỉ nhận sách</h2>
            </div>
            <p>
              {prepared?.destination ??
                "Chọn nơi nhận và kiểm tra phí trước khi gửi người bán."}
            </p>
            <button
              className={styles.textButton}
              onClick={() => setDialogOpen(true)}
            >
              Mở form giao nhận
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </section>
        </div>
        <aside className={styles.summary}>
          <h2>Bước tiếp theo</h2>
          <p>
            Người bán xem thông tin giao nhận, nhập giá sách đã thương lượng và
            tạo đơn. Bạn thanh toán sau khi kiểm tra đơn.
          </p>
          <button
            className={styles.primary}
            onClick={() => setDialogOpen(true)}
          >
            {prepared ? "Xem báo giá giao nhận" : "Gửi địa chỉ và báo giá"}
          </button>
          <p className={styles.note}>
            Gửi báo giá chưa giữ sách hoặc trừ tiền. Ví và giao nhận hiện là mô
            phỏng.
          </p>
        </aside>
      </div>
      <PurchaseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        busy={busy}
        className={styles.flow}
        title={prepared ? "Gửi báo giá cho người bán" : "Địa chỉ nhận sách"}
        description={
          prepared
            ? "Người bán dùng thông tin này để tạo đơn với giá hai bên đã thỏa thuận."
            : "Chọn khu vực luân chuyển và nơi nhận để xem phí giao nhận."
        }
      >
        {displayedListing && (
          <div className={styles.miniBook}>
            <div className={styles.miniCover}>
              <ListingPhoto book={displayedListing} />
            </div>
            <strong>{listingTitle(displayedListing)}</strong>
          </div>
        )}
        {!conversationId && (
          <p role="alert" className={styles.error}>
            Thiếu hội thoại. Hãy mở bước này từ cuộc trò chuyện với người bán.
          </p>
        )}
        {book.data && !book.data.fulfillment && (
          <p role="alert" className={styles.error}>
            Người bán chưa hoàn thiện nơi gửi. Hãy trao đổi để người bán cập
            nhật.
          </p>
        )}
        <BundleManifest bundle={displayedListing?.bundle} />
        {displayedListing?.bundle && <BundleAcknowledgment bundle={displayedListing.bundle} checked={!!prepared || !!pendingListing || bundleAcknowledged} onChange={checked => setAcknowledgedRevision(checked ? purchaseListingKey(displayedListing) : undefined)} disabled={busy || retryPending || !!prepared} />}
        {(addresses.isError || areas.isError) && (
          <p role="alert" className={styles.error}>
            Chưa tải được thông tin giao nhận.{" "}
            <button
              className={styles.textButton}
              onClick={() => {
                void addresses.refetch();
                void areas.refetch();
              }}
            >
              Thử lại
            </button>
          </p>
        )}
        {(addresses.isPending || areas.isPending) && (
          <p role="status">Đang tải thông tin giao nhận…</p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
            {!busy && !retryPending && !attachPending && <button type="button" className={styles.textButton} onClick={reloadListing}>Tải lại nội dung bài đăng</button>}
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
              <div className={styles.total}>
                <dt>Phí giao nhận dự kiến</dt>
                <dd>{formatVnd(prepared.shipping)}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              Người bán nhập giá sách khi tạo đơn. Bước này chỉ gửi thông tin
              giao nhận, chưa đặt mua.
            </p>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={busy || !conversationId}
                onClick={() => void confirm()}
              >
                {busy ? "Đang gửi…" : "Gửi báo giá cho người bán"}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
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
                Địa chỉ mới được lưu vào sổ địa chỉ của bạn.
              </p>
              <div className={styles.actions}>
                <button className={styles.primary} type="submit">
                  {busy ? "Đang tạo báo giá…" : "Xem phí giao nhận"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </fieldset>
            {retryPending && (
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() =>
                  void submit({ preventDefault() {} } as React.FormEvent)
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
