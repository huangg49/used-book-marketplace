import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../orders/presentation/order_details_dossier.dart';

/// Global in-memory cache for listing details so book identity (title, cover, photos)
/// resolves instantly across inbox, dossier and conversation views.
final Map<String, Map<String, dynamic>> _listingCache = {};
final Map<String, Map<String, dynamic>> _bookCache = {};

String _formatTimeVi(dynamic raw) {
  if (raw == null) return '';
  final dt = DateTime.tryParse(raw.toString())?.toLocal();
  if (dt == null) return '';
  final now = DateTime.now();
  final diff = now.difference(dt);
  if (diff.inMinutes < 1) return 'Vừa xong';
  if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
  if (diff.inHours < 24 && dt.day == now.day) {
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }
  final dd = dt.day.toString().padLeft(2, '0');
  final month = dt.month.toString().padLeft(2, '0');
  final hh = dt.hour.toString().padLeft(2, '0');
  final mm = dt.minute.toString().padLeft(2, '0');
  return '$hh:$mm · $dd/$month';
}

/// ChatInboxScreen (`/chat-inbox`) matching `apps/mobile-react-native/src/features/conversations/chat-inbox-screen.tsx`
/// and web `apps/user-web/src/components/conversation/ConversationInbox.tsx`.
class ChatInboxScreen extends ConsumerStatefulWidget {
  const ChatInboxScreen({super.key});

  @override
  ConsumerState<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends ConsumerState<ChatInboxScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  String _selectedTab = 'all';
  bool _isGridView = false;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _conversations = const [];
  List<Map<String, dynamic>> _exchanges = const [];

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
      final results = await Future.wait<dynamic>([
        client.request('/me/purchase-conversations'),
        client.request('/me/exchanges').catchError((_) => const []),
      ]);

      final rawConvs = results[0];
      final rawExchanges = results[1];

      final convList = rawConvs is List
          ? rawConvs
          : (rawConvs is Map && rawConvs['items'] is List
                ? (rawConvs['items'] as List)
                : const []);

      final exchangeList = rawExchanges is List
          ? rawExchanges
          : (rawExchanges is Map && rawExchanges['items'] is List
                ? (rawExchanges['items'] as List)
                : const []);

      final parsedConvs = convList
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      final parsedExchanges = exchangeList
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      if (!mounted) return;
      setState(() {
        _conversations = parsedConvs;
        _exchanges = parsedExchanges;
        _loading = false;
      });

      // Asynchronously resolve listings for all conversations to populate book thumbnails & titles
      final listingIds = <String>{};
      for (final c in parsedConvs) {
        final lid =
            (c['listingId'] ??
                    (c['listing'] is Map ? (c['listing'] as Map)['id'] : null))
                ?.toString();
        if (lid != null && lid.isNotEmpty) listingIds.add(lid);
      }
      for (final x in parsedExchanges) {
        final rlid = (x['recipientListingId'] ?? x['listingId'])?.toString();
        if (rlid != null && rlid.isNotEmpty) listingIds.add(rlid);
        final ilids = x['initiatorListingIds'];
        if (ilids is List && ilids.isNotEmpty) {
          listingIds.add(ilids[0].toString());
        }
      }

      final missing = listingIds
          .where((id) => !_listingCache.containsKey(id))
          .toList();
      if (missing.isNotEmpty) {
        await Future.wait(
          missing.map((lid) async {
            try {
              final res = await client.publicRequest(
                '/listings/$lid?bundleSupport=whole-v1',
              );
              if (res is Map) {
                _listingCache[lid] = Map<String, dynamic>.from(res);
              }
            } catch (_) {}
          }),
        );
        if (mounted) setState(() {});
      }
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

    // Filter calculations
    final query = _searchCtrl.text.trim().toLowerCase();

    // Counts for tabs
    int actionCount = 0;
    int exchangeCount = _exchanges.length;
    int negotiatingCount = 0;
    int orderedCount = 0;

    for (final c in _conversations) {
      final terms = c['terms'] is Map
          ? Map<String, dynamic>.from(c['terms'] as Map)
          : const <String, dynamic>{};
      final proposal = terms['pendingProposal'] is Map
          ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
          : null;
      if (proposal != null && proposal['proposedById']?.toString() != userId) {
        actionCount++;
      }
      if (terms['mode'] == 'Exchange') {
        exchangeCount++;
      }
      final status = (c['status'] ?? 'Active').toString();
      final hasOrder = c['orderId'] != null || status == 'OrderCreated';
      if (hasOrder) {
        orderedCount++;
      } else if (status == 'Active') {
        negotiatingCount++;
      }
    }

    final filteredConvs = _conversations.where((c) {
      final listingId =
          (c['listingId'] ??
                  (c['listing'] is Map ? (c['listing'] as Map)['id'] : ''))
              ?.toString() ??
          '';
      final cachedListing =
          _listingCache[listingId] ??
          (c['listing'] is Map
              ? Map<String, dynamic>.from(c['listing'] as Map)
              : null);

      final bookTitle =
          cachedListing?['bundle']?['title']?.toString() ??
          cachedListing?['book']?['title']?.toString() ??
          cachedListing?['title']?.toString() ??
          c['bookTitle']?.toString() ??
          '';

      final buyerObj = c['buyer'] is Map
          ? Map<String, dynamic>.from(c['buyer'] as Map)
          : const <String, dynamic>{};
      final sellerObj = c['seller'] is Map
          ? Map<String, dynamic>.from(c['seller'] as Map)
          : const <String, dynamic>{};
      final isBuyer =
          userId != null &&
          (buyerObj['id'] ?? c['buyerId'] ?? '').toString() == userId;
      final partner = isBuyer ? sellerObj : buyerObj;
      final partnerName = (partner['displayName'] ?? '').toString();

      if (query.isNotEmpty) {
        final matches =
            bookTitle.toLowerCase().contains(query) ||
            partnerName.toLowerCase().contains(query) ||
            (c['id'] ?? '').toString().toLowerCase().contains(query);
        if (!matches) return false;
      }

      final terms = c['terms'] is Map
          ? Map<String, dynamic>.from(c['terms'] as Map)
          : const <String, dynamic>{};
      final proposal = terms['pendingProposal'] is Map
          ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
          : null;
      final isAction =
          proposal != null && proposal['proposedById']?.toString() != userId;
      final isExchange = terms['mode'] == 'Exchange';
      final status = (c['status'] ?? 'Active').toString();
      final hasOrder = c['orderId'] != null || status == 'OrderCreated';

      if (_selectedTab == 'action') return isAction;
      if (_selectedTab == 'exchange') return isExchange;
      if (_selectedTab == 'negotiating') return status == 'Active' && !hasOrder;
      if (_selectedTab == 'ordered') return hasOrder;
      return true;
    }).toList();

    final filteredExchanges =
        (_selectedTab == 'all' || _selectedTab == 'exchange')
        ? _exchanges.where((x) {
            if (query.isEmpty) return true;
            final targetId =
                (x['recipientListingId'] ?? x['listingId'])?.toString() ?? '';
            final cached = _listingCache[targetId];
            final title =
                (cached?['bundle']?['title'] ??
                        cached?['book']?['title'] ??
                        cached?['title'] ??
                        '')
                    .toString();
            return title.toLowerCase().contains(query) ||
                (x['id'] ?? '').toString().toLowerCase().contains(query);
          }).toList()
        : const <Map<String, dynamic>>[];

