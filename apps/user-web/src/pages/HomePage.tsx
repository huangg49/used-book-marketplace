import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Repeat2,
  Plus,
  BookOpen,
} from "lucide-react";
import { ROUTES, searchUrl } from "../lib/routes";
import { HomeBookCard } from "../components/HomeBookCard";
import {
  getHomeShelf,
  isCatalogPreview,
  homeShelfUrl,
  previewCatalogCount,
  budgetCoverUrls,
  previewTopics,
  previewTopicBooks,
  homeShelfPageSize,
} from "../services/home-shelves";
import styles from "./HomePage.module.css";

function AutumnOrnaments() {
  const motifs = [
    styles.autumnMaple,
    styles.autumnOval,
    styles.autumnSeed,
    styles.autumnAcorn,
    styles.autumnOak,
    styles.autumnTwig,
    styles.autumnOval,
    styles.autumnMaple,
    styles.autumnAcorn,
    styles.autumnSeed,
    styles.autumnTwig,
    styles.autumnOak,
    styles.autumnSeed,
    styles.autumnMaple,
    styles.autumnOval,
    styles.autumnAcorn,
    styles.autumnOval,
    styles.autumnTwig,
    styles.autumnMaple,
    styles.autumnSeed,
    styles.autumnOak,
    styles.autumnAcorn,
    styles.autumnTwig,
    styles.autumnOval,
  ];
  return (
    <div className={styles.autumnOrnaments} aria-hidden="true">
      {motifs.map((motif, index) => (
        <span
          key={`${motif}-${index}`}
          className={`${styles.autumnMotif} ${motif}`}
        />
      ))}
    </div>
  );
}

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

