import { DashboardGreeting } from './profile/components/DashboardGreeting';
import { DashboardStats } from './profile/components/DashboardStats';
import { DashboardLiveAuctions } from './profile/components/DashboardLiveAuctions';
import { DashboardCashflow } from './profile/components/DashboardCashflow';
import { DashboardMyBooks } from './profile/components/DashboardMyBooks';
import { DashboardOrders } from './profile/components/DashboardOrders';

export function ProfilePage() {
  return (
    <>
      <div className="opacity-0 animate-slide-up" style={{ animationDelay: '0ms' }}>
        <DashboardGreeting />
      </div>
      <div className="opacity-0 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <DashboardStats />
      </div>
      <div className="opacity-0 animate-slide-up" style={{ animationDelay: '200ms' }}>
        <DashboardLiveAuctions />
      </div>
      <div className="opacity-0 animate-slide-up" style={{ animationDelay: '300ms' }}>
        <DashboardCashflow />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-space-xl">
        <div className="xl:col-span-3 flex flex-col min-w-0 opacity-0 animate-slide-up" style={{ animationDelay: '400ms' }}>
          <DashboardMyBooks />
        </div>
        <div className="xl:col-span-1 flex flex-col min-w-0 opacity-0 animate-slide-in-right" style={{ animationDelay: '500ms' }}>
          <DashboardOrders />
        </div>
      </div>
    </>
  );
}
