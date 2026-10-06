import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ROUTES, searchUrl } from '../lib/routes'
import { SHELF1_BOOKS, SHELF2_AUCTION, SHELF3_BOOKS } from '../lib/mock/home'
import type { BookItem } from '../lib/mock/home'
import styles from './HomePage.module.css'

/* ---------- Animation Variants ---------- */
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
}

function formatVnd(n: number) {
  return n.toLocaleString('vi-VN') + ' đ'
}

/* ---------- Book Card (Stitch Design) ---------- */
function StitchBookCard({ book }: { book: BookItem }) {
  const [saved, setSaved] = useState(false)

  let conditionClass = styles.conditionNormal
  if (book.conditionTag === 'green') conditionClass = styles.conditionGreen
  if (book.conditionTag === 'archive') conditionClass = styles.conditionArchive

  return (
    <div className={styles.bookCard}>
      <div>
        <div className={styles.bookCoverWrap}>
          <img
            className={styles.bookCoverImg}
            src={book.coverUrl}
            alt={book.title}
          />
          <button
            className={styles.bookmarkBtn}
            title="Lưu danh mục"
            onClick={() => setSaved(!saved)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: saved ? '#994530' : undefined }}>
              bookmark
            </span>
          </button>
          <span className={`${styles.conditionTag} ${conditionClass}`}>
            {book.condition}
          </span>
        </div>
        <div className={styles.bookMeta}>
          <span className={styles.bookGenre}>{book.genre}</span>
          <h4 className={styles.bookTitle}>{book.title}</h4>
          <p className={styles.bookAuthor}>{book.author}</p>
        </div>
      </div>
      <div className={styles.bookFooter}>
        <div>
          {book.listingType === 'sell' && book.priceVnd !== undefined && (
            <span className={styles.priceVnd}>{formatVnd(book.priceVnd)}</span>
          )}
          {book.listingType === 'exchange' && book.priceXu !== undefined && (
            <span className={styles.priceXu}>{book.priceXu} Xu</span>
          )}
        </div>
        <button className={book.listingType === 'exchange' ? styles.btnExchange : styles.btnBuy}>
          {book.listingType === 'exchange' ? 'Đổi sách' : 'Mua ngay'}
        </button>
      </div>
    </div>
  )
}

/* ---------- Auction Card ---------- */
function AuctionCard({ book, timer, bids }: { book: BookItem; timer: string; bids: number }) {
  return (
    <div className={styles.auctionCard}>
      <div>
        <div className={styles.auctionCoverWrap}>
          <img className={styles.auctionCoverImg} src={book.coverUrl} alt={book.title} />
          <div className={styles.auctionTimer}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>timer</span>
            <span>{timer}</span>
          </div>
          <span className={styles.auctionEditionTag}>{book.condition}</span>
        </div>
        <div className={styles.auctionMeta}>
          <span className={styles.auctionGenre}>{book.genre}</span>
          <h4 className={styles.auctionTitle}>{book.title}</h4>
          <p className={styles.auctionAuthorSmall}>{book.author}</p>
        </div>
      </div>
      <div className={styles.auctionFooterBlock}>
        <div className={styles.auctionPriceRow}>
          <div>
            <div className={styles.auctionPriceLabel}>Giá thầu hiện tại</div>
            <div className={styles.auctionPriceValue}>{formatVnd(book.priceVnd!)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.auctionPriceLabel}>Lượt đặt</div>
            <div className={styles.auctionBidCount}>{bids} lượt</div>
          </div>
        </div>
        <button className={styles.btnAuction}>Đặt giá ngay</button>
      </div>
    </div>
  )
}

