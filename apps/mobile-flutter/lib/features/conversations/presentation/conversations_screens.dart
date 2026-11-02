import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// ChatInboxScreen (`/chat-inbox`) matching `apps/mobile-react-native/src/features/conversations/chat-inbox-screen.tsx`
class ChatInboxScreen extends ConsumerStatefulWidget {
  const ChatInboxScreen({super.key});

  @override
  ConsumerState<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends ConsumerState<ChatInboxScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  String _selectedTab = 'all';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _conversations = const [];

  static const _tabs = [
    (id: 'all', label: 'Tất cả'),
    (id: 'exchange', label: 'Trao đổi sách'),
    (id: 'action', label: 'Cần phản hồi'),
    (id: 'negotiating', label: 'Đang thương lượng'),
    (id: 'ordered', label: 'Đã tạo đơn'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadInbox);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInbox() async {
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
      final res = await client.request('/me/purchase-conversations');
      final list = res is List
          ? res
          : (res is Map && res['items'] is List
              ? (res['items'] as List)
              : const []);
      if (!mounted) return;
      setState(() {
        _conversations = list
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
    final session = ref.watch(sessionProvider);
    final userId = session.user?.id;
    final filtered = _conversations.where((c) {
      final q = _searchCtrl.text.trim().toLowerCase();
      if (q.isNotEmpty) {
        final title = (c['listing'] is Map
                ? (c['listing'] as Map)['title']
                : c['bookTitle'] ?? '')
            .toString()
            .toLowerCase();
        if (!title.contains(q)) return false;
      }
      final terms = c['terms'] is Map
          ? Map<String, dynamic>.from(c['terms'] as Map)
          : const <String, dynamic>{};
      if (_selectedTab == 'exchange') {
        return terms['mode'] == 'Exchange';
      }
      if (_selectedTab == 'action') {
        final pending = terms['pendingProposal'] is Map
            ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
            : null;
        return pending != null && pending['proposedById'] != userId;
      }
      if (_selectedTab == 'ordered') {
        return c['orderId'] != null;
      }
      return true;
    }).toList();

    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'HỘP THƯ CHAT'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Quay lại',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Tin nhắn thương lượng',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          SearchField(
            controller: _searchCtrl,
            placeholder: 'Tìm theo tên người bán / người mua / tên sách…',
            onChanged: (_) => setState(() {}),
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
          if (!session.isAuthenticated)
            StatePanel(
              wine: true,
              title: 'Đăng nhập để xem hộp thư thương lượng',
              actionLabel: 'Đăng nhập',
              onAction: () => context.go('/account'),
            )
          else if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải hội thoại…',
            )
          else if (filtered.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Chưa có cuộc trò chuyện nào',
              message:
                  'Mở trang chi tiết một cuốn sách và bấm "Thương lượng & Mua" để trao đổi trực tiếp với người bán.',
              actionLabel: 'Tìm sách trên kệ',
              onAction: () => context.go('/search'),
            )
          else
            ...filtered.map((conv) {
              final id = (conv['id'] ?? '').toString();
              final listing = conv['listing'] is Map
                  ? Map<String, dynamic>.from(conv['listing'] as Map)
                  : const <String, dynamic>{};
              final bookTitle =
                  (listing['title'] ?? conv['bookTitle'] ?? 'Ấn bản sách cũ')
                      .toString();
              final sellerId =
                  (conv['sellerId'] ?? listing['sellerId'] ?? '').toString();
              final isSeller = userId != null && sellerId == userId;
              final terms = conv['terms'] is Map
                  ? Map<String, dynamic>.from(conv['terms'] as Map)
                  : const <String, dynamic>{};
              final agreedPrice = terms['agreedPrice'] is num
                  ? (terms['agreedPrice'] as num)
                  : null;
              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.md),
                child: InkWell(
                  onTap: () => context.push('/conversation?id=$id'),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.all(AppSpace.lg),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: StitchTokens.cardBorder),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: StitchTokens.roseParchment,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.handshake_outlined,
                            color: StitchTokens.wine,
                          ),
                        ),
                        const SizedBox(width: AppSpace.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppText(
                                bookTitle,
                                kind: AppTextKind.bold,
                                color: StitchTokens.darkWood,
                              ),
                              const SizedBox(height: 2),
                              AppText(
                                isSeller
                                    ? 'Bạn là Người bán'
                                    : 'Bạn là Người mua',
                                kind: AppTextKind.small,
                                color: AppColors.muted,
                              ),
                              if (agreedPrice != null) ...[
                                const SizedBox(height: 2),
                                AppText(
                                  'Đã thống nhất giá: ${formatVnd(agreedPrice)}',
                                  kind: AppTextKind.small,
                                  color: AppColors.forest,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: StitchTokens.wine,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// ConversationScreen (`/conversation`) matching `apps/mobile-react-native/src/features/conversations/conversation-screen.tsx`
/// AND the synchronized 2-card Dossier + Chat Workspace (`NegotiationWorkspace.tsx` / `OrderDetails.tsx`).
class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final TextEditingController _priceCtrl = TextEditingController();
  final TextEditingController _msgCtrl = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  bool _processExpanded = false;
  String? _error;
  String? _notice;
  Map<String, dynamic>? _conv;
  List<Map<String, dynamic>> _messages = const [];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadConversation);
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    _msgCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadConversation() async {
    if (widget.id.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Mã cuộc trò chuyện không hợp lệ.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final results = await Future.wait<dynamic>([
        client.request('/me/purchase-conversations/${widget.id}'),
        client
            .request('/me/purchase-conversations/${widget.id}/messages')
            .catchError((_) => const []),
      ]);
      final convData = results[0];
      final msgData = results[1];
      final msgList = msgData is List
          ? msgData
          : (msgData is Map && msgData['items'] is List
              ? (msgData['items'] as List)
              : const []);

      if (!mounted) return;
      setState(() {
        _conv = convData is Map ? Map<String, dynamic>.from(convData) : null;
        _messages = msgList
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

  Future<void> _proposePrice(int amount) async {
    if (_conv == null || amount <= 0) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/purchase-conversations/${widget.id}/terms',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('prop-price'),
        body: {
          'expectedVersion': _conv!['version'] ?? 1,
          'kind': 'Price',
          'amount': amount,
        },
      );
      await _loadConversation();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã gửi đề nghị giá ${formatVnd(amount)}.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _respondProposal(String proposalId, bool accept) async {
    if (_conv == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/purchase-conversations/${widget.id}/terms/respond',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('resp-prop'),
        body: {
          'expectedVersion': _conv!['version'] ?? 1,
          'proposalId': proposalId,
          'accept': accept,
        },
      );
      await _loadConversation();
      if (!mounted) return;
      setState(() => _busy = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _createOrderAsSeller(num agreedBookPrice) async {
    if (_conv == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/orders',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('seller-order'),
        body: {
          'conversationId': widget.id,
          'expectedVersion': _conv!['version'] ?? 1,
          'agreedBookPrice': agreedBookPrice.round(),
        },
      );
      await _loadConversation();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã tạo đơn hàng cho người mua thành công!';
      });
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      final orderId = (map['entityId'] ?? map['id'] ?? '').toString();
      if (orderId.isNotEmpty) {
        context.push('/orders?focus=$orderId');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final userId = session.user?.id;
    final conv = _conv;
    final listing = conv?['listing'] is Map
        ? Map<String, dynamic>.from(conv!['listing'] as Map)
        : const <String, dynamic>{};
    final terms = conv?['terms'] is Map
        ? Map<String, dynamic>.from(conv!['terms'] as Map)
        : const <String, dynamic>{};
    final pendingProposal = terms['pendingProposal'] is Map
        ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
        : null;
    final agreedPrice = terms['agreedPrice'] is num
        ? (terms['agreedPrice'] as num)
        : null;
    final listedPrice = (listing['salePrice'] ?? conv?['listedPrice'] ?? 50000) as num;
    final effectivePrice = agreedPrice ?? listedPrice;
    final isSeller = userId != null &&
        (conv?['sellerId']?.toString() == userId ||
            listing['sellerId']?.toString() == userId);
    final shortCode = widget.id.length >= 8
        ? widget.id.substring(0, 8).toUpperCase()
        : widget.id.toUpperCase();

    return AppScreen(
      maxWidth: 1120,
      header: const TopNavbar(subtitle: 'THỎA THUẬN GIAO DỊCH'),
      child: _loading
          ? const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang mở hồ sơ thỏa thuận…',
            )
          : conv == null
              ? StatePanel(
                  wine: true,
                  title: 'Không tìm thấy cuộc trò chuyện',
                  message: _error,
                  actionLabel: 'Về hộp thư',
                  onAction: () => context.go('/chat-inbox'),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    BackAction(
                      title: 'Hội thoại của bạn',
                      onPressed: () => context.canPop()
                          ? context.pop()
                          : context.go('/chat-inbox'),
                    ),
                    if (_error != null) ...[
                      Notice(message: _error!, tone: NoticeTone.error),
                      const SizedBox(height: AppSpace.md),
                    ],
                    if (_notice != null) ...[
                      Notice(message: _notice!, tone: NoticeTone.success),
                      const SizedBox(height: AppSpace.md),
                    ],
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final isWide = constraints.maxWidth >= 880;
                        final bookCard = _buildBookDossierCard(
                          listing: listing,
                          listedPrice: listedPrice,
                          agreedPrice: agreedPrice,
                          effectivePrice: effectivePrice,
                        );
                        final agreementCard = _buildAgreementDossierCard(
                          shortCode: shortCode,
                          isSeller: isSeller,
                          agreedPrice: agreedPrice,
                          effectivePrice: effectivePrice,
                          pendingProposal: pendingProposal,
                          userId: userId,
                          listingId: (listing['id'] ?? conv['listingId'] ?? '')
                              .toString(),
                        );
                        final chatCard = _buildChatPanelCard(isSeller: isSeller);

                        if (isWide) {
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(flex: 3, child: bookCard),
                              const SizedBox(width: AppSpace.md),
                              Expanded(flex: 4, child: agreementCard),
                              const SizedBox(width: AppSpace.md),
                              Expanded(flex: 3, child: chatCard),
                            ],
                          );
                        }
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            bookCard,
                            const SizedBox(height: AppSpace.md),
                            agreementCard,
                            const SizedBox(height: AppSpace.md),
                            chatCard,
                          ],
                        );
                      },
                    ),
                  ],
                ),
    );
  }

  /// Card 1: Thông tin sách (Synchronized with `NegotiationWorkspace.tsx` & `OrderDetails.tsx`)
  Widget _buildBookDossierCard({
    required Map<String, dynamic> listing,
    required num listedPrice,
    required num? agreedPrice,
    required num effectivePrice,
  }) {
    final title = (listing['title'] ?? 'Ấn bản sách cũ').toString();
    final author = (listing['author'] ??
            (listing['authors'] is List
                ? (listing['authors'] as List).join(' · ')
                : 'Tác giả Lật Lại'))
        .toString();
    final listingId = (listing['id'] ?? '').toString();

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: StitchTokens.cardBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Wine Header matching `.cardHeader`
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            color: StitchTokens.wine,
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: const Icon(
                    Icons.menu_book_rounded,
                    color: StitchTokens.gold,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppText(
                        'Thông tin sách',
                        kind: AppTextKind.bold,
                        color: Colors.white,
                      ),
                      AppText(
                        'Chi tiết ấn bản và thanh toán',
                        kind: AppTextKind.small,
                        color: StitchTokens.goldLight,
                        style: TextStyle(fontSize: 11),
                      ),
                    ],
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
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 64,
                      height: 86,
                      decoration: BoxDecoration(
                        color: StitchTokens.parchment,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: StitchTokens.cardBorder),
                      ),
                      child: const Icon(
                        Icons.auto_stories_rounded,
                        color: StitchTokens.wine,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(title, kind: AppTextKind.bold),
                          const SizedBox(height: 2),
                          AppText(
                            author,
                            kind: AppTextKind.small,
                            color: AppColors.muted,
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: StitchTokens.roseParchment,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: AppText(
                              'Tình trạng: ${formatConditionLabel(listing['condition']?.toString())}',
                              kind: AppTextKind.label,
                              color: StitchTokens.wine,
                            ),
                          ),
                          if (listingId.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            InkWell(
                              onTap: () => context.push('/book?id=$listingId'),
                              child: const AppText(
                                'Xem bài đăng gốc ↗',
                                kind: AppTextKind.small,
                                color: StitchTokens.wine,
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: StitchTokens.parchment,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _DossierRow(
                        label: 'Bìa & gáy:',
                        value: (listing['coverNote'] ?? 'Còn tốt').toString(),
                      ),
                      const SizedBox(height: 4),
                      _DossierRow(
                        label: 'Số trang:',
                        value: (listing['pages'] ?? 'Đủ trang').toString(),
                      ),
                      const Divider(height: 16),
                      const AppText(
                        'Ghi chú người bán:',
                        kind: AppTextKind.small,
                        color: AppColors.muted,
                      ),
                      AppText(
                        (listing['notes'] ??
                                listing['description'] ??
                                'Sách giữ kỹ, giấy sạch.')
                            .toString(),
                        kind: AppTextKind.small,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: StitchTokens.warmIvory,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: StitchTokens.cardBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const AppText(
                            'Chi tiết thanh toán',
                            kind: AppTextKind.bold,
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: StitchTokens.roseParchment,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: AppText(
                              agreedPrice != null ? 'THƯƠNG LƯỢNG' : 'NIÊM YẾT',
                              kind: AppTextKind.label,
                              color: StitchTokens.wine,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      _DossierRow(
                        label: 'Tiền sách',
                        value: formatVnd(effectivePrice),
                      ),
                      const SizedBox(height: 4),
                      const _DossierRow(
                        label: 'Phí giao hàng',
                        value: 'Tính theo địa chỉ nhận',
                      ),
                      const Divider(height: 18),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const AppText(
                            'Tổng thanh toán',
                            kind: AppTextKind.bold,
                          ),
                          AppText(
                            formatVnd(effectivePrice),
                            kind: AppTextKind.bookPrice,
                            color: StitchTokens.wine,
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

  /// Card 2: Thỏa thuận giao dịch (Synchronized with `NegotiationWorkspace.tsx` & `.trustBanner`)
  Widget _buildAgreementDossierCard({
    required String shortCode,
    required bool isSeller,
    required num? agreedPrice,
    required num effectivePrice,
    required Map<String, dynamic>? pendingProposal,
    required String? userId,
    required String listingId,
  }) {
    final proposalAmount = pendingProposal?['amount'] is num
        ? (pendingProposal!['amount'] as num)
        : null;
    final proposedByPartner = pendingProposal != null &&
        userId != null &&
        pendingProposal['proposedById']?.toString() != userId;

    return Container(
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
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            color: StitchTokens.wine,
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: const Icon(
                    Icons.handshake_outlined,
                    color: StitchTokens.gold,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const AppText(
                        'Thỏa thuận giao dịch',
                        kind: AppTextKind.bold,
                        color: Colors.white,
                      ),
                      AppText(
                        'Mã hội thoại: #$shortCode · Bạn là ${isSeller ? "Người bán" : "Người mua"}',
                        kind: AppTextKind.small,
                        color: StitchTokens.goldLight,
                        style: const TextStyle(fontSize: 11),
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
                    color: agreedPrice != null
                        ? const Color(0xFFE8F5E9)
                        : StitchTokens.goldLight,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: AppText(
                    agreedPrice != null ? 'Đã chốt giá' : 'Đang thương lượng',
                    kind: AppTextKind.label,
                    color: agreedPrice != null
                        ? const Color(0xFF1B5E20)
                        : StitchTokens.wineDark,
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
                const AppText(
                  'Hình thức giao dịch:',
                  kind: AppTextKind.bold,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: StitchTokens.parchment,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const AppText(
                            '✓ Thương lượng mua',
                            kind: AppTextKind.bold,
                            color: StitchTokens.wine,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                      Expanded(
                        child: InkWell(
                          onTap: listingId.isNotEmpty
                              ? () => context
                                  .push('/exchange-compose?book=$listingId')
                              : null,
                          child: const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: AppText(
                              'Đổi sách',
                              kind: AppTextKind.small,
                              color: AppColors.muted,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Pending proposal banner
                if (pendingProposal != null && proposalAmount != null) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: StitchTokens.roseWarmSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: StitchTokens.wine.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AppText(
                          proposedByPartner
                              ? 'Đối phương đề nghị mức giá: ${formatVnd(proposalAmount)}'
                              : 'Bạn đã gửi đề nghị giá: ${formatVnd(proposalAmount)}',
                          kind: AppTextKind.bold,
                          color: StitchTokens.wine,
                        ),
                        const SizedBox(height: 8),
                        if (proposedByPartner)
                          Row(
                            children: [
                              Expanded(
                                child: AppButton(
                                  title: 'Chấp nhận giá',
                                  wine: true,
                                  compact: true,
                                  busy: _busy,
                                  onPressed: () => _respondProposal(
                                    (pendingProposal['id'] ?? '').toString(),
                                    true,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: AppButton(
                                  title: 'Từ chối',
                                  secondary: true,
                                  compact: true,
                                  busy: _busy,
                                  onPressed: () => _respondProposal(
                                    (pendingProposal['id'] ?? '').toString(),
                                    false,
                                  ),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Agreed price banner
                if (agreedPrice != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEAF7EE),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFB7DFC2)),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.check_circle_outline_rounded,
                          color: Color(0xFF1F7A3E),
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: AppText(
                            'Đã thống nhất giá: ${formatVnd(agreedPrice)}',
                            kind: AppTextKind.bold,
                            color: const Color(0xFF1F7A3E),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // Propose new price controls
                Row(
                  children: [
                    Expanded(
                      child: AppTextField(
                        controller: _priceCtrl,
                        keyboardType: TextInputType.number,
                        placeholder: 'Nhập mức giá đề xuất (VNĐ)…',
                      ),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      title: 'Gửi giá',
                      wine: true,
                      compact: true,
                      busy: _busy,
                      onPressed: () {
                        final val = int.tryParse(_priceCtrl.text.trim()) ?? 0;
                        if (val >= 5000) {
                          _proposePrice(val);
                        } else {
                          setState(
                            () => _error = 'Giá đề nghị cần tối thiểu 5.000 ₫.',
                          );
                        }
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Seller Create Order CTA / Buyer status banner
                if (isSeller) ...[
                  AppButton(
                    title: 'Tạo đơn cho người mua này (${formatVnd(effectivePrice)})',
                    wine: true,
                    busy: _busy,
                    icon: Icons.receipt_long_rounded,
                    onPressed: () => _createOrderAsSeller(effectivePrice),
                  ),
                  const SizedBox(height: 8),
                  if (listingId.isNotEmpty)
                    AppButton(
                      title: 'Bổ sung / sửa nơi gửi trong bài đăng',
                      secondary: true,
                      compact: true,
                      onPressed: () =>
                          context.push('/drafts?id=$listingId'),
                    ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.infoSurface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const AppText(
                      'Trao đổi và thống nhất giá với người bán. Khi hai bên chốt giá, người bán sẽ tạo đơn để bạn thanh toán qua Quỹ ký quỹ.',
                      kind: AppTextKind.small,
                      color: AppColors.info,
                    ),
                  ),
                ],
                const SizedBox(height: 12),

                // Expandable `.stepperMini`: Quy trình giao dịch trên Lật Lại
                InkWell(
                  onTap: () =>
                      setState(() => _processExpanded = !_processExpanded),
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: StitchTokens.parchment,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: StitchTokens.cardBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const AppText(
                              'Quy trình giao dịch trên Lật Lại',
                              kind: AppTextKind.bold,
                            ),
                            Icon(
                              _processExpanded
                                  ? Icons.expand_less_rounded
                                  : Icons.expand_more_rounded,
                            ),
                          ],
                        ),
                        if (_processExpanded) ...[
                          const SizedBox(height: 8),
                          const AppText(
                            '1. Thương lượng & thống nhất giá sách.\n'
                            '2. Người mua cung cấp địa chỉ nhận sách & người bán tạo đơn.\n'
                            '3. Người mua thanh toán vào Quỹ ký quỹ & kiểm tra sách trong 72h.',
                            kind: AppTextKind.small,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Redesigned `.trustBanner` matching our earlier polish
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFFDFBF7), Color(0xFFF6EFE4)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFE4D6C3)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: const Color(0xFF1F7A3E).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.verified_user_outlined,
                          size: 16,
                          color: Color(0xFF1F7A3E),
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: AppText(
                          'Mọi giao dịch trên Lật Lại được bảo đảm an toàn qua Quỹ ký quỹ & quy trình kiểm định 72h.',
                          kind: AppTextKind.small,
                          color: Color(0xFF4A3A31),
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

  /// Card 3: Chat Panel (`ChatMessagesPanel`)
  Widget _buildChatPanelCard({required bool isSeller}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: StitchTokens.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const CircleAvatar(
                radius: 18,
                backgroundColor: StitchTokens.roseParchment,
                child: Icon(
                  Icons.person_outline_rounded,
                  color: StitchTokens.wine,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const AppText('Hộp thoại thương lượng', kind: AppTextKind.bold),
                    AppText(
                      isSeller
                          ? 'Người mua · Bạn đang bán sách'
                          : 'Người bán · Bạn đang hỏi mua',
                      kind: AppTextKind.small,
                      color: AppColors.muted,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 24),
          if (_messages.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Column(
                children: [
                  const Icon(
                    Icons.mark_chat_unread_outlined,
                    size: 36,
                    color: StitchTokens.wine,
                  ),
                  const SizedBox(height: 8),
                  const AppText(
                    'Bắt đầu cuộc trò chuyện',
                    kind: AppTextKind.bold,
                  ),
                  const SizedBox(height: 4),
                  const AppText(
                    'Bạn có thể hỏi về tình trạng sách hoặc giá trước khi gửi thông tin nhận sách.',
                    kind: AppTextKind.small,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 10),
                  AppChip(
                    title: 'Soạn lời chào',
                    selected: false,
                    onPressed: () {
                      setState(() {
                        _msgCtrl.text =
                            'Chào bạn, sách này hiện còn trên kệ không ạ?';
                      });
                    },
                  ),
                ],
              ),
            )
          else
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _messages.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final m = _messages[index];
                  return Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: StitchTokens.parchment,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: AppText(
                      (m['body'] ?? m['text'] ?? '').toString(),
                      kind: AppTextKind.small,
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: AppTextField(
                  controller: _msgCtrl,
                  placeholder: isSeller
                      ? 'Trả lời người mua…'
                      : 'Nhắn cho người bán…',
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                style: IconButton.styleFrom(
                  backgroundColor: StitchTokens.wine,
                ),
                onPressed: () {
                  final text = _msgCtrl.text.trim();
                  if (text.isEmpty) return;
                  setState(() {
                    _messages = [
                      ..._messages,
                      {'body': text}
                    ];
                    _msgCtrl.clear();
                  });
                },
                icon: const Icon(Icons.send_rounded, color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DossierRow extends StatelessWidget {
  const _DossierRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        AppText(label, kind: AppTextKind.small, color: AppColors.muted),
        Flexible(
          child: AppText(
            value,
            kind: AppTextKind.bold,
            textAlign: TextAlign.right,
          ),
        ),
      ],
    );
  }
}

