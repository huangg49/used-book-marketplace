import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { getPublicListing } from "../services/public-listings";
import { getWalletSummary } from "../services/wallet";
import { formatVnd } from "../lib/routes";

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
const orderReceipt = z.object({
  entityId: z.string().uuid(),
  state: z.string(),
  version: z.number().int(),
});

function errorText(error: unknown, phase: "address" | "quote" | "order") {
  if (!(error instanceof ApiError))
    return "Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Tài khoản chưa có quyền tạo đơn hàng.";
  if (error.status === 409)
    return "Thông tin sách hoặc báo giá vừa thay đổi. Hãy tải lại và tạo lại đơn.";
  if (error.status === 422 && phase === "address")
    return "Địa chỉ chưa hợp lệ. Hãy chọn một khu vực phục vụ trong danh sách.";
  if (error.status === 422 && phase === "quote")
    return "Chưa thể báo giá cho địa chỉ này hoặc sách vừa thay đổi. Hãy kiểm tra lại.";
  if (error.status === 429)
    return "Bạn đã thử nhiều lần. Vui lòng đợi một lúc rồi thử lại.";
  return "Máy chủ chưa thể tạo đơn. Vui lòng thử lại sau.";
}
export function CheckoutPage() {
  const { listingId = "" } = useParams<{ listingId: string }>();
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
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", serviceAreas),
    enabled: auth.status === "authenticated",
  });
  const wallet = useQuery({
    queryKey: [
      "wallet-summary",
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: getWalletSummary,
    enabled: auth.status === "authenticated",
  });
  const [prepared, setPrepared] = useState<{
    body: {
      quoteId: string;
      expectedQuoteVersion: number;
      expectedListingVersion: number;
      expectedListingRevisionId: string;
    };
    total: number;
    shipping: number;
    key: string;
  }>();
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
    { addressKey: string; quoteKey: string; orderKey: string } | undefined
  >(undefined);
  if (auth.status !== "authenticated")
    return (
      <main>
        <h1>Tạo đơn hàng</h1>
        <p>Đăng nhập để nhập địa chỉ nhận sách và tạo đơn.</p>
        <Link
          to={`/login?returnUrl=${encodeURIComponent(`/checkout/${listingId}`)}`}
        >
          Đăng nhập
        </Link>
      </main>
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!book.data || busy) return;
    if (!book.data.fulfillment) {
      setError(
        "Người bán chưa hoàn thiện nơi gửi cho bài đăng này nên chưa thể báo giá. Hãy trao đổi để người bán cập nhật trước.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    let phase: "address" | "quote" | "order" = "address";
    try {
      let address =
        addresses.data?.items.find((item) => item.id === selected) ??
        addresses.data?.items.find((item) => item.isDefault);
      const keys = intent.current ?? {
        addressKey: crypto.randomUUID(),
        quoteKey: crypto.randomUUID(),
        orderKey: crypto.randomUUID(),
      };
      intent.current = keys;
      if (!address) {
        if (
          !areas.data?.localities.some(
            (item) => item.code === form.localityCode,
          )
        ) {
          setError("Hãy chọn một khu vực phục vụ trong danh sách.");
          return;
        }
        const saved = await session.request(
          "/me/addresses",
          z.object({ addressId: z.string().uuid(), version: z.number().int() }),
          {
            method: "POST",
            headers: { "Idempotency-Key": keys.addressKey },
            body: JSON.stringify({
              expectedBookVersion: addresses.data?.version ?? 0,
              address: { ...form, serviceAreaCode: "HCM-DEMO-v1" },
              makeDefault: true,
            }),
          },
        );
        const refreshed = await addresses.refetch();
        address = refreshed.data?.items.find(
          (item) => item.id === saved.addressId,
        );
        if (!address)
          throw new Error(
            "Địa chỉ vừa lưu chưa thể xác nhận. Hãy tải lại trang trước khi tạo đơn.",
          );
      }
      phase = "quote";
      const quoted = await session.request(
        `/listings/${listingId}/quotes`,
        quoteReceipt,
        {
          method: "POST",
          headers: { "Idempotency-Key": keys.quoteKey },
          body: JSON.stringify({
            expectedListingVersion: book.data.version,
            expectedListingRevisionId: book.data.revisionId,
            destinationAddressId: address.id,
            expectedDestinationAddressVersion: address.version,
            method: "DirectDelivery",
          }),
        },
      );
      const current = await session.request(
        `/me/quotes/${quoted.entityId}`,
        quote,
      );
      setPrepared({
        body: {
          quoteId: current.id,
          expectedQuoteVersion: current.version,
          expectedListingVersion: current.listingVersion,
          expectedListingRevisionId: current.listingRevisionId,
        },
        total: current.amounts.buyerTotal,
        shipping: current.amounts.shippingFee,
        key: keys.orderKey,
      });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status)
      )
        intent.current = undefined;
      setError(errorText(cause, phase));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!prepared || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const ordered = await session.request("/orders", orderReceipt, {
        method: "POST",
        headers: { "Idempotency-Key": prepared.key },
        body: JSON.stringify(prepared.body),
      });
      await wallet.refetch();
      navigate(`/account?order=${ordered.entityId}`, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError(
          "Chưa tạo được đơn: số dư, báo giá hoặc trạng thái sách không còn phù hợp. Hãy kiểm tra ví và lấy báo giá mới.",
        );
        await wallet.refetch();
        await book.refetch();
        intent.current = undefined;
        setPrepared(undefined);
      } else setError(errorText(cause, "order"));
    } finally {
      setBusy(false);
    }
  }
  const existing = addresses.data?.items ?? [];
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <Link to="/chat">← Quay lại hội thoại</Link>
      <h1>Tạo đơn hàng</h1>
      <p>
        {book.data
          ? `Bạn đang tạo đơn cho “${book.data.book.title}”.`
          : "Đang kiểm tra thông tin sách…"}{" "}
        Đơn chỉ được hoàn tất sau khi giao nhận và hết thời hạn kiểm tra 72 giờ.
      </p>
      {book.data && !book.data.fulfillment && (
        <p role="alert">
          Người bán chưa hoàn thiện nơi gửi cho bài đăng này. Bạn chưa thể tạo
          đơn cho đến khi thông tin giao hàng được cập nhật.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {wallet.isPending ? (
        <p role="status">Đang kiểm tra số dư ví…</p>
      ) : wallet.data ? (
        <p>
          Số dư khả dụng: {formatVnd(wallet.data.available)} ·{" "}
          <Link to="/wallet">Nạp ví</Link>
        </p>
      ) : (
        <p role="alert">
          Chưa kiểm tra được số dư.{" "}
          <button onClick={() => void wallet.refetch()}>Thử lại</button>
        </p>
      )}
      {prepared && (
        <section aria-labelledby="checkout-total">
          <h2 id="checkout-total">Kiểm tra thanh toán</h2>
          <p>Tiền sách: {formatVnd(prepared.total - prepared.shipping)}</p>
          <p>Phí vận chuyển: {formatVnd(prepared.shipping)}</p>
          <p>
            <strong>Tổng giữ từ ví: {formatVnd(prepared.total)}</strong>
          </p>
          <p>
            Tiền được giữ cho đơn và quyết toán khi giao dịch hoàn tất. Hủy hợp
            lệ sẽ hoàn về ví.
          </p>
          {wallet.data && wallet.data.available < prepared.total && (
            <p role="alert">
              Ví chưa đủ tổng tiền.{" "}
              <Link to="/wallet">Nạp ví trước khi tạo đơn</Link>
            </p>
          )}
          <button
            type="button"
            disabled={
              busy || !wallet.data || wallet.data.available < prepared.total
            }
            onClick={() => void confirm()}
          >
            {busy ? "Đang thanh toán…" : "Thanh toán và tạo đơn hàng"}
          </button>
        </section>
      )}
      <form onSubmit={submit}>
        <fieldset
          disabled={busy || !!prepared}
          style={{ border: 0, padding: 0 }}
        >
          {existing.length > 0 && (
            <fieldset>
              <legend>Chọn địa chỉ đã lưu</legend>
              {existing.map((item) => (
                <label
                  key={item.id}
                  style={{ display: "block", margin: "0.5rem 0" }}
                >
                  <input
                    type="radio"
                    name="address"
                    value={item.id}
                    checked={selected === item.id}
                    onChange={() => setSelected(item.id)}
                  />{" "}
                  {item.recipientName} · {item.phone} · {item.detail}
                </label>
              ))}
            </fieldset>
          )}
          {!selected && (
            <fieldset>
              <legend>Thông tin nhận sách</legend>
              <label>
                Họ tên
                <input
                  required
                  minLength={2}
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
                  pattern="0[0-9]{9}"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Khu vực phục vụ
                <select
                  required
                  value={form.localityCode}
                  disabled={areas.isLoading || areas.isError}
                  onChange={(e) => {
                    intent.current = undefined;
                    setForm({ ...form, localityCode: e.target.value });
                  }}
                >
                  <option value="">
                    {areas.isLoading ? "Đang tải khu vực…" : "Chọn khu vực"}
                  </option>
                  {areas.data?.localities.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {areas.isError && (
                <p role="alert">
                  Chưa tải được danh sách khu vực phục vụ. Hãy tải lại trang.
                </p>
              )}
              <label>
                Địa chỉ chi tiết
                <textarea
                  required
                  minLength={5}
                  value={form.detail}
                  onChange={(e) => setForm({ ...form, detail: e.target.value })}
                />
              </label>
            </fieldset>
          )}
          <button
            type="submit"
            disabled={
              !book.data?.fulfillment ||
              addresses.isLoading ||
              areas.isLoading ||
              areas.isError ||
              busy ||
              !!prepared
            }
          >
            {busy ? "Đang báo giá…" : "Xem tổng tiền đơn hàng"}
          </button>
        </fieldset>
      </form>
    </main>
  );
}
