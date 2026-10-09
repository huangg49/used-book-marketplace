import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, Mail, Menu, MessageCircle, X, Search, User, Heart, Wallet } from 'lucide-react'
import { ROUTES, searchUrl } from '../lib/routes'
import { useSession } from '../hooks/useSession'
import { NotificationBell } from '../components/NotificationBell'
import { session } from '../lib/session'
import styles from './MainLayout.module.css'

interface NavItem {
  label: string
  to: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Khám phá', to: ROUTES.search },
  { label: 'Sách hiếm', to: searchUrl({ collection: 'featured' }) },
  { label: 'Đấu giá', to: ROUTES.auctions },
  { label: 'Đổi sách', to: ROUTES.exchange },
]

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

export function Logo() {
  return (
    <Link to={ROUTES.home} className={styles.logo} aria-label="Trang chủ Lật lại">
      <img src="/logov2.png" alt="Lật Lại Logo" className={styles.logoImage} />
      <div className={styles.logoTextWrapper}>
        <span className={styles.logoText}>Lật Lại</span>
        <span className={styles.logoSubtext}>SÀN SÁCH CŨ & DI SẢN ĐỌC</span>
      </div>
    </Link>
  )
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const state = useSession()
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isItemActive = (item: NavItem) => {
    // If the link has query params, match exactly
    if (item.to.includes('?')) {
      return location.pathname + location.search === item.to
    }
    // For 'Mua' (ROUTES.search), it shouldn't be active if we are on 'Trao đổi' or 'Bộ sưu tập'
    if (item.to === ROUTES.search && location.pathname === ROUTES.search) {
      return !location.search.includes('type=exchange') && !location.search.includes('collection=')
    }
    return location.pathname === item.to || (item.to !== ROUTES.home && location.pathname.startsWith(item.to))
  }

  const isHome = location.pathname === ROUTES.home || location.pathname === '/'
  const isSearchPage = location.pathname === ROUTES.search
  const isDarkTheme = isScrolled || isHome || isSearchPage

  return (
    <header className={`${styles.header} ${isScrolled ? styles.headerScrolled : ''} ${isDarkTheme ? styles.themeDark : ''}`}>
      <div className={styles.headerInner}>
        <Logo />

        <div className={styles.searchBarWrapper}>
          <div className={styles.searchIcon}><Search size={16} /></div>
          <input type="text" placeholder="Tìm kiếm theo tựa sách" className={styles.searchInput} />
          <div className={styles.searchBadge}>ISBN</div>
        </div>

        <nav className={styles.desktopNav} aria-label="Điều hướng chính">
          {NAV_ITEMS.map((item, index) => {
            const link = (
              <Link 
                key={item.label} 
                to={item.to} 
                className={`${styles.navLink} ${isItemActive(item) ? styles.navLinkActive : ''}`}
              >
                {item.label}
              </Link>
            );
            
            if (index === NAV_ITEMS.length - 1) return link;
            
            return [
              link,
              <span key={`sep-${item.label}`} className={styles.navSeparator} />
            ];
          })}
        </nav>

        <div className={styles.headerActions}>
          {state.status === 'authenticated' && <NotificationBell />}
          <button className={styles.iconBtn} aria-label="Yêu thích">
            <Heart size={20} aria-hidden="true" />
          </button>

          <div className={styles.walletBtn}>
            <Wallet size={18} aria-hidden="true" className={styles.walletIcon} /> 120 Xu
          </div>

          <Link to={state.status === 'authenticated' ? '/profile' : ROUTES.login} className={styles.iconBtn} aria-label="Tài khoản">
            <User size={20} aria-hidden="true" />
          </Link>

          <Link to={ROUTES.sell} className={styles.btnPrimaryHeader}>
            + Đăng sách
          </Link>
          
          <button
            type="button"
            className={styles.menuButton}
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-nav" className={styles.mobileNav} aria-label="Điều hướng trên điện thoại">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`${styles.mobileNavLink} ${isItemActive(item) ? styles.mobileNavLinkActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link to={ROUTES.sell} className={styles.mobileNavLink} onClick={() => setMenuOpen(false)}>Đăng sách</Link>
          {state.status === 'authenticated' ? (
            <>
              <Link to={ROUTES.notifications} className={styles.mobileNavLink} onClick={() => setMenuOpen(false)}>
                Thông báo
              </Link>
              <Link to="/profile" className={styles.mobileNavLink} onClick={() => setMenuOpen(false)}>
                Hồ sơ ({state.user.displayName})
              </Link>
              <button 
                onClick={() => { setMenuOpen(false); void session.logout(); }}
                className={styles.mobileNavLink}
                style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <Link
              to={ROUTES.login}
              className={styles.mobileNavLink}
              onClick={() => setMenuOpen(false)}
            >
              Đăng nhập
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}

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
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
