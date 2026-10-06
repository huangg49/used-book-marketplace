import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Award, Quote, Search } from 'lucide-react'
import { ROUTES, searchUrl } from '../lib/routes'
import {
  FEATURED_SELLERS,
  HOW_IT_WORKS,
  TESTIMONIALS,
  TRENDING_QUERIES,
} from '../lib/mock/home'
import type { SellerItem } from '../lib/mock/home'
import { BookCard } from '../components'
import { getPublicListings } from '../services/public-listings'
import styles from './HomePage.module.css'

/* ---------- Hero ---------- */

function Hero() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = keyword.trim()
    // TODO: trang BookSearch sẽ gọi API theo tham số q.
    navigate(q ? searchUrl({ q }) : ROUTES.search)
  }

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        <p className={styles.heroBadge}>Sách cũ, câu chuyện mới</p>
        <h1 id="hero-title" className={styles.heroTitle}>
          Mỗi cuốn sách đều có một quá&nbsp;khứ.
          <br />
          <em className={styles.heroTitleLight}>Hãy cho nó một tương lai.</em>
        </h1>
        <p className={styles.heroLead}>
          Nơi mua, bán và trao đổi sách cũ: sách hiếm, sách kinh điển và những cuốn sách đang chờ
          được đọc lại.
        </p>

        <form className={styles.searchForm} role="search" onSubmit={handleSubmit}>
          <Search size={22} className={styles.searchIcon} aria-hidden="true" />
          <label htmlFor="home-search" className={styles.visuallyHidden}>
            Tìm theo tên sách, tác giả hoặc ISBN
          </label>
          <input
            id="home-search"
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm theo tên sách, tác giả hoặc ISBN..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.searchButton}>
            Khám phá
          </button>
        </form>



        <div className={styles.trending}>
          <span>Tìm nhiều:</span>
          {TRENDING_QUERIES.map((query) => (
            <Link key={query} to={searchUrl({ q: query })} className={styles.trendingLink}>
              {query}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}



function FeaturedBooks() {
  const result = useQuery({ queryKey: ['home-public-listings'], queryFn: () => getPublicListings(new URLSearchParams({ limit: '4', sort: 'newest' })), retry: false, staleTime: 0 })
  return (
    <section className={styles.featured} aria-labelledby="featured-title">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="featured-title" className={styles.sectionTitle}>
              Sách nổi bật
            </h2>
            <p className={styles.sectionLead}>
              Những cuốn sách đáng chú ý, đang tìm một kệ sách mới.
            </p>
          </div>
          <Link to={searchUrl({ collection: 'featured' })} className={styles.viewAll}>
            Xem toàn bộ <span aria-hidden="true">›</span>
          </Link>
        </div>

        <div className={styles.bookGrid}>
          {result.isPending && <p>Đang tải sách trên kệ…</p>}
          {result.isError && <p>Chưa tải được sách. Vui lòng thử lại từ trang Khám phá.</p>}
          {result.data?.items.map((book, index) => (
            <BookCard key={book.id} book={book} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Cách hoạt động ---------- */

function HowItWorks() {
  return (
    <section className={styles.how} aria-labelledby="how-title">
      <div className={styles.container}>
        <div className={styles.centerHeader}>
          <h2 id="how-title" className={styles.sectionTitle}>
            Cách trao đổi sách
          </h2>
          <div className={styles.rule} aria-hidden="true" />
        </div>
        <ol className={styles.steps}>
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepText}>{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------- Người bán ---------- */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const last = parts[parts.length - 1] ?? ''
  return last.charAt(0).toUpperCase()
}

function SellerCard({ seller }: { seller: SellerItem }) {
  return (
    <li className={`${styles.seller} ${seller.featured ? '' : styles.sellerMuted}`}>
      <span className={styles.avatar} aria-hidden="true">
        {getInitials(seller.name)}
      </span>
      <div className={styles.sellerBody}>
        <strong>{seller.name}</strong>
        <p className={styles.sellerBio}>{seller.bio}</p>
      </div>
      {seller.featured && <Award size={26} className={styles.sellerAward} aria-label="Người bán nổi bật" />}
    </li>
  )
}

// Removed SVG imports as we are using external images for now

function SellerSpotlight() {
  return (
    <section className={styles.sellers} aria-labelledby="sellers-title">
      <div className={`${styles.container} ${styles.sellersInner}`}>
        <div className={styles.sellersVisual} aria-hidden="true">
          <div className={styles.visualBlock}>
            <img src="https://i.pinimg.com/474x/57/70/55/5770553158ceac5870925fd79f9699eb.jpg" alt="" className={styles.visualImage} aria-hidden="true" loading="lazy" />
          </div>
          <div className={`${styles.visualBlock} ${styles.visualBlockOffset}`}>
            <img src="https://photo.znews.vn/w660/Uploaded/bpcpwiq2/2020_12_24/vndmdk_1_2.jpg" alt="" className={styles.visualImage} aria-hidden="true" loading="lazy" />
          </div>
        </div>

        <div className={styles.sellersContent}>
          <p className={styles.sellersEyebrow}>Người bán nổi bật</p>
          <h2 id="sellers-title" className={styles.sellersTitle}>
            Những người giữ lửa cho sách
          </h2>
          <p className={styles.sellersLead}>
            Cộng đồng của chúng ta được xây dựng trên sự tin cậy và niềm yêu sách. Từ người có cả
            tủ sách cũ đến người sưu tầm chuyên nghiệp, họ là trái tim của nơi này.
          </p>
          {/* TODO: thay bằng danh sách người bán thật từ API */}
          <ul className={styles.sellerList}>
            {FEATURED_SELLERS.map((seller) => (
              <SellerCard key={seller.id} seller={seller} />
            ))}
          </ul>
          <Link to={ROUTES.sell} className={styles.sellerCta}>
            Trở thành người bán <span aria-hidden="true">›</span>
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ---------- Cảm nhận ---------- */

function Testimonials() {
  return (
    <section className={styles.testimonials} aria-labelledby="testimonials-title">
      <div className={styles.container}>
        <div className={styles.centerHeader}>
          <h2 id="testimonials-title" className={styles.testimonialsTitle}>
            Cảm nhận từ cộng đồng
          </h2>
          <p className={styles.testimonialsLead}>Tiếng nói từ những người yêu sách.</p>
        </div>
        {/* TODO: thay bằng đánh giá thật từ người dùng */}
        <div className={styles.testimonialGrid}>
          {TESTIMONIALS.map((item) => (
            <figure key={item.id} className={styles.testimonial}>
              <Quote size={34} className={styles.quoteIcon} aria-hidden="true" />
              <blockquote className={styles.quote}>{item.quote}</blockquote>
              <figcaption className={styles.quoteAuthor}>{item.author}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Page ---------- */

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedBooks />
      <HowItWorks />
      <SellerSpotlight />
      <Testimonials />
    </>
  )
}
