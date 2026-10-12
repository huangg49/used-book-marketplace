import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, Mail, MessageCircle } from 'lucide-react'
import { ROUTES, searchUrl } from '../lib/routes'
import { Header } from '../components/Header'
export { Header }
import { PageTransition } from '../components/PageTransition'
import styles from './MainLayout.module.css'

interface NavItem {
  label: string
  to: string
}

const COLLECTION_LINKS: NavItem[] = [
  { label: 'Văn học Việt Nam', to: searchUrl({ q: 'Văn học Việt Nam' }) },
  { label: 'Sách thiếu nhi', to: searchUrl({ q: 'Sách thiếu nhi' }) },
  { label: 'Sách ngoại văn', to: searchUrl({ q: 'Sách ngoại văn' }) },
  { label: 'Sách sưu tầm', to: searchUrl({ collection: 'featured' }) },
  { label: 'Sách đang trao đổi', to: searchUrl({ type: 'exchange' }) },
]

// TODO: tạo trang thật cho các mục này rồi chuyển thành <Link>.
const COMPANY_LABELS: string[] = [
  'Về chúng tôi',
  'Hướng dẫn trao đổi',
  'Chính sách bảo mật',
  'Liên hệ',
]



function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <div className={styles.footerLogo}>
              <BookOpen size={30} className={styles.logoIcon} aria-hidden="true" />
              <span className={styles.footerLogoText}>Lật lại</span>
            </div>
            <p className={styles.footerAbout}>
              Giữ cho cuốn sách giấy tiếp tục được đọc. Mỗi cuốn sách đều xứng đáng có thêm một
              người đọc, và mỗi tủ sách đều xứng đáng có một câu chuyện.
            </p>
            <div className={styles.footerSocial}>
              {/* TODO: thay bằng liên kết thật của dự án */}
              <span className={styles.socialIcon} role="img" aria-label="Email liên hệ">
                <Mail size={18} aria-hidden="true" />
              </span>
              <span className={styles.socialIcon} role="img" aria-label="Nhắn tin hỗ trợ">
                <MessageCircle size={18} aria-hidden="true" />
              </span>
            </div>
          </div>

          <nav aria-labelledby="footer-collection">
            <h2 id="footer-collection" className={styles.footerHeading}>
              Bộ sưu tập
            </h2>
            <ul className={styles.footerList}>
              {COLLECTION_LINKS.map((item) => (
                <li key={item.label}>
                  <Link to={item.to} className={styles.footerLink}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className={styles.footerHeading}>Về Lật lại</h2>
            <ul className={styles.footerList}>
              {COMPANY_LABELS.map((label) => (
                <li key={label} className={styles.footerPlaceholder}>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} Lật lại. Bảo lưu mọi quyền.</span>
          <span>Mỗi trang sách là một câu chuyện còn dang dở.</span>
        </div>
      </div>
    </footer>
  )
}

export default function MainLayout() {
  const location = useLocation()

  // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])
  return (
    <div className={styles.root}>
      <a href="#main-content" className={styles.skipLink}>
        Bỏ qua điều hướng
      </a>
      <Header />
      <main id="main-content" className={styles.main} style={(location.pathname === ROUTES.home || location.pathname === ROUTES.search) ? undefined : { paddingTop: '5.5rem' }}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
    </div>
  )
}