/* ---------- Hero ---------- */
function Hero() {
  const navigate = useNavigate()
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroBg1}></div>
      <div className={styles.heroContainer}>
        {/* Left column */}
        <motion.div
          className={styles.heroLeft}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className={styles.heroTag}>
            <span className={styles.heroTagDot}></span>
            <span>DI SẢN TRANG GIẤY &amp; KÝ ỨC</span>
          </div>
          <h1 id="hero-title" className={styles.heroTitle}>
            Những cuốn sách xứng đáng được đọc thêm một lần nữa.
          </h1>
          <p className={styles.heroLead}>
            Trao cho từng trang sách cũ một vòng đời mới. Nền tảng tuyển chọn, thẩm định và giao dịch sách quý, sách lưu trữ minh bạch nguồn gốc và tình trạng.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.btnPrimary} onClick={() => navigate(ROUTES.search)}>
              Khám phá sách
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
            </button>
            <button className={styles.btnOutline} onClick={() => navigate(ROUTES.sell)}>
              Đăng sách của bạn
            </button>
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

        {/* Right column: Featured Live Auction Card */}
        <motion.div
          className={styles.heroRight}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className={styles.featuredCard}>
            <div className={styles.featuredCardTop}>
              <span className={styles.featuredBadge}>
                <span className={styles.pulseDot}></span>
                ĐẤU GIÁ NỔI BẬT
              </span>
              <span className={styles.featuredTimer}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>
                <span>02 : 14 : 38</span>
              </span>
            </div>
            <div className={styles.featuredBody}>
              <div className={styles.featuredCoverCol}>
                <div className={styles.featuredCoverWrap}>
                  <img
                    className={styles.featuredCoverImg}
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBM6c-op_ccW9VfZDAtIR5hN0yAjcZdXBwZS-4N7YydGSlWHu6Ieaar47r-KQSzIT9og-5asLQT_QwCpsZglMwR4b0zMHjODNmFBLMEgoVC7q-NxwANoDJInjyAz1ylJ4AQBJmGFeuLoXNfo1fAW3FPHozLZx5MFoT_AFvjKkCGXHNud0gzEzKx7zz2g9hVqcNIa-hKe3vWBX-4uC6qcce19JpW2iUqSCaEZyhHjXcSwNW7YZ3ZhG8CLdgvUQ-7q0_iJhbJc2cgpLHF"
                    alt="Đoạn Tuyệt"
                  />
                  <div className={styles.featuredCoverGradient}></div>
                  <span className={styles.featuredEditionTag}>Bản in 1940</span>
                </div>
              </div>
              <div className={styles.featuredInfoCol}>
                <div>
                  <span className={styles.featuredPublisher}>Tự Lực Văn Đoàn</span>
                  <h3 className={styles.featuredBookTitle}>Đoạn Tuyệt (Bản in đầu 1940)</h3>
                  <p className={styles.featuredBookAuthor}>Tác giả: Nhất Linh</p>
                  <div className={styles.featuredVerified}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#416656' }}>verified</span>
                    <span>Bảo chứng tem mộc xưa</span>
                  </div>
                </div>
                <div className={styles.featuredPriceBlock}>
                  <div className={styles.featuredPriceRow}>
                    <span className={styles.featuredPriceLabel}>Giá đặt hiện tại:</span>
                    <span className={styles.featuredPriceValue}>2.890.000 đ</span>
                  </div>
                  <div className={styles.featuredBidCount}>29 lượt đặt giá</div>
                </div>
              </div>
            </div>
            <div className={styles.featuredActions}>
              <button className={styles.btnBidPrimary}>Đặt giá ngay</button>
              <button className={styles.btnBidOutline}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>policy</span>
                <span>Bảo chứng</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ---------- Quick Actions ---------- */
const ACTIONS = [
  {
    icon: 'menu_book',
    title: 'Tìm sách quý',
    desc: 'Biên mục & Lọc chuyên sâu tác phẩm hiếm có',
    link: ROUTES.search,
  },
  {
    icon: 'sell',
    title: 'Đăng bán sách',
    desc: 'Định giá & Thẩm định tình trạng 5 bước',
    link: ROUTES.sell,
  },
  {
    icon: 'swap_horiz',
    title: 'Đổi sách bằng Xu',
    desc: 'Dùng điểm Lật-Xu trao đổi không cần tiền mặt',
    link: ROUTES.exchange,
  },
  {
    icon: 'gavel',
    title: 'Sàn đấu giá',
    desc: 'Sách chữ ký tác giả & Bản in đầu thế kỷ 20',
    link: searchUrl({ collection: 'auction' }),
  },
]

