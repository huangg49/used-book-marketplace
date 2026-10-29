import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "../hooks/useSession";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Inbox,
  Clock,
  CheckCircle2,
  X,
  Star,
  ChevronLeft,
  ChevronRight,
  Plus,
  BookOpen,
  Truck,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ROUTES, formatVnd } from "../lib/routes";
import { getExchangeTransactions, getExchangeCounts } from "../services/exchange";
import type { ExchangeItem, ExchangeTab, ExchangeBook } from "../lib/mock/exchangeMine";
import { BookCover } from "../components/BookCover";
import styles from "./ExchangeMinePage.module.css";

const TAB_CONFIG: Record<
  ExchangeTab,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  sent: { label: "Đề nghị đã gửi", icon: ArrowUpRight },
  received: { label: "Đề nghị nhận được", icon: Inbox },
  active: { label: "Đang thực hiện", icon: Clock },
  done: { label: "Hoàn tất", icon: CheckCircle2 },
};

function getStatusInfo(status: string) {
  switch (status) {
    case "FUNDING":
      return { text: "Chờ đặt cọc", pillClass: styles.statusActive, Icon: Clock };
    case "RESOLUTION_PENDING":
      return { text: "Cần xử lý", pillClass: styles.statusActive, Icon: AlertCircle };
    case "PENDING":
      return { text: "Chờ phản hồi", pillClass: styles.statusPending, Icon: Clock };
    case "REJECTED":
      return { text: "Bị từ chối", pillClass: styles.statusRejected, Icon: X };
    case "EXPIRED":
      return { text: "Hết hạn", pillClass: styles.statusRejected, Icon: Clock };
    case "CANCELLED":
      return { text: "Đã hủy", pillClass: styles.statusRejected, Icon: X };
    case "DELIVERING":
      return { text: "Đang giao nhận", pillClass: styles.statusActive, Icon: Truck };
    case "WAITING_YOU_SEND":
      return { text: "Chờ bạn gửi sách", pillClass: styles.statusActive, Icon: Truck };
    case "WAITING_YOU_CONFIRM":
      return { text: "Chờ xác nhận", pillClass: styles.statusActive, Icon: Clock };
    case "COMPLETED":
      return { text: "Hoàn tất", pillClass: styles.statusDone, Icon: CheckCircle2 };
    case "NEED_REVIEW":
      return { text: "Cần đánh giá", pillClass: styles.statusReview, Icon: Star };
    default:
      return { text: status, pillClass: styles.statusPending, Icon: Clock };
  }
}

