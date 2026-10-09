import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, Repeat, Gavel, Tag } from "lucide-react";
import { motion } from "framer-motion";
import { ROUTES } from "../lib/routes";
import { BookCard } from "../components/BookCard";
import { getPublicListings } from "../services/public-listings";
import styles from "./HomePage.module.css";

function Shelf({ mode, title }: { mode?: "Exchange"; title: string }) {
  const query = new URLSearchParams({
    limit: "6",
    sort: "newest",
    ...(mode ? { mode } : {}),
  });
  const result = useQuery({
    queryKey: ["public-listings", query.toString()],
    queryFn: () => getPublicListings(query),
    retry: false,
  });
  return (
    <section className={styles.shelf}>
      <div className={styles.shelfHeader}>
        <div>
          <h2 className={styles.shelfTitle}>{title}</h2>
          <p className={styles.shelfSubtitle}>
            Bìa, tình trạng và giá từ từng bản sách đang được đăng.
          </p>
        </div>
        <Link
          className={styles.shelfViewAll}
          to={mode ? `${ROUTES.search}?mode=${mode}` : ROUTES.search}
        >
          Xem tất cả →
        </Link>
      </div>
      <div aria-live="polite">
        {result.isPending && <p>Đang tải kệ sách…</p>}
        {result.isError && (
          <div role="alert">
            <p>Chưa tải được sách.</p>
            <button type="button" onClick={() => void result.refetch()}>
              Thử lại
            </button>
          </div>
        )}
        {result.data?.items.length === 0 && <p>Chưa có sách trong kệ này.</p>}
        <div className={styles.shelfGrid}>
          {result.data?.items.map((book, index) => (
            <BookCard key={book.id} book={book} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
export default function HomePage() {
  const actions = [
    { to: ROUTES.search, title: "Tìm sách quý", subtitle: "Biên mục & Lọc chuyên sâu tác phẩm hiếm có", Icon: BookOpen },
    { to: ROUTES.sell, title: "Đăng bán sách", subtitle: "Định giá & Thẩm định tình trạng 5 bước", Icon: Tag },
    { to: `${ROUTES.search}?mode=Exchange`, title: "Đổi sách bằng Xu", subtitle: "Dùng điểm Lật-Xu trao đổi không cần tiền mặt", Icon: Repeat },
    { to: ROUTES.auctions, title: "Sàn đấu giá", subtitle: "Sách chữ ký tác giả & Bản in đầu thế kỷ 20", Icon: Gavel },
  ];
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroContainer}>
          <motion.div
            className={styles.heroLeft}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <span className={styles.heroTag}>
              <span className={styles.heroTagDot} aria-hidden="true" />
              DI SẢN TRANG GIẤY & KÝ ỨC
            </span>
            <h1 id="hero-title" className={styles.heroTitle}>
              Những cuốn sách xứng đáng được đọc thêm một lần nữa.
            </h1>
            <p className={styles.heroLead}>
              Trao cho từng trang sách cũ một vòng đời mới. Nền tảng tuyển chọn,
              thẩm định và giao dịch sách quý, sách lưu trữ minh bạch nguồn gốc
              và tình trạng.
            </p>
            <div className={styles.heroActions}>
              <Link to={ROUTES.search} className={styles.btnPrimary}>
                Khám phá sách →
              </Link>
              <Link to={ROUTES.sell} className={styles.btnOutline}>
                Đăng sách của bạn
              </Link>
            </div>
            <div className={styles.trustGrid}>
              <div>
                <div className={styles.trustNum}>45.000+</div>
                <div className={styles.trustLabel}>Tác phẩm lưu trữ</div>
              </div>
              <div>
                <div className={styles.trustNum}>100%</div>
                <div className={styles.trustLabel}>Thẩm định trang sách</div>
              </div>
              <div>
                <div className={styles.trustNum}>12.000+</div>
                <div className={styles.trustLabel}>Cộng đồng độc giả</div>
              </div>
            </div>
          </motion.div>
          <motion.div
            className={styles.featuredCard}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          >
            <div className={styles.featuredCardTop}>
              <span className={styles.featuredBadge}>
                <span className={styles.pulseDot} aria-hidden="true" /> ĐẤU GIÁ NỔI BẬT
              </span>
              <span className={styles.featuredTimer}>⏱ 02 : 14 : 38</span>
            </div>
            <div className={styles.featuredBody}>
              <div className={styles.featuredCoverCol}>
                <div className={styles.featuredCoverWrap}>
                  <img
                    src="https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=600&auto=format&fit=crop"
                    alt="Đoạn Tuyệt"
                    className={styles.featuredCoverImg}
                  />
                  <div className={styles.featuredCoverGradient} />
                  <span className={styles.featuredEditionTag}>Bản in 1940</span>
                </div>
              </div>
              <div className={styles.featuredInfoCol}>
                <div>
                  <span className={styles.featuredPublisher}>TỰ LỰC VĂN ĐOÀN</span>
                  <h3 className={styles.featuredBookTitle}>Đoạn Tuyệt (Bản in đầu 1940)</h3>
                  <p className={styles.featuredBookAuthor}>Tác giả: Nhất Linh</p>
                  <span className={styles.featuredVerified}>✔ Bảo chứng tem mộc xưa</span>
                </div>
                <div className={styles.featuredPriceBlock}>
                  <div className={styles.featuredPriceRow}>
                    <span className={styles.featuredPriceLabel}>Giá đặt hiện tại:</span>
                    <div style={{ textAlign: "right" }}>
                      <div className={styles.featuredPriceValue}>2.890.000 đ</div>
                      <div className={styles.featuredBidCount}>28 lượt đặt giá</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.featuredActions}>
              <button className={styles.btnBidPrimary}>Đặt giá ngay</button>
              <button className={styles.btnBidOutline}>Bảo chứng</button>
            </div>
          </motion.div>
        </div>
      </section>
      <section className={styles.quickActions}>
        <div className={styles.quickActionsGrid}>
          {actions.map(({ to, title, subtitle, Icon }, index) => (
            <motion.div
              key={to}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
            >
              <Link to={to} className={styles.actionCard}>
                <div className={styles.actionIconBox}>
                  <Icon size={24} aria-hidden="true" />
                </div>
                <div>
                  <h2 className={styles.actionTitle}>{title}</h2>
                  <p className={styles.actionDesc}>{subtitle}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
      <main className={styles.shelves} id="kham-pha">
        <Shelf title="Mới lên kệ" />
        <Shelf title="Sẵn sàng trao đổi" mode="Exchange" />
      </main>
    </div>
  );
}
