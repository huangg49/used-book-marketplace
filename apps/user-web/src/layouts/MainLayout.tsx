import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { ROUTES, searchUrl } from "../lib/routes";
import { Header, Logo } from "../components/Header";
import { ConversationNavigation } from "../components/conversation/ConversationNavigation";
import { useConversationTransition } from "../components/conversation/conversation-navigation";
export { Header };
import styles from "./MainLayout.module.css";

export default function MainLayout() {
  const location = useLocation();
  const isChat =
    location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const chatTransition = useConversationTransition("/chat");
  useEffect(() => {
    if (isChat) return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname, isChat]);
  return (
    <div
      className={styles.root}
      data-chat-transition={chatTransition || undefined}
      data-chat-direction={
        chatTransition
          ? location.pathname === "/chat"
            ? "exit"
            : "enter"
          : undefined
      }
    >
      <a href="#main-content" className={styles.skipLink}>
        Bỏ qua điều hướng
      </a>
      <Header freezeScroll={chatTransition} />
      <main
        id="main-content"
        tabIndex={-1}
        className={styles.main}
        data-chat={isChat || undefined}
        data-exchange={
          location.pathname === "/exchange" ||
          location.pathname.startsWith("/exchange/") ||
          undefined
        }
      >
        <ConversationNavigation>
          <Outlet />
        </ConversationNavigation>
      </main>
      {!isChat && (
        <footer
          className={`${styles.footer} ${location.pathname === ROUTES.home || location.pathname === ROUTES.search ? styles.homeFooter : ""}`}
        >
          <div className={styles.footerInner}>
            <div>
              <Logo />
              <p>
                Sách cũ. Người đọc mới.
                <br />
                Câu chuyện còn tiếp.
              </p>
            </div>
            <nav aria-label="Khám phá sách">
              <Link to={ROUTES.search}>
                Tìm một cuốn sách <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link to={searchUrl({ mode: "Exchange" })}>
                Xem sách để đổi <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/guide">Bắt đầu với Lật lại <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link to={ROUTES.sell}>
                Đăng sách của bạn <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </nav>
            <p className={styles.footerNote}>
              Dành cho người đọc tại TP.HCM.
              <br />
              Dự án học tập; tiền và giao nhận mô phỏng.
            </p>
          </div>
          <div className={styles.footerBottom}>
            © {new Date().getFullYear()} Lật lại · Tiệm sách cũ
          </div>
        </footer>
      )}
    </div>
  );
}
