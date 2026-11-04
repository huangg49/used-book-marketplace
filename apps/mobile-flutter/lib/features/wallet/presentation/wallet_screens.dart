import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// WalletScreen (`/wallet`) matching `apps/mobile-react-native/src/features/wallet/wallet-screen.tsx` & `topup-modal.tsx`
class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  String _selectedType = '';
  bool _loading = true;
  bool _topupBusy = false;
  String? _error;
  String? _notice;
  Map<String, dynamic> _wallet = const {
    'available': 0,
    'transactionHeld': 0,
    'total': 0,
  };
  List<Map<String, dynamic>> _history = const [];
  List<Map<String, dynamic>> _topups = const [];

  static const _ledgerTabs = [
    (id: '', label: 'Tất cả'),
    (id: 'Topup', label: 'Nạp tiền'),
    (id: 'OrderHold', label: 'Giữ tiền mua sách'),
    (id: 'SellerPayout', label: 'Nhận tiền bán'),
    (id: 'Refund', label: 'Hoàn tiền'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadWallet);
  }

  Future<void> _loadWallet() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final typeQuery = _selectedType.isNotEmpty
          ? '&type=${Uri.encodeQueryComponent(_selectedType)}'
          : '';
      final results = await Future.wait<dynamic>([
        client.request('/me/wallet'),
        client.request('/me/wallet/history?limit=10$typeQuery'),
        client.request('/me/topups?limit=10').catchError((_) => const {}),
      ]);
      final w = results[0] is Map
          ? Map<String, dynamic>.from(results[0] as Map)
          : const <String, dynamic>{};
      final hList = (results[1] is Map && (results[1] as Map)['items'] is List)
          ? ((results[1] as Map)['items'] as List)
          : const [];
      final tList = (results[2] is Map && (results[2] as Map)['items'] is List)
          ? ((results[2] as Map)['items'] as List)
          : const [];

      if (!mounted) return;
      setState(() {
        _wallet = w;
        _history = hList
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _topups = tList
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _createVnpayTopup(int amount) async {
    setState(() {
      _topupBusy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/topups/vnpay',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('topup'),
        body: {'amount': amount},
      );
      await _loadWallet();
      if (!mounted) return;
      setState(() {
        _topupBusy = false;
        _notice =
            'Đã khởi tạo yêu cầu nạp ${formatVnd(amount)} qua cổng VNPay Sandbox.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _topupBusy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  void _openTopupDialog() {
    final ctrl = TextEditingController(text: '100000');
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const AppText(
          'Nạp tiền vào Ví (VNPay Sandbox)',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppTextField(
              label: 'SỐ TIỀN CẦN NẠP (VNĐ)',
              controller: ctrl,
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [50000, 100000, 200000, 500000, 1000000].map((preset) {
                return AppChip(
                  title: formatVnd(preset),
                  selected: false,
                  onPressed: () => ctrl.text = '$preset',
                );
              }).toList(),
            ),
          ],
        ),
        actions: [
          AppButton(
            title: 'Đóng',
            secondary: true,
            compact: true,
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          AppButton(
            title: 'Mở cổng VNPay Sandbox',
            wine: true,
            compact: true,
            onPressed: () {
              final val = int.tryParse(ctrl.text.trim()) ?? 0;
              Navigator.of(ctx).pop();
              if (val >= 5000) _createVnpayTopup(val);
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final available = (_wallet['available'] ?? 0) as num;
    final held = (_wallet['transactionHeld'] ?? 0) as num;
    final total = (_wallet['total'] ?? (available + held)) as num;

    return AppScreen(
      header: const TopNavbar(subtitle: 'VÍ CỦA TÔI'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về tài khoản',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/account'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Ví của bạn',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.sm),
          const Notice(
            message:
                'Mô phỏng đồ án. Số liệu thử nghiệm sổ cái bất biến (Ledger), không phải tiền thật.',
            tone: NoticeTone.info,
          ),
          const SizedBox(height: AppSpace.md),
          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          if (_notice != null) ...[
            Notice(message: _notice!, tone: NoticeTone.success),
            const SizedBox(height: AppSpace.md),
          ],

          // Balance Card
          Container(
            padding: const EdgeInsets.all(AppSpace.xl),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [StitchTokens.wine, StitchTokens.wineDark],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppText(
                  'Số dư có thể dùng',
                  kind: AppTextKind.small,
                  color: StitchTokens.goldLight,
                ),
                const SizedBox(height: 4),
                AppText(
                  formatVnd(available),
                  kind: AppTextKind.title,
                  color: StitchTokens.gold,
                ),
                const Divider(height: 24, color: Colors.white24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const AppText(
                      'Đang giữ cho đơn sách:',
                      kind: AppTextKind.small,
                      color: Colors.white70,
                    ),
                    AppText(
                      formatVnd(held),
                      kind: AppTextKind.bold,
                      color: Colors.white,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const AppText(
                      'Tổng số dư:',
                      kind: AppTextKind.small,
                      color: Colors.white70,
                    ),
                    AppText(
                      formatVnd(total),
                      kind: AppTextKind.bold,
                      color: StitchTokens.gold,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.lg),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: [
                    AppButton(
                      title: 'Nạp tiền vào ví (VNPay)',
                      busy: _topupBusy,
                      onPressed: _openTopupDialog,
                    ),
                    AppButton(
                      title: 'Cập nhật số dư',
                      secondary: true,
                      wine: true,
                      compact: true,
                      onPressed: _loadWallet,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.xl),

          if (_topups.isNotEmpty) ...[
            const AppText('Yêu cầu nạp gần đây', kind: AppTextKind.heading),
            const SizedBox(height: AppSpace.sm),
            ..._topups.take(3).map((tp) {
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: AppText(
                  formatVnd((tp['amount'] ?? 0) as num),
                  kind: AppTextKind.bold,
                ),
                subtitle: AppText(
                  'Trạng thái: ${tp['credited'] == true ? "Đã nạp" : (tp['state'] ?? "Đang xử lý")}',
                  kind: AppTextKind.small,
                ),
              );
            }),
            const SizedBox(height: AppSpace.md),
          ],

          const AppText('Lịch sử ghi nhận', kind: AppTextKind.heading),
          const SizedBox(height: AppSpace.sm),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _ledgerTabs.map((t) {
                return Padding(
                  padding: const EdgeInsets.only(right: AppSpace.sm),
                  child: AppChip(
                    title: t.label,
                    wine: true,
                    selected: _selectedType == t.id,
                    onPressed: () {
                      setState(() => _selectedType = t.id);
                      _loadWallet();
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: AppSpace.md),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải sổ cái ví…',
            )
          else if (_history.isEmpty)
            const AppText(
              'Chưa có bút toán nào trong mục này.',
              kind: AppTextKind.small,
              color: AppColors.muted,
            )
          else
            ..._history.map((entry) {
              final amount = (entry['amount'] ?? 0) as num;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: StitchTokens.cardBorder),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppText(
                          (entry['type'] ?? 'Bút toán ví').toString(),
                          kind: AppTextKind.bold,
                        ),
                        AppText(
                          'Số dư sau GD: ${formatVnd((entry['balanceAfter'] ?? 0) as num)}',
                          kind: AppTextKind.small,
                        ),
                      ],
                    ),
                    AppText(
                      formatVnd(amount.abs()),
                      kind: AppTextKind.bold,
                      color:
                          amount >= 0 ? AppColors.forest : StitchTokens.wine,
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// CartScreen (`/cart`) matching `apps/mobile-react-native/src/features/cart/cart-screen.tsx`
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  bool _loading = true;
  String? _error;
  int _version = 0;
  List<Map<String, dynamic>> _items = const [];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadCart);
  }

  Future<void> _loadCart() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request('/me/cart');
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      final list = map['items'] is List ? (map['items'] as List) : const [];
      if (!mounted) return;
      setState(() {
        _version = (map['version'] is num) ? (map['version'] as num).toInt() : 0;
        _items = list
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _removeItem(String listingId) async {
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/cart/items/$listingId',
        method: 'DELETE',
        idempotencyKey: generateIdempotencyKey('cart-rm'),
        body: {'expectedVersion': _version},
      );
      await _loadCart();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = presentErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScreen(
      header: const TopNavbar(subtitle: 'GIỎ SÁCH'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về Tài khoản',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/account'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Giỏ sách',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: 4),
          const AppText(
            'Tối đa 50 bài đăng, mỗi bài một dòng. Chọn mua từng bản sách khi sẵn sàng thanh toán.',
            kind: AppTextKind.small,
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            children: [
              AppButton(
                title: 'Cập nhật giỏ sách',
                secondary: true,
                compact: true,
                onPressed: _loadCart,
              ),
              AppButton(
                title: 'Đơn hàng của tôi',
                wine: true,
                compact: true,
                onPressed: () => context.push('/orders'),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          if (_error != null) Notice(message: _error!, tone: NoticeTone.error),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải giỏ sách…',
            )
          else if (_items.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.shopping_bag_outlined,
              title: 'Giỏ sách đang trống',
              actionLabel: 'Khám phá kệ sách',
              onAction: () => context.go('/search'),
            )
          else
            ..._items.map((item) {
              final listingId = (item['listingId'] ?? '').toString();
              final listing = item['listing'] is Map
                  ? Map<String, dynamic>.from(item['listing'] as Map)
                  : const <String, dynamic>{};
              final book = listing['book'] is Map
                  ? Map<String, dynamic>.from(listing['book'] as Map)
                  : const <String, dynamic>{};
              final title =
                  (book['title'] ?? listing['title'] ?? 'Ấn bản trong giỏ')
                      .toString();
              final price =
                  (listing['salePrice'] ?? item['priceAtAdd'] ?? 0) as num;
              return Container(
                margin: const EdgeInsets.only(bottom: AppSpace.md),
                padding: const EdgeInsets.all(AppSpace.lg),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: StitchTokens.cardBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(title, kind: AppTextKind.card),
                    const SizedBox(height: 4),
                    AppText(
                      formatVnd(price),
                      kind: AppTextKind.shelfPrice,
                      color: StitchTokens.wine,
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        AppButton(
                          title: 'Xem bài đăng',
                          wine: true,
                          compact: true,
                          onPressed: () =>
                              context.push('/book?id=$listingId'),
                        ),
                        AppButton(
                          title: 'Xóa khỏi giỏ',
                          secondary: true,
                          compact: true,
                          onPressed: () => _removeItem(listingId),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// WishlistScreen (`/wishlist`) matching `apps/mobile-react-native/src/features/wishlist/wishlist-screen.tsx`
class WishlistScreen extends ConsumerStatefulWidget {
  const WishlistScreen({super.key});

  @override
  ConsumerState<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends ConsumerState<WishlistScreen> {
  String _selectedTab = 'all';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadWishlist);
  }

  Future<void> _loadWishlist() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request('/me/wishlist?limit=20');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (!mounted) return;
      setState(() {
        _items = list
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScreen(
      header: const TopNavbar(subtitle: 'SÁCH YÊU THÍCH'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Quay lại',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/account'),
          ),
          const SizedBox(height: AppSpace.xs),
          AppText(
            'Sách đã lưu (${_items.length})',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppChip(
                title: 'Tất cả (${_items.length})',
                wine: true,
                selected: _selectedTab == 'all',
                onPressed: () => setState(() => _selectedTab = 'all'),
              ),
              AppChip(
                title: 'Ấn bản bán',
                wine: true,
                selected: _selectedTab == 'listing',
                onPressed: () => setState(() => _selectedTab = 'listing'),
              ),
              AppChip(
                title: 'Muốn đổi',
                wine: true,
                selected: _selectedTab == 'exchange',
                onPressed: () => setState(() => _selectedTab = 'exchange'),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          if (_error != null) Notice(message: _error!, tone: NoticeTone.error),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải sách đã lưu…',
            )
          else if (_items.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.bookmark_border_rounded,
              title: 'Chưa có sách đã lưu',
              message:
                  'Nhấn biểu tượng lưu trên thẻ sách để theo dõi giá hoặc nhận thông báo.',
              actionLabel: 'Khám phá kệ sách',
              onAction: () => context.go('/search'),
            )
          else
            ..._items.map((w) {
              final listingId =
                  (w['listingId'] ?? w['subjectId'] ?? '').toString();
              final title = (w['title'] ?? 'Ấn bản đã lưu').toString();
              return Container(
                margin: const EdgeInsets.only(bottom: AppSpace.md),
                padding: const EdgeInsets.all(AppSpace.lg),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: StitchTokens.cardBorder),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(title, kind: AppTextKind.bold),
                          const SizedBox(height: 4),
                          const AppText(
                            'BẢN SÁCH BÁN · Nhận thông báo giá',
                            kind: AppTextKind.label,
                            color: AppColors.forest,
                          ),
                        ],
                      ),
                    ),
                    AppButton(
                      title: 'Xem chi tiết',
                      wine: true,
                      compact: true,
                      onPressed: () => context.push('/book?id=$listingId'),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// AddressesScreen (`/addresses`) matching `apps/mobile-react-native/src/features/addresses/addresses-screen.tsx`
class AddressesScreen extends ConsumerStatefulWidget {
  const AddressesScreen({super.key});

  @override
  ConsumerState<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends ConsumerState<AddressesScreen> {
  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _phoneCtrl = TextEditingController();
  final TextEditingController _detailCtrl = TextEditingController();
  String _localityCode = 'Q1';
  bool _makeDefault = true;
  bool _editing = false;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  int _bookVersion = 0;
  List<Map<String, dynamic>> _items = const [];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadAddresses);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _detailCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAddresses() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request('/me/addresses');
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      final list = map['items'] is List ? (map['items'] as List) : const [];
      if (!mounted) return;
      setState(() {
        _bookVersion =
            (map['version'] is num) ? (map['version'] as num).toInt() : 0;
        _items = list
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _saveAddress() async {
    if (_nameCtrl.text.trim().isEmpty ||
        _phoneCtrl.text.trim().isEmpty ||
        _detailCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Vui lòng điền đầy đủ người nhận, SĐT và địa chỉ.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/addresses',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('addr-add'),
        body: {
          'expectedBookVersion': _bookVersion,
          'makeDefault': _makeDefault,
          'address': {
            'recipientName': _nameCtrl.text.trim(),
            'phone': _phoneCtrl.text.trim(),
            'serviceAreaCode': 'HCM-DEMO-v1',
            'localityCode': _localityCode,
            'detail': _detailCtrl.text.trim(),
          },
        },
      );
      await _loadAddresses();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _editing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScreen(
      header: const TopNavbar(subtitle: 'SỔ ĐỊA CHỈ'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: _editing ? 'Quay lại sổ địa chỉ' : 'Quay lại',
            onPressed: () {
              if (_editing) {
                setState(() => _editing = false);
              } else if (context.canPop()) {
                context.pop();
              } else {
                context.go('/account');
              }
            },
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'NƠI SÁCH ĐƯỢC CHUYỀN TỚI',
            kind: AppTextKind.label,
            color: AppColors.muted,
          ),
          AppText(
            _editing ? 'Thêm địa chỉ' : 'Sổ địa chỉ (${_items.length}/10)',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          if (_editing)
            Container(
              padding: const EdgeInsets.all(AppSpace.xl),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: StitchTokens.cardBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AppText('NGƯỜI NHẬN', kind: AppTextKind.label),
                  const SizedBox(height: 8),
                  AppTextField(
                    label: 'Tên người nhận',
                    requiredField: true,
                    controller: _nameCtrl,
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    label: 'Số điện thoại',
                    requiredField: true,
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 16),
                  const AppText(
                    'KHU VỰC (TP.HCM · BÌNH DƯƠNG · VŨNG TÀU)',
                    kind: AppTextKind.label,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ('Q1', 'Quận 1, TP.HCM'),
                      ('Q3', 'Quận 3, TP.HCM'),
                      ('THUDUC', 'TP. Thủ Đức, TP.HCM'),
                      ('BINHDUONG', 'Bình Dương'),
                      ('VUNGTAU', 'Vũng Tàu'),
                    ].map((loc) {
                      return AppChip(
                        title: loc.$2,
                        wine: true,
                        selected: _localityCode == loc.$1,
                        onPressed: () =>
                            setState(() => _localityCode = loc.$1),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    label: 'Địa chỉ chi tiết',
                    requiredField: true,
                    controller: _detailCtrl,
                    placeholder: 'Số nhà, tên đường, phường/xã…',
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _makeDefault,
                    activeColor: StitchTokens.wine,
                    title: const AppText('Đặt làm địa chỉ mặc định'),
                    onChanged: (v) =>
                        setState(() => _makeDefault = v ?? true),
                  ),
                  const SizedBox(height: 12),
                  AppButton(
                    title: 'Lưu địa chỉ',
                    wine: true,
                    busy: _saving,
                    onPressed: _saveAddress,
                  ),
                ],
              ),
            )
          else ...[
            AppButton(
              title: '+ Thêm địa chỉ',
              wine: true,
              onPressed: () => setState(() => _editing = true),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_loading)
              const StatePanel(
                wine: true,
                loading: true,
                title: 'Đang tải sổ địa chỉ…',
              )
            else if (_items.isEmpty)
              const StatePanel(
                wine: true,
                icon: Icons.location_on_outlined,
                title: 'Chưa có địa chỉ lưu trong sổ',
                message:
                    'Thêm địa chỉ tại TP.HCM, Bình Dương hoặc Vũng Tàu để đặt mua và gửi sách.',
              )
            else
              ..._items.asMap().entries.map((entry) {
                final idx = entry.key + 1;
                final addr = entry.value;
                final isDef = addr['isDefault'] == true;
                return Container(
                  margin: const EdgeInsets.only(bottom: AppSpace.md),
                  padding: const EdgeInsets.all(AppSpace.lg),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isDef
                          ? StitchTokens.wine
                          : StitchTokens.cardBorder,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppText(
                        isDef
                            ? 'ĐỊA CHỈ $idx · MẶC ĐỊNH'
                            : 'ĐỊA CHỈ $idx',
                        kind: AppTextKind.label,
                        color: StitchTokens.wine,
                      ),
                      const SizedBox(height: 4),
                      AppText(
                        '${addr['recipientName'] ?? ''} · ${addr['phone'] ?? ''}',
                        kind: AppTextKind.bold,
                      ),
                      AppText(
                        (addr['detail'] ?? '').toString(),
                        kind: AppTextKind.small,
                      ),
                    ],
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}

