import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

String _formatOrderDateVi(dynamic dateVal) {
  if (dateVal == null) return '';
  final dt = dateVal is DateTime ? dateVal : DateTime.tryParse(dateVal.toString());
  if (dt == null) return dateVal.toString();
  final dd = dt.day.toString().padLeft(2, '0');
  final mm = dt.month.toString().padLeft(2, '0');
  final yyyy = dt.year.toString();
  final hh = dt.hour.toString().padLeft(2, '0');
  final min = dt.minute.toString().padLeft(2, '0');
  return '$hh:$min · $dd/$mm/$yyyy';
}

String _formatOrderStateLabel(String state) {
  switch (state) {
    case 'AwaitingPayment':
      return 'Chờ thanh toán';
    case 'PaidAwaitingSellerConfirmation':
    case 'PendingSellerConfirmation':
      return 'Chờ người bán xác nhận';
    case 'Preparing':
    case 'Accepted':
      return 'Đang chuẩn bị sách';
    case 'InTransit':
    case 'Shipped':
      return 'Đang giao hàng';
    case 'Delivered':
    case 'Inspection':
      return 'Đã giao · Chờ kiểm định 72h';
    case 'Completed':
      return 'Đã hoàn tất';
    case 'Cancelled':
      return 'Đã hủy';
    case 'PaymentExpired':
      return 'Hết hạn thanh toán';
    case 'Rejected':
      return 'Bị từ chối';
    case 'ResolutionPending':
      return 'Đang giải quyết tranh chấp';
    case 'SettlementPending':
      return 'Đang đối soát hoàn tiền';
    default:
      return state;
  }
}

String _getOrderGuidance(Map<String, dynamic> order, bool isBuyer) {
  final state = (order['state'] ?? 'AwaitingPayment').toString();
  switch (state) {
    case 'AwaitingPayment':
      return isBuyer
          ? 'Kiểm tra tổng tiền và hạn trong chi tiết rồi thanh toán bằng ví.'
          : 'Đang chờ người mua thanh toán; sách đang được giữ tạm thời.';
    case 'PaidAwaitingSellerConfirmation':
    case 'PendingSellerConfirmation':
      return isBuyer
          ? 'Đã thanh toán Escrow. Chờ người bán xác nhận và chuẩn bị gửi sách.'
          : 'Người mua đã thanh toán. Vui lòng xác nhận để chuẩn bị đóng gói sách.';
    case 'Preparing':
    case 'Accepted':
      return isBuyer
          ? 'Người bán đang đóng gói sách theo đúng cam kết chất lượng.'
          : 'Chuẩn bị sách, chụp ảnh gói hàng và đăng ký mã vận đơn để gửi shipper.';
    case 'InTransit':
    case 'Shipped':
      return 'Kiện hàng đang được vận chuyển. Theo dõi hành trình giao nhận.';
    case 'Delivered':
    case 'Inspection':
      return isBuyer
          ? 'Đã nhận sách. Bạn có 72 giờ để kiểm định trước khi tiền được chuyển cho người bán.'
          : 'Kiện hàng đã tới người nhận. Chờ người mua kiểm định chất lượng sách.';
    case 'ResolutionPending':
      return 'Đang xử lý khiếu nại / tranh chấp. Ban quản trị đang rà soát hồ sơ.';
    case 'SettlementPending':
      return 'Đang xử lý đối soát và giải tỏa tiền ký quỹ theo quy định.';
    case 'Completed':
      return 'Đơn hàng hoàn tất thành công. Bạn có thể đánh giá đối tác.';
    case 'Cancelled':
    case 'PaymentExpired':
    case 'Rejected':
      return 'Đơn đã kết thúc. Mở chi tiết để xem lý do và kết quả hoàn tiền.';
    default:
      return 'Mở chi tiết để xem trạng thái hiện tại và thao tác được phép.';
  }
}

/// A comprehensive Order Details Dossier matching web `OrderDetails.tsx` / `DirectOrders.module.css`.
/// Can be rendered as a standalone focus view or embedded directly inside `ConversationScreen` ("Đơn sách" tab).
class OrderDetailsDossier extends ConsumerStatefulWidget {
  const OrderDetailsDossier({
    super.key,
    required this.orderId,
    this.embedded = false,
    this.onOrderChanged,
    this.onBack,
  });

  final String orderId;
  final bool embedded;
  final VoidCallback? onOrderChanged;
  final VoidCallback? onBack;

  @override
  ConsumerState<OrderDetailsDossier> createState() => _OrderDetailsDossierState();
}