    final totalItemsCount = filteredConvs.length + filteredExchanges.length;

    final tabs = [
      (
        id: 'all',
        label: 'Tất cả (${_conversations.length + _exchanges.length})',
      ),
      (id: 'action', label: 'Cần phản hồi ($actionCount)'),
      (id: 'exchange', label: 'Trao đổi sách ($exchangeCount)'),
      (id: 'negotiating', label: 'Đang thương lượng ($negotiatingCount)'),
      (id: 'ordered', label: 'Đã tạo đơn ($orderedCount)'),
    ];

    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'HỘP THƯ CHAT'),
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
              if (actionCount > 0)
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
                        Icons.bolt_rounded,
                        size: 14,
                        color: StitchTokens.gold,
                      ),
                      const SizedBox(width: 4),
                      AppText(
                        '$actionCount cần bạn trả lời',
                        kind: AppTextKind.label,
                        color: StitchTokens.gold,
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),

          // Search Input
          SearchField(
            controller: _searchCtrl,
            placeholder: 'Tìm theo tên người bán / người mua / tên sách…',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.md),

          // Filter Dropdown & View Mode Toggle (List / Grid)
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 42,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: StitchTokens.peachBorder),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x06000000),
                        blurRadius: 4,
                        offset: Offset(0, 1),
                      ),
                    ],
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedTab,
                      isExpanded: true,
                      icon: const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: StitchTokens.wine,
                        size: 22,
                      ),
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: StitchTokens.wine,
                      ),
                      items: tabs.map((t) {
                        return DropdownMenuItem<String>(
                          value: t.id,
                          child: Text(t.label),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) {
                          setState(() => _selectedTab = val);
                        }
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                height: 42,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: StitchTokens.peachBorder),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x06000000),
                      blurRadius: 4,
                      offset: Offset(0, 1),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: Icon(
                        Icons.view_agenda_outlined,
                        size: 20,
                        color: !_isGridView
                            ? StitchTokens.wine
                            : AppColors.muted,
                      ),
                      tooltip: 'Xem dạng danh sách',
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      constraints: const BoxConstraints(),
                      onPressed: () => setState(() => _isGridView = false),
                    ),
                    Container(
                      width: 1,
                      height: 20,
                      color: const Color(0xFFEDE4D8),
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.grid_view_rounded,
                        size: 20,
                        color: _isGridView
                            ? StitchTokens.wine
                            : AppColors.muted,
                      ),
                      tooltip: 'Xem dạng lưới (Grid)',
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      constraints: const BoxConstraints(),
                      onPressed: () => setState(() => _isGridView = true),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),

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
          else if (totalItemsCount == 0)
            StatePanel(
              wine: true,
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Chưa có cuộc trò chuyện nào',
              message: 'Mở trang chi tiết một cuốn sách và bấm "Thương lượng & Mua" để trao đổi trực tiếp với người bán.',
              actionLabel: 'Tìm sách trên kệ',
              onAction: () => context.go('/search'),
            )
          else if (_isGridView) ...[
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: filteredConvs.length + filteredExchanges.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.05,
              ),
              itemBuilder: (context, index) {
                if (index < filteredConvs.length) {
                  return _buildConversationGridCard(
                    filteredConvs[index],
                    userId,
                  );
                } else {
                  final exIndex = index - filteredConvs.length;
                  return _buildExchangeGridCard(
                    filteredExchanges[exIndex],
                    userId,
                  );
                }
              },
            ),
          ] else ...[
            ...filteredConvs.map(
              (conv) => _buildConversationCard(conv, userId),
            ),
            ...filteredExchanges.map((ex) => _buildExchangeCard(ex, userId)),
          ],
        ],
      ),
    );
  }

  /// Renders a rich Shopee-style conversation card with real book cover,
  /// partner display name, role tag, timestamp, and status snippets.
  Widget _buildConversationCard(
    Map<String, dynamic> conv,
    String? currentUserId,
  ) {
    final id = (conv['id'] ?? '').toString();
    final listingId =
        (conv['listingId'] ??
                (conv['listing'] is Map ? (conv['listing'] as Map)['id'] : ''))
            ?.toString() ??
        '';
    final cachedListing =
        _listingCache[listingId] ??
        (conv['listing'] is Map
            ? Map<String, dynamic>.from(conv['listing'] as Map)
            : null);

    // Book title and author
    final bookTitle =
        cachedListing?['bundle']?['title']?.toString() ??
        cachedListing?['book']?['title']?.toString() ??
        cachedListing?['title']?.toString() ??
        conv['bookTitle']?.toString() ??
        'Ấn bản sách cũ';

    final author = cachedListing?['book']?['authors'] is List
        ? (cachedListing!['book']['authors'] as List).join(' · ')
        : (cachedListing?['author']?.toString() ?? '');

    // Buyer / Seller Identity
    final buyerObj = conv['buyer'] is Map
        ? Map<String, dynamic>.from(conv['buyer'] as Map)
        : const <String, dynamic>{};
    final sellerObj = conv['seller'] is Map
        ? Map<String, dynamic>.from(conv['seller'] as Map)
        : const <String, dynamic>{};
    final buyerId = (buyerObj['id'] ?? conv['buyerId'] ?? '').toString();
    final isBuyer = currentUserId != null && buyerId == currentUserId;
    final partner = isBuyer ? sellerObj : buyerObj;
    final partnerName =
        (partner['displayName'] ?? (isBuyer ? 'Người bán' : 'Người mua'))
            .toString();
    final partnerInitial = partnerName.isNotEmpty
        ? partnerName[0].toUpperCase()
        : (isBuyer ? 'B' : 'M');

    // Terms, proposals & status
    final terms = conv['terms'] is Map
        ? Map<String, dynamic>.from(conv['terms'] as Map)
        : const <String, dynamic>{};
    final proposal = terms['pendingProposal'] is Map
        ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
        : null;
    final isActionNeeded =
        proposal != null &&
        proposal['proposedById']?.toString() != currentUserId;
    final isWaitingPartner =
        proposal != null &&
        proposal['proposedById']?.toString() == currentUserId;
    final agreedPrice = terms['agreedPrice'] is num
        ? (terms['agreedPrice'] as num)
        : null;
    final isExchange = terms['mode'] == 'Exchange';
    final status = (conv['status'] ?? 'Active').toString();
    final orderId = conv['orderId']?.toString();
    final createdAt = conv['createdAt'] ?? conv['updatedAt'];

    // Status Snippet calculation matching React Native and Web
    String snippet;
    bool snippetHighlight = false;
    if (isActionNeeded) {
      final amount = proposal['amount'] is num
          ? (proposal['amount'] as num)
          : null;
      snippet = amount != null
          ? '⚡ Đối tác đề nghị giá ${formatVnd(amount)} — Cần bạn phản hồi'
          : '⚡ Đối tác đề xuất đổi sách — Cần bạn phản hồi';
      snippetHighlight = true;
    } else if (isWaitingPartner) {
      snippet = 'Đang chờ đối tác phản hồi đề nghị của bạn…';
    } else if (orderId != null || status == 'OrderCreated') {
      snippet = isBuyer
          ? '📦 Người bán đã tạo đơn — Chạm để xem và thanh toán'
          : '📦 Bạn đã tạo đơn — Chờ người mua thanh toán';
      snippetHighlight = true;
    } else if (agreedPrice != null) {
      snippet = '🤝 Đã thống nhất giá: ${formatVnd(agreedPrice)}';
    } else if (isExchange) {
      snippet = '🔄 Đang thương lượng trao đổi sách';
    } else {
      snippet = '💬 Đang trao đổi về tình trạng sách và giá';
    }

    // Status Badge Info
    final (statusLabel, statusColor, statusBg) = switch (status) {
      'OrderCreated' => (
        'ĐÃ TẠO ĐƠN',
        AppColors.forest,
        AppColors.successSurface,
      ),
      'Active' => (
        isActionNeeded ? 'CẦN PHẢN HỒI' : 'ĐANG THƯƠNG LƯỢNG',
        isActionNeeded ? StitchTokens.wine : StitchTokens.darkWood,
        isActionNeeded ? StitchTokens.roseParchment : StitchTokens.parchment,
      ),
      'Expired' => ('HẾT HẠN', AppColors.muted, StitchTokens.parchment),
      'Cancelled' => ('ĐÃ ĐÓNG', AppColors.muted, StitchTokens.parchment),
      _ => (status, StitchTokens.wine, StitchTokens.roseParchment),
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: InkWell(
        onTap: () => context.push('/conversation?id=$id'),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isActionNeeded
                  ? StitchTokens.wine
                  : StitchTokens.cardBorder,
              width: isActionNeeded ? 1.6 : 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(
                  alpha: isActionNeeded ? 0.06 : 0.02,
                ),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Row: Partner Identity + Role Badge + Time
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                child: Row(
                  children: [
                    // Partner Avatar
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: StitchTokens.roseParchment,
                          child: AppText(
                            partnerInitial,
                            kind: AppTextKind.bold,
                            color: StitchTokens.wine,
                          ),
                        ),
                        if (isActionNeeded)
                          Positioned(
                            right: -2,
                            top: -2,
                            child: Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: StitchTokens.wine,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: Colors.white,
                                  width: 1.5,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Row(
                        children: [
                          Flexible(
                            child: AppText(
                              partnerName,
                              kind: AppTextKind.bold,
                              color: StitchTokens.darkWood,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: isBuyer
                                  ? StitchTokens.roseParchment
                                  : AppColors.successSurface,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: AppText(
                              isBuyer ? 'Người bán' : 'Người mua',
                              kind: AppTextKind.label,
                              color: isBuyer
                                  ? StitchTokens.wine
                                  : AppColors.forest,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    AppText(
                      _formatTimeVi(createdAt),
                      kind: AppTextKind.small,
                      color: AppColors.muted,
                    ),
                  ],
                ),
              ),

              const Divider(
                height: 1,
                thickness: 0.6,
                color: StitchTokens.cardBorder,
              ),

              // Middle: Book Identity (Shopee Chat style)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Row(
                  children: [
                    // Mini Book Cover
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 44,
                        height: 58,
                        color: StitchTokens.parchment,
                        child: BookCoverPhoto(
                          item:
                              cachedListing ??
                              {'id': listingId, 'title': bookTitle},
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
                            bookTitle,
                            kind: AppTextKind.bold,
                            color: StitchTokens.darkWood,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (author.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            AppText(
                              author,
                              kind: AppTextKind.small,
                              color: AppColors.muted,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 1.5,
                                ),
                                decoration: BoxDecoration(
                                  color: StitchTokens.parchment,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: AppText(
                                  isExchange ? 'Đổi sách' : 'Mua bán',
                                  kind: AppTextKind.label,
                                  color: StitchTokens.wine,
                                ),
                              ),
                              if (agreedPrice != null) ...[
                                const SizedBox(width: 8),
                                AppText(
                                  formatVnd(agreedPrice),
                                  kind: AppTextKind.bold,
                                  color: AppColors.forest,
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: StitchTokens.wine,
                      size: 22,
                    ),
                  ],
                ),
              ),

              // Bottom Snippet Bar
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: isActionNeeded
                      ? StitchTokens.wine.withValues(alpha: 0.05)
                      : StitchTokens.warmIvory,
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(15),
                    bottomRight: Radius.circular(15),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: AppText(
                        snippet,
                        kind: AppTextKind.small,
                        color: snippetHighlight
                            ? StitchTokens.wine
                            : AppColors.ink,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontWeight: snippetHighlight
                              ? FontWeight.w700
                              : FontWeight.w400,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: statusBg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: AppText(
                        statusLabel,
                        kind: AppTextKind.label,
                        color: statusColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Renders a standalone book exchange card from `/me/exchanges` matching web & RN
  Widget _buildExchangeCard(Map<String, dynamic> ex, String? currentUserId) {
    final id = (ex['id'] ?? '').toString();
    final isInitiator = ex['initiatorId']?.toString() == currentUserId;
    final targetListingId = isInitiator
        ? (ex['recipientListingId'] ?? ex['listingId'])?.toString() ?? ''
        : (ex['initiatorListingIds'] is List &&
                  (ex['initiatorListingIds'] as List).isNotEmpty
              ? ex['initiatorListingIds'][0].toString()
              : (ex['initiatorListingId'] ?? '').toString());

    final cachedListing = _listingCache[targetListingId];
    final bookTitle =
        cachedListing?['bundle']?['title']?.toString() ??
        cachedListing?['book']?['title']?.toString() ??
        cachedListing?['title']?.toString() ??
        'Yêu cầu trao đổi sách';

    final status = (ex['status'] ?? 'Proposed').toString();
    final statusLabel = switch (status) {
      'Proposed' => 'Đã gửi đề xuất',
      'Accepted' => 'Đã chấp thuận',
      'InspectionPending' => 'Chờ kiểm định',
      'Completed' => 'Hoàn tất',
      'Cancelled' => 'Đã hủy',
      _ => status,
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: InkWell(
        onTap: () => context.push('/exchange?id=$id'),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: StitchTokens.cardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: StitchTokens.parchment,
                      child: const Icon(
                        Icons.swap_horiz_rounded,
                        color: StitchTokens.wine,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Row(
                        children: [
                          AppText(
                            isInitiator
                                ? 'Bạn đề xuất đổi'
                                : 'Đối tác đề xuất đổi',
                            kind: AppTextKind.bold,
                            color: StitchTokens.darkWood,
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: StitchTokens.parchment,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const AppText(
                              'Đổi sách',
                              kind: AppTextKind.label,
                              color: StitchTokens.wine,
                            ),
                          ),
                        ],
                      ),
                    ),
                    AppText(
                      _formatTimeVi(ex['createdAt']),
                      kind: AppTextKind.small,
                      color: AppColors.muted,
                    ),
                  ],
                ),
              ),
              const Divider(
                height: 1,
                thickness: 0.6,
                color: StitchTokens.cardBorder,
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 44,
                        height: 58,
                        color: StitchTokens.parchment,
                        child: BookCoverPhoto(
                          item:
                              cachedListing ??
                              {'id': targetListingId, 'title': bookTitle},
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
                            bookTitle,
                            kind: AppTextKind.bold,
                            color: StitchTokens.darkWood,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          const AppText(
                            'Giao dịch trao đổi sách trực tiếp hoặc qua trạm',
                            kind: AppTextKind.small,
                            color: AppColors.muted,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: StitchTokens.wine,
                      size: 22,
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: const BoxDecoration(
                  color: StitchTokens.warmIvory,
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(15),
                    bottomRight: Radius.circular(15),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const AppText(
                      '🔄 Mở chi tiết phiếu trao đổi & trò chuyện',
                      kind: AppTextKind.small,
                      color: AppColors.ink,
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: StitchTokens.roseParchment,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: AppText(
                        statusLabel,
                        kind: AppTextKind.label,
                        color: StitchTokens.wine,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Renders a compact, aesthetic 2-column Grid Card for Conversations
  Widget _buildConversationGridCard(
    Map<String, dynamic> conv,
    String? currentUserId,
  ) {
    final id = (conv['id'] ?? '').toString();
    final listingId =
        (conv['listingId'] ??
                (conv['listing'] is Map ? (conv['listing'] as Map)['id'] : ''))
            ?.toString() ??
        '';
    final cachedListing =
        _listingCache[listingId] ??
        (conv['listing'] is Map
            ? Map<String, dynamic>.from(conv['listing'] as Map)
            : null);

    final bookTitle =
        cachedListing?['bundle']?['title']?.toString() ??
        cachedListing?['book']?['title']?.toString() ??
        cachedListing?['title']?.toString() ??
        conv['bookTitle']?.toString() ??
        'Ấn bản sách cũ';

    final author = cachedListing?['book']?['authors'] is List
        ? (cachedListing!['book']['authors'] as List).join(' · ')
        : (cachedListing?['author']?.toString() ?? '');

    final buyerObj = conv['buyer'] is Map
        ? Map<String, dynamic>.from(conv['buyer'] as Map)
        : const <String, dynamic>{};
    final sellerObj = conv['seller'] is Map
        ? Map<String, dynamic>.from(conv['seller'] as Map)
        : const <String, dynamic>{};
    final buyerId = (buyerObj['id'] ?? conv['buyerId'] ?? '').toString();
    final isBuyer = currentUserId != null && buyerId == currentUserId;
    final partner = isBuyer ? sellerObj : buyerObj;
    final partnerName =
        (partner['displayName'] ?? (isBuyer ? 'Người bán' : 'Người mua'))
            .toString();
    final partnerInitial = partnerName.isNotEmpty
        ? partnerName[0].toUpperCase()
        : (isBuyer ? 'B' : 'M');

    final terms = conv['terms'] is Map
        ? Map<String, dynamic>.from(conv['terms'] as Map)
        : const <String, dynamic>{};
    final proposal = terms['pendingProposal'] is Map
        ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
        : null;
    final isActionNeeded =
        proposal != null &&
        proposal['proposedById']?.toString() != currentUserId;
    final agreedPrice = terms['agreedPrice'] is num
        ? (terms['agreedPrice'] as num)
        : null;
    final isExchange = terms['mode'] == 'Exchange';

    final statusBg = isActionNeeded
        ? const Color(0xFFFBEAE8)
        : StitchTokens.warmIvory;
    final statusColor = isActionNeeded
        ? const Color(0xFFB42318)
        : StitchTokens.wine;
    final statusLabel = isActionNeeded
        ? 'CẦN PHẢN HỒI'
        : (agreedPrice != null ? 'ĐÃ CHỐT GIÁ' : 'THƯƠNG LƯỢNG');

    return InkWell(
      onTap: () => context.push('/conversation?id=$id'),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isActionNeeded ? StitchTokens.wine : StitchTokens.cardBorder,
            width: isActionNeeded ? 1.5 : 1.0,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(
                alpha: isActionNeeded ? 0.06 : 0.02,
              ),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top: Partner row
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 12,
                    backgroundColor: StitchTokens.roseParchment,
                    child: Text(
                      partnerInitial,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: StitchTokens.wine,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      partnerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: StitchTokens.darkWood,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: isBuyer
                          ? StitchTokens.roseParchment
                          : AppColors.successSurface,
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text(
                      isBuyer ? 'Bán' : 'Mua',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: isBuyer ? StitchTokens.wine : AppColors.forest,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFEDE4D8)),

            // Middle: Book Cover + Details
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: Container(
                        width: 40,
                        height: 52,
                        color: StitchTokens.parchment,
                        child: BookCoverPhoto(
                          item:
                              cachedListing ??
                              {'id': listingId, 'title': bookTitle},
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            bookTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: StitchTokens.darkWood,
                            ),
                          ),
                          if (author.isNotEmpty) ...[
                            const SizedBox(height: 1),
                            Text(
                              author,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          if (agreedPrice != null)
                            Text(
                              formatVnd(agreedPrice),
                              style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                color: StitchTokens.wine,
                              ),
                            )
                          else
                            Text(
                              isExchange ? 'Đổi sách' : 'Mua bán',
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.muted,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Status Tag
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: statusBg,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(13),
                  bottomRight: Radius.circular(13),
                ),
              ),
              child: Text(
                statusLabel,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: statusColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Renders a compact, aesthetic 2-column Grid Card for Exchanges
  Widget _buildExchangeGridCard(
    Map<String, dynamic> ex,
    String? currentUserId,
  ) {
    final id = (ex['id'] ?? '').toString();
    final isInitiator = ex['initiatorId']?.toString() == currentUserId;
    final targetListingId = isInitiator
        ? (ex['recipientListingId'] ?? ex['listingId'])?.toString() ?? ''
        : (ex['initiatorListingIds'] is List &&
                  (ex['initiatorListingIds'] as List).isNotEmpty
              ? ex['initiatorListingIds'][0].toString()
              : (ex['initiatorListingId'] ?? '').toString());

    final cachedListing = _listingCache[targetListingId];
    final bookTitle =
        cachedListing?['bundle']?['title']?.toString() ??
        cachedListing?['book']?['title']?.toString() ??
        cachedListing?['title']?.toString() ??
        'Yêu cầu trao đổi sách';

    final status = (ex['status'] ?? 'Proposed').toString();
    final statusLabel = switch (status) {
      'Proposed' => 'ĐÃ ĐỀ XUẤT',
      'Accepted' => 'ĐÃ ĐỒNG Ý',
      'InspectionPending' => 'KIỂM ĐỊNH',
      'Completed' => 'HOÀN TẤT',
      'Cancelled' => 'ĐÃ HỦY',
      _ => status.toUpperCase(),
    };

    return InkWell(
      onTap: () => context.push('/exchange?id=$id'),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: StitchTokens.cardBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top: Exchange Badge
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 12,
                    backgroundColor: StitchTokens.parchment,
                    child: const Icon(
                      Icons.swap_horiz_rounded,
                      color: StitchTokens.wine,
                      size: 14,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      isInitiator ? 'Bạn đề xuất' : 'Đối tác đề xuất',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: StitchTokens.darkWood,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFEDE4D8)),

            // Middle: Book Cover
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: Container(
                        width: 40,
                        height: 52,
                        color: StitchTokens.parchment,
                        child: BookCoverPhoto(
                          item:
                              cachedListing ??
                              {'id': targetListingId, 'title': bookTitle},
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            bookTitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: StitchTokens.darkWood,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Trao đổi sách',
                            style: TextStyle(
                              fontSize: 10,
                              color: StitchTokens.wine,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Status
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: const BoxDecoration(
                color: StitchTokens.warmIvory,
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(13),
                  bottomRight: Radius.circular(13),
                ),
              ),
              child: Text(
                statusLabel,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: StitchTokens.wine,
                ),
              ),
            ),
          ],
        ),
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
  int _activeTab = 0; // 0: Đơn sách (Thông tin sách + Thỏa thuận), 1: Chatbox
  String _transactionMode = 'Buy'; // 'Buy' | 'Exchange'
  bool _loading = true;
  bool _busy = false;
  bool _loadingInventory = false;
  bool _submittingExchange = false;
  bool _bookDossierExpanded = false; // Dropdown accordion for Thông tin sách
  bool _processExpanded = false;
  String? _error;
  String? _notice;
  Map<String, dynamic>? _conv;
  List<Map<String, dynamic>> _messages = const [];
  List<Map<String, dynamic>> _myExchangeBooks = const [];
  final Set<String> _selectedExchangeIds = <String>{};
  Map<String, dynamic>? _linkedExchange;

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

      final convMap = convData is Map
          ? Map<String, dynamic>.from(convData)
          : null;
      Map<String, dynamic>? linkedEx;
      if (convMap != null) {
        final lid =
            (convMap['listingId'] ??
                    (convMap['listing'] is Map
                        ? (convMap['listing'] as Map)['id']
                        : null))
                ?.toString();
        if (lid != null && lid.isNotEmpty) {
          if (!_listingCache.containsKey(lid)) {
            try {
              final lRes = await client.publicRequest(
                '/listings/$lid?bundleSupport=whole-v1',
              );
              if (lRes is Map) {
                _listingCache[lid] = Map<String, dynamic>.from(lRes);
              }
            } catch (_) {}
          }
          try {
            final exRes = await client
                .request('/me/exchanges')
                .catchError((_) => const []);
            final exList = exRes is List
                ? exRes
                : (exRes is Map && exRes['items'] is List
                      ? (exRes['items'] as List)
                      : const []);
            for (final item in exList) {
              if (item is Map) {
                final recId =
                    (item['recipientListingId'] ??
                            item['recipientListing']?['id'])
                        ?.toString();
                final initId =
                    (item['initiatorListingId'] ??
                            item['initiatorListing']?['id'])
                        ?.toString();
                if (recId == lid || initId == lid) {
                  linkedEx = Map<String, dynamic>.from(item);
                  break;
                }
              }
            }
          } catch (_) {}
        }
      }

      if (!mounted) return;
      setState(() {
        _conv = convMap;
        _messages = msgList
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        if (linkedEx != null) {
          _linkedExchange = linkedEx;
        }
        final terms = convMap?['terms'] is Map
            ? Map<String, dynamic>.from(convMap!['terms'] as Map)
            : const <String, dynamic>{};
        if (terms['mode'] == 'Exchange') {
          _transactionMode = 'Exchange';
        }
        _loading = false;
      });
      if (_transactionMode == 'Exchange' && _myExchangeBooks.isEmpty) {
        _loadMyExchangeInventory();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Map<String, dynamic> _normalizeExchangeBook(Map<String, dynamic> raw) {
    final currentRev = raw['currentRevision'] is Map
        ? raw['currentRevision'] as Map
        : null;
    final content = currentRev?['content'] is Map
        ? currentRev!['content'] as Map
        : (raw['content'] is Map ? raw['content'] as Map : null);

    final mode = (content?['mode'] ?? raw['mode'] ?? '').toString();
    final condition = (content?['condition'] ?? raw['condition'] ?? 'Good')
        .toString();
    final salePrice = (content?['salePrice'] ?? raw['salePrice'] ?? 0) as num;
    final exchangeValue =
        (content?['exchangeValue'] ?? raw['exchangeValue'] ?? salePrice) as num;
    final bundle = content?['bundle'] ?? raw['bundle'];
    final bookId = (content?['bookId'] ?? raw['bookId'])?.toString();
    final mediaIds = content?['mediaIds'] is List
        ? (content!['mediaIds'] as List)
        : (raw['mediaIds'] is List ? raw['mediaIds'] as List : const []);
    final photos = mediaIds.isNotEmpty
        ? mediaIds.map((m) => {'id': m.toString()}).toList()
        : (raw['photos'] ?? const []);

    final cachedBook = (bookId != null && _bookCache.containsKey(bookId))
        ? _bookCache[bookId]
        : null;
    final book =
        cachedBook ??
        (content?['book'] is Map
            ? Map<String, dynamic>.from(content!['book'] as Map)
            : (raw['book'] is Map
                  ? Map<String, dynamic>.from(raw['book'] as Map)
                  : null));

    final title =
        (bundle is Map &&
            bundle['title'] != null &&
            bundle['title'].toString().isNotEmpty)
        ? bundle['title'].toString()
        : (book?['title'] ??
                  raw['title'] ??
                  content?['title'] ??
                  'Sách của tôi')
              .toString();

    final authors =
        (book?['authors'] is List && (book!['authors'] as List).isNotEmpty)
        ? (book['authors'] as List).join(', ')
        : (book?['author'] ?? raw['author'] ?? '').toString();

    return {
      ...raw,
      'id': (raw['id'] ?? raw['_id'] ?? '').toString(),
      'version': raw['version'] ?? 1,
      'mode': mode,
      'condition': condition,
      'salePrice': salePrice,
      'exchangeValue': exchangeValue,
      'bundle': bundle,
      'bookId': bookId,
      'book': book,
      'title': title,
      'authors': authors,
      'photos': photos,
      'mediaIds': mediaIds,
    };
  }

  Future<void> _loadMyExchangeInventory() async {
    setState(() => _loadingInventory = true);
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/me/listings?channel=Marketplace&moderation=Approved&limit=20',
      );
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : (res is List ? res : const []);

      final rawList = list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      final normalized = rawList.map(_normalizeExchangeBook).toList();
      if (!mounted) return;
      setState(() {
        _myExchangeBooks = normalized;
        _loadingInventory = false;
      });

      // Background fetch book identities if missing in cache
      final missingBookIds = <String>{};
      for (final item in normalized) {
        final bId = item['bookId']?.toString();
        if (bId != null && bId.isNotEmpty && !_bookCache.containsKey(bId)) {
          missingBookIds.add(bId);
        }
      }
      if (missingBookIds.isNotEmpty) {
        for (final bId in missingBookIds) {
          try {
            final bookRes = await client.publicRequest('/catalog/books/$bId');
            if (bookRes is Map) {
              _bookCache[bId] = Map<String, dynamic>.from(bookRes);
            }
          } catch (_) {
            try {
              final own = await client.request('/me/catalog-requests/$bId');
              if (own is Map && own['currentRevision'] is Map) {
                final meta = (own['currentRevision'] as Map)['metadata'];
                if (meta is Map) {
                  _bookCache[bId] = Map<String, dynamic>.from(meta);
                }
              }
            } catch (_) {}
          }
        }
        if (mounted) {
          setState(() {
            _myExchangeBooks = rawList.map(_normalizeExchangeBook).toList();
          });
        }
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingInventory = false);
    }
  }

  Future<void> _submitInlineExchange(String recipientListingId) async {
    if (_selectedExchangeIds.isEmpty) {
      setState(
        () => _error = 'Vui lòng chọn ít nhất 1 cuốn sách của bạn để đổi.',
      );
      return;
    }
    setState(() {
      _submittingExchange = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final ids = _selectedExchangeIds.toList();
      final res = await client.request(
        '/exchanges',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('ex-inline'),
        body: {
          'initiatorListingId': ids.first,
          'initiatorListingIds': ids,
          'recipientListingId': recipientListingId,
        },
      );
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};

      // Notify conversation chat
      try {
        await client.request(
          '/me/purchase-conversations/${widget.id}/messages',
          method: 'POST',
          idempotencyKey: generateIdempotencyKey('msg-ex-notify'),
          body: {
            'content':
                'Tôi đã gửi đề xuất đổi sách (${ids.length} cuốn). Mời bạn xem và phản hồi nhé!',
          },
        );
      } catch (_) {}

      await _loadConversation();
      if (!mounted) return;
      setState(() {
        _submittingExchange = false;
        _linkedExchange = map.isNotEmpty
            ? Map<String, dynamic>.from(map)
            : <String, dynamic>{'status': 'Pending'};
        _notice =
            'Đã gửi đề xuất đổi ${_selectedExchangeIds.length} cuốn sách thành công!';
        _selectedExchangeIds.clear();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submittingExchange = false;
        _error = presentErrorMessage(e);
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
    final listingId =
        (conv?['listingId'] ??
                (conv?['listing'] is Map
                    ? (conv!['listing'] as Map)['id']
                    : ''))
            ?.toString() ??
        '';
    final listing =
        _listingCache[listingId] ??
        (conv?['listing'] is Map
            ? Map<String, dynamic>.from(conv!['listing'] as Map)
            : const <String, dynamic>{});
    final terms = conv?['terms'] is Map
        ? Map<String, dynamic>.from(conv!['terms'] as Map)
        : const <String, dynamic>{};
    final pendingProposal = terms['pendingProposal'] is Map
        ? Map<String, dynamic>.from(terms['pendingProposal'] as Map)
        : null;
    final agreedPrice = terms['agreedPrice'] is num
        ? (terms['agreedPrice'] as num)
        : null;
    final listedPrice =
        (listing['salePrice'] ?? conv?['listedPrice'] ?? 50000) as num;
    final effectivePrice = agreedPrice ?? listedPrice;
    final isSeller =
        userId != null &&
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

                // Segmented 2 Tabs: "Đơn sách" vs "Chatbox"
                _buildDetailTabBar(
                  activeTab: _activeTab,
                  onTabChanged: (idx) => setState(() => _activeTab = idx),
                  hasPendingProposal: pendingProposal != null,
                  messageCount: _messages.length,
                ),

                LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth >= 880;
                    final bookCard = _buildBookDossierCard(
                      listing: listing,
                      listedPrice: listedPrice,
                      agreedPrice: agreedPrice,
                      effectivePrice: effectivePrice,
                    );
                    final orderId = (conv['orderId'] ?? '').toString();
                    final agreementCard = _buildAgreementDossierCard(
                      shortCode: shortCode,
                      isSeller: isSeller,
                      agreedPrice: agreedPrice,
                      effectivePrice: effectivePrice,
                      pendingProposal: pendingProposal,
                      userId: userId,
                      listingId: (listing['id'] ?? conv['listingId'] ?? '')
                          .toString(),
                      orderId: orderId,
                    );
                    final chatCard = _buildChatPanelCard(
                      isSeller: isSeller,
                      userId: userId,
                    );

                    final dossierWorkspace = orderId.isNotEmpty
                        ? OrderDetailsDossier(
                            orderId: orderId,
                            embedded: true,
                            onOrderChanged: _loadConversation,
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              bookCard,
                              const SizedBox(height: AppSpace.md),
                              agreementCard,
                            ],
                          );

                    if (isWide) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(flex: 5, child: dossierWorkspace),
                          const SizedBox(width: AppSpace.md),
                          Expanded(flex: 5, child: chatCard),
                        ],
                      );
                    }

                    // Mobile View: Switch between 2 tabs (Tab 0: Đơn sách, Tab 1: Chatbox)
                    if (_activeTab == 0) {
                      return dossierWorkspace;
                    } else {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildCompactBookBar(
                            listing: listing,
                            effectivePrice: effectivePrice,
                            agreedPrice: agreedPrice,
                            orderId: orderId,
                          ),
                          chatCard,
                        ],
                      );
                    }
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
    final title =
        (listing['bundle']?['title'] ??
                listing['book']?['title'] ??
                listing['title'] ??
                'Ấn bản sách cũ')
            .toString();
    final author =
        (listing['book']?['authors'] is List
                ? (listing['book']['authors'] as List).join(' · ')
                : (listing['author'] ?? 'Tác giả Lật Lại'))
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
          // Wine Header matching `.cardHeader` with interactive dropdown toggle
          InkWell(
            onTap: () =>
                setState(() => _bookDossierExpanded = !_bookDossierExpanded),
            child: Container(
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const AppText(
                          'Thông tin sách',
                          kind: AppTextKind.bold,
                          color: Colors.white,
                        ),
                        AppText(
                          _bookDossierExpanded
                              ? 'Chi tiết ấn bản và thanh toán'
                              : '$title · ${formatVnd(effectivePrice)}',
                          kind: AppTextKind.small,
                          color: StitchTokens.goldLight,
                          style: const TextStyle(fontSize: 11),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _bookDossierExpanded ? 'Thu gọn' : 'Chi tiết',
                          style: const TextStyle(
                            fontSize: 11,
                            color: StitchTokens.goldLight,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          _bookDossierExpanded
                              ? Icons.keyboard_arrow_up_rounded
                              : Icons.keyboard_arrow_down_rounded,
                          color: StitchTokens.goldLight,
                          size: 18,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            crossFadeState: _bookDossierExpanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 220),
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 68,
                          height: 92,
                          color: StitchTokens.parchment,
                          child: BookCoverPhoto(
                            item: listing.isNotEmpty
                                ? listing
                                : {'id': listingId, 'title': title},
                            fit: BoxFit.cover,
                          ),
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
                                onTap: () =>
                                    context.push('/book?id=$listingId'),
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
                                agreedPrice != null
                                    ? 'THƯƠNG LƯỢNG'
                                    : 'NIÊM YẾT',
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
    String orderId = '',
  }) {
    final proposalAmount = pendingProposal?['amount'] is num
        ? (pendingProposal!['amount'] as num)
        : null;
    final proposedByPartner =
        pendingProposal != null &&
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
                    orderId.isNotEmpty
                        ? 'Đã tạo đơn'
                        : agreedPrice != null
                        ? 'Đã chốt giá'
                        : 'Đang thương lượng',
                    kind: AppTextKind.label,
                    color: (orderId.isNotEmpty || agreedPrice != null)
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
                const AppText('Hình thức giao dịch:', kind: AppTextKind.bold),
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
                        child: InkWell(
                          onTap: () {
                            if (_transactionMode != 'Buy') {
                              setState(() => _transactionMode = 'Buy');
                            }
                          },
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: _transactionMode == 'Buy'
                                  ? Colors.white
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                              boxShadow: _transactionMode == 'Buy'
                                  ? [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                          alpha: 0.05,
                                        ),
                                        blurRadius: 4,
                                        offset: const Offset(0, 1),
                                      ),
                                    ]
                                  : null,
                            ),
                            child: AppText(
                              _transactionMode == 'Buy'
                                  ? '✓ Thương lượng mua'
                                  : 'Thương lượng mua',
                              kind: AppTextKind.bold,
                              color: _transactionMode == 'Buy'
                                  ? StitchTokens.wine
                                  : AppColors.muted,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: InkWell(
                          onTap: () {
                            if (_transactionMode != 'Exchange') {
                              setState(() => _transactionMode = 'Exchange');
                              if (_myExchangeBooks.isEmpty &&
                                  !_loadingInventory) {
                                _loadMyExchangeInventory();
                              }
                            }
                          },
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: _transactionMode == 'Exchange'
                                  ? Colors.white
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(8),
                              boxShadow: _transactionMode == 'Exchange'
                                  ? [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                          alpha: 0.05,
                                        ),
                                        blurRadius: 4,
                                        offset: const Offset(0, 1),
                                      ),
                                    ]
                                  : null,
                            ),
                            child: AppText(
                              _transactionMode == 'Exchange'
                                  ? '✓ Đổi sách'
                                  : 'Đổi sách',
                              kind: AppTextKind.bold,
                              color: _transactionMode == 'Exchange'
                                  ? StitchTokens.wine
                                  : AppColors.muted,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Inline Exchange Mode
                if (_transactionMode == 'Exchange') ...[
                  _buildInlineExchangeSection(listingId),
                ] else ...[
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
                              () =>
                                  _error = 'Giá đề nghị cần tối thiểu 5.000 ₫.',
                            );
                          }
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Order created banner or Seller Create Order CTA / Buyer status banner
                  if (orderId.isNotEmpty) ...[
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
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: AppText(
                                  'Đơn hàng đã được tạo (#${orderId.length >= 8 ? orderId.substring(0, 8).toUpperCase() : orderId})',
                                  kind: AppTextKind.bold,
                                  color: const Color(0xFF166534),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          AppText(
                            isSeller
                                ? 'Bạn đã tạo đơn hàng thành công. Mở đơn để theo dõi trạng thái thanh toán và đóng gói giao hàng.'
                                : 'Người bán đã tạo đơn trực tiếp cho bạn. Vui lòng mở đơn để thanh toán qua Quỹ ký quỹ Lật Lại Escrow.',
                            kind: AppTextKind.small,
                            color: const Color(0xFF15803D),
                          ),
                          const SizedBox(height: 10),
                          AppButton(
                            title: isSeller
                                ? 'Xem tiến độ đơn hàng'
                                : 'Xem & Thanh toán đơn hàng',
                            wine: true,
                            icon: Icons.receipt_long_rounded,
                            onPressed: () =>
                                context.push('/orders?focus=$orderId'),
                          ),
                        ],
                      ),
                    ),
                  ] else if (isSeller) ...[
                    AppButton(
                      title:
                          'Tạo đơn cho người mua này (${formatVnd(effectivePrice)})',
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
                        onPressed: () => context.push('/drafts?id=$listingId'),
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
                            const Expanded(
                              child: AppText(
                                'Quy trình giao dịch trên Lật Lại',
                                kind: AppTextKind.bold,
                              ),
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
                          color: const Color(0xFF1F7A3E)
                              .withValues(alpha: 0.12),
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

  /// Inline Exchange Composer integrated directly inside the dossier card
  Widget _buildInlineExchangeSection(String listingId) {
    num totalExchangeValue = 0;
    for (final b in _myExchangeBooks) {
      final bid = (b['id'] ?? '').toString();
      if (_selectedExchangeIds.contains(bid)) {
        final val = (b['exchangeValue'] ?? b['salePrice'] ?? 0);
        if (val is num) totalExchangeValue += val;
      }
    }

    final linkedId =
        (_linkedExchange?['id'] ?? _linkedExchange?['entityId'] ?? '')
            .toString();
    final linkedStatus = (_linkedExchange?['status'] ?? 'Pending').toString();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_linkedExchange != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF86EFAC)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.swap_horizontal_circle_rounded,
                      color: Color(0xFF16A34A),
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: AppText(
                        'Đề xuất đổi sách (#${linkedId.length >= 8 ? linkedId.substring(0, 8).toUpperCase() : (linkedId.isNotEmpty ? linkedId : "LL-EX")})',
                        kind: AppTextKind.bold,
                        color: const Color(0xFF166534),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDCFCE7),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: AppText(
                        linkedStatus == 'Pending'
                            ? 'Chờ phản hồi'
                            : linkedStatus == 'Accepted'
                            ? 'Đã chấp nhận'
                            : linkedStatus,
                        kind: AppTextKind.label,
                        color: const Color(0xFF15803D),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                AppButton(
                  title: 'Xem chi tiết đơn đổi sách',
                  wine: true,
                  compact: true,
                  icon: Icons.open_in_new_rounded,
                  onPressed: () => context.push(
                    linkedId.isNotEmpty
                        ? '/exchange?id=$linkedId'
                        : '/exchanges',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Header matching user's screenshot
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: StitchTokens.roseParchment,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.swap_horiz_rounded,
                color: StitchTokens.wine,
                size: 18,
              ),
            ),
            const SizedBox(width: 8),
            const Expanded(
              child: AppText(
                'Soạn đề nghị đổi sách',
                kind: AppTextKind.bold,
                color: StitchTokens.wine,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        const AppText(
          'Chọn sách đã được duyệt trên kệ của bạn để đề nghị hoán đổi:',
          kind: AppTextKind.small,
          color: AppColors.muted,
        ),
        const SizedBox(height: 10),

        if (_loadingInventory)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: Column(
                children: [
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: StitchTokens.wine,
                    ),
                  ),
                  SizedBox(height: 8),
                  AppText('Đang tải tủ sách của bạn…', kind: AppTextKind.small),
                ],
              ),
            ),
          )
        else if (_myExchangeBooks.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: StitchTokens.parchment,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: StitchTokens.cardBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppText(
                  'Bạn chưa có sách đang bán/đổi trên kệ',
                  kind: AppTextKind.bold,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                const AppText(
                  'Hãy đăng ít nhất một cuốn sách lên kệ và được duyệt để bắt đầu hoán đổi.',
                  kind: AppTextKind.small,
                  color: AppColors.muted,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                AppButton(
                  title: 'Đăng sách mới lên kệ',
                  wine: true,
                  compact: true,
                  icon: Icons.add_rounded,
                  onPressed: () => context.push('/drafts'),
                ),
              ],
            ),
          )
        else ...[
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: StitchTokens.cardBorder),
            ),
            child: ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _myExchangeBooks.length,
              separatorBuilder: (context, index) =>
                  const Divider(height: 1, color: StitchTokens.cardBorder),
              itemBuilder: (context, idx) {
                final book = _myExchangeBooks[idx];
                final id = (book['id'] ?? '').toString();
                final checked = _selectedExchangeIds.contains(id);
                final title = (book['title'] ?? 'Sách của tôi').toString();
                final authors = (book['authors'] ?? '').toString();
                final exchangeValue =
                    (book['exchangeValue'] ?? book['salePrice'] ?? 0) as num;

                return InkWell(
                  onTap: () {
                    setState(() {
                      if (checked) {
                        _selectedExchangeIds.remove(id);
                      } else {
                        _selectedExchangeIds.add(id);
                      }
                    });
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        // Book Cover Thumbnail using BookCoverPhoto
                        Container(
                          width: 44,
                          height: 60,
                          decoration: BoxDecoration(
                            color: StitchTokens.warmIvory,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: BookCoverPhoto(
                            item: book,
                            fit: BoxFit.cover,
                            isMine: true,
                          ),
                        ),
                        const SizedBox(width: 12),
                        // Title, Author and Valuation
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppText(
                                title,
                                kind: AppTextKind.bold,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (authors.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                AppText(
                                  authors,
                                  kind: AppTextKind.small,
                                  color: AppColors.muted,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 11),
                                ),
                              ],
                              const SizedBox(height: 3),
                              AppText(
                                'Định giá quy đổi: ${formatVnd(exchangeValue)}',
                                kind: AppTextKind.small,
                                color: StitchTokens.wineDark,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Checkbox
                        Checkbox(
                          value: checked,
                          activeColor: StitchTokens.wine,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(4),
                          ),
                          onChanged: (v) {
                            setState(() {
                              if (v == true) {
                                _selectedExchangeIds.add(id);
                              } else {
                                _selectedExchangeIds.remove(id);
                              }
                            });
                          },
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          // Total counter & CTA button
          if (_selectedExchangeIds.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: StitchTokens.parchment,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  AppText(
                    'Đã chọn: ${_selectedExchangeIds.length} cuốn',
                    kind: AppTextKind.bold,
                  ),
                  AppText(
                    'Tổng: ${formatVnd(totalExchangeValue)}',
                    kind: AppTextKind.bold,
                    color: StitchTokens.wine,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
          AppButton(
            title: 'Gửi đề xuất đổi ${_selectedExchangeIds.length} cuốn',
            wine: true,
            busy: _submittingExchange,
            onPressed: _selectedExchangeIds.isEmpty
                ? null
                : () => _submitInlineExchange(listingId),
          ),
        ],
      ],
    );
  }

  /// Segmented 2-Tab Switcher: "Đơn sách" vs "Chatbox"
  Widget _buildDetailTabBar({
    required int activeTab,
    required ValueChanged<int> onTabChanged,
    required bool hasPendingProposal,
    required int messageCount,
  }) {
    return Container(
      margin: const EdgeInsets.only(top: AppSpace.xs, bottom: AppSpace.md),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: StitchTokens.parchment,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: StitchTokens.cardBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildDetailTabButton(
              title: 'Đơn sách',
              icon: Icons.receipt_long_rounded,
              isSelected: activeTab == 0,
              badge: hasPendingProposal ? 'Cần xử lý' : null,
              badgeIsAlert: true,
              onTap: () => onTabChanged(0),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _buildDetailTabButton(
              title: 'Chatbox',
              icon: Icons.chat_bubble_outline_rounded,
              isSelected: activeTab == 1,
              badge: messageCount > 0 ? '$messageCount' : null,
              badgeIsAlert: false,
              onTap: () => onTabChanged(1),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailTabButton({
    required String title,
    required IconData icon,
    required bool isSelected,
    String? badge,
    bool badgeIsAlert = false,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 10),
        decoration: BoxDecoration(
          color: isSelected ? StitchTokens.wine : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: StitchTokens.wine.withValues(alpha: 0.22),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected ? StitchTokens.gold : StitchTokens.darkWood,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? Colors.white : StitchTokens.darkWood,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (badge != null) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 1.5,
                ),
                decoration: BoxDecoration(
                  color: isSelected
                      ? (badgeIsAlert
                            ? const Color(0xFFFF5252)
                            : StitchTokens.gold.withValues(alpha: 0.28))
                      : (badgeIsAlert ? const Color(0xFFFFEBEE) : Colors.white),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected
                        ? Colors.transparent
                        : (badgeIsAlert
                              ? const Color(0xFFEF9A9A)
                              : StitchTokens.cardBorder),
                  ),
                ),
                child: Text(
                  badge,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: isSelected
                        ? (badgeIsAlert ? Colors.white : StitchTokens.gold)
                        : (badgeIsAlert
                              ? const Color(0xFFC62828)
                              : StitchTokens.wine),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Compact Book Header shown at the top of Tab 2 (Chatbox)
  Widget _buildCompactBookBar({
    required Map<String, dynamic> listing,
    required num effectivePrice,
    required num? agreedPrice,
    String? orderId,
  }) {
    final title =
        (listing['bundle']?['title'] ??
                listing['book']?['title'] ??
                listing['title'] ??
                'Ấn bản sách cũ')
            .toString();
    final author =
        (listing['book']?['authors'] is List
                ? (listing['book']['authors'] as List).join(' · ')
                : (listing['author'] ?? 'Tác giả Lật Lại'))
            .toString();
    final coverUrl =
        (listing['coverImageUrl'] ??
                listing['book']?['coverUrl'] ??
                listing['coverUrl'] ??
                '')
            .toString();

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpace.md),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: StitchTokens.cardBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 44,
              height: 58,
              color: StitchTokens.parchment,
              child: coverUrl.isNotEmpty
                  ? Image.network(
                      coverUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.menu_book_rounded,
                        color: StitchTokens.wine,
                        size: 22,
                      ),
                    )
                  : const Icon(
                      Icons.menu_book_rounded,
                      color: StitchTokens.wine,
                      size: 22,
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
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                AppText(
                  author,
                  kind: AppTextKind.small,
                  color: AppColors.muted,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    AppText(
                      formatVnd(effectivePrice),
                      kind: AppTextKind.bold,
                      color: StitchTokens.wine,
                    ),
                    if (orderId != null && orderId.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1.5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: const Color(0xFF86EFAC)),
                        ),
                        child: Text(
                          'Đơn #${orderId.length >= 8 ? orderId.substring(0, 8).toUpperCase() : orderId}',
                          style: const TextStyle(
                            fontSize: 10,
                            color: Color(0xFF166534),
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ] else if (agreedPrice != null) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1.5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F5E9),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Đã chốt giá',
                          style: TextStyle(
                            fontSize: 10,
                            color: Color(0xFF1B5E20),
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => setState(() => _activeTab = 0),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: StitchTokens.parchment,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: StitchTokens.cardBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Text(
                    'Xem đơn',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: StitchTokens.wine,
                    ),
                  ),
                  SizedBox(width: 2),
                  Icon(
                    Icons.arrow_forward_ios_rounded,
                    size: 10,
                    color: StitchTokens.wine,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Card 3: Chat Panel (`ChatMessagesPanel`)
  Widget _buildChatPanelCard({required bool isSeller, String? userId}) {
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
                    const AppText(
                      'Hộp thoại thương lượng',
                      kind: AppTextKind.bold,
                    ),
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
              constraints: const BoxConstraints(minHeight: 240, maxHeight: 420),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _messages.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final m = _messages[index];
                  final isOwn =
                      userId != null && m['senderId']?.toString() == userId;
                  final text = (m['body'] ?? m['text'] ?? '').toString();

                  return Align(
                    alignment: isOwn
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 280),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: isOwn
                            ? StitchTokens.wine
                            : StitchTokens.parchment,
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(14),
                          topRight: const Radius.circular(14),
                          bottomLeft: Radius.circular(isOwn ? 14 : 2),
                          bottomRight: Radius.circular(isOwn ? 2 : 14),
                        ),
                        border: Border.all(
                          color: isOwn
                              ? Colors.transparent
                              : StitchTokens.cardBorder,
                        ),
                      ),
                      child: Text(
                        text,
                        style: TextStyle(
                          fontSize: 13,
                          color: isOwn ? Colors.white : StitchTokens.darkWood,
                        ),
                      ),
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
                style: IconButton.styleFrom(backgroundColor: StitchTokens.wine),
                onPressed: () {
                  final text = _msgCtrl.text.trim();
                  if (text.isEmpty) return;
                  setState(() {
                    _messages = [
                      ..._messages,
                      {'body': text, 'senderId': ?userId},
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
