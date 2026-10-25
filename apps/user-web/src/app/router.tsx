import { StartConversationPage } from '../pages/StartConversationPage';
import { BuyNowPage } from '../pages/BuyNowPage';
import { DirectOrderListPage } from '../pages/DirectOrderPage';
import { OrderConversationPage } from '../pages/OrderConversationPage';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import HomePage from '../pages/HomePage';
import { BookSearchPage } from '../pages/BookSearchPage';
import { BookDetailPage } from '../pages/BookDetailPage';
import { SellBookPage } from '../pages/SellBookPage';
import { ChatPage } from '../pages/ChatPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { WalletPage } from '../pages/WalletPage';
import { VNPayReturnGate } from '../pages/VNPayReturnGate';
import { ProfilePage } from '../pages/ProfilePage';
import { MyBooksPage } from '../pages/MyBooksPage';
import { EditListingPage } from '../pages/EditListingPage';
import { AccountOverviewPage } from '../pages/AccountOverviewPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { AuthLayout } from '../layouts/AuthLayout';
import { NotFoundPage } from '../pages/NotFoundPage';
import ExchangePage from '../pages/ExchangePage';
import ExchangeComposePage from '../pages/ExchangeComposePage';
import ExchangeMinePage from '../pages/ExchangeMinePage';
import { ExchangeDetailPage } from '../pages/ExchangeDetailPage';
import { AuctionListPage } from '../pages/AuctionListPage';
import { MyAuctionsPage } from '../pages/MyAuctionsPage';
import { AuctionDetailPage } from '../pages/AuctionDetailPage';
import { CreateAuctionPage } from '../pages/CreateAuctionPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { PaperStormLayout } from '../components/auth/PaperStormLayout';
import { DriverPage } from '../pages/DriverPage';

export const router = createBrowserRouter([
  {
    element: <PaperStormLayout />,
    children: [
      {
        element: <MainLayout />,
        errorElement: (
          <main style={{ padding: '2rem' }}>
            <h1>Đã có lỗi xảy ra</h1>
            <p>
              <a href="/">Về trang chủ</a>
            </p>
          </main>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: '/books', element: <BookSearchPage /> },
          { path: '/books/:id', element: <BookDetailPage /> },
          { path: '/chat', element: <ChatPage /> },
          { path: '/chat/orders/:orderId', element: <OrderConversationPage /> },
          { path: '/chat/:roomId', element: <ChatPage /> },
          { path: '/chat/start/:listingId', element: <StartConversationPage /> },
          { path: '/checkout/:listingId', element: <CheckoutPage /> },
          { path: '/buy-now/:listingId', element: <BuyNowPage /> },
          { path: '/orders', element: <DirectOrderListPage /> },
          { path: '/orders/:orderId', element: <OrderConversationPage /> },
          { path: '/exchange', element: <ExchangePage /> },
          { path: '/exchange/new', element: <ExchangeComposePage /> },
          { path: '/exchange/mine', element: <ExchangeMinePage /> },
          { path: '/exchange/:id', element: <ExchangeDetailPage /> },
          { path: '/auctions', element: <AuctionListPage /> },
          { path: '/auctions/new', element: <CreateAuctionPage /> },
          { path: '/auctions/:id', element: <AuctionDetailPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
        ],
      },
      // Dashboard routes — dùng DashboardLayout
      {
        element: <VNPayReturnGate />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { path: '/account', element: <AccountOverviewPage /> },
              { path: '/wallet', element: <WalletPage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '/my-books', element: <MyBooksPage /> },
              { path: '/my-books/:listingId/edit', element: <EditListingPage /> },
              { path: '/my-auctions', element: <MyAuctionsPage /> },
            ],
          },
        ],
      },
      // Auth sheets share one persistent paper stack and memory-only input draft.
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Fullscreen routes — không dùng MainLayout
      {
        element: <Outlet />,
        children: [
          { path: '/sell', element: <SellBookPage /> },
          { path: '/driver', element: <DriverPage /> },
        ],
      },
      // Catch-all
      { path: '/404', element: <NotFoundPage /> },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
]);
