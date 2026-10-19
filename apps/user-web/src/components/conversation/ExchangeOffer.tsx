import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { session } from "../../lib/session";
import { getMyListings, getMyBookIdentity } from "../../services/my-listings";
import { exchangeSchema } from "../../services/exchange";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import type { PublicListing } from "../../services/public-listings";
import { FilterSelect } from "../FilterSelect";
import { formatVnd } from "../../lib/routes";
import styles from "./Conversation.module.css";

const addressSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      recipientName: z.string(),
      detail: z.string(),
      isDefault: z.boolean(),
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
          ["Both", "Exchange"].includes(row.currentRevision.content.mode ?? ""),
      ),
    );
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      value: row.currentRevision.content.exchangeValue!,
      book: await getMyBookIdentity(
        row.currentRevision.content.bookId!,
        row.catalogStatus,
      ),
    })),
  );
}
export function ExchangeOffer({
  room,
  userId,
  book,
  refresh,
}: {
  room: PurchaseConversation;
  userId: string;
  book: PublicListing;
  refresh: () => void;
}) {
  const buyer = room.buyer.id === userId;
  const mine = useQuery({
    queryKey: ["conversation-exchange-inventory", userId],
    queryFn: inventory,
    enabled: buyer,
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["conversation-addresses", userId],
    queryFn: () => session.request("/me/addresses", addressSchema),
    enabled: buyer,
    retry: false,
  });
  const [chosen, setChosen] = useState<string[]>([]),
    [address, setAddress] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{ body: object; key: string } | null>(null);
  if (!buyer)
    return (
      <div className={styles.proposal}>
        <h3>Chờ người mua chọn sách đem đổi</h3>
        <p>
          Đề nghị và tiền bù sẽ hiện trên phiếu này. Bạn kiểm tra rồi quyết định
          chấp nhận hoặc đề xuất lại.
        </p>
      </div>
    );
  if (mine.isPending || addresses.isPending)
    return <p role="status">Đang tải kệ sách và nơi nhận của bạn…</p>;
  if (mine.isError || addresses.isError)
    return (
      <div role="alert">
        <p>Chưa tải được dữ liệu để đổi sách.</p>
        <button
          type="button"
          onClick={() => {
            void mine.refetch();
            void addresses.refetch();
          }}
        >
          Thử tải lại
        </button>
      </div>
    );
  const selected = mine.data?.filter((x) => chosen.includes(x.id)) ?? [];
  const total = selected.reduce((n, b) => n + b.value, 0),
    difference = (book.exchangeValue ?? 0) - total;
  const addressId =
    address ||
    addresses.data?.items.find((a) => a.isDefault)?.id ||
    addresses.data?.items[0]?.id ||
    "";
  async function submit() {
    if (busy) return;
    if (!attempt.current && (!chosen.length || !addressId)) {
      setError("Chọn sách đem đổi và một địa chỉ nhận của bạn.");
      return;
    }
    attempt.current ??= {
      key: crypto.randomUUID(),
      body: {
        conversationId: room.id,
        expectedConversationVersion: room.version,
        initiatorListingIds: chosen,
        recipientListingId: room.listingId,
        deliveryAddressId: addressId,
      },
    };
    setBusy(true);
    setError("");
    try {
      await session.request("/exchanges", exchangeSchema, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body: JSON.stringify(attempt.current.body),
      });
      attempt.current = null;
      setUncertain(false);
      refresh();
    } catch (e) {
      const terminal =
        e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status);
      if (terminal) {
        attempt.current = null;
        setUncertain(false);
        refresh();
        void mine.refetch();
      } else setUncertain(true);
      setError(
        terminal
          ? "Sách hoặc điều kiện vừa thay đổi. Kiểm tra lại phiếu; lựa chọn của bạn vẫn được giữ."
          : "Chưa xác nhận được đề nghị đã gửi. Thử lại sẽ dùng đúng yêu cầu này.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.exchangeOffer} aria-label="Chọn sách đem đổi">
      <h3>Sách bạn đem đổi</h3>
      {!mine.data?.length ? (
        <p>
          Bạn chưa có sách sẵn sàng để đổi. <Link to="/sell">Đăng sách</Link>{" "}
          hoặc <Link to="/my-books">xem kệ của bạn</Link>.
        </p>
      ) : (
        <>
          <fieldset disabled={busy || uncertain}>
            <legend>Chọn từ kệ của bạn</legend>
            <div className={styles.inventory}>
              {mine.data.map((item) => (
                <label key={item.id} className={styles.inventoryItem}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(item.id)}
                    onChange={(e) =>
                      setChosen((ids) =>
                        e.target.checked
                          ? [...ids, item.id]
                          : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>{item.book.title}</strong>
                    <small>
                      {item.book.authors.join(", ")} · {formatVnd(item.value)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            {addresses.data?.items.length ? (
              <FilterSelect
                id={`exchange-address-${room.id}`}
                label="Địa chỉ nhận sách của bạn"
                value={addressId}
                options={addresses.data.items.map((a) => ({
                  value: a.id,
                  label: `${a.recipientName} · ${a.detail}`,
                }))}
                onChange={setAddress}
              />
            ) : (
              <p>
                Thêm địa chỉ nhận tại <Link to="/profile">Tài khoản</Link> trước
                khi gửi đề nghị.
              </p>
            )}
          </fieldset>
          {!!selected.length && (
            <dl className={styles.totals}>
              <div>
                <dt>Sách bạn muốn nhận</dt>
                <dd>{formatVnd(book.exchangeValue!)}</dd>
              </div>
              <div>
                <dt>Tổng giá trị sách bạn gửi</dt>
                <dd>{formatVnd(total)}</dd>
              </div>
              <div>
                <dt>Tiền bù dự kiến</dt>
                <dd>
                  {difference > 0
                    ? `Bạn bù ${formatVnd(difference)}`
                    : difference < 0
                      ? `Đối tác bù ${formatVnd(-difference)}`
                      : "Ngang giá"}
                </dd>
              </div>
            </dl>
          )}
          <p className={styles.help}>
            Gửi đề nghị chưa giữ sách. Hệ thống xác nhận tiền bù và tiền bảo
            chứng khi hai bên chốt trao đổi.
          </p>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || (!uncertain && (!chosen.length || !addressId))}
            onClick={() => void submit()}
          >
            {busy
              ? "Đang gửi…"
              : uncertain
                ? "Thử lại đề nghị trước"
                : "Gửi đề nghị đổi sách"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
