import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import HomePage from '../pages/HomePage';
import { BookSearchPage } from '../pages/BookSearchPage';
import { BookDetailPage } from '../pages/BookDetailPage';
import { SellBookPage } from '../pages/SellBookPage';
import { ChatPage } from '../pages/ChatPage';
import { ProfilePage } from '../pages/ProfilePage';
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
import { AuctionDetailPage } from '../pages/AuctionDetailPage';
import { NotificationsPage } from '../pages/NotificationsPage';
export const router = createBrowserRouter([
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
      { path: '/chat/:roomId', element: <ChatPage /> },
      { path: '/exchange', element: <ExchangePage /> },
      { path: '/exchange/new', element: <ExchangeComposePage /> },
      { path: '/exchange/mine', element: <ExchangeMinePage /> },
      { path: '/exchange/:id', element: <ExchangeDetailPage /> },
      { path: '/auctions', element: <AuctionListPage /> },
      { path: '/auctions/:id', element: <AuctionDetailPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
    ],
  },
  // Dashboard routes — dùng DashboardLayout
  {
    element: <DashboardLayout />,
    children: [
      { path: '/profile', element: <ProfilePage /> },
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
    ],
  },
  // Catch-all
  { path: '/404', element: <NotFoundPage /> },
  { path: '*', element: <Navigate to="/404" replace /> },
]);
