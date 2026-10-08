import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { ROUTES } from '../lib/routes'
import { session } from '../lib/session'
import { getPurchaseMessages, purchaseMessageSchema, type PurchaseMessage } from '../services/purchase-conversations'

const socketUrl = (import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000/api/v1').replace(/\/api\/v1$/, '')
export function ChatPage() {
  const { roomId } = useParams<{ roomId?: string }>(); const state = useSession(); const [messages, setMessages] = useState<PurchaseMessage[]>([]); const [body, setBody] = useState(''); const [error, setError] = useState<string | null>(null)
  const history = useQuery({ queryKey: ['purchase-messages', roomId], queryFn: () => getPurchaseMessages(roomId!), enabled: Boolean(roomId && state.status === 'authenticated') })
  useEffect(() => { if (history.data) setMessages(history.data) }, [history.data])
  useEffect(() => {
    if (!roomId || state.status !== 'authenticated') return
    const token = session.getAccessToken(); if (!token) return
    const socket: Socket = io(`${socketUrl}/purchase-chat`, { auth: { token } })
    socket.emit('purchase:join', roomId, (reply: { ok?: boolean }) => { if (!reply?.ok) setError('Không thể mở cuộc trò chuyện này.') })
    socket.on('purchase:message', (raw: unknown) => { const parsed = purchaseMessageSchema.safeParse(raw); if (parsed.success && parsed.data.conversationId === roomId) setMessages((current) => current.some((m) => m.id === parsed.data.id) ? current : [...current, parsed.data]) })
    socket.on('connect_error', () => setError('Kết nối chat bị gián đoạn. Bạn vẫn có thể tải lại tin nhắn.'))
    return () => {
      socket.disconnect()
    }
  }, [roomId, state.status])
  if (state.status !== 'authenticated') return <section style={{ padding: '2rem' }}><h1>Nhắn tin</h1><p>Hãy đăng nhập để xem cuộc trò chuyện.</p><Link to={ROUTES.login}>Đăng nhập</Link></section>
  if (!roomId) return <section style={{ padding: '2rem' }}><h1>Nhắn tin</h1><p>Cuộc trò chuyện được mở khi bạn mua một cuốn sách.</p></section>
  const send = () => { const text = body.trim(); if (!text || text.length > 1000) return; const token = session.getAccessToken(); if (!token) return setError('Phiên đăng nhập đã hết hạn.'); const socket = io(`${socketUrl}/purchase-chat`, { auth: { token } }); socket.on('connect', () => { socket.emit('purchase:join', roomId, () => socket.emit('purchase:send', { messageId: crypto.randomUUID(), conversationId: roomId, body: text }, (reply: unknown) => { const parsed = purchaseMessageSchema.safeParse(reply); if (parsed.success) { setMessages((items) => items.some((m) => m.id === parsed.data.id) ? items : [...items, parsed.data]); setBody('') } else setError('Không gửi được tin nhắn. Hãy thử lại.'); socket.disconnect() })) }); socket.on('connect_error', () => { setError('Không kết nối được chat.'); socket.disconnect() }) }
  return <section style={{ maxWidth: 800, margin: '0 auto', padding: '2rem clamp(1rem, 4vw, 3rem)' }}><h1>Trao đổi với người bán</h1><p>Cuộc trò chuyện này chỉ dùng trong thời gian giữ sách 24 giờ.</p>{history.isLoading && <p>Đang tải tin nhắn…</p>}{error && <p role="alert">{error}</p>}<div aria-live="polite">{messages.map((message) => <p key={message.id}><strong>{message.senderId === state.user.id ? 'Bạn' : 'Người kia'}:</strong> {message.body}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); send() }}><label htmlFor="message">Tin nhắn</label><textarea id="message" value={body} maxLength={1000} onChange={(event) => setBody(event.target.value)} /><button type="submit" disabled={!body.trim()}>Gửi</button></form></section>
}
