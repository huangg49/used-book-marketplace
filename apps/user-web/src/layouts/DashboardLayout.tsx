import { Outlet } from 'react-router-dom';
import { DashboardSidebar } from '../pages/profile/components/DashboardSidebar';
import { Header } from '../components/Header';
import { AnimatedBackground } from '../components/AnimatedBackground';

export function DashboardLayout() {
  return (
    <div className="relative font-body-md text-on-surface antialiased min-h-screen z-0 isolate">
      <AnimatedBackground />
      <Header forceDark={true} forceSolid={false} />
      <DashboardSidebar />
      <div className="pl-72 relative z-10">
        <main className="relative pt-[88px] min-h-screen">
          <div className="flex flex-col w-full max-w-[1440px] mx-auto px-space-lg py-space-xl gap-space-xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
