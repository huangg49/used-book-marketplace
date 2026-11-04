import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/account/presentation/account_screens.dart';
import '../features/auctions/presentation/auctions_screens.dart';
import '../features/auth/presentation/auth_screens.dart';
import '../features/conversations/presentation/conversations_screens.dart';
import '../features/drafts/presentation/drafts_screen.dart';
import '../features/exchanges/presentation/exchanges_screens.dart';
import '../features/orders/presentation/orders_screens.dart';
import '../features/reviews/presentation/reviews_screens.dart';
import '../features/shelf/presentation/shelf_screen.dart';
import '../features/wallet/presentation/wallet_screens.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const ShelfScreen(),
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) => SearchScreen(
          initialQuery: state.uri.queryParameters['q'] ?? '',
          initialMode: state.uri.queryParameters['mode'] ?? '',
        ),
      ),
      GoRoute(
        path: '/book',
        builder: (context, state) => BookScreen(
          id: state.uri.queryParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: '/guide',
        builder: (context, state) => const GuideScreen(),
      ),
      GoRoute(
        path: '/account',
        builder: (context, state) => AccountScreen(
          returnBookId: state.uri.queryParameters['returnBook'],
        ),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/drafts',
        builder: (context, state) => DraftsScreen(
          initialDraftId: state.uri.queryParameters['id'],
        ),
      ),
      GoRoute(
        path: '/chat-inbox',
        builder: (context, state) => const ChatInboxScreen(),
      ),
      GoRoute(
        path: '/conversation',
        builder: (context, state) => ConversationScreen(
          id: state.uri.queryParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: '/orders',
        builder: (context, state) => OrdersScreen(
          focusOrderId: state.uri.queryParameters['focus'] ??
              state.uri.queryParameters['id'],
        ),
      ),
      GoRoute(
        path: '/orders/:orderId',
        builder: (context, state) => OrdersScreen(
          focusOrderId: state.pathParameters['orderId'] ??
              state.uri.queryParameters['focus'] ??
              state.uri.queryParameters['id'],
        ),
      ),
      GoRoute(
        path: '/chat/orders/:orderId',
        builder: (context, state) => OrdersScreen(
          focusOrderId: state.pathParameters['orderId'],
        ),
      ),
      GoRoute(
        path: '/exchanges',
        builder: (context, state) => const MyExchangesScreen(),
      ),
      GoRoute(
        path: '/exchange',
        builder: (context, state) => ExchangeDetailScreen(
          id: state.uri.queryParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: '/exchange-compose',
        builder: (context, state) => ExchangeComposeScreen(
          recipientListingId: state.uri.queryParameters['book'] ?? '',
        ),
      ),
      GoRoute(
        path: '/auctions',
        builder: (context, state) => const AuctionsScreen(),
      ),
      GoRoute(
        path: '/auction',
        builder: (context, state) => AuctionScreen(
          id: state.uri.queryParameters['id'] ?? '',
        ),
      ),
      GoRoute(
        path: '/my-auctions',
        builder: (context, state) => const MyAuctionsScreen(),
      ),
      GoRoute(
        path: '/send-to-auction',
        builder: (context, state) => const SendToAuctionScreen(),
      ),
      GoRoute(
        path: '/wallet',
        builder: (context, state) => const WalletScreen(),
      ),
      GoRoute(
        path: '/cart',
        builder: (context, state) => const CartScreen(),
      ),
      GoRoute(
        path: '/wishlist',
        builder: (context, state) => const WishlistScreen(),
      ),
      GoRoute(
        path: '/addresses',
        builder: (context, state) => const AddressesScreen(),
      ),
      GoRoute(
        path: '/reviews',
        builder: (context, state) => ReviewsScreen(
          initialType: state.uri.queryParameters['type'],
          initialTransactionId: state.uri.queryParameters['id'],
        ),
      ),
      GoRoute(
        path: '/reputation',
        builder: (context, state) => ReputationScreen(
          memberId: state.uri.queryParameters['sellerId'] ??
              state.uri.queryParameters['id'] ??
              '',
        ),
      ),
      GoRoute(
        path: '/support',
        builder: (context, state) => const SupportCenterScreen(),
      ),
    ],
  );
});

