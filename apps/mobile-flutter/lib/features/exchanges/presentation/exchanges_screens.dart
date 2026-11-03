import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// MyExchangesScreen (`/exchanges`) matching `apps/mobile-react-native/src/features/exchanges/my-exchanges-screen.tsx`
class MyExchangesScreen extends ConsumerStatefulWidget {
  const MyExchangesScreen({super.key});

  @override
  ConsumerState<MyExchangesScreen> createState() => _MyExchangesScreenState();
}

class _MyExchangesScreenState extends ConsumerState<MyExchangesScreen> {
  String _selectedTab = 'all';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];

  static const _tabs = [
    (id: 'all', label: 'Tất cả'),
    (id: 'Proposed', label: 'Chờ phản hồi'),
    (id: 'active', label: 'Đang giao dịch'),
    (id: 'history', label: 'Lịch sử'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadExchanges);
  }

  Future<void> _loadExchanges() async {
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
      final res = await client.request('/exchanges');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : (res is List ? res : const []);
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

  String _formatExchangeStatus(String status) {
    return switch (status) {
      'Proposed' => 'Chờ phản hồi',
      'AcceptedAwaitingFunding' => 'Chờ đặt cọc bảo chứng',
      'Preparing' => 'Đang chuẩn bị gửi sách',
      'InTransit' => 'Đang vận chuyển đôi bên',
      'Delivered' => 'Đã nhận · Chờ xác nhận kiểm tra',
      'Completed' => 'Hoàn tất trao đổi',
      'Disputed' => 'Đang khiếu nại / xử lý',
      'Cancelled' || 'Rejected' => 'Đã hủy / từ chối',
      _ => status,
    };
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _items.where((item) {
      final status = (item['status'] ?? item['state'] ?? 'Proposed').toString();
      if (_selectedTab == 'all') return true;
      if (_selectedTab == 'Proposed') return status == 'Proposed';
      if (_selectedTab == 'active') {
        return status == 'AcceptedAwaitingFunding' ||
            status == 'Preparing' ||
            status == 'InTransit' ||
            status == 'Delivered' ||
            status == 'Disputed';
      }
      return status == 'Completed' ||
          status == 'Cancelled' ||
          status == 'Rejected';
    }).toList();

    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'TRAO ĐỔI SÁCH'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Tài khoản',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/account'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Trao đổi sách của tôi',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
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
              title: 'Đang tải giao dịch trao đổi…',
            )
          else if (filtered.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.swap_horiz_rounded,
              title: 'Chưa có đề nghị trao đổi nào',
              message:
                  'Chọn một cuốn sách có gắn nhãn "Đổi" trên kệ để gửi đề nghị hoán đổi với sách của bạn.',
              actionLabel: 'Tìm sách để đổi',
              onAction: () => context.go('/search?mode=Both'),
            )
          else
            ...filtered.map((ex) {
              final id = (ex['id'] ?? '').toString();
              final shortId =
                  id.length >= 8 ? id.substring(0, 8).toUpperCase() : id;
              final status =
                  (ex['status'] ?? ex['state'] ?? 'Proposed').toString();
              final diffAmount =
                  (ex['diffAmount'] is num) ? (ex['diffAmount'] as num) : 0;

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
                          AppText('#$shortId', kind: AppTextKind.bold),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: StitchTokens.roseParchment,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: AppText(
                              _formatExchangeStatus(status),
                              kind: AppTextKind.label,
                              color: StitchTokens.wine,
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 20),
                      AppText(
                        diffAmount > 0
                            ? 'Chênh lệch bù thêm: ${formatVnd(diffAmount)}'
                            : 'Trao đổi ngang giá (0 ₫ chênh lệch)',
                        kind: AppTextKind.bold,
                        color: AppColors.forest,
                      ),
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerRight,
                        child: AppButton(
                          title: 'Xem chi tiết',
                          wine: true,
                          compact: true,
                          onPressed: () => context.push('/exchange?id=$id'),
                        ),
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
}

/// ExchangeDetailScreen (`/exchange`) matching `apps/mobile-react-native/src/features/exchanges/exchange-detail-screen.tsx`
/// Includes 2 segmented tabs (`Phiếu trao đổi` & `Trò chuyện`), mutual cancellation, funding, shipping, and dispute actions.
class ExchangeDetailScreen extends ConsumerStatefulWidget {
  const ExchangeDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<ExchangeDetailScreen> createState() =>
      _ExchangeDetailScreenState();
}

class _ExchangeDetailScreenState extends ConsumerState<ExchangeDetailScreen> {
  String _tab = 'sheet';
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;
  Map<String, dynamic>? _exchange;
  List<Map<String, dynamic>> _messages = const [];
  final TextEditingController _msgCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadExchange);
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadExchange() async {
    if (widget.id.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Mã giao dịch trao đổi không hợp lệ.';
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
        client.request('/exchanges/${widget.id}'),
        client
            .request('/exchanges/${widget.id}/messages')
            .catchError((_) => const {}),
      ]);
      final exData = results[0];
      final msgData = results[1];
      final msgList = (msgData is Map && msgData['items'] is List)
          ? (msgData['items'] as List)
          : (msgData is List ? msgData : const []);
      if (!mounted) return;
      setState(() {
        _exchange = exData is Map ? Map<String, dynamic>.from(exData) : null;
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

  Future<void> _performAction(
    String endpointSuffix, {
    Map<String, dynamic>? extraBody,
  }) async {
    if (_exchange == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final version = (_exchange!['version'] is num)
          ? (_exchange!['version'] as num).toInt()
          : 1;
      await client.request(
        '/exchanges/${widget.id}/$endpointSuffix',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('ex-$endpointSuffix'),
        body: {
          'expectedVersion': version,
          'revision': version,
          ...?extraBody,
        },
      );
      await _loadExchange();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã thực hiện thao tác trao đổi thành công.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _sendMessage() async {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/exchanges/${widget.id}/messages',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('ex-msg'),
        body: {'body': text},
      );
      _msgCtrl.clear();
      await _loadExchange();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = presentErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final ex = _exchange;
    final status = (ex?['status'] ?? ex?['state'] ?? 'Proposed').toString();

    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'CHI TIẾT TRAO ĐỔI'),
      child: _loading
          ? const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải hồ sơ trao đổi…',
            )
          : ex == null
              ? StatePanel(
                  wine: true,
                  title: 'Không tìm thấy giao dịch trao đổi',
                  message: _error,
                  actionLabel: 'Về danh sách trao đổi',
                  onAction: () => context.go('/exchanges'),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    BackAction(
                      title: 'Trao đổi sách của tôi',
                      onPressed: () => context.canPop()
                          ? context.pop()
                          : context.go('/exchanges'),
                    ),
                    const SizedBox(height: AppSpace.sm),
                    Row(
                      children: [
                        AppChip(
                          title: 'Phiếu trao đổi',
                          wine: true,
                          selected: _tab == 'sheet',
                          onPressed: () => setState(() => _tab = 'sheet'),
                        ),
                        const SizedBox(width: AppSpace.sm),
                        AppChip(
                          title: 'Trò chuyện (${_messages.length})',
                          wine: true,
                          selected: _tab == 'chat',
                          onPressed: () => setState(() => _tab = 'chat'),
                        ),
                      ],
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
                    if (_tab == 'sheet')
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
                            AppText(
                              'Trạng thái hiện tại: $status',
                              kind: AppTextKind.heading,
                              color: StitchTokens.wine,
                            ),
                            const SizedBox(height: AppSpace.sm),
                            const AppText(
                              'Hai bên đặt cọc bảo chứng qua Ví Lật Lại và xác nhận khi nhận sách. Có thể đề nghị hủy đồng thuận (hoàn cọc 100%) trước khi hoàn tất.',
                              kind: AppTextKind.small,
                            ),
                            const Divider(height: AppSpace.xxl),
                            Wrap(
                              spacing: AppSpace.sm,
                              runSpacing: AppSpace.sm,
                              children: [
                                if (status == 'Proposed') ...[
                                  AppButton(
                                    title: 'Đồng ý đổi',
                                    wine: true,
                                    busy: _busy,
                                    onPressed: () => _performAction('accept'),
                                  ),
                                  AppButton(
                                    title: 'Từ chối',
                                    secondary: true,
                                    busy: _busy,
                                    onPressed: () => _performAction(
                                      'reject',
                                      extraBody: {
                                        'reason': 'Chưa phù hợp nhu cầu đổi sách'
                                      },
                                    ),
                                  ),
                                ],
                                if (status == 'AcceptedAwaitingFunding')
                                  AppButton(
                                    title: 'Đặt cọc bảo chứng ngay',
                                    wine: true,
                                    busy: _busy,
                                    onPressed: () => _performAction('funding'),
                                  ),
                                if (status == 'Preparing') ...[
                                  AppButton(
                                    title: '📦 Báo gửi sách & Nhập mã vận đơn',
                                    wine: true,
                                    busy: _busy,
                                    onPressed: () => _performAction(
                                      'ship',
                                      extraBody: {
                                        'method': 'direct',
                                        'meetupLocation': 'TP. Hồ Chí Minh',
                                      },
                                    ),
                                  ),
                                  AppButton(
                                    title: '🤝 Đề nghị / Đồng ý hủy (Hoàn cọc 100%)',
                                    secondary: true,
                                    busy: _busy,
                                    onPressed: () => _performAction('cancel'),
                                  ),
                                ],
                                if (status == 'InTransit')
                                  AppButton(
                                    title: 'Tôi đã nhận được sách an toàn',
                                    wine: true,
                                    busy: _busy,
                                    onPressed: () => _performAction('receive'),
                                  ),
                                if (status == 'Delivered')
                                  AppButton(
                                    title: 'Xác nhận đã kiểm tra',
                                    wine: true,
                                    busy: _busy,
                                    onPressed: () => _performAction('complete'),
                                  ),
                                if (status == 'InTransit' ||
                                    status == 'Delivered')
                                  AppButton(
                                    title: 'Báo cáo khiếu nại sách',
                                    secondary: true,
                                    busy: _busy,
                                    onPressed: () => _performAction(
                                      'dispute',
                                      extraBody: {
                                        'reason':
                                            'Sách nhận được cần kiểm tra lại với mô tả'
                                      },
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      )
                    else
                      Container(
                        padding: const EdgeInsets.all(AppSpace.lg),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: StitchTokens.cardBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const AppText(
                              'Hộp thoại trao đổi',
                              kind: AppTextKind.heading,
                              color: StitchTokens.wine,
                            ),
                            const SizedBox(height: AppSpace.md),
                            if (_messages.isEmpty)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 20),
                                child: AppText(
                                  'Chưa có tin nhắn trong phiếu trao đổi này.',
                                  kind: AppTextKind.small,
                                ),
                              )
                            else
                              ..._messages.map((m) {
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: StitchTokens.parchment,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: AppText(
                                      (m['body'] ?? '').toString(),
                                      kind: AppTextKind.small,
                                    ),
                                  ),
                                );
                              }),
                            const SizedBox(height: AppSpace.md),
                            Row(
                              children: [
                                Expanded(
                                  child: AppTextField(
                                    controller: _msgCtrl,
                                    placeholder:
                                        'Nhắn tin về việc đổi sách...',
                                  ),
                                ),
                                const SizedBox(width: 8),
                                AppButton(
                                  title: 'Gửi',
                                  wine: true,
                                  compact: true,
                                  onPressed: _sendMessage,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
    );
  }
}

/// ExchangeComposeScreen (`/exchange-compose`) matching `apps/mobile-react-native/src/features/exchanges/exchange-compose-screen.tsx`
class ExchangeComposeScreen extends ConsumerStatefulWidget {
  const ExchangeComposeScreen({super.key, required this.recipientListingId});

  final String recipientListingId;

  @override
  ConsumerState<ExchangeComposeScreen> createState() =>
      _ExchangeComposeScreenState();
}

class _ExchangeComposeScreenState extends ConsumerState<ExchangeComposeScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _myBooks = const [];
  final Set<String> _selectedIds = <String>{};
  final Map<String, Map<String, dynamic>> _bookCache = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadMyInventory);
  }

  Map<String, dynamic> _normalizeBook(Map<String, dynamic> raw) {
    final currentRev = raw['currentRevision'] is Map
        ? raw['currentRevision'] as Map
        : null;
    final content = currentRev?['content'] is Map
        ? currentRev!['content'] as Map
        : (raw['content'] is Map ? raw['content'] as Map : null);

    final mode = (content?['mode'] ?? raw['mode'] ?? '').toString();
    final condition =
        (content?['condition'] ?? raw['condition'] ?? 'Good').toString();
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
    final book = cachedBook ??
        (content?['book'] is Map
            ? Map<String, dynamic>.from(content!['book'] as Map)
            : (raw['book'] is Map
                ? Map<String, dynamic>.from(raw['book'] as Map)
                : null));

    final title = (bundle is Map &&
            bundle['title'] != null &&
            bundle['title'].toString().isNotEmpty)
        ? bundle['title'].toString()
        : (book?['title'] ??
                raw['title'] ??
                content?['title'] ??
                'Sách của tôi')
            .toString();

    final authors = (book?['authors'] is List &&
            (book!['authors'] as List).isNotEmpty)
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

  Future<void> _loadMyInventory() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client
          .request('/me/listings?channel=Marketplace&moderation=Approved&limit=20');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      final rawList = list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      final normalized = rawList.map(_normalizeBook).toList();
      if (!mounted) return;
      setState(() {
        _myBooks = normalized;
        _loading = false;
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
            _myBooks = rawList.map(_normalizeBook).toList();
          });
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = presentErrorMessage(e);
        _loading = false;
      });
    }
  }

  Future<void> _submitExchange() async {
    if (_selectedIds.isEmpty) {
      setState(() => _error = 'Vui lòng chọn ít nhất 1 cuốn sách của bạn để đổi.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final ids = _selectedIds.toList();
      final res = await client.request(
        '/exchanges',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('ex-create'),
        body: {
          'initiatorListingId': ids.first,
          'initiatorListingIds': ids,
          'recipientListingId': widget.recipientListingId,
        },
      );
      if (!mounted) return;
      setState(() => _submitting = false);
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      final id = (map['entityId'] ?? map['id'] ?? '').toString();
      if (id.isNotEmpty) {
        context.go('/exchange?id=$id');
      } else {
        context.go('/exchanges');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScreen(
      header: const TopNavbar(subtitle: 'SOẠN ĐỀ NGHỊ ĐỔI SÁCH'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Quay lại',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/exchanges'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Soạn đề nghị đổi sách',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          const AppText(
            'Chọn sách đã được duyệt trên kệ của bạn để đề nghị hoán đổi:',
            kind: AppTextKind.bold,
          ),
          const SizedBox(height: AppSpace.md),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải tủ sách của bạn…',
            )
          else if (_myBooks.isEmpty)
            StatePanel(
              wine: true,
              title: 'Bạn chưa có sách đang bán/đổi để đem hoán đổi',
              message:
                  'Hãy đăng ít nhất một cuốn sách lên kệ và được duyệt để bắt đầu trao đổi.',
              actionLabel: 'Mở kệ sách của tôi',
              onAction: () => context.push('/drafts'),
            )
          else ...[
            ..._myBooks.map((book) {
              final id = (book['id'] ?? '').toString();
              final checked = _selectedIds.contains(id);
              final title = (book['title'] ?? 'Sách của tôi').toString();
              final authors = (book['authors'] ?? '').toString();
              final exchangeValue =
                  (book['exchangeValue'] ?? book['salePrice'] ?? 0) as num;

              return CheckboxListTile(
                value: checked,
                activeColor: StitchTokens.wine,
                secondary: Container(
                  width: 40,
                  height: 54,
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
                title: AppText(title, kind: AppTextKind.bold),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (authors.isNotEmpty)
                      AppText(
                        authors,
                        kind: AppTextKind.small,
                        color: AppColors.muted,
                        style: const TextStyle(fontSize: 11),
                      ),
                    AppText(
                      'Định giá quy đổi: ${formatVnd(exchangeValue)}',
                      kind: AppTextKind.small,
                      color: StitchTokens.wineDark,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                onChanged: (v) {
                  setState(() {
                    if (v == true) {
                      _selectedIds.add(id);
                    } else {
                      _selectedIds.remove(id);
                    }
                  });
                },
              );
            }),
            const SizedBox(height: AppSpace.lg),
            AppButton(
              title: 'Gửi đề xuất đổi ${_selectedIds.length} cuốn',
              wine: true,
              busy: _submitting,
              onPressed: _submitExchange,
            ),
          ],
        ],
      ),
    );
  }
}

