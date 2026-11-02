import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// OrdersScreen (`/orders`) matching `apps/mobile-react-native/src/features/orders/orders-screen.tsx`
/// and `order-focus-screen.tsx` / `OrderDetails.tsx` (synchronized 5-step progress stepper).
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key, this.focusOrderId});

  final String? focusOrderId;

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String _selectedTab = 'all';
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;
  List<Map<String, dynamic>> _orders = const [];
  Map<String, dynamic>? _focusedOrder;

  static const _tabs = [
    (id: 'all', label: 'Tất cả'),
    (id: 'AwaitingPayment', label: 'Chờ thanh toán'),
    (id: 'processing', label: 'Đang xử lý'),
    (id: 'Completed', label: 'Hoàn tất'),
    (id: 'Cancelled', label: 'Đã hủy'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadOrders);
  }

  Future<void> _loadOrders() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) {
      setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request('/me/orders?limit=20');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (!mounted) return;
      final parsed = list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      setState(() {
        _orders = parsed;
        _loading = false;
      });
      if (widget.focusOrderId != null && widget.focusOrderId!.isNotEmpty) {
        await _openOrderDetail(widget.focusOrderId!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _openOrderDetail(String orderId) async {
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request('/me/orders/$orderId');
      if (!mounted) return;
      if (res is Map) {
        setState(() => _focusedOrder = Map<String, dynamic>.from(res));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = presentErrorMessage(e));
    }
  }

  Future<void> _performOrderAction(String orderId, String action) async {
    final version = (_focusedOrder?['version'] is num)
        ? (_focusedOrder!['version'] as num).toInt()
        : 1;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/orders/$orderId/$action',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('order-$action'),
        body: {'expectedVersion': version},
      );
      await _openOrderDetail(orderId);
      await _loadOrders();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã cập nhật trạng thái đơn hàng thành công.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  String _formatOrderState(String state) {
    return switch (state) {
      'AwaitingPayment' => 'Chờ thanh toán',
      'PaidAwaitingSellerConfirmation' => 'Chờ người bán xác nhận',
      'Preparing' || 'Accepted' => 'Đang chuẩn bị sách',
      'InTransit' || 'Shipped' => 'Đang vận chuyển',
      'Delivered' || 'Inspection' => 'Đã giao · Kiểm định 72h',
      'Completed' => 'Hoàn tất',
      'Cancelled' || 'Rejected' => 'Đã hủy',
      _ => state,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_focusedOrder != null) {
      return _buildOrderFocusView(_focusedOrder!);
    }

    final awaitingCount =
        _orders.where((o) => o['state'] == 'AwaitingPayment').length;
    final filtered = _orders.where((o) {
      final state = (o['state'] ?? '').toString();
      if (_selectedTab == 'all') return true;
      if (_selectedTab == 'processing') {
        return state != 'AwaitingPayment' &&
            state != 'Completed' &&
            state != 'Cancelled' &&
            state != 'Rejected';
      }
      return state == _selectedTab;
    }).toList();

    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'ĐƠN HÀNG TRỰC TIẾP'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              BackAction(
                title: 'Quay lại',
                onPressed: () =>
                    context.canPop() ? context.pop() : context.go('/account'),
              ),
              if (awaitingCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: StitchTokens.wine,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: AppText(
                    '$awaitingCount chờ trả',
                    kind: AppTextKind.label,
                    color: StitchTokens.gold,
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Đơn hàng của tôi',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: [
              AppButton(
                title: 'Mở đấu giá của tôi',
                secondary: true,
                wine: true,
                compact: true,
                onPressed: () => context.push('/my-auctions'),
              ),
              AppButton(
                title: 'Cách mua sách',
                secondary: true,
                compact: true,
                onPressed: () => context.push('/guide'),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _tabs.map((t) {
                return Padding(
                  padding: const EdgeInsets.only(right: AppSpace.sm),
                  child: AppChip(
                    title: t.label,
                    wine: true,
                    selected: _selectedTab == t.id,
                    onPressed: () => setState(() => _selectedTab = t.id),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          if (_error != null) Notice(message: _error!, tone: NoticeTone.error),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải danh sách đơn hàng…',
            )
          else if (filtered.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.receipt_long_outlined,
              title: 'Chưa có đơn hàng trong mục này',
              message:
                  'Đơn mua ngay hoặc đơn được tạo từ phòng thương lượng sẽ hiển thị tại đây.',
              actionLabel: 'Khám phá kệ sách',
              onAction: () => context.go('/search'),
            )
          else
            ...filtered.map((order) {
              final id = (order['id'] ?? '').toString();
              final shortId =
                  id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
              final role = (order['role'] ?? 'Buyer').toString();
              final state = (order['state'] ?? 'AwaitingPayment').toString();
              final item = order['item'] is Map
                  ? Map<String, dynamic>.from(order['item'] as Map)
                  : const <String, dynamic>{};
              final title =
                  (item['title'] ?? order['title'] ?? 'Đơn sách Lật Lại')
                      .toString();
              final total = (order['buyerTotal'] ??
                  order['totalAmount'] ??
                  item['bookPrice'] ??
                  0) as num;

              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.md),
                child: Container(
                  padding: const EdgeInsets.all(AppSpace.lg),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: StitchTokens.cardBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: role == 'Seller'
                                      ? AppColors.successSurface
                                      : StitchTokens.roseParchment,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: AppText(
                                  role == 'Seller' ? 'Bán' : 'Mua',
                                  kind: AppTextKind.label,
                                  color: role == 'Seller'
                                      ? AppColors.forest
                                      : StitchTokens.wine,
                                ),
                              ),
                              const SizedBox(width: 8),
                              AppText('#$shortId', kind: AppTextKind.bold),
                            ],
                          ),
                          AppText(
                            _formatOrderState(state),
                            kind: AppTextKind.label,
                            color: StitchTokens.wine,
                          ),
                        ],
                      ),
                      const Divider(height: 20),
                      AppText(title, kind: AppTextKind.card),
                      const SizedBox(height: 4),
                      AppText(
                        'Tổng đơn: ${formatVnd(total)}',
                        kind: AppTextKind.shelfPrice,
                        color: StitchTokens.wine,
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: AppSpace.sm,
                        runSpacing: AppSpace.sm,
                        children: [
                          AppButton(
                            title: state == 'AwaitingPayment'
                                ? 'Xem để thanh toán hoặc hủy'
                                : 'Mở chi tiết đơn',
                            wine: true,
                            compact: true,
                            onPressed: () => _openOrderDetail(id),
                          ),
                          if (state == 'Completed')
                            AppButton(
                              title: 'Xem hoặc viết đánh giá',
                              secondary: true,
                              wine: true,
                              compact: true,
                              onPressed: () => context.push(
                                '/reviews?type=DirectOrder&id=$id',
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  /// Synchronized 2-Card Order Focus View matching `order-focus-screen.tsx` & `OrderDetails.tsx`
  Widget _buildOrderFocusView(Map<String, dynamic> order) {
    final id = (order['id'] ?? '').toString();
    final shortId = id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
    final state = (order['state'] ?? 'AwaitingPayment').toString();
    final item = order['item'] is Map
        ? Map<String, dynamic>.from(order['item'] as Map)
        : const <String, dynamic>{};
    final bookPrice = (item['bookPrice'] ?? order['bookPrice'] ?? 0) as num;
    final shippingFee =
        (order['shippingFee'] ?? item['shippingFee'] ?? 0) as num;
    final buyerTotal =
        (order['buyerTotal'] ?? (bookPrice + shippingFee)) as num;

    const steps = [
      'Đặt đơn',
      'Thanh toán',
      'Chuẩn bị',
      'Vận chuyển',
      'Hoàn tất',
    ];
    final activeStepIndex = switch (state) {
      'AwaitingPayment' => 1,
      'PaidAwaitingSellerConfirmation' || 'Preparing' || 'Accepted' => 2,
      'InTransit' || 'Shipped' || 'Delivered' => 3,
      'Completed' => 4,
      _ => 0,
    };

    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'CHI TIẾT ĐƠN HÀNG'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về danh sách đơn trực tiếp',
            onPressed: () => setState(() => _focusedOrder = null),
          ),
          const SizedBox(height: AppSpace.sm),
          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          if (_notice != null) ...[
            Notice(message: _notice!, tone: NoticeTone.success),
            const SizedBox(height: AppSpace.md),
          ],

          // Card: Thủ tục đơn hàng & 5-Step Progress Stepper
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: StitchTokens.cardBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  color: StitchTokens.wine,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const AppText(
                            'Thủ tục đơn hàng',
                            kind: AppTextKind.bold,
                            color: Colors.white,
                          ),
                          AppText(
                            'Mã đơn: #$shortId',
                            kind: AppTextKind.small,
                            color: StitchTokens.goldLight,
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: StitchTokens.goldLight,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: AppText(
                          _formatOrderState(state),
                          kind: AppTextKind.label,
                          color: StitchTokens.wineDark,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // 5-Step Horizontal Stepper
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: List.generate(steps.length, (i) {
                            final done = i < activeStepIndex;
                            final current = i == activeStepIndex;
                            return Padding(
                              padding: const EdgeInsets.only(right: 12),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 13,
                                    backgroundColor: done
                                        ? const Color(0xFF1F7A3E)
                                        : current
                                            ? StitchTokens.wine
                                            : StitchTokens.parchment,
                                    child: done
                                        ? const Icon(
                                            Icons.check_rounded,
                                            size: 14,
                                            color: Colors.white,
                                          )
                                        : AppText(
                                            '${i + 1}',
                                            kind: AppTextKind.label,
                                            color: current
                                                ? StitchTokens.gold
                                                : AppColors.muted,
                                          ),
                                  ),
                                  const SizedBox(width: 6),
                                  AppText(
                                    steps[i],
                                    kind: current
                                        ? AppTextKind.bold
                                        : AppTextKind.small,
                                    color: current
                                        ? StitchTokens.wine
                                        : AppColors.ink,
                                  ),
                                ],
                              ),
                            );
                          }),
                        ),
                      ),
                      const Divider(height: 24),
                      AppText(
                        (item['title'] ?? 'Ấn bản sách trong đơn').toString(),
                        kind: AppTextKind.card,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const AppText('Giá sách:'),
                          AppText(formatVnd(bookPrice), kind: AppTextKind.bold),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const AppText('Phí giao nhận:'),
                          AppText(
                            formatVnd(shippingFee),
                            kind: AppTextKind.bold,
                          ),
                        ],
                      ),
                      const Divider(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const AppText(
                            'Tổng người mua thanh toán:',
                            kind: AppTextKind.bold,
                          ),
                          AppText(
                            formatVnd(buyerTotal),
                            kind: AppTextKind.bookPrice,
                            color: StitchTokens.wine,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: AppSpace.sm,
                        runSpacing: AppSpace.sm,
                        children: [
                          if (order['paymentEnabled'] == true ||
                              state == 'AwaitingPayment')
                            AppButton(
                              title: 'Thanh toán ngay (${formatVnd(buyerTotal)})',
                              wine: true,
                              busy: _busy,
                              onPressed: () => _performOrderAction(id, 'pay'),
                            ),
                          if (order['sellerAcceptanceEnabled'] == true)
                            AppButton(
                              title: 'Xác nhận bán',
                              wine: true,
                              busy: _busy,
                              onPressed: () =>
                                  _performOrderAction(id, 'accept'),
                            ),
                          if (order['canReject'] == true)
                            AppButton(
                              title: 'Từ chối đơn',
                              secondary: true,
                              busy: _busy,
                              onPressed: () =>
                                  _performOrderAction(id, 'reject'),
                            ),
                          if (order['canCancel'] == true ||
                              state == 'AwaitingPayment')
                            AppButton(
                              title: 'Hủy đơn chưa thanh toán',
                              secondary: true,
                              busy: _busy,
                              onPressed: () =>
                                  _performOrderAction(id, 'cancel'),
                            ),
                          if (state == 'Completed')
                            AppButton(
                              title: 'Xem hoặc viết đánh giá',
                              wine: true,
                              onPressed: () => context.push(
                                '/reviews?type=DirectOrder&id=$id',
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

