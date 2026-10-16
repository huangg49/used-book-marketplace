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
import { getPublicListing } from "../services/public-listings";
import { createBuyNowOrder, type BuyNowInput } from "../services/orders";
import styles from "./DirectOrders.module.css";

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
  address?: { key: string; body: object; id?: string };
  quoteKey: string;
  quoteBody?: object;
  quoteId?: string;
};
type Prepared = {
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
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", areasSchema),
    enabled: auth.status === "authenticated",
    retry: false,
  });
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    recipientName: "",
    phone: "",
    localityCode: "",
    detail: "",
  });
  const [prepared, setPrepared] = useState<Prepared>();
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
    setBusy(true);
    setError(undefined);
    const intent = attempt.current ?? { quoteKey: crypto.randomUUID() };
    attempt.current = intent;
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
        expectedListingVersion: book.data.version,
        expectedListingRevisionId: book.data.revisionId,
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
  const item = book.data;
  const unavailable =
    item.seller.id === auth.user.id ||
    item.salePrice === null ||
    item.purchaseAvailability.status !== "Available" ||
    !item.fulfillment;
  return (
    <section className={styles.page} aria-labelledby="buy-now-title">
      <Link className={styles.back} to={`/books/${listingId}`}>
        ← Xem lại bản sách
      </Link>
      <h1 id="buy-now-title">Mua ngay</h1>
      <p className={styles.intro}>
        Mua theo giá niêm yết. Không cần chat hay chờ người bán duyệt đơn.
      </p>
      <div className={styles.columns}>
        <div>
          <section className={styles.section}>
            <h2>{item.book.title}</h2>
            <p>
              {conditions[item.condition]} · {formatVnd(item.salePrice ?? 0)}
            </p>
            <p>{item.description}</p>
            <p>Bìa và gáy: {item.coverNote || "Chưa ghi rõ"}</p>
            <p>Ruột sách: {item.pages || "Chưa ghi rõ"}</p>
            <p>
              {item.hasMissingPages
                ? "Có trang thiếu theo mô tả người bán."
                : "Không có trang thiếu theo người bán."}
            </p>
          </section>
          {unavailable && !prepared && (
            <p role="alert" className={styles.error}>
              Bản sách này hiện chưa thể mua ngay. Kiểm tra nơi gửi và trạng
              thái trên bài đăng.
            </p>
          )}
          {(addresses.isError || areas.isError) && (
            <div role="alert" className={styles.error}>
              Chưa tải được thông tin giao nhận.{" "}
              <button
                onClick={() => {
                  void addresses.refetch();
                  void areas.refetch();
                }}
              >
                Thử lại
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <form onSubmit={(event) => void prepare(event)}>
            <fieldset
              disabled={
                busy ||
                !!prepared ||
                uncertain ||
                unavailable ||
                addresses.isPending ||
                areas.isPending ||
                addresses.isError ||
                areas.isError
              }
            >
              <legend>Địa chỉ nhận tại TP.HCM</legend>
              {existing.map((a) => (
                <label key={a.id} className={styles.address}>
                  <input
                    type="radio"
                    name="destination"
                    checked={selectedAddress?.id === a.id}
                    onChange={() => setSelected(a.id)}
                  />
                  <span>
                    {a.recipientName} · {a.phone}
                    <br />
                    {a.detail}
                  </span>
                </label>
              ))}
              {existing.length > 0 && (
                <label className={styles.address}>
                  <input
                    type="radio"
                    name="destination"
                    checked={selected === "new"}
                    onChange={() => setSelected("new")}
                  />
                  Dùng địa chỉ mới
                </label>
              )}
              {!selectedAddress && (
                <div className={styles.form}>
                  <label>
                    Họ tên
                    <input
                      required
                      minLength={1}
                      maxLength={100}
                      autoComplete="name"
                      value={form.recipientName}
                      onChange={(e) =>
                        setForm({ ...form, recipientName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Số điện thoại
                    <input
                      required
                      type="tel"
                      pattern="0[0-9]{9}"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Khu vực phục vụ
                    <select
                      required
                      value={form.localityCode}
                      onChange={(e) =>
                        setForm({ ...form, localityCode: e.target.value })
                      }
                    >
                      <option value="">Chọn khu vực</option>
                      {areas.data?.localities.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Địa chỉ chi tiết
                    <textarea
                      required
                      minLength={5}
                      maxLength={300}
                      autoComplete="street-address"
                      value={form.detail}
                      onChange={(e) =>
                        setForm({ ...form, detail: e.target.value })
                      }
                    />
                  </label>
                </div>
              )}
              <p>
                Giao trực tiếp từ người bán. Phí giao nhận được tính trước khi
                đặt đơn.
              </p>
              {!prepared && (
                <button className={styles.primary} type="submit">
                  {busy ? "Đang tính phí…" : "Xem tổng thanh toán"}
                </button>
              )}
            </fieldset>
          </form>
          {uncertain && !prepared && (
            <button
              className={styles.primary}
              disabled={busy}
              onClick={() =>
                void prepare({ preventDefault() {} } as React.FormEvent)
              }
            >
              Thử lại bước tính phí
            </button>
          )}
        </div>
        <aside className={styles.summary} aria-labelledby="total-title">
          <h2 id="total-title">Xác nhận đơn mua</h2>
          {prepared ? (
            <>
              <p>{prepared.destination}</p>
              <dl>
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
              <p>
                Bấm đặt mua để giữ cuốn sách 15 phút và chuyển sang thanh toán
                từ ví. Thanh toán thành công là chốt đơn; người bán phải chuẩn
                bị gửi trong 48 giờ.
              </p>
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
              </button>
              {!createPending && (
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => {
                    setPrepared(undefined);
                    attempt.current = undefined;
                    setError(undefined);
                    setUncertain(false);
                  }}
                >
                  Đổi địa chỉ / lấy báo giá mới
                </button>
              )}
            </>
          ) : (
            <p>
              Chọn địa chỉ rồi xem tổng thanh toán. Bước xem phí chưa giữ sách
              hoặc trừ tiền.
            </p>
          )}
          <p className={styles.note}>
            Ví và vận chuyển hiện là mô phỏng của Lật lại. Tiền thanh toán được
            giữ cho đơn, chưa trả ngay cho người bán.
          </p>
          <Link to="/orders">Đơn hàng của tôi</Link>
        </aside>
      </div>
    </section>
  );
}
