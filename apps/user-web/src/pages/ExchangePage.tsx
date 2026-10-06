import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Repeat } from 'lucide-react'
import { ROUTES, formatVnd, searchUrl } from '../lib/routes'
import { EXCHANGE_BOOKS, EXCHANGE_STEPS, MATCHES } from '../lib/mock/exchange'
import type { ExchangeBook, MatchItem } from '../lib/mock/exchange'
import { BookCover } from '../components/BookCover'
import styles from './ExchangePage.module.css'

/* ---------- Giới thiệu + 3 bước ---------- */

function Intro() {
    return (
        <section className={styles.intro} aria-labelledby="exchange-title">
            <p className={styles.tagline}>Từ tay này sang tay kia, mỗi câu chuyện đều tiếp tục</p>
            <h1 id="exchange-title" className={styles.title}>
                Góc trao đổi sách
            </h1>
            <p className={styles.lead}>
                Nơi những cuốn sách cũ tìm thấy mái nhà mới, qua sự kết nối giữa những người yêu văn
                chương.
            </p>

            <ol className={styles.steps}>
                {EXCHANGE_STEPS.map((step, index) => (
                    <li key={step.title} className={styles.step}>
                        <span className={styles.stepNumber} aria-hidden="true">
                            {index + 1}
                        </span>
                        <h2 className={styles.stepTitle}>{step.title}</h2>
                        <p className={styles.stepText}>{step.description}</p>
                    </li>
                ))}
            </ol>
        </section>
    )
}

/* ---------- Gợi ý khớp ---------- */

function MatchCard({ match }: { match: MatchItem }) {
    const isMutual = match.kind === 'mutual'
    return (
        <article className={styles.match}>
            <div className={styles.matchBooks}>
                <figure className={styles.matchBook}>
                    <BookCover title={match.wanted.title} index={0} coverUrl={match.wanted.coverUrl} />
                    <figcaption className={styles.matchCaption}>
                        <strong>{match.wanted.title}</strong>
                        <span>Sách bạn muốn</span>
                    </figcaption>
                </figure>

                <div className={styles.matchCenter}>
                    <span className={`${styles.matchBadge} ${isMutual ? styles.matchBadgeMutual : ''}`}>
                        {isMutual ? 'Khớp hai chiều' : 'Khớp một chiều'}
                    </span>
                    <Repeat size={30} className={styles.matchIcon} aria-hidden="true" />
                </div>

                <figure className={styles.matchBook}>
                    <BookCover title={match.offered.title} index={1} coverUrl={match.offered.coverUrl} />
                    <figcaption className={styles.matchCaption}>
                        <strong>{match.offered.title}</strong>
                        <span>Sách của bạn</span>
                    </figcaption>
                </figure>
            </div>

            <p className={styles.matchNote}>
                {isMutual
                    ? 'Bạn có cuốn họ cần, và họ có cuốn bạn cần.'
                    : 'Họ có cuốn bạn cần. Hãy thử đề nghị một cuốn khác trong tủ sách của bạn.'}
            </p>

            <Link
                to={ROUTES.exchangeCompose(match.wanted.id)}
                className={isMutual ? styles.matchPrimary : styles.matchSecondary}
            >
                {isMutual ? 'Gửi đề nghị trao đổi' : 'Xem đề nghị này'}
            </Link>
        </article>
    )
}

function Matches() {
    // TODO: chỉ hiện khi đã đăng nhập và có sách trong tủ sách; nếu chưa thì mời đăng nhập/đăng sách.
    return (
        <section className={styles.matches} aria-labelledby="matches-title">
            <div className={styles.container}>
                <div className={styles.matchesHeader}>
                    <h2 id="matches-title" className={styles.matchesTitle}>
                        Gợi ý khớp cho bạn
                    </h2>
                    <div className={styles.matchesRule} aria-hidden="true" />
                    <span className={styles.matchesHint}>Dựa trên tủ sách của bạn</span>
                </div>

                <div className={styles.matchGrid}>
                    {MATCHES.map((match) => (
                        <MatchCard key={match.id} match={match} />
                    ))}
                </div>
            </div>
        </section>
    )
}

/* ---------- Sách đang mở trao đổi ---------- */

type SortMode = 'newest' | 'nearby'

function ExchangeBookCard({ book, index }: { book: ExchangeBook; index: number }) {
    return (
        <article className={styles.card}>
            <BookCover title={book.title} index={index} tag="Đang tìm trao đổi" coverUrl={book.coverUrl} />
            <h3 className={styles.cardTitle}>{book.title}</h3>
            <p className={styles.cardAuthor}>{book.author}</p>
            <p className={styles.cardWants}>
                <span className={styles.cardWantsLabel}>Muốn đổi lấy:</span> {book.wants}
            </p>
            <p className={styles.cardMeta}>
                <span className={styles.cardLocation}>
                    <MapPin size={13} aria-hidden="true" /> {book.location}
                </span>
                <span>Giá tham khảo {formatVnd(book.referencePriceVnd)}</span>
            </p>
            <Link
                to={ROUTES.bookDetail(book.id)}
                className={styles.cardCta}
                aria-label={`Xem đề nghị trao đổi cho ${book.title}`}
            >
                Xem đề nghị
            </Link>
        </article>
    )
}

function OpenForExchange() {
    const [sort, setSort] = useState<SortMode>('newest')

    const books = useMemo(() => {
        const list = [...EXCHANGE_BOOKS]
        // TODO: "Gần tôi" cần vị trí người dùng và sắp xếp ở phía API.
        if (sort === 'newest') {
            list.sort((a, b) => b.listedAt.localeCompare(a.listedAt))
        }
        return list
    }, [sort])

    return (
        <section className={styles.open} aria-labelledby="open-title">
            <div className={styles.container}>
                <div className={styles.openHeader}>
                    <div>
                        <h2 id="open-title" className={styles.openTitle}>
                            Sách đang mở trao đổi
                        </h2>
                        <p className={styles.openLead}>
                            Những đầu sách vừa được đưa lên để trao đổi. Hãy tìm mảnh ghép còn thiếu cho tủ sách
                            của bạn.
                        </p>
                    </div>
                    <div className={styles.sortGroup} role="group" aria-label="Sắp xếp sách">
                        <button
                            type="button"
                            className={styles.sortButton}
                            aria-pressed={sort === 'newest'}
                            onClick={() => setSort('newest')}
                        >
                            Mới nhất
                        </button>
                        <button
                            type="button"
                            className={styles.sortButton}
                            aria-pressed={sort === 'nearby'}
                            onClick={() => setSort('nearby')}
                        >
                            Gần tôi
                        </button>
                    </div>
                </div>

                <div className={styles.bookGrid}>
                    {books.map((book, index) => (
                        <ExchangeBookCard key={book.id} book={book} index={index} />
                    ))}
                </div>

                <div className={styles.moreWrap}>
                    <Link to={searchUrl({ type: 'exchange' })} className={styles.moreButton}>
                        Khám phá tất cả sách trao đổi
                    </Link>
                </div>
            </div>
        </section>
    )
}

/* ---------- Page ---------- */

export default function ExchangePage() {
    return (
        <>
            <Intro />
            <Matches />
            <OpenForExchange />
        </>
    )
}