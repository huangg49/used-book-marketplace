import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@used-books/session-client'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useSession } from '../hooks/useSession'
import { formatVnd, ROUTES } from '../lib/routes'
import { getPurchaseConversations, startPurchaseConversation } from '../services/purchase-conversations'
import { getPublicListing, getPublicPhoto } from '../services/public-listings'
import styles from './BookDetailPage.module.css'

const condition = { LikeNew: 'Gần như mới', Good: 'Còn tốt', Fair: 'Đã dùng nhiều', Worn: 'Cũ nhiều' }

function purchaseError(error: unknown) {
  if (!(error instanceof ApiError)) return 'Chưa thể bắt đầu cuộc trao đổi. Vui lòng thử lại sau.'
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error.code === 'CONFLICT') return 'Thông tin sách vừa thay đổi. Hãy tải lại trang để xem trạng thái mới nhất.'
  if (error.code === 'INVALID_STATE') return 'Sách này hiện chưa thể mở cuộc trao đổi. Hãy tải lại trang.'
  if (error.status === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
  return 'Máy chủ chưa thể bắt đầu cuộc trao đổi. Vui lòng thử lại sau.'
}
export function BookDetailPage() {
  const { id = '' } = useParams<{ id: string }>(); const navigate = useNavigate(); const state = useSession()
  const valid = /^[0-9a-f-]{36}$/i.test(id)
  const detail = useQuery({ queryKey: ['public-listing', id], queryFn: () => getPublicListing(id), enabled: valid, retry: false })
  const photo = useQuery({ queryKey: ['public-listing-photo', id, detail.data?.revisionId], queryFn: () => getPublicPhoto(id, detail.data!.photos[0]!.id), enabled: Boolean(detail.data?.photos[0]), retry: false, staleTime: 60_000 })
  const conversations = useQuery({ queryKey: ['purchase-conversations'], queryFn: getPurchaseConversations, enabled: state.status === 'authenticated', retry: false })
  const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  if (!valid || detail.isError) return <main className={styles.state}><h1>Cuốn sách này không còn trên kệ</h1><Link to={ROUTES.search}>Về kệ sách</Link></main>
  if (!detail.data) return <main className={styles.state}>Đang mở thông tin sách…</main>
  const book = detail.data; const held = book.purchaseAvailability.status === 'InNegotiation'
  const isOwner = state.status === 'authenticated' && state.user.id === book.seller.id
  const activeConversation = conversations.data?.find((conversation) => conversation.listingId === book.id && conversation.status === 'Active')
  const requestPurchase = () => { if (state.status !== 'authenticated') { navigate(ROUTES.login); return }; if (isOwner) return; setError(null); setConfirming(true) }
  const confirmPurchase = async () => { setBusy(true); setError(null); try { const receipt = await startPurchaseConversation(book.id, book.version); navigate(ROUTES.chat(receipt.entityId)) } catch (caught) { setError(purchaseError(caught)) } finally { setBusy(false) } }
  return <main className={styles.page}><Link className={styles.back} to={ROUTES.search}>← Về kệ sách</Link><div className={styles.grid}><section className={styles.coverPanel}>{photo.data ? <img src={photo.data.url} alt={`Ảnh bìa ${book.book.title}`} /> : <div className={styles.photoFallback}>{photo.isError ? 'Không tải được ảnh' : 'Đang tải ảnh…'}</div>}</section><article className={styles.content}><p className={styles.eyebrow}>{book.mode === 'Sale' ? 'Đăng bán' : book.mode === 'Exchange' ? 'Trao đổi' : 'Bán hoặc đổi'} · {condition[book.condition]}</p><h1>{book.book.title}</h1><p className={styles.author}>{book.book.authors.join(', ')}</p><div className={styles.prices}>{book.salePrice !== null && <p><span>Giá bán</span><strong>{formatVnd(book.salePrice)}</strong></p>}{book.exchangeValue !== null && <p><span>Giá trị đổi</span><strong>{formatVnd(book.exchangeValue)}</strong></p>}</div>{book.salePrice !== null && isOwner && <section className={styles.purchase}><h2>{activeConversation ? 'Sách đang giao dịch' : 'Đây là bài đăng của bạn'}</h2><p>{activeConversation ? 'Bạn đang trao đổi với người mua cho cuốn sách này.' : 'Bạn không thể mua bài đăng của chính mình.'}</p>{activeConversation && <Link className={styles.chatLink} to={ROUTES.chat(activeConversation.id)}>Mở chat với người mua</Link>}</section>}{book.salePrice !== null && !isOwner && <section className={styles.purchase}><h2>{held ? 'Sách đang giao dịch' : 'Bạn muốn mua cuốn này?'}</h2><p>{held ? `Một cuộc trao đổi đang diễn ra${book.purchaseAvailability.expiresAt ? ` đến ${new Date(book.purchaseAvailability.expiresAt).toLocaleString('vi-VN')}` : ''}. ${activeConversation ? 'Bạn là người tham gia cuộc trao đổi này.' : 'Bạn vẫn có thể xem thông tin nhưng chưa thể mua.'}` : 'Khi mua, hệ thống giữ sách trong 24 giờ và mở chat riêng với người bán. Bước này chưa phát sinh thanh toán.'}</p>{activeConversation ? <Link className={styles.chatLink} to={ROUTES.chat(activeConversation.id)}>Mở chat với người bán</Link> : <><>{error && <p className={styles.purchaseError} role="alert">{error}</p>}</><button type="button" disabled={held} onClick={requestPurchase}>{held ? 'Đang giao dịch' : 'Mua sách'}</button></>}</section>}<section className={styles.details}><h2>Tình trạng bản sách</h2><p className={styles.description}>{book.description}</p><dl><div><dt>Ruột sách</dt><dd>{book.pages}</dd></div><div><dt>Bìa và gáy</dt><dd>{book.coverNote}</dd></div><div><dt>Ghi chú</dt><dd>{book.notes}</dd></div><div><dt>Phụ kiện</dt><dd>{book.accessories}</dd></div></dl></section><footer><p>Người đăng: <strong>{book.seller.displayName}</strong></p><p className={styles.note}>{book.fulfillment ? 'Giao hàng DirectDelivery mô phỏng trong TP.HCM.' : 'Bài đăng chưa cấu hình giao nhận.'}</p><p className={styles.note}>Ảnh và tình trạng do người đăng cung cấp; việc kiểm duyệt không xác nhận tình trạng vật lý.</p></footer></article></div><ConfirmDialog isOpen={confirming} onClose={() => !busy && setConfirming(false)} title="Giữ sách để trao đổi?" description="Sách sẽ chuyển sang đang giao dịch trong 24 giờ và chỉ bạn cùng người bán có thể chat. Bước này chưa thanh toán." confirmText="Giữ sách và mở chat" onConfirm={() => void confirmPurchase()} isBusy={busy}>{error && <p role="alert">{error}</p>}</ConfirmDialog></main>
}
