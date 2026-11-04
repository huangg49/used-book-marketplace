import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:used_books_flutter/core/api/session_client.dart';
import 'package:used_books_flutter/core/theme/app_theme.dart';
import 'package:used_books_flutter/core/widgets/app_widgets.dart';
import 'package:used_books_flutter/features/conversations/presentation/conversations_screens.dart';
import 'package:used_books_flutter/main.dart';

class _FakeSessionClient extends SessionClient {
  _FakeSessionClient({this.authenticated = false})
    : super(baseUrl: 'http://localhost:3000/api/v1');

  final bool authenticated;
  final List<String> recordedCalls = [];

  @override
  Future<void> restore() async {}

  @override
  SessionState get snapshot => authenticated
      ? const SessionState.authenticated(
          CurrentUser(
            id: '11111111-1111-4111-8111-111111111111',
            email: 'member@latlai.local',
            displayName: 'Nguyễn Minh Tuấn',
            roles: ['MEMBER'],
            status: 'ACTIVE',
          ),
        )
      : const SessionState.anonymous();

  @override
  Future<dynamic> publicRequest(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String>? headers,
  }) async {
    if (path.startsWith('/listings?')) {
      return {
        'items': [
          {
            'id': '22222222-2222-4222-8222-222222222222',
            'condition': 'LikeNew',
            'mode': 'Both',
            'salePrice': 65000,
            'exchangeValue': 70000,
            'book': {
              'title': 'Mắt Biếc',
              'authors': ['Nguyễn Nhật Ánh'],
            },
            'fulfillment': {'name': 'Quận 1, TP.HCM'},
          },
        ],
      };
    }
    if (path.startsWith('/listings/')) {
      return {
        'id': '22222222-2222-4222-8222-222222222222',
        'condition': 'LikeNew',
        'mode': 'Both',
        'salePrice': 65000,
        'exchangeValue': 70000,
        'version': 1,
        'revisionId': 'rev-1',
        'book': {
          'title': 'Mắt Biếc',
          'authors': ['Nguyễn Nhật Ánh'],
        },
        'seller': {'id': 'seller-9999-8888', 'displayName': 'Chủ sách cũ'},
      };
    }
    if (path.startsWith('/auctions')) {
      return {
        'items': [
          {
            'id': '33333333-3333-4333-8333-333333333333',
            'state': 'Active',
            'currentPrice': 120000,
            'buyNowPrice': 250000,
            'book': {'title': 'Truyện Kiều Ấn Bản Cổ'},
          },
        ],
      };
    }
    return const <String, dynamic>{};
  }

  @override
  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String>? headers,
    String? idempotencyKey,
  }) async {
    recordedCalls.add('$method $path');
    if (method == 'POST' && path == '/catalog/requests') {
      return {'entityId': '66666666-6666-4666-8666-666666666666', 'version': 1};
    }
    if (method == 'POST' && path == '/listings') {
      return {'entityId': '55555555-5555-4555-8555-555555555555', 'version': 1};
    }
    if (path.startsWith('/me/purchase-conversations')) {
      if (path.contains('/messages')) {
        return [
          {
            'id': 'msg-1',
            'senderId': 'buyer-1',
            'body': 'Chào bạn, sách còn mới không?',
            'createdAt': DateTime.now().toIso8601String(),
          },
        ];
      }
      if (path == '/me/purchase-conversations') {
        return [
          {
            'id': 'conv-1111-1111',
            'listingId': '22222222-2222-4222-8222-222222222222',
            'buyer': {'id': 'buyer-1', 'displayName': 'Lan Anh'},
            'seller': {
              'id': '11111111-1111-4111-8111-111111111111',
              'displayName': 'Nguyễn Minh Tuấn',
            },
            'terms': {
              'mode': 'Sale',
              'agreedPrice': 45000,
              'pendingProposal': {
                'id': 'prop-1',
                'kind': 'Price',
                'amount': 45000,
                'proposedById': 'buyer-1',
              },
            },
            'orderId': null,
            'status': 'Active',
            'createdAt': DateTime.now().toIso8601String(),
          },
        ];
      }
      if (path.contains('conv-with-order')) {
        return {
          'id': 'conv-with-order',
          'listingId': '22222222-2222-4222-8222-222222222222',
          'sellerId': 'seller-other',
          'buyerId': '11111111-1111-4111-8111-111111111111',
          'buyer': {
            'id': '11111111-1111-4111-8111-111111111111',
            'displayName': 'Nguyễn Minh Tuấn',
          },
          'seller': {'id': 'seller-other', 'displayName': 'Lan Anh'},
          'terms': {'mode': 'Sale', 'agreedPrice': 50000},
          'orderId': 'order-1234-5678',
          'status': 'Active',
          'createdAt': DateTime.now().toIso8601String(),
        };
      }
      return {
        'id': 'conv-1111-1111',
        'listingId': '22222222-2222-4222-8222-222222222222',
        'sellerId': '11111111-1111-4111-8111-111111111111',
        'buyerId': 'buyer-1',
        'buyer': {'id': 'buyer-1', 'displayName': 'Lan Anh'},
        'seller': {
          'id': '11111111-1111-4111-8111-111111111111',
          'displayName': 'Nguyễn Minh Tuấn',
        },
        'terms': {
          'mode': 'Sale',
          'agreedPrice': 45000,
          'pendingProposal': {
            'id': 'prop-1',
            'kind': 'Price',
            'amount': 45000,
            'proposedById': 'buyer-1',
          },
        },
        'orderId': null,
        'status': 'Active',
        'createdAt': DateTime.now().toIso8601String(),
      };
    }
    if (path.startsWith('/me/orders')) {
      if (path.endsWith('/shipment')) {
        return {
          'trackingCode': 'LL-12345678',
          'carrier': 'LatLaiSimulator',
          'pickupConfirmed': true,
          'state': 'Delivered',
        };
      }
      if (path.endsWith('/packaging-evidence')) {
        return {
          'items': [
            {'id': 'ev-1', 'status': 'Ready'},
          ],
        };
      }
      if (path == '/me/orders' || path.startsWith('/me/orders?')) {
        return {
          'items': [
            {
              'id': 'order-1234-5678',
              'role': 'Buyer',
              'state': 'AwaitingPayment',
              'title': 'Dế Mèn Phiêu Lưu Ký',
              'item': {
                'title': 'Dế Mèn Phiêu Lưu Ký',
                'bookPrice': 50000,
                'shippingFee': 15000,
              },
              'buyerTotal': 65000,
              'createdAt': DateTime.now().toIso8601String(),
            },
          ],
        };
      }
      return {
        'id': 'order-1234-5678',
        'role': 'Buyer',
        'state': 'AwaitingPayment',
        'version': 1,
        'title': 'Dế Mèn Phiêu Lưu Ký',
        'item': {
          'title': 'Dế Mèn Phiêu Lưu Ký',
          'bookPrice': 50000,
          'shippingFee': 15000,
        },
        'buyerTotal': 65000,
        'ownAddress': {
          'recipientName': 'Nguyễn Văn A',
          'phone': '0901234567',
          'detail': 'Quận 1, TP. Hồ Chí Minh',
        },
        'paymentDeadline': DateTime.now()
            .add(const Duration(hours: 24))
            .toIso8601String(),
        'createdAt': DateTime.now().toIso8601String(),
      };
    }
    if (path.startsWith('/orders/')) {
      return {'entityId': 'order-1234-5678', 'replayed': false};
    }
    if (path.startsWith('/me/notifications')) {
      if (method == 'POST' && path == '/me/notifications/read') {
        return {'unreadCount': 0};
      }
      return {
        'items': [
          {
            'id': '66666666-6666-4666-8666-666666666666',
            'kind': 'EXCHANGE_REQUEST',
            'title': 'Đề xuất trao đổi đã được chấp thuận',
            'body': 'Hai bên đã đồng ý trao đổi “Mắt Biếc” và “Doraemon”.',
            'targetType': 'Exchange',
            'targetId': '77777777-7777-4777-8777-777777777777',
            'createdAt': DateTime.now().toIso8601String(),
            'readAt': null,
          },
          {
            'id': '88888888-8888-4888-8888-888888888888',
            'kind': 'ORDER_BUY_NOW_PAID',
            'title': 'Đặt mua thành công',
            'body': 'Bạn đã thanh toán đơn Mua ngay.',
            'targetType': 'Order',
            'targetId': '99999999-9999-4999-8999-999999999999',
            'createdAt': DateTime.now()
                .subtract(const Duration(hours: 2))
                .toIso8601String(),
            'readAt': DateTime.now()
                .subtract(const Duration(hours: 1))
                .toIso8601String(),
          },
        ],
        'unreadCount': 1,
      };
    }
    if (path.startsWith('/me/work-items')) {
      return {'items': const []};
    }
    if (path.startsWith('/me/listings')) {
      return {
        'items': [
          {
            'id': '44444444-4444-4444-8444-444444444444',
            'moderation': 'Approved',
            'salePrice': 85000,
            'book': {
              'title': 'Cho Tôi Xin Một Vé Đi Tuổi Thơ',
              'authors': ['Nguyễn Nhật Ánh'],
            },
          },
        ],
      };
    }
    if (path == '/me/addresses') {
      return {
        'version': 1,
        'items': [
          {
            'id': 'addr-1',
            'version': 1,
            'recipientName': 'Nguyễn Văn A',
            'phone': '0901234567',
            'localityCode': 'Q1',
            'detail': '123 Lê Lợi, P. Bến Nghé',
            'isDefault': true,
          },
        ],
      };
    }
    if (path == '/me/wallet') {
      return {
        'available': 200000,
        'balance': 200000,
        'availableBalance': 200000,
      };
    }
    if (path.contains('/quotes')) {
      return {
        'id': 'quote-1234',
        'version': 1,
        'listingVersion': 1,
        'listingRevisionId': 'rev-1',
        'amounts': {'bookPrice': 50000, 'shippingFee': 0, 'buyerTotal': 50000},
      };
    }
    if (path == '/orders/buy-now') {
      return {
        'entityId': 'order-1234-5678',
        'version': 1,
        'state': 'AwaitingPayment',
      };
    }
    if (path.startsWith('/exchanges')) {
      return {'entityId': 'ex-1234-5678', 'status': 'Pending'};
    }
    return const <String, dynamic>{};
  }
}

