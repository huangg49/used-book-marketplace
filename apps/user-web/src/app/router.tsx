import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import HomePage from '../pages/HomePage';
import { VNPayReturnGate } from '../pages/VNPayReturnGate';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AppRouteLayout } from './AppRouteLayout';
import { RouteError, RoutePending } from './RouteFeedback';

const chatRoute = () => import('../pages/ChatPage').then(({ ChatPage }) => ({ Component: ChatPage }));
const orderConversationRoute = () => import('../pages/OrderConversationPage')
  .then(({ OrderConversationPage }) => ({ Component: OrderConversationPage }));

export const router = createBrowserRouter([
  {
    element: <AppRouteLayout />,
    HydrateFallback: RoutePending,
    ErrorBoundary: RouteError,
    children: [
      {
        element: <MainLayout />,
        ErrorBoundary: RouteError,
        children: [
          { index: true, element: <HomePage /> },
          { path: '/books', lazy: () => import('../pages/BookSearchPage').then(m => ({ Component: m.BookSearchPage })) },
          { path: '/books/:id', lazy: () => import('../pages/BookDetailPage').then(m => ({ Component: m.BookDetailPage })) },
          { path: '/chat', lazy: chatRoute },
          { path: '/chat/orders/:orderId', lazy: orderConversationRoute },
          { path: '/chat/:roomId', lazy: chatRoute },
          { path: '/chat/start/:listingId', lazy: () => import('../pages/StartConversationPage').then(m => ({ Component: m.StartConversationPage })) },
          { path: '/checkout/:listingId', lazy: () => import('../pages/CheckoutPage').then(m => ({ Component: m.CheckoutPage })) },
          { path: '/buy-now/:listingId', lazy: () => import('../pages/BuyNowPage').then(m => ({ Component: m.BuyNowPage })) },
          { path: '/orders/:orderId', lazy: orderConversationRoute },
          { path: '/exchange', lazy: () => import('../pages/ExchangePage').then(m => ({ Component: m.default })) },
          { path: '/exchange/new', lazy: () => import('../pages/ExchangeComposePage').then(m => ({ Component: m.default })) },
          { path: '/exchange/:id', lazy: () => import('../pages/ExchangeDetailPage').then(m => ({ Component: m.ExchangeDetailPage })) },
          { path: '/auctions', lazy: () => import('../pages/AuctionListPage').then(m => ({ Component: m.AuctionListPage })) },
          { path: '/auctions/new', lazy: () => import('../pages/CreateAuctionPage').then(m => ({ Component: m.CreateAuctionPage })) },
          { path: '/auctions/:id', lazy: () => import('../pages/AuctionDetailPage').then(m => ({ Component: m.AuctionDetailPage })) },
          { path: '/guide', lazy: () => import('../pages/MemberGuidePage').then(m => ({ Component: m.MemberGuidePage })) },
          { path: '/members/:id', lazy: () => import('../pages/MemberReputationPage').then(m => ({ Component: m.MemberReputationPage })) },
        ],
      },
      // Dashboard routes — dùng DashboardLayout
      {
        element: <VNPayReturnGate />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { path: '/account', lazy: () => import('../pages/AccountOverviewPage').then(m => ({ Component: m.AccountOverviewPage })) },
              { path: '/reviews', lazy: () => import('../pages/ReviewsPage').then(m => ({ Component: m.ReviewsPage })) },
              { path: '/wallet', lazy: () => import('../pages/WalletPage').then(m => ({ Component: m.WalletPage })) },
              { path: '/profile', lazy: () => import('../pages/ProfilePage').then(m => ({ Component: m.ProfilePage })) },
              { path: '/orders', lazy: () => import('../pages/DirectOrderPage').then(m => ({ Component: m.DirectOrderListPage })) },
              { path: '/my-books', lazy: () => import('../pages/MyBooksPage').then(m => ({ Component: m.MyBooksPage })) },
              { path: '/my-books/:listingId/edit', lazy: () => import('../pages/EditListingPage').then(m => ({ Component: m.EditListingPage })) },
              { path: '/my-auctions', lazy: () => import('../pages/MyAuctionsPage').then(m => ({ Component: m.MyAuctionsPage })) },
              { path: '/exchange/mine', lazy: () => import('../pages/ExchangeMinePage').then(m => ({ Component: m.default })) },
              { path: '/account/exchanges', lazy: () => import('../pages/ExchangeMinePage').then(m => ({ Component: m.default })) },
              { path: '/notifications', lazy: () => import('../pages/NotificationsPage').then(m => ({ Component: m.NotificationsPage })) },
              { path: '/account/notifications', lazy: () => import('../pages/NotificationsPage').then(m => ({ Component: m.NotificationsPage })) },
            ],
          },
        ],
      },
      // Auth sheets share one persistent paper stack and memory-only input draft.
      {
        lazy: () => import('../layouts/AuthLayout').then(m => ({ Component: m.AuthLayout })),
        children: [
          { path: '/login', lazy: () => import('../pages/LoginPage').then(m => ({ Component: m.LoginPage })) },
          { path: '/register', lazy: () => import('../pages/RegisterPage').then(m => ({ Component: m.RegisterPage })) },
          { path: '/forgot-password', lazy: () => import('../pages/ForgotPasswordPage').then(m => ({ Component: m.ForgotPasswordPage })) },
        ],
      },
      // Fullscreen routes — không dùng MainLayout
      {
        element: <Outlet />,
        children: [
          { path: '/sell', lazy: () => import('../pages/SellBookPage').then(m => ({ Component: m.SellBookPage })) },
          { path: '/driver', lazy: () => import('../pages/DriverPage').then(m => ({ Component: m.DriverPage })) },
        ],
      },
      // Catch-all
      { path: '/404', element: <NotFoundPage /> },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
]);
