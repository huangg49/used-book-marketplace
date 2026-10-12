import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "@used-books/session-client";
import { ArrowRight, ArrowUpRight, Bell, Plus, Wallet } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { ROUTES, formatVnd } from "../lib/routes";
import { myListingsQuery } from "../lib/owner-listing-queries";
import { getWalletSummary } from "../services/wallet";
import {
  listNotifications,
  markNotificationsRead,
} from "../services/notifications";
import { queryClient } from "../lib/session";
import { OwnerListingRow } from "../components/OwnerListingRow";
import styles from "./AccountOverviewPage.module.css";

function ReadFailure({
  error,
  pending,
  retry,
  subject,
}: {
  error: unknown;
  pending: boolean;
  retry: () => void;
  subject: string;
}) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className={styles.failure} role="alert">
      <p>
        {forbidden
          ? `Tài khoản hiện chưa được phép xem ${subject}.`
          : `Chưa tải được ${subject}. Kiểm tra kết nối rồi thử lại.`}
      </p>
      {forbidden ? (
        <Link to={ROUTES.profile}>Xem trạng thái tài khoản</Link>
      ) : (
        <button type="button" onClick={retry} disabled={pending}>
          {pending ? "Đang thử lại…" : "Thử lại"}
        </button>
      )}
    </div>
  );
}