function QuickActions() {
  return (
    <section className={styles.quickActions}>
      <div className={styles.quickActionsGrid}>
        {ACTIONS.map((a, i) => (
          <Link to={a.link} key={i} className={styles.actionCard}>
            <div className={styles.actionIconBox}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{a.icon}</span>
            </div>
            <div>
              <h4 className={styles.actionTitle}>{a.title}</h4>
              <p className={styles.actionDesc}>{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ---------- Book Shelves ---------- */
function BookShelves() {
  return (
    <main className={styles.shelves} id="kham-pha">
      {/* Shelf 1: Mới lên kệ */}
      <section className={styles.shelf}>
        <div className={styles.shelfHeader}>
          <div>
            <div className={styles.shelfTitleRow}>
              <h2 className={styles.shelfTitle}>Mới lên kệ hôm nay</h2>
              <span className={styles.shelfBadge}>42 cuốn vừa biên mục</span>
            </div>
            <p className={styles.shelfSubtitle}>Các tác phẩm vừa được kiểm duyệt chất lượng giấy và hình thức bìa</p>
          </div>
          <Link to={searchUrl({})} className={styles.shelfViewAll}>
            Xem tất cả
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </Link>
        </div>
        <motion.div
          className={styles.shelfGrid}
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
        >
          {SHELF1_BOOKS.map(book => (
            <motion.div variants={itemVariants} key={book.id}>
              <StitchBookCard book={book} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Shelf 2: Sách hiếm đấu giá trực tiếp */}
      <section className={styles.auctionShelf} id="dau-gia">
        <div className={styles.shelfHeader}>
          <div>
            <div className={styles.shelfTitleRow}>
              <h2 className={styles.shelfTitle}>Sách hiếm đấu giá trực tiếp</h2>
              <span className={styles.liveBadge}>
                <span className={styles.pingDot}></span>
                TRỰC TIẾP
              </span>
            </div>
            <p className={styles.shelfSubtitle}>Các bản in đầu thế kỷ, có chữ ký tác giả và dấu triện thư viện cổ</p>
          </div>
          <Link to={searchUrl({ collection: 'auction' })} className={`${styles.shelfViewAll} ${styles.shelfViewAllRed}`}>
            Xem tất cả phiên
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </Link>
        </div>
        <motion.div
          className={styles.auctionGrid}
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
        >
          <motion.div variants={itemVariants}><AuctionCard book={SHELF2_AUCTION[0]} timer="00 : 45 : 12" bids={38} /></motion.div>
          <motion.div variants={itemVariants}><AuctionCard book={SHELF2_AUCTION[1]} timer="06 : 19 : 04" bids={51} /></motion.div>
          <motion.div variants={itemVariants}><AuctionCard book={SHELF2_AUCTION[2]} timer="14 : 02 : 55" bids={22} /></motion.div>
        </motion.div>
      </section>

      {/* Shelf 3: Gợi ý theo gu đọc */}
      <section className={styles.shelf}>
        <div className={styles.shelfHeader}>
          <div>
            <div className={styles.shelfTitleRow}>
              <h2 className={styles.shelfTitle}>Gợi ý theo gu đọc: Văn học &amp; Khảo cứu</h2>
              <span className={styles.shelfBadgeGreen}>Tuyển tập đặc biệt</span>
            </div>
            <p className={styles.shelfSubtitle}>Dành cho độc giả tìm kiếm các ấn phẩm khảo cứu văn hóa và kiến trúc</p>
          </div>
          <Link to={searchUrl({})} className={styles.shelfViewAll}>
            Xem tất cả
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </Link>
        </div>
        <motion.div
          className={styles.shelfGrid}
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
        >
          {SHELF3_BOOKS.map(book => (
            <motion.div variants={itemVariants} key={book.id}>
              <StitchBookCard book={book} />
            </motion.div>
          ))}
        </motion.div>
      </section>
    </main>
  )
}

export default function HomePage() {
  return (
    <div className={styles.page}>
      <Hero />
      <QuickActions />
      <BookShelves />
    </div>
  )
}
