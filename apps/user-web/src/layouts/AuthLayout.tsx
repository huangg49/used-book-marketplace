import type { ReactNode } from 'react';
import { Header } from '../components/Header';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen flex flex-col justify-between selection:bg-[#c3ecd7] selection:text-[#002116] overflow-x-hidden font-body-md text-[#1d1c16] bg-[#fef9ef]">
      {/* BACKGROUND & AMBIANCE LAYER */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <img
          alt="Atmospheric antique vintage library study"
          className="w-full h-full object-cover object-center filter brightness-[0.82] contrast-[1.08] scale-105"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZzQ4i3KeDqMHcAbshHmPgydxnZPbzrHpq3vUCoJLj9NRC_GVcqJMn8yXHn4EKHB7EVLe0IbtaF64AvZl41qxujcpROF_dg6rDluMM2MBKNd23dWKrmntvVj6lNjyUIiEAdL21bPbKcPCsW85YIdfXXwcLpIbQ7q57V2wL7wKaES6qhRXzjvkY8M2kC36KlD9OO_MAdUaSYj7w1yinBa2ANLLM4H5AliFzRerPazUoW--pZzB6B8jHew"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0a1811]/90 via-[#10291f]/75 to-[#1a2e22]/85 backdrop-blur-[2.5px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_rgba(6,16,11,0.85)_100%)]"></div>
        {/* Warm lamp ambient glow */}
        <div className="lamp-glow absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[580px] pointer-events-none blur-2xl" style={{ background: 'radial-gradient(circle, rgba(255,190,92,0.18) 0%, rgba(217,143,59,0.08) 50%, transparent 75%)' }}></div>
        
        {/* Animated Golden Book Dust & Sunlight Motes */}
        <div className="mote-particle w-2.5 h-2.5 left-[12%]" style={{ animationDuration: '14s', animationDelay: '0s' }}></div>
        <div className="mote-particle w-1.5 h-1.5 left-[24%]" style={{ animationDuration: '18s', animationDelay: '2s' }}></div>
        <div className="mote-particle w-3 h-3 left-[38%]" style={{ animationDuration: '22s', animationDelay: '5s' }}></div>
        <div className="mote-particle w-2 h-2 left-[52%]" style={{ animationDuration: '16s', animationDelay: '1.5s' }}></div>
        <div className="mote-particle w-3.5 h-3.5 left-[68%]" style={{ animationDuration: '20s', animationDelay: '7s' }}></div>
        <div className="mote-particle w-1.5 h-1.5 left-[79%]" style={{ animationDuration: '15s', animationDelay: '3.5s' }}></div>
        <div className="mote-particle w-2.5 h-2.5 left-[88%]" style={{ animationDuration: '24s', animationDelay: '6s' }}></div>
        <div className="mote-particle w-2 h-2 left-[45%]" style={{ animationDuration: '19s', animationDelay: '9s' }}></div>
      </div>

      {/* HEADER */}
      <Header forceDark />

      {/* MAIN CONTENT */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 pt-28 pb-10 flex flex-col items-center justify-center">
        <div className="flex flex-col w-full">
          <div className="relative w-full py-6 flex items-center justify-center">
            {children}
          </div>
        </div>
      </main>


    </div>
  );
}