void main() {
  test('formatVnd formats Vietnamese currency accurately', () {
    expect(formatVnd(50000), '50.000 ₫');
    expect(formatVnd(1250000), '1.250.000 ₫');
    expect(formatVnd(null), 'Chưa có giá');
  });

  testWidgets('Home shelf renders Lật Lại header, book grid, and 5-tab bar', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2200);
    tester.view.devicePixelRatio = 2.0;
    addTearTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionClientProvider.overrideWithValue(_FakeSessionClient()),
        ],
        child: const UsedBooksApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(TopNavbar), findsOneWidget);
    expect(find.byType(SearchField), findsOneWidget);
    expect(
      find.text('Mỗi cuốn sách cũ là một hành trình được lật lại'),
      findsOneWidget,
    );

    // Verify promo banner can be dismissed (thu gọn / đóng)
    final closeBannerButton = find.byIcon(Icons.close_rounded);
    expect(closeBannerButton, findsOneWidget);
    await tester.tap(closeBannerButton);
    await tester.pumpAndSettle();
    expect(
      find.text('Mỗi cuốn sách cũ là một hành trình được lật lại'),
      findsNothing,
    );
    expect(find.text('Mắt Biếc'), findsOneWidget);
    expect(find.text('Trang chủ'), findsOneWidget);
    expect(find.text('Tìm sách'), findsOneWidget);
    expect(find.text('Đăng sách'), findsOneWidget);
    expect(find.text('Đấu giá'), findsWidgets);
    expect(find.text('Tài khoản'), findsOneWidget);
  });

  testWidgets('Authenticated Account hub renders WorkInbox and member links', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2200);
    tester.view.devicePixelRatio = 2.0;
    addTearTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionClientProvider.overrideWithValue(
            _FakeSessionClient(authenticated: true),
          ),
        ],
        child: const UsedBooksApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Tài khoản'));
    await tester.pumpAndSettle();

    expect(find.text('Tổng quan của bạn'), findsOneWidget);
    expect(find.text('SỐ DƯ KHẢ DỤNG'), findsOneWidget);
    expect(find.text('TẠM GIỮ (ESCROW)'), findsOneWidget);
    expect(find.text('GIÁ TRỊ KỆ SÁCH'), findsOneWidget);
    expect(find.text('ĐƠN ĐANG XỬ LÝ'), findsNothing);
    expect(find.text('Việc của tôi'), findsOneWidget);
    expect(find.text('Kệ cập nhật gần đây'), findsOneWidget);
    expect(find.text('Theo dõi đơn hàng'), findsOneWidget);
    expect(find.textContaining('Nguyễn Minh Tuấn'), findsOneWidget);
    expect(find.text('Đơn mua/bán trực tiếp'), findsOneWidget);
    expect(find.text('Trao đổi của tôi'), findsOneWidget);
    expect(find.text('Hỗ trợ & phản ánh'), findsOneWidget);
  });

  testWidgets(
    'Unauthenticated Account tab renders Red-themed Login and Register screens',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionClientProvider.overrideWithValue(
              _FakeSessionClient(authenticated: false),
            ),
          ],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Tài khoản'));
      await tester.pumpAndSettle();

      // Verify Login screen with red & gold branding
      expect(find.text('Lại gặp nhau rồi.'), findsOneWidget);
      expect(find.text('Đăng nhập'), findsOneWidget);
      expect(
        find.text('Chưa có tài khoản độc giả? Đăng ký ngay'),
        findsOneWidget,
      );

      // Tap to go to Register screen
      await tester.tap(find.text('Chưa có tài khoản độc giả? Đăng ký ngay'));
      await tester.pumpAndSettle();

      // Verify Register screen
      expect(find.text('Tạo tài khoản mới'), findsOneWidget);
      expect(find.text('Đã có tài khoản? Đăng nhập'), findsOneWidget);
      expect(find.text('Tạo tài khoản'), findsOneWidget);
    },
  );

  test('generateIdempotencyKey generates valid UUID v4 compliant with API contract', () {
    final uuidRegex = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    for (var i = 0; i < 20; i++) {
      final key = generateIdempotencyKey('draft-create');
      expect(
        uuidRegex.hasMatch(key),
        isTrue,
        reason: 'Key "$key" must match backend ContractInput.uuid validation',
      );
    }
  });

  testWidgets(
    'Draft editor does not create draft on server if no information entered',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on Đăng sách in bottom bar
      await tester.tap(find.text('Đăng sách'));
      await tester.pumpAndSettle();

      expect(find.text('Kệ sách của tôi'), findsOneWidget);
      expect(find.text('+ Đăng Sách Mới Ngay'), findsOneWidget);

      // Click + Đăng Sách Mới Ngay
      await tester.tap(find.text('+ Đăng Sách Mới Ngay'));
      await tester.pumpAndSettle();

      // Verify it opened the editor immediately without network draft creation
      expect(find.text('Về sách của tôi'), findsOneWidget);
      // Verify progress loading bar shows 0/5 bước when nothing is filled yet
      expect(find.text('0/5 bước (0%)'), findsOneWidget);
      expect(
        fakeClient.recordedCalls.where((c) => c.startsWith('POST /listings')),
        isEmpty,
      );

      // Tap "Về sách của tôi" to exit without filling anything
      await tester.tap(find.text('Về sách của tôi'));
      await tester.pumpAndSettle();

      // Back to shelf, still NO POST /listings
      expect(find.text('Kệ sách của tôi'), findsOneWidget);
      expect(
        fakeClient.recordedCalls.where((c) => c.startsWith('POST /listings')),
        isEmpty,
      );
    },
  );

  testWidgets(
    'Draft editor automatically saves draft on exit when book information is entered',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on Đăng sách in bottom bar
      await tester.tap(find.text('Đăng sách'));
      await tester.pumpAndSettle();

      // Click + Đăng Sách Mới Ngay
      await tester.tap(find.text('+ Đăng Sách Mới Ngay'));
      await tester.pumpAndSettle();

      expect(find.text('Về sách của tôi'), findsOneWidget);

      // Verify default entry mode is 'Tìm sách có sẵn'
      expect(find.textContaining('Tìm sách có sẵn'), findsOneWidget);

      // Switch to manual mode
      final manualModeBtn = find.textContaining('Tự nhập thông tin');
      if (manualModeBtn.evaluate().isNotEmpty) {
        await tester.tap(manualModeBtn);
        await tester.pumpAndSettle();
      }

      // Enter title and author
      final textFields = find.byType(TextField);
      if (textFields.evaluate().length >= 2) {
        await tester.enterText(textFields.at(0), 'Truyện Kiều');
        await tester.enterText(textFields.at(1), 'Nguyễn Du');
        await tester.pumpAndSettle();
      } else if (textFields.evaluate().isNotEmpty) {
        await tester.enterText(textFields.first, 'Truyện Kiều');
        await tester.pumpAndSettle();
      }

      // Tap "Về sách của tôi" to exit and auto-save
      await tester.tap(find.text('Về sách của tôi'));
      await tester.pumpAndSettle();

      // Verify it automatically persisted draft on server
      expect(
        fakeClient.recordedCalls.where((c) => c.startsWith('POST /listings')),
        isNotEmpty,
      );
    },
  );

  testWidgets(
    'Notifications bottom sheet renders redesigned cards, filter tabs, and mark-all-read',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap bell icon on top navbar
      final bellIcon = find.byIcon(Icons.notifications_none_rounded).first;
      await tester.tap(bellIcon);
      await tester.pumpAndSettle();

      // Verify modal header and count
      expect(find.text('Thông báo'), findsOneWidget);
      expect(find.text('1 mới'), findsOneWidget);
      expect(find.text('Đọc tất cả'), findsOneWidget);

      // Verify filter chips
      expect(find.text('Tất cả (2)'), findsOneWidget);
      expect(find.text('Chưa đọc (1)'), findsOneWidget);

      // Verify custom styled notification cards with category labels
      expect(find.text('TRAO ĐỔI SÁCH'), findsOneWidget);
      expect(find.text('ĐƠN MUA SÁCH'), findsOneWidget);
      expect(find.text('Đề xuất trao đổi đã được chấp thuận'), findsOneWidget);
      expect(find.text('Đặt mua thành công'), findsOneWidget);

      // Tap "Đọc tất cả"
      await tester.tap(find.text('Đọc tất cả'));
      await tester.pumpAndSettle();

      expect(
        fakeClient.recordedCalls.where(
          (c) => c.startsWith('POST /me/notifications/read'),
        ),
        isNotEmpty,
      );
    },
  );

  testWidgets(
    'Auctions screen renders redesigned Bento banner, ViaPoint trust badge, and auction grid',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on Đấu giá in the bottom navigation bar
      final auctionTab = find.text('Đấu giá').last;
      await tester.tap(auctionTab);
      await tester.pumpAndSettle();

      // Verify Bento Header
      expect(find.text('SÀN ĐẤU GIÁ SÁCH HIẾM & SÁCH CỔ'), findsOneWidget);
      expect(find.text('Sách Cũ Đang Đấu Giá'), findsOneWidget);
      expect(find.text('Gửi sách đấu giá'), findsOneWidget);
      expect(find.text('Phiên của tôi'), findsOneWidget);
      expect(find.text('Quy chế'), findsOneWidget);

      // Verify ViaPoint Trust Banner
      expect(find.text('Kiểm định ViaPoint & Ký quỹ an toàn'), findsOneWidget);

      // Verify Auction Card Grid
      expect(find.text('Truyện Kiều Ấn Bản Cổ'), findsOneWidget);
      expect(find.text('DẪN GIÁ HIỆN TẠI'), findsOneWidget);
      expect(find.text('120.000 ₫'), findsOneWidget);
      expect(find.text('⚡ Mua ngay: 250.000 ₫'), findsOneWidget);

      // Tap on "Quy chế" modal
      await tester.tap(find.text('Quy chế'));
      await tester.pumpAndSettle();

      expect(find.text('Quy chế đấu giá Lật Lại'), findsOneWidget);
      expect(
        find.text('1. Kiểm định thực tế tại trạm ViaPoint'),
        findsOneWidget,
      );
      expect(find.text('2. Ký quỹ bảo chứng & Hoàn cọc 100%'), findsOneWidget);

      // Close modal
      await tester.tap(find.text('Tôi đã hiểu'));
      await tester.pumpAndSettle();

      expect(find.text('Quy chế đấu giá Lật Lại'), findsNothing);
    },
  );

  testWidgets(
    'ChatInboxScreen renders redesigned cards, book thumbnails, and partner tags',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on chat icon in TopNavbar
      final chatIcon = find.byIcon(Icons.chat_bubble_outline_rounded).first;
      await tester.tap(chatIcon);
      await tester.pumpAndSettle();

      // Verify Chat Inbox Search & Filter Dropdown
      expect(find.byType(SearchField), findsOneWidget);
      expect(find.textContaining('Tất cả'), findsOneWidget);

      // Verify Partner Identity and Role Tag
      expect(find.text('Lan Anh'), findsOneWidget);
      expect(find.text('Người mua'), findsOneWidget);

      // Verify real book title
      expect(find.text('Mắt Biếc'), findsOneWidget);

      // Verify status snippet with partner proposal highlight
      expect(
        find.textContaining(
          '⚡ Đối tác đề nghị giá 45.000 ₫ — Cần bạn phản hồi',
        ),
        findsOneWidget,
      );
      expect(find.text('CẦN PHẢN HỒI'), findsOneWidget);
    },
  );

  testWidgets(
    'OrdersScreen renders web-parity role tabs, status filters, and book details',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Go to Account -> Đơn mua/bán trực tiếp
      await tester.tap(find.text('Tài khoản'));
      await tester.pumpAndSettle();

      final scrollable = find.byType(Scrollable).first;
      final orderLink = find.text('Đơn mua/bán trực tiếp');
      await tester.scrollUntilVisible(orderLink, 300, scrollable: scrollable);
      await tester.tap(orderLink);
      await tester.pumpAndSettle();

      // Verify Dashboard Bento Header
      expect(find.text('Đơn hàng của tôi'), findsOneWidget);
      expect(
        find.text('Đơn mua & bán trực tiếp qua Lật Lại Escrow'),
        findsOneWidget,
      );

      // Verify Role Filter Tabs
      expect(find.text('Tất cả'), findsWidgets);
      expect(find.text('Đơn mua'), findsOneWidget);
      expect(find.text('Đơn bán'), findsOneWidget);

      // Verify Status Filter Chips
      expect(find.text('Tất cả trạng thái'), findsOneWidget);
      expect(find.text('Đang xử lý'), findsOneWidget);
      expect(find.text('Đã hoàn tất'), findsOneWidget);
      expect(find.text('Đã hủy / hết hạn'), findsOneWidget);

      // Verify Order Card details matching Web
      expect(find.text('Bạn mua'), findsOneWidget);
      expect(find.text('#ORDER-12'), findsOneWidget);
      expect(find.text('Chờ thanh toán'), findsOneWidget);
      expect(find.text('Dế Mèn Phiêu Lưu Ký'), findsOneWidget);
      expect(find.text('65.000 ₫'), findsOneWidget);
      expect(find.text('Thanh toán ngay'), findsOneWidget);
    },
  );

  testWidgets(
    'ConversationScreen renders 2 tabs (Đơn sách vs Chatbox) and switches smoothly',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Open chat inbox from top navbar
      final chatIcon = find.byIcon(Icons.chat_bubble_outline_rounded).first;
      await tester.tap(chatIcon);
      await tester.pumpAndSettle();

      // Tap on the conversation card to open detail
      final convCard = find.text('Lan Anh');
      await tester.tap(convCard);
      await tester.pumpAndSettle();

      // Verify 2 Segmented Tabs
      expect(find.text('Đơn sách'), findsOneWidget);
      expect(find.text('Chatbox'), findsOneWidget);

      // In Tab 0 ("Đơn sách"):
      expect(find.text('Thông tin sách'), findsOneWidget);
      expect(find.text('Thỏa thuận giao dịch'), findsOneWidget);

      // Switch to Tab 1 ("Chatbox")
      await tester.tap(find.text('Chatbox'));
      await tester.pumpAndSettle();

      // In Tab 1 ("Chatbox"):
      expect(find.text('Hộp thoại thương lượng'), findsOneWidget);
      expect(find.text('Xem đơn'), findsOneWidget);

      // Tap "Xem đơn" to switch back to Tab 0
      await tester.tap(find.text('Xem đơn'));
      await tester.pumpAndSettle();

      expect(find.text('Thông tin sách'), findsOneWidget);

      // Test Inline Exchange Selector integrated directly in this screen
      expect(find.text('✓ Thương lượng mua'), findsOneWidget);
      expect(find.text('Đổi sách'), findsOneWidget);

      // Tap "Đổi sách" to switch to inline exchange proposal composer
      await tester.tap(find.text('Đổi sách'));
      await tester.pumpAndSettle();

      expect(find.text('✓ Đổi sách'), findsOneWidget);
      expect(find.text('Soạn đề nghị đổi sách'), findsOneWidget);
      expect(
        find.text(
          'Chọn sách đã được duyệt trên kệ của bạn để đề nghị hoán đổi:',
        ),
        findsOneWidget,
      );
      expect(find.text('Cho Tôi Xin Một Vé Đi Tuổi Thơ'), findsOneWidget);
      expect(find.text('Gửi đề xuất đổi 0 cuốn'), findsOneWidget);

      // Select the book
      await tester.tap(find.text('Cho Tôi Xin Một Vé Đi Tuổi Thơ'));
      await tester.pumpAndSettle();

      expect(find.text('Gửi đề xuất đổi 1 cuốn'), findsOneWidget);

      // Tap "Thương lượng mua" to switch back seamlessly
      await tester.tap(find.text('Thương lượng mua'));
      await tester.pumpAndSettle();

      expect(find.text('✓ Thương lượng mua'), findsOneWidget);
    },
  );

  testWidgets(
    'OrdersScreen renders full lifecycle procedures, escrow protection, and executes order payment',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Go to Account -> Đơn mua/bán trực tiếp
      await tester.tap(find.text('Tài khoản'));
      await tester.pumpAndSettle();

      final scrollable = find.byType(Scrollable).first;
      final orderLink = find.text('Đơn mua/bán trực tiếp');
      await tester.scrollUntilVisible(orderLink, 300, scrollable: scrollable);
      await tester.tap(orderLink);
      await tester.pumpAndSettle();

      // Open detail of order-1234-5678
      final payNowBtn = find.text('Thanh toán ngay');
      await tester.tap(payNowBtn);
      await tester.pumpAndSettle();

      // Verify 5-Step Stepper & Escrow banner
      expect(find.text('Thủ tục đơn hàng'), findsOneWidget);
      expect(find.textContaining('Bảo lưu Lật Lại Escrow'), findsOneWidget);

      // Verify address preview
      expect(find.text('Địa chỉ nhận sách của bạn'), findsOneWidget);
      expect(find.textContaining('Nguyễn Văn A'), findsOneWidget);

      // Verify AwaitingPayment procedure card & Pay CTA
      expect(find.text('Chờ thanh toán đơn hàng'), findsOneWidget);
      expect(find.textContaining('Thanh toán ngay (65.000 ₫)'), findsOneWidget);

      // Execute Payment
      await tester.tap(find.textContaining('Thanh toán ngay (65.000 ₫)'));
      await tester.pumpAndSettle();

      expect(
        fakeClient.recordedCalls.where(
          (c) => c.startsWith('POST /orders/order-1234-5678/pay'),
        ),
        isNotEmpty,
      );
    },
  );

  testWidgets(
    'Book detail screen renders "Mua ngay" CTA and executes Buy Now with quote and escrow payment',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const UsedBooksApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on book "Mắt Biếc" on shelf
      await tester.tap(find.text('Mắt Biếc').first);
      await tester.pumpAndSettle();

      // Verify "Mua ngay" button is present and "Thêm vào giỏ" is gone
      expect(find.text('Mua ngay'), findsOneWidget);
      expect(find.text('Thêm vào giỏ'), findsNothing);
      expect(find.text('Thương lượng & Mua'), findsOneWidget);

      // Tap "Mua ngay"
      await tester.tap(find.text('Mua ngay'));
      await tester.pumpAndSettle();

      // Verify bottom sheet appeared with address and quote
      expect(find.text('Xác nhận Mua ngay'), findsOneWidget);
      expect(find.text('ĐỊA CHỈ NHẬN HÀNG (DIRECTDELIVERY)'), findsOneWidget);
      expect(find.text('CHI TIẾT THANH TOÁN'), findsOneWidget);
      expect(find.text('Ví Lật Lại (Escrow):'), findsOneWidget);

      // Confirm Buy Now
      final confirmBtn = find.textContaining(
        'Thanh toán & Đặt mua ngay (50.000 ₫)',
      );
      expect(confirmBtn, findsOneWidget);
      await tester.tap(confirmBtn);
      await tester.pumpAndSettle();

      // Verify calls: quote, buy-now order, and instant wallet payment
      expect(
        fakeClient.recordedCalls.where((c) => c.contains('/quotes')),
        isNotEmpty,
      );
      expect(
        fakeClient.recordedCalls.where(
          (c) => c.startsWith('POST /orders/buy-now'),
        ),
        isNotEmpty,
      );
      expect(
        fakeClient.recordedCalls.where(
          (c) => c.startsWith('POST /orders/order-1234-5678/pay'),
        ),
        isNotEmpty,
      );
    },
  );

  testWidgets(
    'ConversationScreen embeds full OrderDetailsDossier when orderId is present (Web parity)',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 2.0;
      addTearTearDown(tester.view.resetPhysicalSize);

      final fakeClient = _FakeSessionClient(authenticated: true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [sessionClientProvider.overrideWithValue(fakeClient)],
          child: const MaterialApp(
            home: ConversationScreen(id: 'conv-with-order'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify 2 Tabs
      expect(find.text('Đơn sách'), findsOneWidget);
      expect(find.text('Chatbox'), findsOneWidget);

      // In Tab 0 ("Đơn sách"): Verify full OrderDetailsDossier is embedded in place
      expect(find.text('Thủ tục đơn hàng'), findsOneWidget);
      expect(find.textContaining('Bảo lưu Lật Lại Escrow:'), findsOneWidget);
      expect(find.textContaining('Thanh toán ngay'), findsOneWidget);
      expect(find.text('Hủy đơn chưa thanh toán'), findsOneWidget);

      // Switch to Tab 1 ("Chatbox") and verify compact bar with order badge
      await tester.tap(find.text('Chatbox'));
      await tester.pumpAndSettle();

      expect(find.text('Hộp thoại thương lượng'), findsOneWidget);
      expect(find.textContaining('Đơn #ORDER-12'), findsOneWidget);
      expect(find.text('Xem đơn'), findsOneWidget);
    },
  );
}

void addTearTearDown(VoidCallback callback) {
  addTearDown(callback);
}
