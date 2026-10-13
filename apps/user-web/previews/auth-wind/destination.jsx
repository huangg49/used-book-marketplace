import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { memo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MainLayout from '../../src/layouts/MainLayout';
import { AuctionHero } from '../../src/components/AuctionHero';
import { PaperArrivalContext } from '../../src/components/auth/paper-journey';
import styles from '../../src/pages/AuctionListPage.module.css';

const queries = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });

// Real layout and hero, with the existing empty-shelf state. This motion demo
// neither authenticates nor subscribes to the live auction/socket service.
export const Destination = memo(function Destination() {
  return <QueryClientProvider client={queries}><MemoryRouter initialEntries={['/auctions']}>
    <PaperArrivalContext.Provider value={true}><Routes><Route element={<MainLayout />}>
      <Route path="*" element={<div className={styles.page}>
        <AuctionHero auctions={[]} pending={false} stale={false} failed={false} />
        <div className={styles.content}><section aria-labelledby="auction-list-title">
          <div className={styles.sectionHeading}><h2 id="auction-list-title" tabIndex={-1}>Phiên đang mở</h2></div>
          <div className={styles.empty}><h3>Kệ đấu giá đang chờ sách mới</h3><p>Phiên mới mở sau khi sách được kiểm tra tại điểm giao nhận.</p></div>
        </section></div>
      </div>} />
    </Route></Routes></PaperArrivalContext.Provider>
  </MemoryRouter></QueryClientProvider>;
});