class _OrderDetailsDossierState extends ConsumerState<OrderDetailsDossier> {
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;
  Map<String, dynamic>? _order;
  Map<String, dynamic>? _shipment;
  List<Map<String, dynamic>> _packagingEvidences = const [];
  final TextEditingController _trackingCtrl = TextEditingController();
  final TextEditingController _complaintCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadOrder);
  }

  @override
  void didUpdateWidget(covariant OrderDetailsDossier oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.orderId != widget.orderId) {
      _loadOrder();
    }
  }

  @override
  void dispose() {
    _trackingCtrl.dispose();
    _complaintCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadOrder() async {
    if (widget.orderId.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final results = await Future.wait<dynamic>([
        client.request('/me/orders/${widget.orderId}'),
        client.request('/me/orders/${widget.orderId}/shipment').catchError((_) => null),
        client
            .request('/me/orders/${widget.orderId}/packaging-evidence')
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
          _order = Map<String, dynamic>.from(orderRes);
          _shipment = shipmentRes is Map
              ? Map<String, dynamic>.from(shipmentRes)
              : null;
          _packagingEvidences = evidences;
          _loading = false;
        });
        widget.onOrderChanged?.call();
      } else {
        setState(() {
          _loading = false;
          _error = 'Không thể tải thông tin đơn hàng.';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _performOrderAction(
    String action, [
    Map<String, dynamic>? extraBody,
  ]) async {
    if (_order == null) return;
    final version = (_order!['version'] is num)
        ? (_order!['version'] as num).toInt()
        : 1;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/orders/${widget.orderId}/$action',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('order-$action'),
        body: {
          'expectedVersion': version,
          ...?extraBody,
        },
      );
      await _loadOrder();
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

  Future<void> _confirmReceipt() async {
    await _performOrderAction('confirm-receipt');
  }

  void _showNonReceiptDialog() {
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
                      content: Text('Mô tả sự cố cần tối thiểu 20 ký tự.'),
                      backgroundColor: StitchTokens.wineDark,
                    ),
                  );
                  return;
                }
                Navigator.pop(ctx);
                _performOrderAction('non-receipt', {'description': desc});
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showCancelPaidDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const AppText('Hủy đơn đã thanh toán', kind: AppTextKind.bold),
        content: const AppText(
          'Người bán đã quá hạn xác nhận đơn. Bạn có thể yêu cầu hủy đơn ngay lập tức. Toàn bộ tiền sách và phí vận chuyển sẽ được hoàn lại 100% vào Ví Lật Lại của bạn.',
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
                'cancel-paid',
                {'reason': 'SellerConfirmationTimeout'},
              );
            },
            child: const Text('Xác nhận hoàn tiền'),
          ),
        ],
      ),
    );
  }

  Future<void> _registerShipment() async {
    if (_order == null) return;
    final version = (_order!['version'] is num)
        ? (_order!['version'] as num).toInt()
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
      await client.request(
        '/orders/${widget.orderId}/shipment',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('order-shipment'),
        body: {
          'expectedVersion': version,
          'carrier': 'LatLaiSimulator',
          'trackingCode': tracking,
        },
      );
      await _loadOrder();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã đăng ký mã vận đơn thành công.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _uploadPackagingEvidence() async {
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
    final version = (_order?['version'] is num)
        ? (_order!['version'] as num).toInt()
        : 1;

    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final created = await client.request(
        '/orders/${widget.orderId}/packaging-evidence',
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
          '/orders/${widget.orderId}/packaging-evidence/$evidenceId/content',
          method: 'PUT',
          idempotencyKey: generateIdempotencyKey('pack-content'),
          body: bytes,
        );
      }
      await _loadOrder();
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

  Future<void> _openOrLinkConversation(
    String orderId,
    String? conversationId,
  ) async {
    if (conversationId != null && conversationId.isNotEmpty) {
      context.push('/conversation?id=$conversationId');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/orders/$orderId/conversation',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('order-conv'),
        body: const {},
      );
      if (!mounted) return;
      setState(() => _busy = false);
      if (res is Map) {
        final cid = (res['entityId'] ?? res['id'] ?? '').toString();
        if (cid.isNotEmpty) {
          context.push('/conversation?id=$cid');
          return;
        }
      }
      await _loadOrder();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
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
                      : Text(
                          '${stepIndex + 1}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isCurrent
                                ? Colors.white
                                : StitchTokens.darkWood,
                          ),
                        ),
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: steps.asMap().entries.map((entry) {
              final isCurrent = entry.key == activeIndex;
              return Expanded(
                child: Center(
                  child: Text(
                    entry.value,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                      color: isCurrent
                          ? StitchTokens.wineDark
                          : StitchTokens.darkWood.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _order == null) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: StitchTokens.cardBorder),
        ),
        child: Column(
          children: const [
            CircularProgressIndicator(color: StitchTokens.wine),
            SizedBox(height: 12),
            AppText('Đang tải dữ liệu đơn hàng…', kind: AppTextKind.small, color: AppColors.muted),
          ],
        ),
      );
    }

    if (_error != null && _order == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: StitchTokens.cardBorder),
        ),
        child: Column(
          children: [
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: 12),
            AppButton(
              title: 'Thử lại',
              wine: true,
              compact: true,
              onPressed: _loadOrder,
            ),
          ],
        ),
      );
    }

    final order = _order!;
    final id = (order['id'] ?? widget.orderId).toString();
    final shortId = id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
    final state = (order['state'] ?? 'AwaitingPayment').toString();
    final role = (order['role'] ?? 'Buyer').toString();
    final isBuyer = role == 'Buyer';
    final isSeller = role == 'Seller';
    final conversationId = order['conversationId']?.toString();

    final item = order['item'] is Map
        ? Map<String, dynamic>.from(order['item'] as Map)
        : const <String, dynamic>{};
    final amounts = order['amounts'] is Map
        ? Map<String, dynamic>.from(order['amounts'] as Map)
        : const <String, dynamic>{};
    final metadata = item['metadata'] is Map
        ? Map<String, dynamic>.from(item['metadata'] as Map)
        : const <String, dynamic>{};
    final title = (metadata['title'] ?? item['title'] ?? order['title'] ?? 'Ấn bản sách trong đơn').toString();
    final bookPrice = (amounts['bookPrice'] ?? item['bookPrice'] ?? order['bookPrice'] ?? 0) as num;
    final shippingFee =
        (amounts['shippingFee'] ?? order['shippingFee'] ?? item['shippingFee'] ?? 0) as num;
    final buyerTotal =
        (amounts['buyerTotal'] ?? order['buyerTotal'] ?? (bookPrice + shippingFee)) as num;

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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.onBack != null) ...[
          BackAction(
            title: 'Về danh sách đơn trực tiếp',
            onPressed: widget.onBack!,
          ),
          const SizedBox(height: AppSpace.sm),
        ],
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
                        _formatOrderStateLabel(state),
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
                              item: {
                                'id': order['listingId'] ?? item['listingId'] ?? '',
                                'title': title,
                                if (item['photos'] != null) 'photos': item['photos'],
                                if (order['photos'] != null) 'photos': order['photos'],
                                if (item['mediaIds'] != null) 'mediaIds': item['mediaIds'],
                              },
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
                                title,
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
                          if (shippingFee > 0) ...[
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
                          ],
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

                    // Delivery & Shipping Addresses
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
                                (order['ownAddress']['detail'] ?? '').toString(),
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
                                (order['shippingAddress']['detail'] ?? '').toString(),
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
                                  ? 'Vui lòng thanh toán trước ${_formatOrderDateVi(order['paymentDeadline'])}. Quá hạn, đơn hàng sẽ tự động hủy và sách được mở lại cho độc giả khác.'
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
                                    _performOrderAction('pay'),
                              ),
                              const SizedBox(height: 8),
                              AppButton(
                                title: 'Hủy đơn chưa thanh toán',
                                secondary: true,
                                busy: _busy,
                                onPressed: () =>
                                    _performOrderAction('cancel'),
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
                                    _performOrderAction('accept'),
                              ),
                              const SizedBox(height: 8),
                              AppButton(
                                title: 'Từ chối đơn',
                                secondary: true,
                                busy: _busy,
                                onPressed: () =>
                                    _performOrderAction('reject'),
                              ),
                            ] else ...[
                              AppButton(
                                title: 'Hủy đơn và hoàn tiền 100%',
                                secondary: true,
                                busy: _busy,
                                onPressed: _showCancelPaidDialog,
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
                                      'Hạn bàn giao shipper: ${_formatOrderDateVi(order['preparation']?['pickupDeadline'] ?? order['pickupDeadline'])}',
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
                                        : _uploadPackagingEvidence,
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
                                    onPressed: _registerShipment,
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
                            const AppText(
                              'Đơn vị vận chuyển LatLai Simulator đã tiếp nhận sách và đang trên đường giao tới người nhận.',
                              kind: AppTextKind.small,
                              color: Color(0xFF15803D),
                            ),
                            if (_shipment != null) ...[
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
                                      (_shipment!['trackingCode'] ??
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
                                onPressed: _confirmReceipt,
                              ),
                              const SizedBox(height: 8),
                              AppButton(
                                title: 'Báo cáo sự cố / Chưa nhận sách',
                                secondary: true,
                                busy: _busy,
                                icon: Icons.report_problem_outlined,
                                onPressed: _showNonReceiptDialog,
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

                    // Shortcut back to conversation if standalone
                    if (!widget.embedded) ...[
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
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
