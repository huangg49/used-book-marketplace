import { NavLink } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { canReview, canViewFinance } from "../../core/session";
import styles from "./StatisticsHub.module.css";

type TabDef = {
  to: string;
  label: string;
  subtitle: string;
  icon: typeof BarChart3;
  end?: boolean;
  visible: (user: CurrentUser) => boolean;
};

const TABS: TabDef[] = [
  {
    to: "/statistics/finance",
    label: "Tài chính & Lợi nhuận",
    subtitle: "GMV, hoa hồng, cọc tịch thu, chi phí & lãi/lỗ",
    icon: TrendingUp,
    visible: canViewFinance,
  },
  {
    to: "/statistics/cashflow",
    label: "Dòng tiền & Đối soát",
    subtitle: "Cân đối sổ cái, tiền đang giữ & nạp/rút",
    icon: ArrowLeftRight,
    visible: canViewFinance,
  },
  {
    to: "/statistics/operations",
    label: "Giao dịch & Rủi ro",
    subtitle: "Hiệu suất 3 kênh, tranh chấp & thành viên",
    icon: Activity,
    visible: canReview,
  },
  {
    to: "/statistics",
    label: "Ghi sổ & Nổi bật",
    subtitle: "Nhịp ghi sổ, sách nổi bật & nhật ký bút toán",
    icon: BarChart3,
    end: true,
    visible: canReview,
  },
];

export function StatisticsSubNav({ user }: { user: CurrentUser }) {
  const items = TABS.filter((tab) => tab.visible(user));
  if (items.length <= 1) return null;

  return (
    <nav className={styles.subNav} aria-label="Phân mục thống kê">
      {items.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `${styles.subNavItem} ${isActive ? styles.subNavItemActive : ""}`
            }
          >
            <span className={styles.subNavIcon} aria-hidden="true">
              <Icon size={17} />
            </span>
            <span className={styles.subNavText}>
              <strong>{tab.label}</strong>
              <span>{tab.subtitle}</span>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

