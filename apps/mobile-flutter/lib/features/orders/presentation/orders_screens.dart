import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';
import 'order_details_dossier.dart';

String _formatDateVi(dynamic raw) {
  if (raw == null) return '';
  final dt = DateTime.tryParse(raw.toString())?.toLocal();
  if (dt == null) return '';
  final dd = dt.day.toString().padLeft(2, '0');
  final mm = dt.month.toString().padLeft(2, '0');
  final yyyy = dt.year.toString();
  final hh = dt.hour.toString().padLeft(2, '0');
  final min = dt.minute.toString().padLeft(2, '0');
  return '$hh:$min · $dd/$mm/$yyyy';
}

/// OrdersScreen (`/orders`) synchronized with web `DirectOrders.module.css` / `DirectOrderPage.tsx`
/// and React Native `orders-screen.tsx` / `order-focus-screen.tsx`.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key, this.focusOrderId});

  final String? focusOrderId;

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String _selectedRole = 'all'; // 'all' | 'Buyer' | 'Seller'
  String _selectedStatus =
      'all'; // 'all' | 'in_progress' | 'completed' | 'cancelled'
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _orders = const [];
  Map<String, dynamic>? _focusedOrder;
  final Map<String, Map<String, dynamic>> _orderDetailCache = {};

  static const _inProgressStates = [
    'AwaitingPayment',
    'PendingSellerConfirmation',
    'PaidAwaitingSellerConfirmation',
    'Preparing',
    'Accepted',
    'InTransit',
    'Shipped',
    'Delivered',
    'Inspection',
    'ResolutionPending',
    'SettlementPending',
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
      final res = await client.request('/me/orders?limit=30');
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
      _enrichOrderSummaries(parsed);
      if (widget.focusOrderId != null && widget.focusOrderId!.isNotEmpty) {
        _openOrderDetail(widget.focusOrderId!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _enrichOrderSummaries(List<Map<String, dynamic>> orders) async {
    final client = ref.read(sessionClientProvider);
    final toFetch = orders
        .map((o) => (o['id'] ?? '').toString())
        .where((id) => id.isNotEmpty && !_orderDetailCache.containsKey(id))
        .take(15)
        .toList();
    if (toFetch.isEmpty) return;

    await Future.wait(
      toFetch.map((id) async {
        try {
          final res = await client.request('/me/orders/$id');
          if (res is Map && mounted) {
            _orderDetailCache[id] = Map<String, dynamic>.from(res);
          }
        } catch (_) {}
      }),
    );

    if (mounted) {
      setState(() {});
    }
  }

  void _openOrderDetail(String orderId) {
    setState(() {
      _focusedOrder = {'id': orderId};
    });
  }

  String _formatOrderState(String state) {
    return switch (state) {
      'AwaitingPayment' => 'Chờ thanh toán',
      'PaidAwaitingSellerConfirmation' ||
      'PendingSellerConfirmation' => 'Chờ người bán xác nhận',
      'Preparing' || 'Accepted' => 'Đang chuẩn bị sách',
      'InTransit' || 'Shipped' => 'Đang vận chuyển',
      'Delivered' || 'Inspection' => 'Đã giao · Kiểm định 72h',
      'ResolutionPending' => 'Đang xử lý vướng mắc',
      'SettlementPending' => 'Đang quyết toán',
      'Completed' => 'Hoàn tất',
      'Cancelled' || 'PaymentExpired' || 'Rejected' => 'Đã hủy',
      _ => state,
    };
  }

  String _getOrderGuidance(Map<String, dynamic> order, bool isBuyer) {
    final state = (order['state'] ?? '').toString();
    return switch (state) {
      'AwaitingPayment' =>
        isBuyer
            ? 'Kiểm tra tổng tiền và hạn trong chi tiết rồi thanh toán bằng ví.'
            : 'Đang chờ người mua thanh toán; mở chi tiết để xem thời hạn.',
      'PaidAwaitingSellerConfirmation' || 'PendingSellerConfirmation' =>
        isBuyer
            ? 'Đã thanh toán, đang chờ người bán xác nhận. Theo dõi hạn trong chi tiết.'
            : 'Người mua đã thanh toán. Mở chi tiết để xem và phản hồi đơn.',
      'Preparing' || 'Accepted' =>
        isBuyer
            ? 'Người bán đang chuẩn bị sách. Theo dõi tiến trình trong chi tiết.'
            : 'Chuẩn bị sách và làm theo bước được phép trong chi tiết đơn.',
      'InTransit' ||
      'Shipped' => 'Theo dõi thông tin vận chuyển trong chi tiết đơn.',
      'Delivered' || 'Inspection' => 'Đọc thời hạn kiểm tra và hướng dẫn xử lý nếu sách có vấn đề trong chi tiết.',
      'ResolutionPending' =>
        'Đang xử lý vướng mắc. Mở hồ sơ để xem yêu cầu bổ sung.',
      'SettlementPending' =>
        'Đang xử lý quyết toán. Chờ hệ thống đối soát hoàn tất.',
      'Completed' =>
        'Đã hoàn tất. Bạn có thể xem hoặc viết đánh giá nếu còn đủ điều kiện.',
      'Cancelled' ||
      'PaymentExpired' ||
      'Rejected' ||
      'ClosedAfterResolution' =>
        'Đơn đã kết thúc. Mở chi tiết để xem lý do và kết quả.',
      _ => 'Mở chi tiết để xem trạng thái hiện tại và thao tác được phép.',
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_focusedOrder != null) {
      return _buildOrderFocusView(_focusedOrder!);
    }

    final buyerCount = _orders
        .where((o) => (o['role'] ?? 'Buyer') == 'Buyer')
        .length;
    final sellerCount = _orders
        .where((o) => (o['role'] ?? 'Buyer') == 'Seller')
        .length;
    final awaitingCount = _orders
        .where((o) => o['state'] == 'AwaitingPayment')
        .length;

    // Filter items according to Role & Status
    final filtered = _orders.where((o) {
      final role = (o['role'] ?? 'Buyer').toString();
      if (_selectedRole != 'all' && role != _selectedRole) return false;

      final state = (o['state'] ?? '').toString();
      if (_selectedStatus == 'in_progress') {
        if (!_inProgressStates.contains(state)) return false;
      } else if (_selectedStatus == 'completed') {
        if (state != 'Completed') return false;
      } else if (_selectedStatus == 'cancelled') {
        if (state != 'Cancelled' &&
            state != 'PaymentExpired' &&
            state != 'Rejected') {
          return false;
        }
      }
      return true;
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
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.schedule_rounded,
                        size: 14,
                        color: StitchTokens.gold,
                      ),
                      const SizedBox(width: 4),
                      AppText(
                        '$awaitingCount chờ thanh toán',
                        kind: AppTextKind.label,
                        color: StitchTokens.gold,
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),

          // Bento Header Dashboard
          Container(
            padding: const EdgeInsets.all(AppSpace.lg),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF4A0E17), Color(0xFF2C080E)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: StitchTokens.gold.withValues(alpha: 0.3),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: StitchTokens.gold.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: StitchTokens.gold.withValues(alpha: 0.4),
                    ),
                  ),
                  child: const Icon(
                    Icons.receipt_long_rounded,
                    color: StitchTokens.gold,
                    size: 26,
                  ),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const AppText(
                        'Đơn hàng của tôi',
                        kind: AppTextKind.title,
                        color: Colors.white,
                      ),
                      const SizedBox(height: 2),
                      AppText(
                        'Đơn mua & bán trực tiếp qua Lật Lại Escrow',
                        kind: AppTextKind.small,
                        color: StitchTokens.goldLight.withValues(alpha: 0.9),
                      ),
                    ],
                  ),
                ),
                if (_orders.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: StitchTokens.gold.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: StitchTokens.gold.withValues(alpha: 0.5),
                      ),
                    ),
                    child: AppText(
                      '${_orders.length} Đơn',
                      kind: AppTextKind.label,
                      color: StitchTokens.goldLight,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),

          // Quick Navigation Bar matching Web
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                AppButton(
                  title: 'Đơn đấu giá của tôi',
                  secondary: true,
                  wine: true,
                  compact: true,
                  onPressed: () => context.push('/my-auctions'),
                ),
                const SizedBox(width: AppSpace.sm),
                AppButton(
                  title: 'Trao đổi sách',
                  secondary: true,
                  wine: true,
                  compact: true,
                  onPressed: () => context.push('/exchanges'),
                ),
                const SizedBox(width: AppSpace.sm),
                AppButton(
                  title: 'Hộp thư thương lượng',
                  secondary: true,
                  wine: true,
                  compact: true,
                  onPressed: () => context.push('/chat-inbox'),
                ),
                const SizedBox(width: AppSpace.sm),
                AppButton(
                  title: 'Cách mua sách',
                  secondary: true,
                  compact: true,
                  onPressed: () => context.push('/guide'),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),

          // Role Filter Tabs (Tất cả / Đơn mua / Đơn bán)
          Row(
            children: [
              Expanded(
                child: _buildRoleTabButton(
                  label: 'Tất cả',
                  count: _orders.length,
                  icon: Icons.list_alt_rounded,
                  selected: _selectedRole == 'all',
                  onTap: () => setState(() => _selectedRole = 'all'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildRoleTabButton(
                  label: 'Đơn mua',
                  count: buyerCount,
                  icon: Icons.shopping_bag_outlined,
                  selected: _selectedRole == 'Buyer',
                  onTap: () => setState(() => _selectedRole = 'Buyer'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildRoleTabButton(
                  label: 'Đơn bán',
                  count: sellerCount,
                  icon: Icons.storefront_outlined,
                  selected: _selectedRole == 'Seller',
                  onTap: () => setState(() => _selectedRole = 'Seller'),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),

          // Status Filter Chips matching Web
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children:
                  [
                    (id: 'all', label: 'Tất cả trạng thái'),
                    (id: 'in_progress', label: 'Đang xử lý'),
                    (id: 'completed', label: 'Đã hoàn tất'),
                    (id: 'cancelled', label: 'Đã hủy / hết hạn'),
                  ].map((chip) {
                    final isSelected = _selectedStatus == chip.id;
                    return Padding(
                      padding: const EdgeInsets.only(right: AppSpace.sm),
                      child: AppChip(
                        title: chip.label,
                        wine: true,
                        selected: isSelected,
                        onPressed: () =>
                            setState(() => _selectedStatus = chip.id),
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
              message: 'Đơn mua ngay hoặc đơn được tạo từ phòng thương lượng sẽ hiển thị tại đây.',
              actionLabel: 'Khám phá kệ sách',
              onAction: () => context.go('/search'),
            )
          else
            ...filtered.map((order) => _buildOrderCard(order)),
        ],
      ),
    );
  }

  Widget _buildRoleTabButton({
    required String label,
    required int count,
    required IconData icon,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
        decoration: BoxDecoration(
          color: selected ? StitchTokens.wine : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? StitchTokens.wine : StitchTokens.cardBorder,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 15,
              color: selected ? StitchTokens.gold : StitchTokens.wine,
            ),
            const SizedBox(width: 4),
            Flexible(
              child: AppText(
                label,
                kind: AppTextKind.label,
                color: selected ? Colors.white : StitchTokens.darkWood,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: selected
                    ? StitchTokens.gold.withValues(alpha: 0.3)
                    : StitchTokens.parchment,
                borderRadius: BorderRadius.circular(10),
              ),
              child: AppText(
                '$count',
                kind: AppTextKind.label,
                color: selected ? StitchTokens.goldLight : StitchTokens.wine,
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Renders a full-featured Order Card matching web `DirectOrders.module.css`
  Widget _buildOrderCard(Map<String, dynamic> order) {
    final id = (order['id'] ?? '').toString();
    final shortId = id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
    final role = (order['role'] ?? 'Buyer').toString();
    final isBuyer = role == 'Buyer';
    final state = (order['state'] ?? 'AwaitingPayment').toString();
    final isCompleted = state == 'Completed';
    final isCancelled =
        state == 'Cancelled' ||
        state == 'PaymentExpired' ||
        state == 'Rejected';

    final cached = _orderDetailCache[id];
    final item = cached?['item'] is Map
        ? Map<String, dynamic>.from(cached!['item'] as Map)
        : (order['item'] is Map
              ? Map<String, dynamic>.from(order['item'] as Map)
              : const <String, dynamic>{});
    final amounts = cached?['amounts'] is Map
        ? Map<String, dynamic>.from(cached!['amounts'] as Map)
        : (order['amounts'] is Map
              ? Map<String, dynamic>.from(order['amounts'] as Map)
              : const <String, dynamic>{});
    final metadata = item['metadata'] is Map
        ? Map<String, dynamic>.from(item['metadata'] as Map)
        : const <String, dynamic>{};
    final title =
        (metadata['title'] ??
                item['title'] ??
                order['title'] ??
                'Ấn bản sách Lật Lại')
            .toString();
    final total =
        (amounts['buyerTotal'] ??
                order['buyerTotal'] ??
                order['totalAmount'] ??
                amounts['bookPrice'] ??
                item['bookPrice'] ??
                0)
            as num;

    final conversationId = order['conversationId']?.toString();
    final guidance = _getOrderGuidance(order, isBuyer);

    // Status Badge Tone
    final statusBg = isCompleted
        ? AppColors.successSurface
        : isCancelled
        ? const Color(0xFFFDE8E8)
        : StitchTokens.roseParchment;
    final statusColor = isCompleted
        ? AppColors.forest
        : isCancelled
        ? const Color(0xFFC53030)
        : StitchTokens.wine;
    final statusIcon = isCompleted
        ? Icons.check_circle_outline_rounded
        : isCancelled
        ? Icons.cancel_outlined
        : Icons.schedule_rounded;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: StitchTokens.cardBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Row: Role Badge + Order ID + Date + Status Badge
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: isBuyer
                              ? StitchTokens.roseParchment
                              : AppColors.successSurface,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              isBuyer
                                  ? Icons.shopping_bag_outlined
                                  : Icons.storefront_outlined,
                              size: 13,
                              color: isBuyer
                                  ? StitchTokens.wine
                                  : AppColors.forest,
                            ),
                            const SizedBox(width: 4),
                            AppText(
                              isBuyer ? 'Bạn mua' : 'Bạn bán',
                              kind: AppTextKind.label,
                              color: isBuyer
                                  ? StitchTokens.wine
                                  : AppColors.forest,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      AppText(
                        '#$shortId',
                        kind: AppTextKind.bold,
                        color: StitchTokens.darkWood,
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: statusBg,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(statusIcon, size: 13, color: statusColor),
                        const SizedBox(width: 4),
                        AppText(
                          _formatOrderState(state),
                          kind: AppTextKind.label,
                          color: statusColor,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const Divider(
              height: 1,
              thickness: 0.6,
              color: StitchTokens.cardBorder,
            ),

            // Middle: Book Identity + Guidance Text
            Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Book Thumbnail
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      width: 52,
                      height: 70,
                      color: StitchTokens.parchment,
                      child: BookCoverPhoto(
                        item: item.isNotEmpty
                            ? item
                            : {'id': order['listingId'] ?? '', 'title': title},
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppText(
                          title,
                          kind: AppTextKind.bold,
                          color: StitchTokens.darkWood,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        AppText(
                          guidance,
                          kind: AppTextKind.small,
                          color: AppColors.ink,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            AppText(
                              _formatDateVi(order['createdAt']),
                              kind: AppTextKind.small,
                              color: AppColors.muted,
                            ),
                            if (total > 0)
                              AppText(
                                formatVnd(total),
                                kind: AppTextKind.bold,
                                color: StitchTokens.wine,
                                style: const TextStyle(fontSize: 15),
                              )
                            else if (cached == null)
                              const AppText(
                                '…',
                                kind: AppTextKind.small,
                                color: AppColors.muted,
                              )
                            else
                              const SizedBox.shrink(),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Bottom Actions Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              color: StitchTokens.warmIvory,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (conversationId != null && conversationId.isNotEmpty)
                    InkWell(
                      onTap: () =>
                          context.push('/conversation?id=$conversationId'),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.forum_outlined,
                            size: 16,
                            color: StitchTokens.wine,
                          ),
                          const SizedBox(width: 4),
                          AppText(
                            isBuyer
                                ? 'Hội thoại với người bán'
                                : 'Hội thoại với người mua',
                            kind: AppTextKind.small,
                            color: StitchTokens.wine,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    )
                  else
                    const SizedBox.shrink(),
                  Wrap(
                    spacing: 8,
                    children: [
                      if (state == 'Completed')
                        AppButton(
                          title: 'Đánh giá',
                          secondary: true,
                          wine: true,
                          compact: true,
                          onPressed: () =>
                              context.push('/reviews?type=DirectOrder&id=$id'),
                        ),
                      AppButton(
                        title: state == 'AwaitingPayment' && isBuyer
                            ? 'Thanh toán ngay'
                            : 'Xem chi tiết',
                        wine: true,
                        compact: true,
                        onPressed: () => _openOrderDetail(id),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Synchronized 5-Step Order Focus View matching web `OrderDetails.tsx`
  Widget _buildOrderFocusView(Map<String, dynamic> order) {
    final id = (order['id'] ?? '').toString();
    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'CHI TIẾT ĐƠN HÀNG'),
      child: OrderDetailsDossier(
        orderId: id,
        onBack: () => setState(() => _focusedOrder = null),
        onOrderChanged: _loadOrders,
      ),
    );
  }
}
