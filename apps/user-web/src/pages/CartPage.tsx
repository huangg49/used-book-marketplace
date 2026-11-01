import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  accountErrorMessage,
  cartSchema,
  readCart,
  changeCart,
  pendingCartCommand,
} from "@used-books/session-client";
import { session } from "../lib/session";
import { useSession } from "../hooks/useSession";
import { publicListingSchema } from "../services/public-listings";
import { ListingPhoto } from "../components/BookCard";
import { listingTitle } from "../lib/book-bundle";
import { formatVnd } from "../lib/routes";
import styles from "./CartPage.module.css";
const schema = cartSchema(publicListingSchema);
export function CartPage() {
  const state = useSession();
  if (state.status === "loading")
    return <p role="status">Đang khôi phục phiên…</p>;
  if (state.status !== "authenticated")
    return (
      <section className={styles.page}>
        <h1>Giỏ sách</h1>
        <p>Đăng nhập để xem giỏ của bạn.</p>
        <Link to="/login?returnTo=%2Fcart">Đăng nhập</Link>
      </section>
    );
  return <CartContent key={state.user.id} owner={state.user.id} />;
}
function CartContent({ owner }: { owner: string }) {
  const result = useQuery({
    queryKey: ["member-cart", owner],
    queryFn: () => readCart(session, schema),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [needsRead, setNeedsRead] = useState(false);
  const pending = pendingCartCommand(session),
    disabled = busy || pending || needsRead;
  async function refresh() {
    const r = await result.refetch();
    if (r.error) throw r.error;
    setError("");
    setNeedsRead(false);
  }
  async function remove(listingId?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeCart(
        session,
        listingId ? { action: "remove", listingId } : null,
        () => crypto.randomUUID(),
      );
      setNeedsRead(true);
      setMessage("Đã cập nhật giỏ sách.");
      await refresh();
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.page}>
      <Link to="/books">← Tiếp tục xem sách</Link>
      <h1>Giỏ sách</h1>
      <p>
        Tối đa 50 bài đăng, mỗi bài một dòng. Thêm giỏ chưa giữ chỗ; chọn một
        bài để mua, giá và khả năng mua được kiểm lại ở bước thanh toán.
      </p>
      <button
        type="button"
        disabled={busy || result.isFetching}
        onClick={() =>
          void refresh().catch((e) => setError(accountErrorMessage(e)))
        }
      >
        Cập nhật giỏ sách
      </button>
      <p>
        <Link to="/orders">Đơn hàng của tôi</Link>
      </p>
      {result.isPending && <p role="status">Đang tải giỏ sách…</p>}
      {result.error && (
        <p role="alert">
          Chưa tải được giỏ. {accountErrorMessage(result.error)}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {needsRead && (
        <p role="status">
          Lệnh đã ghi nhận. Tải lại giỏ để xem trạng thái mới trước khi chọn
          tiếp.
        </p>
      )}
      {pending && (
        <div>
          <p>
            Chưa xác nhận được thao tác giỏ trước. Giữ nguyên yêu cầu khi thử
            lại.
          </p>
          <button disabled={busy} onClick={() => void remove()}>
            Xác minh thao tác giỏ trước
          </button>
        </div>
      )}
      {result.data && (
        <>
          <p>
            {result.data.items.length}/50 bài đăng trong giỏ. Không có thao tác
            mua nhiều bài cùng lúc.
          </p>
          {!result.data.items.length && !result.error && (
            <div>
              <h2>Giỏ sách đang trống</h2>
              <Link to="/books">Tìm sách để thêm vào giỏ</Link>
            </div>
          )}
          <ul className={styles.items}>
            {result.data.items.map((item) => (
              <li className={styles.item} key={item.listingId}>
                {item.listing ? (
                  <>
                    <div className={styles.photo}>
                      <ListingPhoto book={item.listing} />
                    </div>
                    <div className={styles.content}>
                      <h2>
                        <Link to={`/books/${item.listingId}`}>
                          {listingTitle(item.listing)}
                        </Link>
                      </h2>
                      <p>{item.listing.seller.displayName} · Số lượng: 1</p>
                      <p>
                        Giá hiện tại:{" "}
                        <strong>
                          {item.listing.salePrice !== null
                            ? formatVnd(item.listing.salePrice)
                            : "Không bán"}
                        </strong>
                      </p>
                      {item.listing.salePrice !== item.priceAtAdd && (
                        <p>
                          Giá khi thêm: {formatVnd(item.priceAtAdd)}. Giá đã
                          thay đổi; kiểm tra giá mới trước khi mua.
                        </p>
                      )}
                      {!item.canBuy && (
                        <p>
                          Hiện chưa thể mua: sách có thể đang được giữ, tài
                          khoản bị hạn chế hoặc thông tin giao hàng cần cập
                          nhật.
                        </p>
                      )}
                      {item.canBuy && !disabled && !result.error ? (
                        <Link
                          className={styles.linkButton}
                          to={`/buy-now/${item.listingId}`}
                        >
                          Mua bài đăng này
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className={styles.content}>
                    <h2>Bài đăng không còn công khai</h2>
                    <p>
                      Nội dung hiện không thể xem. Bạn có thể xóa dòng này khỏi
                      giỏ.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void remove(item.listingId)}
                  aria-label={`Xóa ${item.listing ? listingTitle(item.listing) : "bài đăng không công khai"} khỏi giỏ`}
                >
                  Xóa khỏi giỏ
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
