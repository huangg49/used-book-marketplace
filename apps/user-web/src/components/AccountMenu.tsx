import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  ShoppingBag,
  Package,
  Star,
  Wallet,
  Library,
  Gavel,
  ArrowLeftRight,
  LayoutDashboard,
  UserRound,
  ArrowUpRight,
} from "lucide-react";
import { useAccountLogout } from "../hooks/useAccountLogout";
import { useSession } from "../hooks/useSession";
import { useCurrentMemberAvatar } from "../hooks/useCurrentMemberAvatar";
import { getWalletSummary } from "../services/wallet";
import { formatVnd, ROUTES } from "../lib/routes";
import styles from "./AccountMenu.module.css";

interface AccountMenuProps {
  displayName: string;
}

const popoverVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -14,
    scale: 0.88,
    transition: {
      duration: 0.14,
      ease: [0.4, 0, 1, 1],
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 26,
      mass: 0.75,
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.94,
    transition: {
      duration: 0.14,
      ease: [0.32, 0, 0.67, 0],
    },
  },
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 380,
      damping: 26,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.08,
    },
  },
};

export function AccountMenu({ displayName }: AccountMenuProps) {
  const auth = useSession();
  const user = auth.status === "authenticated" ? auth.user : null;
  const {
    avatarUrl,
    initial,
    displayName: dynamicName,
    onImageError,
  } = useCurrentMemberAvatar();
  const activeName = dynamicName || displayName;
  const location = useLocation();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusFirst = useRef(false);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === location.key;
  const { busy, error, logout } = useAccountLogout();

  // Load wallet summary on-demand when dropdown is opened
  const walletQuery = useQuery({
    queryKey: ["member-wallet-mini", user?.id ?? ""],
    queryFn: getWalletSummary,
    enabled: Boolean(user && open),
    staleTime: 30_000,
  });

  const handleClose = () => {
    setOpenPath(null);
  };

  useEffect(() => {
    if (!open) return;
    if (focusFirst.current) {
      focusFirst.current = false;
      const timer = setTimeout(() => {
        root.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpenPath(null);
      }
    };
    const narrow = () => {
      if (window.innerWidth <= 1000) setOpenPath(null);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", narrow);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", narrow);
    };
  }, [open]);

  const walletBalance =
    walletQuery.data?.available !== undefined
      ? formatVnd(walletQuery.data.available)
      : walletQuery.isLoading
      ? "Đang tải…"
      : "—";

  return (
    <div
      className={styles.root}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpenPath(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpenPath(null);
          trigger.current?.focus();
        }
      }}
    >
      {/* Header Pill Trigger with Micro Tap Animation */}
      <motion.button
        ref={trigger}
        className={styles.trigger}
        type="button"
        whileTap={{ scale: 0.97 }}
        aria-label={`Tài khoản của ${activeName}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpenPath(open ? null : location.key)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open) {
              root.current?.querySelector<HTMLAnchorElement>("a")?.focus();
            } else {
              focusFirst.current = true;
              setOpenPath(location.key);
            }
          }
        }}
      >
        <span className={styles.navAvatar} aria-hidden="true">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className={styles.avatarImg}
              onError={onImageError}
            />
          ) : (
            initial
          )}
        </span>
        <span className={styles.userName}>{activeName}</span>
        <motion.span
          className={styles.chevronWrap}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 25 }}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </motion.span>
      </motion.button>

      {/* Floating Popover Container with Spring Motion Unfurl */}
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            className={styles.popover}
            role="region"
            aria-label="Menu tài khoản"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={popoverVariants}
          >
            {/* User Identity Header Card with Dual Quick-Hub */}
            <motion.div variants={itemVariants} className={styles.identityCard}>
              <NavLink
                to={ROUTES.account}
                className={styles.identityRow}
                onClick={handleClose}
                title="Vào Không gian tổng quan"
              >
                <span className={styles.initialBadge} aria-hidden="true">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className={styles.avatarImg}
                      onError={onImageError}
                    />
                  ) : (
                    initial
                  )}
                </span>
                <div className={styles.identityMeta}>
                  <strong className={styles.nameText} title={activeName}>
                    {activeName}
                  </strong>
                  <span className={styles.emailText} title={user?.email}>
                    {user?.email || "Thành viên Bạn đọc"}
                  </span>
                </div>
              </NavLink>

              {/* Dual Quick-Hub: Cặp đôi Tổng quan & Ví song song */}
              <div className={styles.quickHubGrid}>
                {/* Hub 1: Tổng quan */}
                <NavLink
                  to={ROUTES.account}
                  className={styles.hubCard}
                  onClick={handleClose}
                  title="Vào Trang tổng quan cá nhân"
                >
                  <div className={styles.hubTop}>
                    <div className={styles.hubHeader}>
                      <LayoutDashboard size={15} aria-hidden="true" />
                      <span className={styles.hubTitle}>Tổng quan</span>
                    </div>
                    <ArrowUpRight size={13} className={styles.hubArrow} aria-hidden="true" />
                  </div>
                  <span className={styles.hubSub}>Không gian cá nhân</span>
                </NavLink>

                {/* Hub 2: Ví của tôi */}
                <NavLink
                  to={ROUTES.wallet}
                  className={styles.hubCard}
                  onClick={handleClose}
                  title="Xem và nạp tiền vào ví"
                >
                  <div className={styles.hubTop}>
                    <div className={styles.hubHeader}>
                      <Wallet size={15} aria-hidden="true" />
                      <span className={styles.hubTitle}>Ví của tôi</span>
                    </div>
                    <ArrowUpRight size={13} className={styles.hubArrow} aria-hidden="true" />
                  </div>
                  <span className={styles.hubBalance}>{walletBalance}</span>
                </NavLink>
              </div>
            </motion.div>

            {/* Content: 2-Column Balanced Split (Mua sắm vs Kệ sách) */}
            <motion.div variants={itemVariants} className={styles.columnsSplit}>
              {/* Column 1: Mua sắm */}
              <div className={styles.columnBlock}>
                <span className={styles.columnTitle}>Mua sắm</span>
                <NavLink
                  to="/cart"
                  className={styles.tileLink}
                  onClick={handleClose}
                >
                  <ShoppingBag size={15} aria-hidden="true" />
                  <span className={styles.tileText}>Giỏ sách</span>
                </NavLink>

                <NavLink
                  to="/orders"
                  className={styles.tileLink}
                  onClick={handleClose}
                >
                  <Package size={15} aria-hidden="true" />
                  <span className={styles.tileText}>Đơn trực tiếp</span>
                </NavLink>

                <NavLink
                  to="/reviews"
                  className={styles.tileLink}
                  onClick={handleClose}
                >
                  <Star size={15} aria-hidden="true" />
                  <span className={styles.tileText}>Đánh giá</span>
                </NavLink>
              </div>

              {/* Column 2: Kệ sách & Giao lưu */}
              <div className={styles.columnBlock}>
                <span className={styles.columnTitle}>Kệ sách & Giao lưu</span>
                <NavLink
                  to={ROUTES.myBooks}
                  className={styles.tileLink}
                  onClick={handleClose}
                >
                  <Library size={15} aria-hidden="true" />
                  <span className={styles.tileText}>Kệ sách của tôi</span>
                </NavLink>

                <NavLink
                  to={ROUTES.myAuctions}
                  className={styles.tileLink}
                  onClick={handleClose}
                >
                  <Gavel size={15} aria-hidden="true" />
                  <span className={styles.tileText}>Đấu giá</span>
                </NavLink>

                <NavLink
                  to={ROUTES.exchangeMine}
                  className={styles.tileLink}
                  onClick={handleClose}
                >
                  <ArrowLeftRight size={15} aria-hidden="true" />
                  <span className={styles.tileText}>Trao đổi</span>
                </NavLink>
              </div>
            </motion.div>

            {/* Footer: Profile settings & Logout */}
            <motion.div variants={itemVariants} className={styles.popoverFooter}>
              <NavLink
                to="/profile"
                className={styles.footerLink}
                onClick={handleClose}
              >
                <UserRound size={15} aria-hidden="true" />
                <span>Hồ sơ & bảo mật</span>
              </NavLink>

              <button
                type="button"
                className={styles.logoutBtn}
                disabled={busy}
                onClick={() => void logout()}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>{busy ? "Đang thoát…" : "Đăng xuất"}</span>
              </button>
            </motion.div>

            {error && (
              <p className={styles.errorText} role="alert">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
