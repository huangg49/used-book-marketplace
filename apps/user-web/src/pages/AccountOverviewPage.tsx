import { useSession } from "../hooks/useSession";
import { DashboardGreeting } from "./profile/components/DashboardGreeting";
import { DashboardShelfFocus } from "./profile/components/DashboardShelfFocus";
import { DashboardStats } from "./profile/components/DashboardStats";
import { DashboardLiveAuctions } from "./profile/components/DashboardLiveAuctions";
import { DashboardCashflow } from "./profile/components/DashboardCashflow";
import { DashboardMyBooks } from "./profile/components/DashboardMyBooks";
import { DashboardOrders } from "./profile/components/DashboardOrders";

export function AccountOverviewPage() {
  const auth = useSession();

  if (auth.status !== "authenticated") {
    return null;
  }

  const { user } = auth;

  return (
    <div className="flex flex-col gap-space-lg w-full max-w-7xl mx-auto" key={user.id}>
      {/* 1. Header Greeting & Welcome Panel */}
      <DashboardGreeting user={user} />

      {/* 2. Top Statistic Cards (4 Metrics: Wallet, Escrow, Shelf, Orders) */}
      <DashboardStats ownerId={user.id} />

      {/* 3. Actionable Shelf Focus (Reviews, Rejections, Drafts, Retries) */}
      <DashboardShelfFocus ownerId={user.id} />

      {/* 4. Live Auctions & Recent Activity (Outbid Alerts, Bids, Notifications) */}
      <DashboardLiveAuctions ownerId={user.id} />

      {/* 5. Income / Expense & Cashflow (6-Month Archival Chart & Finance Summary) */}
      <DashboardCashflow ownerId={user.id} />

      {/* 6. My Books (Kệ sách của tôi - Filter tabs & Equal-Height Archival Cards) */}
      <DashboardMyBooks ownerId={user.id} />

      {/* 7. Orders Timeline Tracker (5-Step Horizontal/Vertical Transport Progress) */}
      <DashboardOrders />
    </div>
  );
}
