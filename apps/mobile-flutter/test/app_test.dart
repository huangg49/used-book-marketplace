import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:used_books_flutter/core/api/session_client.dart';
import 'package:used_books_flutter/core/theme/app_theme.dart';
import 'package:used_books_flutter/core/widgets/app_widgets.dart';
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
    if (method == 'POST' && path == '/listings') {
      return {
        'entityId': '55555555-5555-4555-8555-555555555555',
        'version': 1,
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
    return const <String, dynamic>{};
  }
}

void main() {
  test('formatVnd formats Vietnamese currency accurately', () {
    expect(formatVnd(50000), '50.000 ₫');
    expect(formatVnd(1250000), '1.250.000 ₫');
    expect(formatVnd(null), 'Chưa có giá');
  });

  testWidgets('Home shelf renders Lật Lại header, book grid, and 5-tab bar',
      (tester) async {
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

  testWidgets('Authenticated Account hub renders WorkInbox and member links',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2200);
    tester.view.devicePixelRatio = 2.0;
    addTearTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionClientProvider
              .overrideWithValue(_FakeSessionClient(authenticated: true)),
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
          sessionClientProvider
              .overrideWithValue(_FakeSessionClient(authenticated: false)),
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
    expect(find.text('Chưa có tài khoản độc giả? Đăng ký ngay'), findsOneWidget);

    // Tap to go to Register screen
    await tester.tap(find.text('Chưa có tài khoản độc giả? Đăng ký ngay'));
    await tester.pumpAndSettle();

    // Verify Register screen
    expect(find.text('Tạo tài khoản mới'), findsOneWidget);
    expect(find.text('Đã có tài khoản? Đăng nhập'), findsOneWidget);
    expect(find.text('Tạo tài khoản'), findsOneWidget);
  });

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
        overrides: [
          sessionClientProvider.overrideWithValue(fakeClient),
        ],
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
    expect(find.text('Phiếu thông tin sách'), findsOneWidget);
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
  });
}

void addTearTearDown(VoidCallback callback) {
  addTearDown(callback);
}
