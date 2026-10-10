import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";
import { ROUTES, searchUrl } from "../lib/routes";
import { BookCard } from "../components/BookCard";
import { getPublicListings } from "../services/public-listings";
import styles from "./HomePage.module.css";

const heroCovers = [
  "/illustrations/chua-nhan.webp",
  "/illustrations/tuoi-tho.webp",
  "/illustrations/alice-moi.webp",
  "/illustrations/sao.webp",
  "/illustrations/one-piece.webp",
  "/illustrations/nghin-le-mot-dem.webp",
  "/illustrations/duoc-su.webp",
  "/illustrations/chua-nhan.webp",
];

function HeroCovers() {
  const gallery = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const hero = gallery.current?.closest("section");
    if (!hero) return;
    let inView = false;
    const sync = () => setMoving(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(hero);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return (
    <div
      ref={gallery}
      className={styles.coverGallery}
      aria-hidden="true"
      data-moving={moving}
    >
      {[0, 1].map((group) => (
        <div
          className={group === 0 ? styles.leftCovers : styles.rightCovers}
          key={group}
        >
          {heroCovers.slice(group * 4, group * 4 + 4).map((src, index) => (
            <span className={styles.heroCover} key={src + index}>
              <span className={styles.coverMotion}>
                <img
                  src={src}
                  alt=""
                  width="120"
                  height="176"
                  draggable={false}
                  decoding="async"
                />
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Shelf({
  mode,
  title,
  description,
}: {
  mode?: "Exchange";
  title: string;
  description: string;
}) {
  const query = new URLSearchParams({
    limit: "4",
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
      <div className={styles.sectionHead}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Link to={mode ? searchUrl({ mode }) : ROUTES.search}>
          Xem tất cả <ArrowUpRight size={20} aria-hidden="true" />
        </Link>
      </div>
      <div aria-live="polite" aria-busy={result.isFetching}>
        {result.isPending && (
          <div className={styles.loading}>Đang tải kệ sách…</div>
        )}
        {result.isError && (
          <div className={styles.state} role="alert">
            <p>Chưa tải được sách. Kiểm tra kết nối rồi thử lại.</p>
            <button
              type="button"
              onClick={() => void result.refetch()}
              disabled={result.isFetching}
            >
              Thử lại
            </button>
          </div>
        )}
        {!result.isError && result.data?.items.length === 0 && (
          <div className={styles.state}>
            <p>Chưa có sách trong kệ này.</p>
            <Link to={ROUTES.sell}>Đăng cuốn sách đầu tiên</Link>
          </div>
        )}
        <div className={styles.grid}>
          {result.data?.items.map((book, index) => (
            <BookCard key={book.id} book={book} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
export function HomePage() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  return (
    <div>
      <section className={styles.hero}>
        <div className={styles.heroArtwork} aria-hidden="true">
          <img
            className={styles.paperLeft}
            src="/illustrations/hero-paper-left.svg"
            alt=""
            width="380"
            height="560"
            draggable={false}
          />
          <img
            className={styles.paperRight}
            src="/illustrations/hero-paper-right.svg"
            alt=""
            width="380"
            height="560"
            draggable={false}
          />
          <img
            className={styles.openBook}
            src="/illustrations/hero-open-book.svg"
            alt=""
            width="180"
            height="140"
            draggable={false}
          />
        </div>
        <div className={styles.heroInner}>
          <HeroCovers />
          <div className={styles.heroCopy}>
            <h1>
              <span className="sr-only">
                SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI.
              </span>
              <img
                className={styles.heroLettering}
                src="/brand/hero-lettering.png"
                alt=""
                aria-hidden="true"
                width="1313"
                height="655"
                fetchPriority="high"
                draggable={false}
              />
            </h1>
            <p>
              Một cuốn sách đã đọc.
              <br className={styles.mobileBreak} /> Một câu chuyện để đọc tiếp.
              <br />
              Tìm, mua bán và đổi sách cũ tại TP.HCM.
            </p>
          </div>
          <form
            role="search"
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              navigate(searchUrl(query.trim() ? { q: query.trim() } : {}));
            }}
          >
            <Search size={22} aria-hidden="true" />
            <label htmlFor="home-search" className="sr-only">
              Bạn muốn tìm cuốn nào?
            </label>
            <input
              id="home-search"
              type="search"
              placeholder="Tên sách, tác giả hoặc ISBN…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">
              Tìm sách <ArrowUpRight size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
        <p className={styles.caption}>
          Bìa sách dùng để minh họa · Ảnh sách đang đăng ở bên dưới
        </p>
      </section>
      <Shelf
        title="VỪA LÊN KỆ"
        description="Những bản sách mới được đăng. Biết rõ tình trạng trước khi chọn."
      />
      <section className={styles.discover}>
        <div className={styles.sectionHead}>
          <div>
            <h2>HÔM NAY, BẠN TÌM GÌ?</h2>
            <p>Chọn cách tìm phù hợp với tủ sách và túi tiền của bạn.</p>
          </div>
        </div>
        <div className={styles.tiles}>
          <Link to={searchUrl({ mode: "Sale" })} className={styles.saleTile}>
            <ArrowUpRight aria-hidden="true" />
            <div>
              <span>Thêm một cuốn vào tủ</span>
              <h3>SÁCH ĐỂ MUA</h3>
            </div>
            <img src="/illustrations/alice-moi.webp" alt="" loading="lazy" />
          </Link>
          <Link
            to={searchUrl({ mode: "Exchange" })}
            className={styles.exchangeTile}
          >
            <ArrowUpRight aria-hidden="true" />
            <div>
              <span>Đọc mới từ sách cũ</span>
              <h3>SÁCH ĐỂ ĐỔI</h3>
            </div>
            <img src="/illustrations/chua-nhan.webp" alt="" loading="lazy" />
          </Link>
          <Link
            to={searchUrl({ mode: "Sale", maxSalePrice: "100000" })}
            className={styles.budgetTile}
          >
            <ArrowUpRight aria-hidden="true" />
            <div>
              <span>Một khoản nhỏ cho việc đọc</span>
              <h3>DƯỚI 100.000₫</h3>
            </div>
            <img
              src="/illustrations/nghin-le-mot-dem.webp"
              alt=""
              loading="lazy"
            />
          </Link>
        </div>
        <p className={styles.tileCaption}>
          Bìa minh họa từ tư liệu; mỗi mục mở danh sách bài đăng thực tế.
        </p>
      </section>
      <div className={styles.exchangeShelf}>
        <Shelf
          mode="Exchange"
          title="ĐỔI SÁCH, ĐỔI CÂU CHUYỆN"
          description="Xem bản sách và giá trị đổi do người đăng cung cấp."
        />
      </div>
      <section className={styles.posting}>
        <div>
          <h2>
            TỦ SÁCH CHẬT?
            <br />
            CHO SÁCH MỘT CHƯƠNG MỚI.
          </h2>
          <p>Chụp ảnh, mô tả tình trạng và đăng cuốn bạn muốn bán hoặc đổi.</p>
        </div>
        <Link to={ROUTES.sell}>
          Đăng sách của bạn <ArrowUpRight size={20} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
export default HomePage;
