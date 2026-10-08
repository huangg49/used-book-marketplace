import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getPublicListing, getPublicPhoto } from '../services/public-listings'
import { formatVnd, ROUTES } from '../lib/routes'
import styles from './BookDetailPage.module.css'

const condition = { LikeNew: 'Gần như mới', Good: 'Còn tốt', Fair: 'Đã dùng nhiều', Worn: 'Cũ nhiều' }
export function BookDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const detail = useQuery({ queryKey: ['public-listing', id], queryFn: () => getPublicListing(id), enabled: valid, retry: false })
  const photo = useQuery({ queryKey: ['public-listing-photo', id, detail.data?.revisionId], queryFn: () => getPublicPhoto(id, detail.data!.photos[0]!.id), enabled: Boolean(detail.data?.photos[0]), retry: false, staleTime: 60_000 })
  if (!valid || detail.isError) return <main className={styles.state}><h1>Cuốn sách này không còn trên kệ</h1><Link to={ROUTES.search}>Về kệ sách</Link></main>
  if (!detail.data) return <main className={styles.state}>Đang mở thông tin sách…</main>
  const book = detail.data
  return <main className={styles.page}><Link className={styles.back} to={ROUTES.search}>← Về kệ sách</Link><div className={styles.grid}><section className={styles.coverPanel}>{photo.data ? <img src={photo.data.url} alt={`Ảnh bìa ${book.book.title}`} /> : <div className={styles.photoFallback}>{photo.isError ? 'Không tải được ảnh' : 'Đang tải ảnh…'}</div>}</section><article className={styles.content}><p className={styles.eyebrow}>{book.mode === 'Sale' ? 'Đăng bán' : book.mode === 'Exchange' ? 'Trao đổi' : 'Bán hoặc đổi'} · {condition[book.condition]}</p><h1>{book.book.title}</h1><p className={styles.author}>{book.book.authors.join(', ')}</p><div className={styles.prices}>{book.salePrice !== null && <p><span>Giá bán</span><strong>{formatVnd(book.salePrice)}</strong></p>}{book.exchangeValue !== null && <p><span>Giá trị đổi</span><strong>{formatVnd(book.exchangeValue)}</strong></p>}</div><section className={styles.details}><h2>Tình trạng bản sách</h2><p className={styles.description}>{book.description}</p><dl><div><dt>Ruột sách</dt><dd>{book.pages}</dd></div><div><dt>Bìa và gáy</dt><dd>{book.coverNote}</dd></div><div><dt>Ghi chú</dt><dd>{book.notes}</dd></div><div><dt>Phụ kiện</dt><dd>{book.accessories}</dd></div></dl></section><footer><p>Người đăng: <strong>{book.seller.displayName}</strong></p><p className={styles.note}>{book.fulfillment ? 'Giao hàng DirectDelivery mô phỏng trong TP.HCM.' : 'Bài đăng chưa cấu hình giao nhận.'}</p><p className={styles.note}>Ảnh và tình trạng do người đăng cung cấp; việc kiểm duyệt không xác nhận tình trạng vật lý.</p></footer></article></div></main>
}
