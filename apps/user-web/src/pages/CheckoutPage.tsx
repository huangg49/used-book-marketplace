import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useSession } from "../hooks/useSession";
import { session } from "../lib/session";
import { getPublicListing } from "../services/public-listings";
import { formatVnd } from "../lib/routes";
import { attachPurchaseQuote, getPurchaseConversations } from "../services/purchase-conversations";

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
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", serviceAreas),
    enabled: auth.status === "authenticated",
  });
  const [prepared, setPrepared] = useState<{
    body: {
      quoteId: string;
      expectedQuoteVersion: number;
      expectedListingVersion: number;
      expectedListingRevisionId: string;
    };
    shipping: number;
    key: string;
    attachVersion?: number;
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
    { addressKey: string; quoteKey: string; attachKey: string } | undefined
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
    if (!book.data || busy) return;
    if (!book.data.fulfillment) {
      setError(
        "Người bán chưa hoàn thiện nơi gửi cho bài đăng này nên chưa thể báo giá. Hãy trao đổi để người bán cập nhật trước.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    let phase: "address" | "quote" | "attach" = "address";
    try {
      let address =
        addresses.data?.items.find((item) => item.id === selected) ??
        addresses.data?.items.find((item) => item.isDefault);
      const keys = intent.current ?? {
        addressKey: crypto.randomUUID(),
        quoteKey: crypto.randomUUID(),
        attachKey: crypto.randomUUID(),
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
        shipping: current.amounts.shippingFee,
        key: keys.attachKey,
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
    if (!conversationId) {
      setError("Không tìm thấy hội thoại. Hãy quay lại chat với người bán.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const conversations = await getPurchaseConversations();
      const conversation = conversations.find((item) => item.id === conversationId);
      if (!conversation || conversation.status !== "Active") {
        setError("Hội thoại đã đóng. Hãy kiểm tra trạng thái sách rồi thử lại.");
        return;
      }
      const expectedVersion = prepared.attachVersion ?? conversation.version;
      setPrepared({ ...prepared, attachVersion: expectedVersion });
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
      if (cause instanceof ApiError && cause.status === 409) {
        setError("Hội thoại hoặc báo giá vừa thay đổi. Hãy tạo lại báo giá.");
        intent.current = undefined;
        setPrepared(undefined);
      } else setError(errorText(cause, "attach"));
    } finally {
      setBusy(false);
    }
  }
  const existing = addresses.data?.items ?? [];
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <Link to={`/chat/${conversationId}`}>← Quay lại hội thoại</Link>
      <h1>Gửi địa chỉ và báo giá</h1>
      <p>
        {book.data
          ? `Bạn đang chuẩn bị thông tin giao nhận cho “${book.data.book.title}”.`
          : "Đang kiểm tra thông tin sách…"}{" "}
        Người bán sẽ xem địa chỉ và phí giao nhận trước khi tạo đơn với giá đã thỏa thuận.
      </p>
      {!conversationId && (
        <p role="alert">Thiếu hội thoại. Hãy mở bước này từ cuộc trò chuyện với người bán.</p>
      )}
      {book.data && !book.data.fulfillment && (
        <p role="alert">
          Người bán chưa hoàn thiện nơi gửi cho bài đăng này. Bạn chưa thể tạo
          đơn cho đến khi thông tin giao hàng được cập nhật.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {prepared && (
        <section aria-labelledby="checkout-total">
          <h2 id="checkout-total">Thông tin gửi người bán</h2>
          <p>Phí giao nhận dự kiến: {formatVnd(prepared.shipping)}</p>
          <p>Người bán sẽ nhập giá sách đã thương lượng khi tạo đơn.</p>
          <button
            type="button"
            disabled={busy || !conversationId}
            onClick={() => void confirm()}
          >
            {busy ? "Đang gửi…" : "Gửi báo giá cho người bán"}
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
            {busy ? "Đang tạo báo giá…" : "Xem phí giao nhận"}
          </button>
        </fieldset>
      </form>
    </main>
  );
}