function LoadingRows({ subject }: { subject: string }) {
  return (
    <div className={styles.loading} role="status">
      <span>Đang tải {subject}…</span>
      <div className={styles.skeletons} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function accessDenied(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function WalletSummary({ ownerId }: { ownerId: string }) {
  const query = useQuery({
    queryKey: ["wallet-summary", ownerId],
    queryFn: getWalletSummary,
  });
  return (
    <section
      className={styles.wallet}
      aria-labelledby="overview-wallet"
      aria-busy={query.isPending}
    >
      <div className={styles.walletLabel}>
        <Wallet size={20} aria-hidden="true" />
        <div>
          <h2 id="overview-wallet">Ví mô phỏng</h2>
          <p>Mô phỏng đồ án</p>
        </div>
      </div>
      {query.isPending ? (
        <p className={styles.walletLoading} role="status">
          Đang tải số dư…
        </p>
      ) : !query.data || accessDenied(query.error) ? (
        <ReadFailure
          subject="số dư ví"
          error={query.error}
          pending={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          <dl className={styles.balances}>
            <div>
              <dt>Số dư khả dụng</dt>
              <dd>{formatVnd(query.data.available)}</dd>
            </div>
            <div>
              <dt>Đang giữ cho giao dịch</dt>
              <dd>{formatVnd(query.data.transactionHeld)}</dd>
            </div>
          </dl>
          {query.isError && (
            <ReadFailure
              subject="số dư mới"
              error={query.error}
              pending={query.isFetching}
              retry={() => void query.refetch()}
            />
          )}
        </>
      )}
    </section>
  );
}

const shelfShortcuts = [
  ["Draft", "Bản nháp"],
  ["PendingReview", "Chờ duyệt"],
  ["Rejected", "Bị từ chối"],
] as const;

function RecentBooks({ ownerId }: { ownerId: string }) {
  const query = useQuery(myListingsQuery(ownerId, "", undefined, 4));
  return (
    <section className={styles.books} aria-labelledby="overview-books">
      <header className={styles.sectionHeading}>
        <div>
          <h2 id="overview-books">Kệ cập nhật gần đây</h2>
          <p>Những bản sách bạn vừa chăm chút.</p>
        </div>
        <Link to={ROUTES.myBooks}>
          Xem toàn bộ kệ <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <nav className={styles.shortcuts} aria-label="Lối vào các mục trên kệ">
        {shelfShortcuts.map(([value, label]) => (
          <Link key={value} to={`${ROUTES.myBooks}?moderation=${value}`}>
            {label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <div className={styles.bookResults} aria-busy={query.isPending}>
        {query.isPending ? (
          <LoadingRows subject="kệ sách" />
        ) : !query.data || accessDenied(query.error) ? (
          <ReadFailure
            subject="kệ sách"
            error={query.error}
            pending={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : (
          <>
            {query.isError && (
              <ReadFailure
                subject="kệ cập nhật"
                error={query.error}
                pending={query.isFetching}
                retry={() => void query.refetch()}
              />
            )}
            {query.data.items.length ? (
              <ul className={styles.bookList}>
                {query.data.items.map((item) => (
                  <OwnerListingRow
                    key={`${ownerId}:${item.id}`}
                    item={item}
                    compact
                  />
                ))}
              </ul>
            ) : (
              <div className={styles.emptyBooks}>
                <h3>Một chỗ trống cho cuốn sách đầu tiên.</h3>
                <p>Đăng cuốn đã đọc xong để tìm người đọc tiếp theo.</p>
                <Link to={ROUTES.sell}>
                  Đăng cuốn đầu tiên <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const activityDate = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
function RecentActivity({ ownerId }: { ownerId: string }) {
  const query = useQuery({
    queryKey: ["notifications", ownerId, "overview", 3],
    queryFn: () => listNotifications(undefined, 3),
  });
  function read(id: string, readAt: string | null) {
    if (!readAt)
      void markNotificationsRead({ ids: [id] })
        .catch(() => undefined)
        .finally(
          () =>
            void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        );
  }
  return (
    <section className={styles.activity} aria-labelledby="overview-activity">
      <header className={styles.sectionHeading}>
        <div>
          <h2 id="overview-activity">Hoạt động gần đây</h2>
          <p>Thông báo từ các phiên đấu giá.</p>
        </div>
      </header>
      <div className={styles.activityResults} aria-busy={query.isPending}>
        {query.isPending ? (
          <LoadingRows subject="thông báo" />
        ) : !query.data || accessDenied(query.error) ? (
          <ReadFailure
            subject="thông báo"
            error={query.error}
            pending={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : (
          <>
            {query.isError && (
              <ReadFailure
                subject="thông báo mới"
                error={query.error}
                pending={query.isFetching}
                retry={() => void query.refetch()}
              />
            )}
            {query.data.items.length ? (
              <ul className={styles.activityList}>
                {query.data.items.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={ROUTES.auctionDetail(n.targetId)}
                      onClick={() => read(n.id, n.readAt)}
                    >
                      <strong>{n.title}</strong>
                      <span>{n.body}</span>
                      <small>
                        {!n.readAt && <b>Chưa đọc · </b>}
                        <time dateTime={n.createdAt}>
                          {Number.isNaN(Date.parse(n.createdAt))
                            ? ""
                            : activityDate.format(new Date(n.createdAt))}
                        </time>
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyActivity}>
                <Bell size={26} aria-hidden="true" />
                <h3>Chưa có thông báo</h3>
                <p>
                  Khi có cập nhật về phiên đấu giá của bạn, thông báo sẽ nằm ở
                  đây.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <Link className={styles.allActivity} to={ROUTES.notifications}>
        Xem thông báo
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}

export function AccountOverviewPage() {
  const auth = useSession();
  if (auth.status !== "authenticated") return null;
  const { user } = auth;
  return (
    <div className={styles.root} key={user.id}>
      <header className={styles.greeting}>
        <div className={styles.greetingCopy}>
          <h1>Tổng quan của bạn</h1>
          <p className={styles.hello}>
            Chào {user.displayName}, mừng bạn trở lại.
          </p>
          <p className={styles.intro}>
            Chăm chút kệ sách, đón người đọc tiếp theo.
          </p>
          <div className={styles.actions}>
            <Link className={styles.post} to={ROUTES.sell}>
              <Plus size={18} aria-hidden="true" />
              Đăng sách
            </Link>
            <Link className={styles.shelfLink} to={ROUTES.myBooks}>
              Xem kệ sách
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <img
          className={styles.greetingArt}
          src="/illustrations/penguins/post.png"
          width="256"
          height="256"
          alt=""
          aria-hidden="true"
          decoding="async"
        />
      </header>
      {user.status !== "ACTIVE" && (
        <p className={styles.accountNotice}>
          Tài khoản đang {user.status === "LOCKED" ? "khóa" : "hạn chế"} giao
          dịch mới. <Link to={ROUTES.profile}>Xem thông tin tài khoản</Link>
        </p>
      )}
      <WalletSummary ownerId={user.id} />
      <div className={styles.workspace}>
        <RecentBooks ownerId={user.id} />
        <RecentActivity ownerId={user.id} />
      </div>
    </div>
  );
}
