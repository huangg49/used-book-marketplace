import { Link } from 'react-router-dom'
import {
  PLATFORM_CONTACT_CHANNELS,
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_CONTACT_FAQ,
  PLATFORM_POLICY_NOTICE,
  PLATFORM_POLICY_SECTIONS,
  PLATFORM_POLICY_UPDATED,
} from '@used-books/session-client'
import { useIsAuthenticated } from '../hooks/useSession'
import { ROUTES } from '../lib/routes'
import styles from './PolicyPages.module.css'

const updated = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' })
  .format(new Date(`${PLATFORM_POLICY_UPDATED}T00:00:00+07:00`))

export function PolicyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.lede}>
        <h1>Chính sách & quy chế</h1>
        <p>Những điều cần biết trước khi đăng, mua, đổi hoặc đấu giá sách trên Lật lại.</p>
        <p className={styles.meta}>Cập nhật {updated}</p>
      </header>
      <p className={styles.notice} role="note">{PLATFORM_POLICY_NOTICE}</p>
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Mục lục chính sách">
          <ol>
            {PLATFORM_POLICY_SECTIONS.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          </ol>
        </nav>
        <div>
          {PLATFORM_POLICY_SECTIONS.map(s => (
            <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`}>{s.title}</h2>
              <p>{s.summary}</p>
              <ul>{s.points.map(point => <li key={point}>{point}</li>)}</ul>
            </section>
          ))}
          <section className={styles.section}>
            <h2>Áp dụng chính sách</h2>
            <p>
              Phí, thời hạn và tỷ lệ được lưu lại tại lúc giao kết; thay đổi chính sách sau đó không áp dụng ngược
              cho giao dịch đang chạy. Thời hạn tính theo giờ liên tục trên máy chủ.
            </p>
            <div className={styles.links}>
              <Link to={ROUTES.contact}>Liên hệ Lật lại</Link>
              <Link to="/guide">Hướng dẫn bắt đầu</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export function ContactPage() {
  const signedIn = useIsAuthenticated()
  const supportTo = signedIn
    ? ROUTES.supportNew
    : `${ROUTES.login}?returnUrl=${encodeURIComponent(ROUTES.supportNew)}`
  return (
    <div className={styles.page}>
      <header className={styles.lede}>
        <h1>Liên hệ</h1>
        <p>
          Cần trợ giúp về một giao dịch, tài khoản hoặc góp ý cho đồ án? Chọn kênh phù hợp bên dưới.
        </p>
      </header>
      <div className={styles.channels}>
        {PLATFORM_CONTACT_CHANNELS.map(c => (
          <section key={c.id} className={styles.channel} aria-labelledby={`contact-${c.id}`}>
            <h2 id={`contact-${c.id}`}>{c.title}</h2>
            {c.id === 'email' ? (
              <>
                <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>
                <p>Phản hồi trong giờ hành chính. Đừng gửi mật khẩu hoặc mã xác thực qua email.</p>
              </>
            ) : (
              <>
                <p>{c.detail}</p>
                <Link className={styles.primary} to={supportTo}>
                  {signedIn ? 'Tạo yêu cầu hỗ trợ' : 'Đăng nhập để tạo yêu cầu'}
                </Link>
              </>
            )}
          </section>
        ))}
      </div>
      <section className={styles.faq} aria-labelledby="faq-title">
        <h2 id="faq-title">Câu hỏi thường gặp</h2>
        <dl>
          {PLATFORM_CONTACT_FAQ.map(item => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.links}>
          <Link to={ROUTES.policy}>Xem chính sách & quy chế</Link>
          {signedIn && <Link to="/support">Yêu cầu hỗ trợ của tôi</Link>}
        </div>
      </section>
    </div>
  )
}
