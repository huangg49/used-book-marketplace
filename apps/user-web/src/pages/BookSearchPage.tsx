import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { BookCard } from '../components/BookCard'
import { getPublicListings } from '../services/public-listings'
import styles from './BookSearchPage.module.css'

const conditionLabels = { LikeNew: 'Gần như mới', Good: 'Còn tốt', Fair: 'Đã dùng nhiều', Worn: 'Cũ nhiều' }

export function BookSearchPage() {
  const [params, setParams] = useSearchParams()
  const query = new URLSearchParams()
  for (const key of ['q', 'mode', 'condition', 'sort', 'minSalePrice', 'maxSalePrice']) {
    const value = params.get(key)
    if (value) query.set(key, value)
  }
  query.set('limit', '12')
  const result = useQuery({ queryKey: ['public-listings', query.toString()], queryFn: () => getPublicListings(query), retry: false, staleTime: 0 })
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }) }

  return <main className={styles.container}>
    <header className={styles.header}><div className={styles.headerInner}><div className={styles.titleWrapper}><h1 className={styles.title}>Khám phá kệ sách</h1><p className={styles.subtitle}>{result.data ? `${result.data.items.length} cuốn sách đang có thể xem.` : 'Tìm sách theo tên, tác giả hoặc ISBN.'}</p></div><label className={styles.sortContainer}>Sắp xếp <select className={styles.sortSelect} value={params.get('sort') ?? 'newest'} onChange={(event) => update('sort', event.target.value)}><option value="newest">Mới nhất</option><option value="salePriceAsc">Giá thấp đến cao</option><option value="salePriceDesc">Giá cao đến thấp</option></select></label></div></header>
    <div className={styles.mainLayout}><aside className={styles.sidebar}><div className={styles.filterGroup}><label htmlFor="book-query" className={styles.filterTitle}>Tìm sách</label><input id="book-query" value={params.get('q') ?? ''} onChange={(event) => update('q', event.target.value)} placeholder="Tên, tác giả, ISBN" /></div><div className={styles.filterGroup}><h2 className={styles.filterTitle}>Hình thức</h2>{[['', 'Tất cả'], ['Sale', 'Bán'], ['Exchange', 'Trao đổi'], ['Both', 'Bán hoặc đổi']].map(([value, label]) => <label key={value} className={styles.filterItem}><input type="radio" name="mode" checked={(params.get('mode') ?? '') === value} onChange={() => update('mode', value)} />{label}</label>)}</div><div className={styles.filterGroup}><h2 className={styles.filterTitle}>Tình trạng</h2>{Object.entries(conditionLabels).map(([value, label]) => <label key={value} className={styles.filterItem}><input type="radio" name="condition" checked={params.get('condition') === value} onChange={() => update('condition', params.get('condition') === value ? '' : value)} />{label}</label>)}</div></aside>
    <section className={styles.resultsArea} aria-live="polite">{result.isPending && <p>Đang tải kệ sách…</p>}{result.isError && <div><p>Không tải được kệ sách. Vui lòng kiểm tra API rồi thử lại.</p><button type="button" onClick={() => void result.refetch()}>Thử lại</button></div>}{result.data?.items.length === 0 && <p>Chưa có cuốn sách nào phù hợp.</p>}<div className={styles.grid}>{result.data?.items.map((book, index) => <BookCard key={book.id} book={book} index={index} />)}</div></section></div>
  </main>
}