function formatDate(isoString: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export default function ExchangeMinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useSession();
  const actor = auth.status === "authenticated" ? auth.user.id : undefined;

  const rawTab = searchParams.get("tab");
  const currentTab: ExchangeTab =
    rawTab && rawTab in TAB_CONFIG ? (rawTab as ExchangeTab) : "sent";
  const rawPage = Number(searchParams.get("page") ?? 1);
  const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const { data: countsData } = useQuery({
    queryKey: ["exchangeCounts", actor],
    queryFn: getExchangeCounts,
    enabled: !!actor,
  });

  const {
    data: listData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["exchangeTransactions", actor, currentTab, currentPage],
    queryFn: () => getExchangeTransactions(currentTab, currentPage),
    enabled: !!actor,
  });

  const setTab = (tab: ExchangeTab) => {
    setSearchParams({ tab, page: "1" });
  };

  const setPage = (page: number) => {
    setSearchParams({ tab: currentTab, page: page.toString() });
  };

  const handleTabKeyDown = (
    e: React.KeyboardEvent,
    tabKeys: ExchangeTab[],
    currentIndex: number,
  ) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = tabKeys[(currentIndex + 1) % tabKeys.length];
      setTab(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = tabKeys[(currentIndex - 1 + tabKeys.length) % tabKeys.length];
      setTab(prev);
    }
  };

  if (!actor) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIconBox}>
            <ArrowLeftRight size={28} />
          </div>
          <h2 className={styles.emptyTitle}>Trao Đổi Của Tôi</h2>
          <p className={styles.emptyDesc}>
            {auth.status === "loading"
              ? "Đang xác thực thông tin tài khoản…"
              : "Đăng nhập để theo dõi và quản lý các giao dịch trao đổi sách của bạn."}
          </p>
          {auth.status !== "loading" && (
            <Link
              to="/login?returnUrl=%2Fexchange%2Fmine"
              className={styles.emptyBtn}
            >
              Đăng nhập ngay
            </Link>
          )}
        </div>
      </div>
    );
  }

  const tabKeys = Object.keys(TAB_CONFIG) as ExchangeTab[];

  return (
    <div className={styles.root}>
      {/* 1. Header with Title, Subtitle and Quick Action CTAs */}
      <header className={styles.heading}>
        <div className={styles.headingInfo}>
          <h1 className={styles.title} tabIndex={-1}>
            Trao Đổi Của Tôi
          </h1>
          <p className={styles.subtitle}>
            Quản lý hành trình trao đổi sách cũ của bạn. Theo dõi đề nghị đã gửi, lời mời nhận
            được, tiến độ đặt cọc, giao nhận và lưu trữ lịch sử giao lưu.
          </p>
        </div>

        <div className={styles.headingActions}>
          <Link to={ROUTES.exchange} className={styles.actionOutline}>
            <BookOpen size={16} />
            <span>Khám phá sách trao đổi</span>
          </Link>
          <Link to={ROUTES.sell} className={styles.actionPrimary}>
            <Plus size={16} />
            <span>Đăng sách lên kệ</span>
          </Link>
        </div>
      </header>

      {/* 2. Modern Segmented Tab Bar */}
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label="Các nhóm giao dịch trao đổi"
      >
        {tabKeys.map((tab, idx) => {
          const config = TAB_CONFIG[tab];
          const IconComponent = config.icon;
          const count = countsData ? countsData[tab] : "—";
          const isActive = currentTab === tab;

          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab}`}
              id={`tab-${tab}`}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ""}`}
              onClick={() => setTab(tab)}
              onKeyDown={(e) => handleTabKeyDown(e, tabKeys, idx)}
            >
              <IconComponent size={16} aria-hidden="true" />
              <span>{config.label}</span>
              <span className={styles.tabBadge}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Tab Panel Content */}
      <div
        role="tabpanel"
        id={`panel-${currentTab}`}
        aria-labelledby={`tab-${currentTab}`}
        aria-live="polite"
      >
        {isLoading && (
          <div className={styles.loadingBox}>
            <div className="flex items-center justify-center gap-2">
              <RefreshCw size={20} className="animate-spin text-[#5c0202]" />
              <span>Đang tải các giao dịch trao đổi…</span>
            </div>
          </div>
        )}

        {isError && (
          <div className={styles.errorBox}>
            <p className="font-semibold">Đã xảy ra lỗi khi tải danh sách trao đổi.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className={styles.retryBtn}
            >
              Thử tải lại
            </button>
          </div>
        )}

        {/* Empty States */}
        {!isLoading && !isError && listData && listData.data.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={styles.emptyState}
          >
            <div className={styles.emptyIconBox}>
              {currentTab === "sent" && <ArrowUpRight size={28} />}
              {currentTab === "received" && <Inbox size={28} />}
              {currentTab === "active" && <Clock size={28} />}
              {currentTab === "done" && <CheckCircle2 size={28} />}
            </div>

            <h2 className={styles.emptyTitle}>
              {currentTab === "sent" && "Bạn chưa gửi đề nghị nào"}
              {currentTab === "received" && "Chưa có đề nghị nào gửi đến bạn"}
              {currentTab === "active" && "Không có giao dịch nào đang thực hiện"}
              {currentTab === "done" && "Chưa có giao dịch trao đổi nào hoàn tất"}
            </h2>

            <p className={styles.emptyDesc}>
              {currentTab === "sent" &&
                "Khám phá các cuốn sách trao đổi thú vị từ cộng đồng và chọn cuốn sách bạn yêu thích để gửi lời mời ngay."}
              {currentTab === "received" &&
                "Đăng thêm sách vào kệ để kết nối và nhận lời mời đổi sách từ những độc giả khác."}
              {currentTab === "active" &&
                "Khi bạn và đối tác đồng ý đổi sách và hoàn tất cọc, tiến trình giao nhận sách sẽ hiển thị tại đây."}
              {currentTab === "done" &&
                "Lịch sử các cuốn sách đã trao đổi thành công sẽ được lưu trữ trang trọng tại đây."}
            </p>

            {currentTab === "sent" && (
              <Link to={ROUTES.exchange} className={styles.emptyBtn}>
                <BookOpen size={18} />
                <span>Tìm sách để trao đổi</span>
                <ArrowRight size={18} />
              </Link>
            )}

            {currentTab === "received" && (
              <Link to={ROUTES.sell} className={styles.emptyBtn}>
                <Plus size={18} />
                <span>Đăng sách lên kệ</span>
                <ArrowRight size={18} />
              </Link>
            )}

            {(currentTab === "active" || currentTab === "done") && (
              <Link to={ROUTES.exchange} className={styles.emptyBtn}>
                <BookOpen size={18} />
                <span>Khám phá sàn trao đổi</span>
                <ArrowRight size={18} />
              </Link>
            )}
          </motion.div>
        )}

        {/* Card List */}
        {!isLoading && !isError && listData && listData.data.length > 0 && (
          <div className={styles.cardList}>
            <AnimatePresence mode="popLayout">
              {listData.data.map((item) => (
                <ExchangeCard key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !isError && listData && listData.total > 5 && (
          <nav className={styles.pagination} aria-label="Phân trang trao đổi">
            <button
              type="button"
              className={styles.pageBtn}
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft size={18} />
            </button>

            {Array.from({ length: Math.ceil(listData.total / 5) }).map((_, i) => (
              <button
                type="button"
                key={i + 1}
                className={`${styles.pageBtn} ${currentPage === i + 1 ? styles.pageBtnActive : ""}`}
                onClick={() => setPage(i + 1)}
                aria-label={`Trang ${i + 1}`}
                aria-current={currentPage === i + 1 ? "page" : undefined}
              >
                {i + 1}
              </button>
            ))}

            <button
              type="button"
              className={styles.pageBtn}
              disabled={currentPage >= Math.ceil(listData.total / 5)}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Trang sau"
            >
              <ChevronRight size={18} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

function ExchangeCard({ item }: { item: ExchangeItem }) {
  const isRejected =
    item.status === "REJECTED" || item.status === "EXPIRED" || item.status === "CANCELLED";
  const statusInfo = getStatusInfo(item.status);
  const StatusIcon = statusInfo.Icon;

  const renderBookCol = (books: ExchangeBook[], label: string, isGive: boolean) => {
    const mainBook = books[0] || {
      title: "Sách trao đổi",
      author: "Chưa rõ",
      price: 0,
    };
    const count = books.length;
    const title = count > 1 ? `${mainBook.title} (+${count - 1} cuốn khác)` : mainBook.title;
    const author = count > 1 ? "Nhiều tác giả" : mainBook.author;
    const totalPrice = books.reduce((sum, b) => sum + (b.price || 0), 0);

    return (
      <div className={styles.bookSide}>
        <div className={styles.bookCoverBox}>
          <BookCover
            title={mainBook.title}
            coverUrl={mainBook.coverUrl}
            index={isGive ? 1 : 0}
            className={styles.coverImage}
          />
          {count > 1 && <span className={styles.multiBadge}>{count} cuốn</span>}
        </div>

        <div className={styles.bookDetails}>
          <span
            className={`${styles.sideTag} ${
              isGive ? styles.sideTagGive : styles.sideTagReceive
            }`}
          >
            {label}
          </span>
          <h3 className={styles.bookTitle} title={title}>
            {title}
          </h3>
          <p className={styles.bookAuthor}>{author}</p>
          {totalPrice > 0 && (
            <p className={styles.bookPrice}>Ước tính: {formatVnd(totalPrice)}</p>
          )}
        </div>
      </div>
    );
  };

  const firstReceiveTitle = item.receiveBooks[0]?.title || "Sách";
  const firstGiveTitle = item.giveBooks[0]?.title || "Sách";
  const partnerInitial = item.partner.username.charAt(0).toUpperCase();

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={`${styles.card} ${isRejected ? styles.cardRejected : ""}`}
    >
      {/* Top Header: Partner Info & Status Pill */}
      <div className={styles.cardHeader}>
        <div className={styles.partnerInfo}>
          <div className={styles.partnerAvatar} aria-hidden="true">
            {partnerInitial}
          </div>
          <div className={styles.partnerMeta}>
            <span className={styles.partnerName}>@{item.partner.username}</span>
            <div className={styles.partnerRating}>
              <Star size={13} fill="currentColor" strokeWidth={0} />
              <span>
                {item.partner.rating
                  ? `Đánh giá ${item.partner.rating.toFixed(1).replace(".", ",")}`
                  : "Chưa có đánh giá"}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.cardHeaderRight}>
          <span className={styles.timestamp}>
            Khởi tạo: {formatDate(item.createdAt)}
          </span>
          <div className={`${styles.statusPill} ${statusInfo.pillClass}`}>
            <StatusIcon size={14} aria-hidden="true" />
            <span>{statusInfo.text}</span>
          </div>
        </div>
      </div>

      {/* Middle Body: Receive (Left) <== [Swap & Compensation] ==> Give (Right) */}
      <div className={styles.cardBody}>
        {renderBookCol(item.receiveBooks, "Sách bạn nhận", false)}

        <div className={styles.swapConnector}>
          <div
            className={`${styles.swapIconBox} ${
              isRejected ? styles.swapIconBoxRejected : ""
            }`}
          >
            {isRejected ? (
              <X size={20} strokeWidth={2.5} />
            ) : (
              <ArrowLeftRight size={20} strokeWidth={2.2} />
            )}
          </div>

          <div className={styles.compBadge}>
            {isRejected ? (
              <span className={styles.compNone}>Đã kết thúc</span>
            ) : item.moneyCompensationType === "user_pays" ? (
              <span className={styles.compUserPays}>
                Bạn bù: +{formatVnd(item.moneyAmount || 0)}
              </span>
            ) : item.moneyCompensationType === "other_pays" ? (
              <span className={styles.compOtherPays}>
                Họ bù: +{formatVnd(item.moneyAmount || 0)}
              </span>
            ) : (
              <span className={styles.compNone}>Đổi ngang giá</span>
            )}
          </div>
        </div>

        {renderBookCol(item.giveBooks, "Sách bạn giao", true)}
      </div>

      {/* Bottom Footer: Meta & Action CTA Button */}
      <div className={styles.cardFooter}>
        <div className={styles.cardFooterMeta}>
          <span className="text-xs text-[#716157]">
            Mã giao dịch: #{item.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        <Link
          to={ROUTES.exchangeDetail(item.id)}
          className={styles.detailBtn}
          aria-label={`Xem chi tiết trao đổi ${firstReceiveTitle} lấy ${firstGiveTitle} với @${item.partner.username}`}
        >
          <span>Xem chi tiết trao đổi</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </motion.article>
  );
}