function BookmarkPaper() {
  const paperId = useId();
  const paperShape =
    "M8.5.5H191.5Q199.5.5 199.5 8.5V163.5Q199.5 167.5 195.5 167.5H120L100 148L80 167.5H4.5Q.5 167.5 .5 163.5V8.5Q.5.5 8.5.5Z";
  return (
    <>
      <svg
        className={styles.bookmarkBacking}
        viewBox="0 0 200 168"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={paperShape} />
      </svg>
      <svg
        className={styles.bookmarkPaper}
        viewBox="0 0 200 168"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={paperId}>
            <path d={paperShape} />
          </clipPath>
        </defs>
        <path d={paperShape} vectorEffect="non-scaling-stroke" />
        <image
          className={styles.bookmarkTexture}
          href="/login-art/ivory-paper.webp"
          width="200"
          height="168"
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${paperId})`}
        />
        <path
          className={styles.bookmarkThread}
          d="M16 12H184"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}

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

const shelfFilters: { label: string; params: Record<string, string> }[] = [
  { label: "Tất cả", params: {} },
  { label: "Mua sách", params: { mode: "Sale" } },
  { label: "Đổi sách", params: { mode: "Exchange" } },
  { label: "Đến 100.000₫", params: { mode: "Sale", maxSalePrice: "100000" } },
];

function LatestShelf({ preview }: { preview: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [liveFilter, setFilter] = useState(0);
  const filter = preview
    ? searchParams.has("maxSalePrice")
      ? 3
      : searchParams.get("mode") === "Sale"
        ? 1
        : searchParams.get("mode") === "Exchange"
          ? 2
          : 0
    : liveFilter;
  const selectionScope = preview ? location.key : String(liveFilter);
  const [selection, setSelection] = useState({
    scope: selectionScope,
    category: "",
    visible: homeShelfPageSize,
  });
  const category = selection.scope === selectionScope ? selection.category : "";
  const visible =
    selection.scope === selectionScope ? selection.visible : homeShelfPageSize;
  const params = shelfFilters[filter].params;
  const query = new URLSearchParams({
    limit: preview ? String(previewCatalogCount) : "24",
    sort: "newest",
    ...params,
  });
  if (preview && searchParams.has("maxSalePrice"))
    query.set("maxSalePrice", searchParams.get("maxSalePrice")!);
  if (preview && searchParams.get("q")) query.set("q", searchParams.get("q")!);
  if (preview && searchParams.get("topic"))
    query.set("topic", searchParams.get("topic")!);
  const topic = preview
    ? previewTopics.find((item) => item.id === searchParams.get("topic"))
    : undefined;
  const result = useQuery({
    queryKey: ["home-shelves", preview, query.toString()],
    queryFn: () => getHomeShelf(query, preview),
    retry: false,
  });
  const items = result.data?.items ?? [];
  const categories = [
    ...new Set(items.map((book) => book.book.category.trim()).filter(Boolean)),
  ];
  const filtered = category
    ? items.filter((book) => book.book.category.trim() === category)
    : items;
  const shown = filtered.slice(0, visible);
  return (
    <>
      <section className={styles.categories} aria-labelledby="category-title">
        <div className={styles.categoryHead}>
          <h2 id="category-title">Khám phá thể loại</h2>
          <p>
            {preview
              ? "Thể loại trong bộ sách xem trước đang chọn."
              : "Thể loại từ tối đa 24 bài đăng mới nhất trong kệ đang chọn."}
          </p>
        </div>
        <div
          className={styles.categoryChoices}
          role="group"
          aria-label="Lọc thể loại trong kệ mới"
        >
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => {
              setSelection({
                scope: selectionScope,
                category: "",
                visible: homeShelfPageSize,
              });
            }}
          >
            <BookOpen size={18} aria-hidden="true" /> Tất cả thể loại
          </button>
          {categories.map((name) => (
            <button
              type="button"
              key={name}
              aria-pressed={category === name}
              onClick={() => {
                setSelection({
                  scope: selectionScope,
                  category: name,
                  visible: homeShelfPageSize,
                });
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {result.isPending && (
          <p className={styles.categoryNote}>Đang tải thể loại…</p>
        )}
        {result.isError && (
          <p className={styles.categoryNote}>
            Thể loại sẽ hiện khi tải được bài đăng. Bạn vẫn có thể tìm theo hình
            thức hoặc mức giá.
          </p>
        )}
        {!result.isPending && !result.isError && categories.length === 0 && (
          <p className={styles.categoryNote}>Chưa có thể loại trong kệ này.</p>
        )}
      </section>
      <section className={styles.shelf} aria-labelledby="latest-title">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="latest-title">
              {preview
                ? (topic?.title ?? "Kệ sách xem trước")
                : "Sách mới đăng"}
            </h2>
            <p>
              Mỗi cuốn một tình trạng, một câu chuyện. Chọn bản sách hợp với
              bạn.
            </p>
            {topic && <Link to={homeShelfUrl({}, true)}>Về tất cả chủ đề</Link>}
          </div>
          {preview ? (
            <button
              className={styles.more}
              type="button"
              onClick={() =>
                setSelection({
                  scope: selectionScope,
                  category,
                  visible: filtered.length,
                })
              }
            >
              Xem toàn bộ kệ mẫu <ArrowUpRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <Link to={searchUrl(params)}>
              Tìm trong toàn bộ sách{" "}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div
          className={styles.shelfFilters}
          role="group"
          aria-label="Chọn kệ sách mới"
        >
          {shelfFilters.map((item, index) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={index === filter}
              onClick={() => {
                if (preview)
                  setSearchParams({
                    data: "preview",
                    ...(topic ? { topic: topic.id } : {}),
                    ...(searchParams.get("q")
                      ? { q: searchParams.get("q")! }
                      : {}),
                    ...item.params,
                  });
                else setFilter(index);
                setSelection({
                  scope: "",
                  category: "",
                  visible: homeShelfPageSize,
                });
              }}
            >
              {item.label}
            </button>
          ))}
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
          {!result.isPending && !result.isError && filtered.length === 0 && (
            <div className={styles.state}>
              <p>
                {category
                  ? "Chưa có sách thuộc thể loại này trong các bài đăng đã tải."
                  : "Chưa có sách trong kệ này."}
              </p>
              <Link to={homeShelfUrl({}, preview)}>
                {preview ? "Xem lại bộ sách mẫu" : "Tìm thêm sách"}
              </Link>
            </div>
          )}
          {result.data && !result.isError && filtered.length > 0 && (
            <p className={styles.resultScope}>
              {category && <strong>{category} · </strong>}
              {shown.length} / {filtered.length}{" "}
              {preview ? "sách xem trước" : "bài đăng đã tải"}
              {category ? " thuộc thể loại này" : ""}.
              {result.data.nextCursor &&
                " Còn bài đăng khác trong danh sách tìm sách."}
            </p>
          )}
          <div className={styles.grid}>
            {!result.isError &&
              shown.map((book, index) => (
                <HomeBookCard key={book.id} book={book} index={index} />
              ))}
          </div>
          {!result.isError && filtered.length > visible && (
            <button
              className={styles.more}
              type="button"
              onClick={() =>
                setSelection({
                  scope: selectionScope,
                  category,
                  visible: visible + homeShelfPageSize,
                })
              }
            >
              Xem thêm trong kệ <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function TopicShelves() {
  return (
    <div className={styles.topicShelves}>
      {previewTopics.map((topic) => (
        <section
          className={styles.shelf}
          aria-labelledby={`topic-${topic.id}`}
          key={topic.id}
        >
          <div className={styles.sectionHead}>
            <div>
              <h2 id={`topic-${topic.id}`}>{topic.title}</h2>
              <p>{topic.description}</p>
            </div>
            <Link to={homeShelfUrl({ topic: topic.id }, true)}>
              Xem thêm sách <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.grid}>
            {previewTopicBooks(topic.id).map((book, index) => (
              <HomeBookCard key={book.id} book={book} index={index} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ExchangeShelf({ preview }: { preview: boolean }) {
  const query = new URLSearchParams({
    limit: "4",
    sort: "newest",
    mode: "Exchange",
  });
  const result = useQuery({
    queryKey: ["home-shelves", preview, query.toString()],
    queryFn: () => getHomeShelf(query, preview),
    retry: false,
  });
  return (
    <section
      className={styles.exchangeSection}
      aria-labelledby="exchange-title"
    >
      <div className={styles.exchangeIntro}>
        <Repeat2 size={28} aria-hidden="true" />
        <h2 id="exchange-title">
          Đổi sách.
          <br />
          Đổi góc nhìn.
        </h2>
        <p>Mang một câu chuyện đã đọc, tìm một cuốn muốn đọc tiếp.</p>
        <Link to={homeShelfUrl({ mode: "Exchange" }, preview)}>
          Khám phá sách để đổi <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
        <p className={styles.exchangeNote}>
          {preview
            ? "Giá trị đổi và tình trạng là dữ liệu mẫu để xem giao diện."
            : "Giá trị đổi do người đăng cung cấp. Xem chi tiết để biết tình trạng bản sách."}
        </p>
      </div>
      <div
        className={styles.exchangeBooks}
        aria-live="polite"
        aria-busy={result.isFetching}
      >
        {result.isPending && (
          <div className={styles.loading}>Đang tải sách để đổi…</div>
        )}
        {result.isError && (
          <div className={styles.state} role="alert">
            <p>Chưa tải được sách để đổi.</p>
            <button
              type="button"
              disabled={result.isFetching}
              onClick={() => void result.refetch()}
            >
              Thử lại
            </button>
          </div>
        )}
        {!result.isError && result.data?.items.length === 0 && (
          <div className={styles.state}>
            <p>Chưa có sách để đổi. Bắt đầu từ cuốn bạn đã đọc nhé.</p>
            <Link to={ROUTES.sell}>Đăng sách để đổi</Link>
          </div>
        )}
        <div className={styles.exchangeGrid}>
          {!result.isError &&
            result.data?.items.map((book, index) => (
              <HomeBookCard book={book} index={index} key={book.id} />
            ))}
        </div>
      </div>
    </section>
  );
}
export function HomePage() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const preview = isCatalogPreview(location.search);
  useEffect(() => {
    if (preview && location.hash === "#latest-title")
      document
        .getElementById("latest-title")
        ?.scrollIntoView({ block: "start" });
  }, [preview, location.key, location.hash]);
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
              navigate(
                homeShelfUrl(query.trim() ? { q: query.trim() } : {}, preview),
              );
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
          {preview
            ? "Bìa trên hero để trang trí · Bộ sách bên dưới đang ở chế độ xem trước"
            : "Bìa sách dùng để minh họa · Ảnh sách đang đăng ở bên dưới"}
        </p>
      </section>
      <div className={styles.marketplace}>
        <AutumnOrnaments />
        <div className={styles.autumnCanopies} aria-hidden="true">
          <span className={styles.canopyLeft} />
          <span className={styles.canopyRight} />
        </div>
        <div className={styles.shortcutBand}>
          <nav className={styles.quickLinks} aria-label="Khám phá sách">
            <Link
              className={styles.quickBuy}
              to={homeShelfUrl({ mode: "Sale" }, preview)}
            >
              <BookmarkPaper />
              <img
                src="/illustrations/penguins/buy.png"
                width="88"
                height="88"
                alt=""
              />
              <span>Mua sách</span>
            </Link>
            <Link
              className={styles.quickExchange}
              to={homeShelfUrl({ mode: "Exchange" }, preview)}
            >
              <BookmarkPaper />
              <img
                src="/illustrations/penguins/exchange.png"
                width="88"
                height="88"
                alt=""
              />
              <span>Đổi sách</span>
            </Link>
            <Link
              className={styles.quickAuction}
              to={ROUTES.auctions}
            >
              <BookmarkPaper />
              <img
                src="/illustrations/penguins/auction.png"
                width="88"
                height="88"
                alt=""
              />
              <span>Đấu giá</span>
            </Link>
            <Link className={styles.quickPost} to={ROUTES.sell}>
              <BookmarkPaper />
              <img
                src="/illustrations/penguins/post.png"
                width="88"
                height="88"
                alt=""
              />
              <span>Đăng sách</span>
            </Link>
          </nav>
        </div>
        <div className={styles.marketInner}>
          <LatestShelf preview={preview} key={preview ? "preview" : "live"} />
          <section
            className={styles.budgetBanners}
            aria-label="Tìm sách theo ngân sách"
          >
            <Link
              to={homeShelfUrl(
                { mode: "Sale", maxSalePrice: "50000" },
                preview,
              )}
              className={styles.budgetSmall}
            >
              <div>
                <h2>
                  Đọc hay,
                  <br />
                  chi vừa.
                </h2>
                <p>Tìm sách giá đến 50.000₫</p>
                <span>
                  Xem sách <ArrowUpRight size={18} aria-hidden="true" />
                </span>
              </div>
              <div className={styles.bannerCovers} aria-hidden="true">
                <img src={budgetCoverUrls[0]} alt="" loading="lazy" />
                <img src={budgetCoverUrls[1]} alt="" loading="lazy" />
              </div>
            </Link>
            <Link
              to={homeShelfUrl(
                { mode: "Sale", maxSalePrice: "100000" },
                preview,
              )}
              className={styles.budgetLarge}
            >
              <div>
                <h2>
                  Thêm sách.
                  <br />
                  Thêm vui.
                </h2>
                <p>Tìm sách giá đến 100.000₫</p>
                <span>
                  Xem sách <ArrowUpRight size={18} aria-hidden="true" />
                </span>
              </div>
              <div className={styles.bannerCovers} aria-hidden="true">
                <img src={budgetCoverUrls[2]} alt="" loading="lazy" />
                <img src={budgetCoverUrls[3]} alt="" loading="lazy" />
              </div>
            </Link>
          </section>
          <p className={styles.artNote}>
            Bìa trong banner dùng để minh họa, không đại diện cho sách hay giá
            đang bán.
          </p>
          {preview && <TopicShelves />}
          <ExchangeShelf preview={preview} />
          <section className={styles.posting} aria-labelledby="posting-title">
            <div>
              <h2 id="posting-title">
                Đọc xong rồi?
                <br />
                <span>Để sách đi tiếp.</span>
              </h2>
              <p>Chụp ảnh, ghi rõ tình trạng và đăng sách để bán hoặc đổi.</p>
            </div>
            <div className={styles.postingAction}>
              <Link to={ROUTES.sell}>
                Đăng sách của bạn <Plus size={20} aria-hidden="true" />
              </Link>
              <p>Mỗi bản sách có ảnh và mô tả riêng.</p>
            </div>
          </section>
        </div>
        <div className={styles.autumnClosing} aria-hidden="true">
          <img
            src="/illustrations/autumn/fox-landscape.webp"
            alt=""
            width={1920}
            height={1080}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </div>
  );
}
export default HomePage;
