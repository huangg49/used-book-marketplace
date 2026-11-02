import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

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
  String _selectedStatus = 'all'; // 'all' | 'in_progress' | 'completed' | 'cancelled'
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;
  List<Map<String, dynamic>> _orders = const [];
  Map<String, dynamic>? _focusedOrder;
  Map<String, dynamic>? _orderShipment;
  List<Map<String, dynamic>> _packagingEvidences = const [];
  final TextEditingController _trackingCtrl = TextEditingController();
  final TextEditingController _complaintCtrl = TextEditingController();

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

  @override
  void dispose() {
    _trackingCtrl.dispose();
    _complaintCtrl.dispose();
    super.dispose();
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
      final results = await Future.wait<dynamic>([
        client.request('/me/orders/$orderId'),
        client.request('/me/orders/$orderId/shipment').catchError((_) => null),
        client
            .request('/me/orders/$orderId/packaging-evidence')
            .catchError((_) => null),
      ]);
      if (!mounted) return;
      final orderRes = results[0];
      final shipmentRes = results[1];
      final evidenceRes = results[2];

      if (orderRes is Map) {
        final evidences = (evidenceRes is Map && evidenceRes['items'] is List)
            ? (evidenceRes['items'] as List)
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : const <Map<String, dynamic>>[];

        setState(() {
          _focusedOrder = Map<String, dynamic>.from(orderRes);
          _orderShipment = shipmentRes is Map
              ? Map<String, dynamic>.from(shipmentRes)
              : null;
          _packagingEvidences = evidences;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = presentErrorMessage(e));
    }
  }

  Future<void> _performOrderAction(
    String orderId,
    String action, [
    Map<String, dynamic>? extraBody,
  ]) async {
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
        body: {
          'expectedVersion': version,
          ...?extraBody,
        },
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

  /// Confirm receipt of order (Escrow release to seller)
  Future<void> _confirmReceipt(String orderId) async {
    await _performOrderAction(orderId, 'confirm-receipt');
  }

  /// Open dialog to report non-receipt or issue (72h inspection window)
  void _showNonReceiptDialog(String orderId) {
    _complaintCtrl.text =
        'Tôi chưa nhận được sách hoặc sách nhận được bị hư hại nghiêm trọng so với mô tả.';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
        ),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const AppText(
                  'Báo cáo sự cố / Chưa nhận sách',
                  kind: AppTextKind.bold,
                  style: TextStyle(fontSize: 16),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const AppText(
              'Vui lòng mô tả chi tiết vấn đề (tối thiểu 20 ký tự). Tiền ký quỹ sẽ được bảo lưu an toàn để ban quản trị giải quyết tranh chấp.',
              kind: AppTextKind.small,
              color: AppColors.muted,
            ),
            const SizedBox(height: 14),
            AppTextField(
              controller: _complaintCtrl,
              multiline: true,
              placeholder: 'Nhập nội dung báo cáo sự cố…',
            ),
            const SizedBox(height: 16),
            AppButton(
              title: 'Gửi báo cáo sự cố',
              wine: true,
              busy: _busy,
              onPressed: () {
                final desc = _complaintCtrl.text.trim();
                if (desc.length < 20) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Vui lòng nhập tối thiểu 20 ký tự.'),
                    ),
                  );
                  return;
                }
                Navigator.pop(ctx);
                _performOrderAction(
                  orderId,
                  'non-receipt',
                  {'description': desc},
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Open dialog to cancel paid order before seller acceptance
  void _showCancelPaidDialog(String orderId) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const AppText('Hủy đơn và hoàn tiền', kind: AppTextKind.bold),
        content: const AppText(
          'Bạn có chắc chắn muốn hủy đơn hàng này? Toàn bộ số tiền đã thanh toán sẽ được hoàn lại 100% vào Ví Lật Lại của bạn.',
          kind: AppTextKind.body,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Quay lại'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: StitchTokens.wine,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              _performOrderAction(
                orderId,
                'cancel-paid',
                {'reason': 'Người mua hủy đơn trước khi người bán xác nhận'},
              );
            },
            child: const Text('Xác nhận hủy & hoàn tiền'),
          ),
        ],
      ),
    );
  }

  /// Register Shipment tracking for seller in Preparing state
  Future<void> _registerShipment(String orderId) async {
    final version = (_focusedOrder?['version'] is num)
        ? (_focusedOrder!['version'] as num).toInt()
        : 1;
    String tracking = _trackingCtrl.text.trim();
    if (tracking.isEmpty) {
      tracking =
          'LL-${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}VN';
      _trackingCtrl.text = tracking;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final evidenceIds = _packagingEvidences
          .where((e) => e['status'] == 'Ready')
          .take(8)
          .map((e) => e['id']?.toString() ?? '')
          .where((id) => id.isNotEmpty)
          .toList();

      await client.request(
        '/orders/$orderId/shipment',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('order-shipment'),
        body: {
          'expectedOrderVersion': version,
          'carrier': 'LatLaiSimulator',
          'trackingCode': tracking,
          'packagingEvidenceIds': evidenceIds,
        },
      );
      await _openOrderDetail(orderId);
      await _loadOrders();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã đăng ký vận đơn thành công: $tracking';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  /// Upload Packaging photo evidence for seller
  Future<void> _uploadPackagingEvidence(String orderId) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked == null) return;

    final bytes = await picked.readAsBytes();
    if (bytes.isEmpty) return;

    final hash = sha256.convert(bytes).toString();
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
      final created = await client.request(
        '/orders/$orderId/packaging-evidence',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('pack-evidence'),
        body: {
          'expectedVersion': version,
          'mimeType': 'image/jpeg',
          'byteSize': bytes.length,
          'sha256': hash,
        },
      );
      final map =
          created is Map ? Map<String, dynamic>.from(created) : const {};
      final evidenceId = (map['entityId'] ?? map['id'] ?? '').toString();
      if (evidenceId.isNotEmpty) {
        await client.request(
          '/orders/$orderId/packaging-evidence/$evidenceId/content',
          method: 'PUT',
          idempotencyKey: generateIdempotencyKey('pack-content'),
          body: bytes,
        );
      }
      await _openOrderDetail(orderId);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã lưu ảnh bằng chứng đóng gói thành công.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  /// Open or link conversation from order (ADR0045)
  Future<void> _openOrLinkConversation(
    String orderId,
    String? existingConvId,
  ) async {
    if (existingConvId != null && existingConvId.isNotEmpty) {
      context.push('/conversation?id=$existingConvId');
      return;
    }
    setState(() => _busy = true);
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/orders/$orderId/conversation',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('open-order-conv'),
        body: {},
      );
      if (!mounted) return;
      setState(() => _busy = false);
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      final convId = (map['entityId'] ?? map['id'] ?? '').toString();
      if (convId.isNotEmpty) {
        context.push('/conversation?id=$convId');
      } else {
        context.push('/chat-inbox');
      }
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
      'AwaitingPayment' => isBuyer
          ? 'Kiểm tra tổng tiền và hạn trong chi tiết rồi thanh toán bằng ví.'
          : 'Đang chờ người mua thanh toán; mở chi tiết để xem thời hạn.',
      'PaidAwaitingSellerConfirmation' ||
      'PendingSellerConfirmation' => isBuyer
          ? 'Đã thanh toán, đang chờ người bán xác nhận. Theo dõi hạn trong chi tiết.'
          : 'Người mua đã thanh toán. Mở chi tiết để xem và phản hồi đơn.',
      'Preparing' || 'Accepted' => isBuyer
          ? 'Người bán đang chuẩn bị sách. Theo dõi tiến trình trong chi tiết.'
          : 'Chuẩn bị sách và làm theo bước được phép trong chi tiết đơn.',
      'InTransit' || 'Shipped' =>
          'Theo dõi thông tin vận chuyển trong chi tiết đơn.',
      'Delivered' || 'Inspection' =>
          'Đọc thời hạn kiểm tra và hướng dẫn xử lý nếu sách có vấn đề trong chi tiết.',
      'ResolutionPending' =>
          'Đang xử lý vướng mắc. Mở hồ sơ để xem yêu cầu bổ sung.',
      'SettlementPending' =>
          'Đang xử lý quyết toán. Chờ hệ thống đối soát hoàn tất.',
      'Completed' =>
          'Đã hoàn tất. Bạn có thể xem hoặc viết đánh giá nếu còn đủ điều kiện.',
      'Cancelled' || 'PaymentExpired' || 'Rejected' || 'ClosedAfterResolution' =>
          'Đơn đã kết thúc. Mở chi tiết để xem lý do và kết quả.',
      _ => 'Mở chi tiết để xem trạng thái hiện tại và thao tác được phép.',
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_focusedOrder != null) {
      return _buildOrderFocusView(_focusedOrder!);
    }

    final buyerCount =
        _orders.where((o) => (o['role'] ?? 'Buyer') == 'Buyer').length;
    final sellerCount =
        _orders.where((o) => (o['role'] ?? 'Buyer') == 'Seller').length;
    final awaitingCount =
        _orders.where((o) => o['state'] == 'AwaitingPayment').length;

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
              children: [
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
                    onPressed: () => setState(() => _selectedStatus = chip.id),
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
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
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
    final isCancelled = state == 'Cancelled' ||
        state == 'PaymentExpired' ||
        state == 'Rejected';

    final item = order['item'] is Map
        ? Map<String, dynamic>.from(order['item'] as Map)
        : const <String, dynamic>{};
    final title = (item['title'] ?? order['title'] ?? 'Ấn bản sách Lật Lại')
        .toString();
    final total = (order['buyerTotal'] ??
        order['totalAmount'] ??
        item['bookPrice'] ??
        0) as num;

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

            const Divider(height: 1, thickness: 0.6, color: StitchTokens.cardBorder),

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
                            AppText(
                              formatVnd(total),
                              kind: AppTextKind.bold,
                              color: StitchTokens.wine,
                              style: const TextStyle(fontSize: 15),
                            ),
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
                      onTap: () => context.push('/conversation?id=$conversationId'),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.forum_outlined,
                            size: 16,
                            color: StitchTokens.wine,
                          ),
                          const SizedBox(width: 4),
                          AppText(
                            isBuyer ? 'Hội thoại với người bán' : 'Hội thoại với người mua',
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
                          onPressed: () => context.push(
                            '/reviews?type=DirectOrder&id=$id',
                          ),
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
    final shortId = id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
    final state = (order['state'] ?? 'AwaitingPayment').toString();
    final role = (order['role'] ?? 'Buyer').toString();
    final isBuyer = role == 'Buyer';
    final isSeller = role == 'Seller';
    final conversationId = order['conversationId']?.toString();

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
      'PaidAwaitingSellerConfirmation' ||
      'PendingSellerConfirmation' ||
      'Preparing' ||
      'Accepted' => 2,
      'InTransit' ||
      'Shipped' ||
      'Delivered' ||
      'Inspection' => 3,
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
                // Header Bar
                Container(
                  padding: const EdgeInsets.all(16),
                  color: StitchTokens.wine,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const AppText(
                              'Thủ tục đơn hàng',
                              kind: AppTextKind.bold,
                              color: Colors.white,
                            ),
                            AppText(
                              'Mã đơn: #$shortId · ${isBuyer ? "Bạn mua" : "Bạn bán"}',
                              kind: AppTextKind.small,
                              color: StitchTokens.goldLight,
                            ),
                          ],
                        ),
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
                      // 5-Step Stepper with connecting line
                      _buildProgressStepper(steps, activeStepIndex),
                      const SizedBox(height: 16),

                      // Escrow protection banner
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: StitchTokens.roseParchment,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: StitchTokens.wine.withValues(alpha: 0.2),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.verified_user_outlined,
                              color: StitchTokens.wine,
                              size: 24,
                            ),
                            const SizedBox(width: 10),
                            const Expanded(
                              child: AppText(
                                'Bảo lưu Lật Lại Escrow: Tiền được giữ an toàn trên hệ thống. Người bán chỉ nhận thanh toán sau khi người mua nhận sách và hết hạn kiểm định 72h.',
                                kind: AppTextKind.small,
                                color: StitchTokens.wineDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 24),

                      // Book details row
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              width: 60,
                              height: 82,
                              color: StitchTokens.parchment,
                              child: BookCoverPhoto(
                                item: item.isNotEmpty
                                    ? item
                                    : {'id': order['listingId'] ?? '', 'title': item['title'] ?? ''},
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AppText(
                                  (item['title'] ?? 'Ấn bản sách trong đơn').toString(),
                                  kind: AppTextKind.card,
                                  color: StitchTokens.darkWood,
                                ),
                                const SizedBox(height: 4),
                                AppText(
                                  _getOrderGuidance(order, isBuyer),
                                  kind: AppTextKind.small,
                                  color: AppColors.muted,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Pricing breakdown
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: StitchTokens.warmIvory,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: StitchTokens.cardBorder),
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const AppText('Giá sách:'),
                                AppText(formatVnd(bookPrice), kind: AppTextKind.bold),
                              ],
                            ),
                            const SizedBox(height: 6),
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
                            const Divider(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Flexible(
                                  child: AppText(
                                    'Tổng người mua thanh toán:',
                                    kind: AppTextKind.bold,
                                  ),
                                ),
                                AppText(
                                  formatVnd(buyerTotal),
                                  kind: AppTextKind.bookPrice,
                                  color: StitchTokens.wine,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Delivery & Shipping Addresses (Matching Web OrderDetails.tsx)
                      if (order['ownAddress'] is Map ||
                          order['shippingAddress'] is Map) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: StitchTokens.warmIvory,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.location_on_outlined,
                                    size: 16,
                                    color: StitchTokens.wine,
                                  ),
                                  const SizedBox(width: 6),
                                  AppText(
                                    isBuyer
                                        ? 'Địa chỉ nhận sách của bạn'
                                        : 'Nơi gửi hàng của bạn',
                                    kind: AppTextKind.bold,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              if (order['ownAddress'] is Map) ...[
                                AppText(
                                  '${order['ownAddress']['recipientName'] ?? ''} · ${order['ownAddress']['phone'] ?? ''}',
                                  kind: AppTextKind.bold,
                                  color: StitchTokens.darkWood,
                                ),
                                const SizedBox(height: 2),
                                AppText(
                                  (order['ownAddress']['detail'] ?? '')
                                      .toString(),
                                  kind: AppTextKind.small,
                                  color: AppColors.muted,
                                ),
                              ],
                              if (order['shippingAddress'] is Map && !isBuyer) ...[
                                const Divider(height: 14),
                                Row(
                                  children: const [
                                    Icon(
                                      Icons.local_shipping_outlined,
                                      size: 15,
                                      color: StitchTokens.wine,
                                    ),
                                    SizedBox(width: 6),
                                    AppText(
                                      'Địa chỉ giao hàng cho người mua:',
                                      kind: AppTextKind.bold,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                AppText(
                                  '${order['shippingAddress']['recipientName'] ?? ''} · ${order['shippingAddress']['phone'] ?? ''}',
                                  kind: AppTextKind.bold,
                                ),
                                const SizedBox(height: 2),
                                AppText(
                                  (order['shippingAddress']['detail'] ?? '')
                                      .toString(),
                                  kind: AppTextKind.small,
                                  color: AppColors.muted,
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // ==========================================
                      // DYNAMIC LIFECYCLE PROCEDURES ACCORDING TO STATE
                      // ==========================================

                      // STAGE 1: AwaitingPayment
                      if (state == 'AwaitingPayment') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFFBEB),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFFDE68A)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.access_time_rounded,
                                    color: Color(0xFFD97706),
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  const Expanded(
                                    child: AppText(
                                      'Chờ thanh toán đơn hàng',
                                      kind: AppTextKind.bold,
                                      color: Color(0xFF92400E),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              AppText(
                                isBuyer
                                    ? 'Vui lòng thanh toán trước ${_formatDateVi(order['paymentDeadline'])}. Quá hạn, đơn hàng sẽ tự động hủy và sách được mở lại cho độc giả khác.'
                                    : 'Người mua đang tiến hành chuyển tiền qua Quỹ ký quỹ. Sách đang được giữ tạm thời cho đơn này đến hạn chót.',
                                kind: AppTextKind.small,
                                color: const Color(0xFF78350F),
                              ),
                              if (isBuyer) ...[
                                const SizedBox(height: 12),
                                AppButton(
                                  title:
                                      'Thanh toán ngay (${formatVnd(buyerTotal)})',
                                  wine: true,
                                  busy: _busy,
                                  icon: Icons.credit_card_rounded,
                                  onPressed: () =>
                                      _performOrderAction(id, 'pay'),
                                ),
                                const SizedBox(height: 8),
                                AppButton(
                                  title: 'Hủy đơn chưa thanh toán',
                                  secondary: true,
                                  busy: _busy,
                                  onPressed: () =>
                                      _performOrderAction(id, 'cancel'),
                                ),
                                const SizedBox(height: 6),
                                InkWell(
                                  onTap: () => context.push('/wallet'),
                                  child: const Center(
                                    child: AppText(
                                      'Số dư ví không đủ? Mở Ví Lật Lại để nạp tiền →',
                                      kind: AppTextKind.small,
                                      color: StitchTokens.wine,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // STAGE 2: PendingSellerConfirmation
                      if (state == 'PendingSellerConfirmation' ||
                          state == 'PaidAwaitingSellerConfirmation') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEFF6FF),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFBFDBFE)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.pending_actions_rounded,
                                    color: Color(0xFF2563EB),
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: AppText(
                                      isSeller
                                          ? 'Người mua đã thanh toán · Cần bạn xác nhận'
                                          : 'Đã thanh toán · Chờ người bán xác nhận',
                                      kind: AppTextKind.bold,
                                      color: const Color(0xFF1E40AF),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              AppText(
                                isSeller
                                    ? 'Khoản tiền ${formatVnd(buyerTotal)} đã được giữ an toàn tại Quỹ ký quỹ Lật Lại. Vui lòng xác nhận nhận đơn để tiến hành đóng gói sách.'
                                    : 'Khoản tiền của bạn đang được bảo vệ an toàn trong quỹ bảo chứng. Đang chờ người bán xác nhận để đóng gói gửi sách.',
                                kind: AppTextKind.small,
                                color: const Color(0xFF1E3A8A),
                              ),
                              const SizedBox(height: 12),
                              if (isSeller) ...[
                                AppButton(
                                  title: 'Xác nhận bán',
                                  wine: true,
                                  busy: _busy,
                                  icon: Icons.check_circle_outline_rounded,
                                  onPressed: () =>
                                      _performOrderAction(id, 'accept'),
                                ),
                                const SizedBox(height: 8),
                                AppButton(
                                  title: 'Từ chối đơn',
                                  secondary: true,
                                  busy: _busy,
                                  onPressed: () =>
                                      _performOrderAction(id, 'reject'),
                                ),
                              ] else ...[
                                AppButton(
                                  title: 'Hủy đơn và hoàn tiền 100%',
                                  secondary: true,
                                  busy: _busy,
                                  onPressed: () => _showCancelPaidDialog(id),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // STAGE 3: Preparing (Seller packaging & shipment registration)
                      if (state == 'Preparing' || state == 'Accepted') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFDFBF7),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.inventory_2_outlined,
                                    color: StitchTokens.wine,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: AppText(
                                      isSeller
                                          ? 'Chuẩn bị đóng gói & Bàn giao shipper'
                                          : 'Người bán đang chuẩn bị sách',
                                      kind: AppTextKind.bold,
                                      color: StitchTokens.darkWood,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              AppText(
                                isSeller
                                    ? 'Chụp ảnh gói sách trước khi gửi, sau đó đăng ký mã vận đơn để bàn giao cho shipper trước thời hạn.'
                                    : 'Đơn hàng đã được xác nhận. Người bán đang tiến hành đóng gói sách theo đúng quy chuẩn kiểm định và sẽ bàn giao cho shipper.',
                                kind: AppTextKind.small,
                                color: AppColors.ink,
                              ),
                              if (order['preparation']?['pickupDeadline'] != null ||
                                  order['pickupDeadline'] != null) ...[
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: StitchTokens.roseParchment,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.alarm_rounded,
                                        size: 14,
                                        color: StitchTokens.wine,
                                      ),
                                      const SizedBox(width: 4),
                                      AppText(
                                        'Hạn bàn giao shipper: ${_formatDateVi(order['preparation']?['pickupDeadline'] ?? order['pickupDeadline'])}',
                                        kind: AppTextKind.small,
                                        color: StitchTokens.wine,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                              if (isSeller) ...[
                                const Divider(height: 20),
                                // Packaging Evidence
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    AppText(
                                      'Ảnh đóng gói đã lưu: ${_packagingEvidences.where((e) => e['status'] == 'Ready').length}/8',
                                      kind: AppTextKind.label,
                                    ),
                                    OutlinedButton.icon(
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: StitchTokens.wine,
                                        side: const BorderSide(
                                          color: StitchTokens.wine,
                                        ),
                                      ),
                                      onPressed: _busy
                                          ? null
                                          : () =>
                                              _uploadPackagingEvidence(id),
                                      icon: const Icon(Icons.camera_alt_outlined, size: 16),
                                      label: const Text('Thêm ảnh gói hàng'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                // Shipment registration form
                                const AppText(
                                  'Mã vận đơn mô phỏng (LatLai Delivery):',
                                  kind: AppTextKind.label,
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    Expanded(
                                      child: AppTextField(
                                        controller: _trackingCtrl,
                                        placeholder: 'Ví dụ: LL-12345678',
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    AppButton(
                                      title: 'Đăng ký vận đơn',
                                      wine: true,
                                      compact: true,
                                      busy: _busy,
                                      onPressed: () => _registerShipment(id),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // STAGE 4: InTransit / Shipped
                      if (state == 'InTransit' || state == 'Shipped') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0FDF4),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF86EFAC)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.local_shipping_rounded,
                                    color: Color(0xFF16A34A),
                                    size: 22,
                                  ),
                                  const SizedBox(width: 8),
                                  const Expanded(
                                    child: AppText(
                                      'Kiện hàng đang được giao',
                                      kind: AppTextKind.bold,
                                      color: Color(0xFF166534),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              AppText(
                                'Đơn vị vận chuyển LatLai Simulator đã tiếp nhận sách và đang trên đường giao tới người nhận.',
                                kind: AppTextKind.small,
                                color: const Color(0xFF15803D),
                              ),
                              if (_orderShipment != null) ...[
                                const SizedBox(height: 10),
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: const Color(0xFFBBF7D0),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      const AppText(
                                        'Mã vận đơn:',
                                        kind: AppTextKind.small,
                                      ),
                                      AppText(
                                        (_orderShipment!['trackingCode'] ??
                                                'LL-12345678')
                                            .toString(),
                                        kind: AppTextKind.bold,
                                        color: StitchTokens.wine,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // STAGE 5: Delivered / Inspection (72h inspection window)
                      if (state == 'Delivered' ||
                          state == 'Inspection' ||
                          state == 'ResolutionPending') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFFCD34D)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.verified_user_rounded,
                                    color: Color(0xFFD97706),
                                    size: 22,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: AppText(
                                      state == 'ResolutionPending'
                                          ? 'Đang giải quyết tranh chấp / vướng mắc'
                                          : 'Đã giao hàng · Thời hạn kiểm định 72h',
                                      kind: AppTextKind.bold,
                                      color: const Color(0xFF92400E),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              AppText(
                                isBuyer
                                    ? 'Bạn có 72 giờ để kiểm tra tình trạng sách thực tế. Nếu hài lòng, hãy bấm xác nhận bên dưới để hệ thống giải ngân tiền cho người bán.'
                                    : 'Kiện hàng đã giao tới người mua. Người mua đang kiểm định sách trong vòng 72 giờ trước khi hệ thống đối soát giải ngân.',
                                kind: AppTextKind.small,
                                color: const Color(0xFF78350F),
                              ),
                              if (isBuyer && state != 'ResolutionPending') ...[
                                const SizedBox(height: 12),
                                AppButton(
                                  title: 'Đã nhận được sách & Xác nhận hoàn tất',
                                  wine: true,
                                  busy: _busy,
                                  icon: Icons.check_circle_rounded,
                                  onPressed: () => _confirmReceipt(id),
                                ),
                                const SizedBox(height: 8),
                                AppButton(
                                  title: 'Báo cáo sự cố / Chưa nhận sách',
                                  secondary: true,
                                  busy: _busy,
                                  icon: Icons.report_problem_outlined,
                                  onPressed: () => _showNonReceiptDialog(id),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // STAGE 6: Completed
                      if (state == 'Completed') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0FDF4),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFF86EFAC)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.check_circle_rounded,
                                    color: Color(0xFF16A34A),
                                    size: 24,
                                  ),
                                  const SizedBox(width: 8),
                                  const Expanded(
                                    child: AppText(
                                      'Đơn hàng đã hoàn tất thành công',
                                      kind: AppTextKind.bold,
                                      color: Color(0xFF166534),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              const AppText(
                                'Giao dịch đã kết thúc tốt đẹp! Khoản tiền thanh toán đã được giải ngân an toàn vào Ví Lật Lại của người bán.',
                                kind: AppTextKind.small,
                                color: Color(0xFF15803D),
                              ),
                              const SizedBox(height: 12),
                              AppButton(
                                title: 'Xem hoặc viết đánh giá giao dịch',
                                wine: true,
                                icon: Icons.star_rate_rounded,
                                onPressed: () => context.push(
                                  '/reviews?type=DirectOrder&id=$id',
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // STAGE 7: Cancelled / PaymentExpired / Rejected
                      if (state == 'Cancelled' ||
                          state == 'PaymentExpired' ||
                          state == 'Rejected' ||
                          state == 'SettlementPending') ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF2F2),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFFECACA)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.cancel_outlined,
                                    color: Color(0xFFDC2626),
                                    size: 22,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: AppText(
                                      state == 'PaymentExpired'
                                          ? 'Đơn hàng tự động hủy do quá hạn thanh toán'
                                          : state == 'SettlementPending'
                                              ? 'Đang xử lý hoàn tiền về ví'
                                              : 'Đơn hàng đã kết thúc / Hủy bỏ',
                                      kind: AppTextKind.bold,
                                      color: const Color(0xFF991B1B),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              const AppText(
                                'Đơn hàng đã được kết thúc. Nếu bạn đã thanh toán, khoản tiền ký quỹ đã được hoàn lại đầy đủ vào số dư ví của bạn.',
                                kind: AppTextKind.small,
                                color: Color(0xFF7F1D1D),
                              ),
                              const SizedBox(height: 12),
                              AppButton(
                                title: 'Kiểm tra số dư Ví Lật Lại',
                                wine: true,
                                icon: Icons.account_balance_wallet_outlined,
                                onPressed: () => context.push('/wallet'),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // ==========================================
                      // BIDIRECTIONAL CONVERSATION SHORTCUT (ADR0045)
                      // ==========================================
                      AppButton(
                        title: conversationId != null &&
                                conversationId.isNotEmpty
                            ? 'Mở hội thoại thương lượng với đối tác'
                            : 'Nhắn tin trao đổi về đơn hàng này',
                        secondary: true,
                        wine: true,
                        icon: Icons.chat_bubble_outline_rounded,
                        busy: _busy,
                        onPressed: () => _openOrLinkConversation(
                          id,
                          conversationId,
                        ),
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

  Widget _buildProgressStepper(List<String> steps, int activeIndex) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      decoration: BoxDecoration(
        color: StitchTokens.warmIvory,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: StitchTokens.cardBorder),
      ),
      child: Column(
        children: [
          Row(
            children: List.generate(steps.length * 2 - 1, (index) {
              if (index.isOdd) {
                final stepBefore = index ~/ 2;
                final isDone = stepBefore < activeIndex;
                return Expanded(
                  child: Container(
                    height: 3,
                    color: isDone
                        ? const Color(0xFF1F7A3E)
                        : StitchTokens.cardBorder,
                  ),
                );
              }
              final stepIndex = index ~/ 2;
              final isDone = stepIndex < activeIndex;
              final isCurrent = stepIndex == activeIndex;
              return Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isDone
                      ? const Color(0xFF1F7A3E)
                      : isCurrent
                          ? StitchTokens.wine
                          : StitchTokens.parchment,
                  border: Border.all(
                    color: isCurrent ? StitchTokens.gold : Colors.transparent,
                    width: 1.5,
                  ),
                ),
                child: Center(
                  child: isDone
                      ? const Icon(
                          Icons.check_rounded,
                          size: 14,
                          color: Colors.white,
                        )
                      : AppText(
                          '${stepIndex + 1}',
                          kind: AppTextKind.label,
                          color: isCurrent
                              ? StitchTokens.goldLight
                              : AppColors.muted,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(steps.length, (i) {
              final isCurrent = i == activeIndex;
              final isDone = i < activeIndex;
              return SizedBox(
                width: 54,
                child: AppText(
                  steps[i],
                  kind: AppTextKind.small,
                  textAlign: TextAlign.center,
                  color: isCurrent
                      ? StitchTokens.wine
                      : isDone
                          ? AppColors.forest
                          : AppColors.muted,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}
