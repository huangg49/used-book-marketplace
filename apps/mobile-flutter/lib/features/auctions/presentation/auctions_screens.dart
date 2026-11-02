import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// AuctionsScreen (`/auctions`) matching `apps/mobile-react-native/src/features/auctions/auctions-screen.tsx`
class AuctionsScreen extends ConsumerStatefulWidget {
  const AuctionsScreen({super.key});

  @override
  ConsumerState<AuctionsScreen> createState() => _AuctionsScreenState();
}

class _AuctionsScreenState extends ConsumerState<AuctionsScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  String _selectedTab = 'all';
  String _selectedSort = 'newest';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _auctions = const [];

  static const _tabs = [
    (id: 'all', label: 'Tất cả phiên'),
    (id: 'ending_soon', label: 'Sắp kết thúc'),
    (id: 'buy_now', label: 'Có Mua ngay'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadAuctions);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAuctions() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.publicRequest('/auctions');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (!mounted) return;
      setState(() {
        _auctions = list
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
    final filtered = _auctions.where((a) {
      final q = _searchCtrl.text.trim().toLowerCase();
      if (q.isNotEmpty) {
        final book = a['book'] is Map ? (a['book'] as Map) : const {};
        final title =
            (book['title'] ?? a['title'] ?? '').toString().toLowerCase();
        if (!title.contains(q)) return false;
      }
      if (_selectedTab == 'buy_now') {
        return a['buyNowPrice'] != null;
      }
      return true;
    }).toList();

    return AppScreen(
      currentNavPath: '/auctions',
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'SÀN ĐẤU GIÁ'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Flexible(
                child: AppText(
                  'Sách Cũ Đang Đấu Giá',
                  kind: AppTextKind.title,
                  color: StitchTokens.wine,
                ),
              ),
              Wrap(
                spacing: 8,
                children: [
                  AppButton(
                    title: 'Phiên của tôi',
                    secondary: true,
                    wine: true,
                    compact: true,
                    onPressed: () => context.push('/my-auctions'),
                  ),
                  AppButton(
                    title: 'Gửi đấu giá',
                    wine: true,
                    compact: true,
                    onPressed: () => context.push('/send-to-auction'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          SearchField(
            controller: _searchCtrl,
            placeholder: 'Tìm tên ấn bản đấu giá…',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.md),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ..._tabs.map((t) {
                  return Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: AppChip(
                      title: t.label,
                      wine: true,
                      selected: _selectedTab == t.id,
                      onPressed: () => setState(() => _selectedTab = t.id),
                    ),
                  );
                }),
                AppChip(
                  title: _selectedSort == 'price_asc'
                      ? 'Giá tăng dần'
                      : 'Mới nhất',
                  icon: Icons.sort_rounded,
                  selected: false,
                  onPressed: () {
                    setState(() {
                      _selectedSort =
                          _selectedSort == 'newest' ? 'price_asc' : 'newest';
                    });
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          if (_error != null) Notice(message: _error!, tone: NoticeTone.error),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải phiên đấu giá…',
            )
          else if (filtered.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.gavel_rounded,
              title: 'Chưa có phiên đấu giá phù hợp',
              message:
                  'Sách đấu giá bắt buộc qua kiểm định tại trạm ViaPoint TP.HCM trước khi mở phiên.',
              actionLabel: 'Gửi sách đi đấu giá',
              onAction: () => context.push('/send-to-auction'),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                final cols = constraints.maxWidth >= 760 ? 3 : 2;
                const spacing = 12.0;
                final width =
                    (constraints.maxWidth - spacing * (cols - 1)) / cols;
                return Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: filtered.map((auction) {
                    final id = (auction['id'] ?? '').toString();
                    final book = auction['book'] is Map
                        ? Map<String, dynamic>.from(auction['book'] as Map)
                        : const <String, dynamic>{};
                    final title =
                        (book['title'] ?? auction['title'] ?? 'Ấn bản đấu giá')
                            .toString();
                    final currentPrice = (auction['currentPrice'] ??
                        auction['startingPrice'] ??
                        0) as num;
                    final buyNow = auction['buyNowPrice'] is num
                        ? (auction['buyNowPrice'] as num)
                        : null;

                    return SizedBox(
                      width: width,
                      child: InkWell(
                        onTap: () => context.push('/auction?id=$id'),
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          padding: const EdgeInsets.all(AppSpace.lg),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: StitchTokens.peachBorder),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: StitchTokens.wine,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: AppText(
                                  (auction['state'] ?? 'Active').toString() ==
                                          'Active'
                                      ? 'LIVE · ĐANG MỞ'
                                      : (auction['state'] ?? '').toString(),
                                  kind: AppTextKind.label,
                                  color: StitchTokens.gold,
                                ),
                              ),
                              const SizedBox(height: 10),
                              AppText(
                                title,
                                kind: AppTextKind.card,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 8),
                              AppText(
                                'Dẫn giá: ${formatVnd(currentPrice)}',
                                kind: AppTextKind.shelfPrice,
                                color: StitchTokens.wine,
                              ),
                              if (buyNow != null) ...[
                                const SizedBox(height: 2),
                                AppText(
                                  'Mua ngay: ${formatVnd(buyNow)}',
                                  kind: AppTextKind.small,
                                  color: AppColors.forest,
                                ),
                              ],
                              const SizedBox(height: 10),
                              AppButton(
                                title: 'Xem phiên đấu giá',
                                wine: true,
                                compact: true,
                                onPressed: () =>
                                    context.push('/auction?id=$id'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                );
              },
            ),
        ],
      ),
    );
  }
}

/// AuctionScreen (`/auction`) matching `apps/mobile-react-native/src/features/auctions/auction-screen.tsx`
/// Includes Manual Bid, Auto-Bid, Buy-Now, Winner Point-Order steps, and Bid History.
class AuctionScreen extends ConsumerStatefulWidget {
  const AuctionScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<AuctionScreen> createState() => _AuctionScreenState();
}

class _AuctionScreenState extends ConsumerState<AuctionScreen> {
  final TextEditingController _bidCtrl = TextEditingController();
  final TextEditingController _autoBidCtrl = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;
  Map<String, dynamic>? _auction;
  List<Map<String, dynamic>> _history = const [];
  Map<String, dynamic>? _participation;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadAuctionDetail);
  }

  @override
  void dispose() {
    _bidCtrl.dispose();
    _autoBidCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAuctionDetail() async {
    if (widget.id.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Mã phiên đấu giá không hợp lệ.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    final session = ref.read(sessionProvider);
    try {
      final res = await client.publicRequest('/auctions/${widget.id}');
      final map = res is Map
          ? Map<String, dynamic>.from(res)
          : const <String, dynamic>{};
      final auctionObj = map['auction'] is Map
          ? Map<String, dynamic>.from(map['auction'] as Map)
          : map;
      final hist = map['history'] is List ? (map['history'] as List) : const [];

      Map<String, dynamic>? part;
      if (session.isAuthenticated) {
        final pRes = await client
            .request('/me/auctions/${widget.id}/participation')
            .catchError((_) => null);
        if (pRes is Map) part = Map<String, dynamic>.from(pRes);
      }

      if (!mounted) return;
      final current =
          (auctionObj['currentPrice'] ?? auctionObj['startingPrice'] ?? 50000)
              as num;
      final step = (auctionObj['step'] ?? 10000) as num;
      setState(() {
        _auction = auctionObj;
        _history = hist
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _participation = part;
        _bidCtrl.text = '${(current + step).round()}';
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

  Future<void> _placeManualBid() async {
    final amount = int.tryParse(_bidCtrl.text.trim()) ?? 0;
    if (amount <= 0) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/auctions/${widget.id}/bids',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('bid'),
        body: {
          'amount': amount,
          'fulfillmentMethod': 'SelfCollect',
        },
      );
      await _loadAuctionDetail();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã ghi nhận lượt trả giá ${formatVnd(amount)}!';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _setAutoBid() async {
    final maxAmount = int.tryParse(_autoBidCtrl.text.trim()) ?? 0;
    if (maxAmount <= 0) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/auctions/${widget.id}/auto-bid',
        method: 'PUT',
        idempotencyKey: generateIdempotencyKey('autobid'),
        body: {
          'maxAmount': maxAmount,
          'fulfillmentMethod': 'SelfCollect',
        },
      );
      await _loadAuctionDetail();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Đã bật đặt giá tự động tối đa ${formatVnd(maxAmount)}.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _buyNow() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/auctions/${widget.id}/buy-now',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('buynow'),
        body: {'fulfillmentMethod': 'SelfCollect'},
      );
      await _loadAuctionDetail();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _notice = 'Bạn đã mua ngay phiên đấu giá thành công!';
      });
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
    final a = _auction;
    final book = a?['book'] is Map
        ? Map<String, dynamic>.from(a!['book'] as Map)
        : const <String, dynamic>{};
    final currentPrice =
        (a?['currentPrice'] ?? a?['startingPrice'] ?? 0) as num;
    final buyNowPrice =
        a?['buyNowPrice'] is num ? (a!['buyNowPrice'] as num) : null;

    return AppScreen(
      header: const TopNavbar(subtitle: 'CHI TIẾT ĐẤU GIÁ'),
      child: _loading
          ? const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải phiên đấu giá…',
            )
          : a == null
              ? StatePanel(
                  wine: true,
                  title: 'Không tìm thấy phiên đấu giá',
                  message: _error,
                  actionLabel: 'Về sàn đấu giá',
                  onAction: () => context.go('/auctions'),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    BackAction(
                      title: 'Quay lại',
                      onPressed: () => context.canPop()
                          ? context.pop()
                          : context.go('/auctions'),
                    ),
                    if (_error != null) ...[
                      Notice(message: _error!, tone: NoticeTone.error),
                      const SizedBox(height: AppSpace.md),
                    ],
                    if (_notice != null) ...[
                      Notice(message: _notice!, tone: NoticeTone.success),
                      const SizedBox(height: AppSpace.md),
                    ],
                    Container(
                      padding: const EdgeInsets.all(AppSpace.xl),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: StitchTokens.cardBorder),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppText(
                            (book['title'] ?? a['title'] ?? 'Ấn bản đấu giá')
                                .toString(),
                            kind: AppTextKind.bookTitle,
                            color: StitchTokens.wine,
                          ),
                          const SizedBox(height: 8),
                          AppText(
                            'Giá hiện tại: ${formatVnd(currentPrice)}',
                            kind: AppTextKind.bookPrice,
                            color: StitchTokens.wine,
                          ),
                          if (_participation != null) ...[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: _participation!['leading'] == true
                                    ? AppColors.successSurface
                                    : AppColors.warningSurface,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: AppText(
                                _participation!['leading'] == true
                                    ? 'Bạn đang dẫn giá phiên này!'
                                    : 'Bạn đã tham gia trả giá trong phiên này.',
                                kind: AppTextKind.bold,
                                color: _participation!['leading'] == true
                                    ? AppColors.forest
                                    : AppColors.warning,
                              ),
                            ),
                          ],
                          const Divider(height: 24),
                          AppTextField(
                            label: 'Số tiền trả lượt này (VNĐ)',
                            controller: _bidCtrl,
                            keyboardType: TextInputType.number,
                          ),
                          const SizedBox(height: 10),
                          AppButton(
                            title: 'Tiếp tục trả giá',
                            wine: true,
                            busy: _busy,
                            onPressed: _placeManualBid,
                          ),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: AppTextField(
                                  label: 'Đặt giá tự động (Mức tối đa)',
                                  controller: _autoBidCtrl,
                                  keyboardType: TextInputType.number,
                                  placeholder: 'Nhập mức trần tự động…',
                                ),
                              ),
                              const SizedBox(width: 8),
                              Padding(
                                padding: const EdgeInsets.only(top: 22),
                                child: AppButton(
                                  title: 'Bật tự động',
                                  secondary: true,
                                  wine: true,
                                  compact: true,
                                  busy: _busy,
                                  onPressed: _setAutoBid,
                                ),
                              ),
                            ],
                          ),
                          if (buyNowPrice != null) ...[
                            const SizedBox(height: 14),
                            AppButton(
                              title: 'Mua ngay (${formatVnd(buyNowPrice)})',
                              busy: _busy,
                              onPressed: _buyNow,
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.lg),
                    Container(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: StitchTokens.cardBorder),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const AppText(
                            'Diễn biến giá',
                            kind: AppTextKind.heading,
                            color: StitchTokens.wine,
                          ),
                          const SizedBox(height: 8),
                          if (_history.isEmpty)
                            const AppText(
                              'Chưa có lượt trả giá nào.',
                              kind: AppTextKind.small,
                            )
                          else
                            ..._history.map((h) {
                              return Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 4),
                                child: Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    AppText(
                                      (h['bidderAlias'] ?? 'Độc giả')
                                          .toString(),
                                      kind: AppTextKind.bold,
                                    ),
                                    AppText(
                                      formatVnd(
                                        (h['price'] ?? 0) as num,
                                      ),
                                      kind: AppTextKind.bold,
                                      color: StitchTokens.wine,
                                    ),
                                  ],
                                ),
                              );
                            }),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}

/// MyAuctionsScreen (`/my-auctions`) matching `apps/mobile-react-native/src/features/auctions/my-auctions-screen.tsx`
class MyAuctionsScreen extends ConsumerStatefulWidget {
  const MyAuctionsScreen({super.key});

  @override
  ConsumerState<MyAuctionsScreen> createState() => _MyAuctionsScreenState();
}

class _MyAuctionsScreenState extends ConsumerState<MyAuctionsScreen> {
  String _view = 'all';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];

  static const _views = [
    (id: 'all', label: 'Tất cả'),
    (id: 'active', label: 'Đang diễn ra'),
    (id: 'upcoming', label: 'Sắp mở'),
    (id: 'payment', label: 'Cần thanh toán'),
    (id: 'selling', label: 'Sách tôi bán'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadMyAuctions);
  }

  Future<void> _loadMyAuctions() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request('/me/auctions?limit=12&view=$_view');
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
      header: const TopNavbar(subtitle: 'ĐẤU GIÁ CỦA TÔI'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về phiên đang mở',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/auctions'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Phiên của tôi',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _views.map((v) {
                return Padding(
                  padding: const EdgeInsets.only(right: AppSpace.sm),
                  child: AppChip(
                    title: v.label,
                    wine: true,
                    selected: _view == v.id,
                    onPressed: () {
                      setState(() => _view = v.id);
                      _loadMyAuctions();
                    },
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
              title: 'Đang tải phiên của bạn…',
            )
          else if (_items.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.gavel_rounded,
              title: 'Chưa có phiên đấu giá trong mục này',
              actionLabel: 'Gửi sách đấu giá',
              onAction: () => context.push('/send-to-auction'),
            )
          else
            ..._items.map((item) {
              final id = (item['id'] ?? item['auctionId'] ?? '').toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.md),
                child: ListTile(
                  tileColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: StitchTokens.cardBorder),
                  ),
                  title: AppText(
                    (item['title'] ?? 'Phiên đấu giá').toString(),
                    kind: AppTextKind.bold,
                  ),
                  subtitle: AppText(
                    'Trạng thái: ${(item['state'] ?? 'Active')}',
                    kind: AppTextKind.small,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => context.push('/auction?id=$id'),
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// SendToAuctionScreen (`/send-to-auction`) matching `apps/mobile-react-native/src/features/auctions/send-to-auction-screen.tsx`
class SendToAuctionScreen extends ConsumerStatefulWidget {
  const SendToAuctionScreen({super.key});

  @override
  ConsumerState<SendToAuctionScreen> createState() =>
      _SendToAuctionScreenState();
}

class _SendToAuctionScreenState extends ConsumerState<SendToAuctionScreen> {
  final TextEditingController _startPriceCtrl =
      TextEditingController(text: '50000');
  final TextEditingController _buyNowPriceCtrl =
      TextEditingController(text: '150000');
  int _step = 10000;
  String? _selectedPointId;
  String? _selectedListingId;
  int _selectedListingVersion = 1;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String? _notice;
  List<Map<String, dynamic>> _points = const [];
  List<Map<String, dynamic>> _listings = const [];
  List<Map<String, dynamic>> _intakes = const [];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadInitialData);
  }

  @override
  void dispose() {
    _startPriceCtrl.dispose();
    _buyNowPriceCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInitialData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final results = await Future.wait<dynamic>([
        client.publicRequest('/handover-points').catchError((_) => const []),
        client
            .request('/me/listings?channel=Auction&limit=20')
            .catchError((_) => const {}),
        client.request('/me/auction-intakes').catchError((_) => const []),
      ]);
      final pts = results[0] is List
          ? (results[0] as List)
          : (results[0] is Map && (results[0] as Map)['items'] is List
              ? ((results[0] as Map)['items'] as List)
              : const []);
      final lst = (results[1] is Map && (results[1] as Map)['items'] is List)
          ? ((results[1] as Map)['items'] as List)
          : const [];
      final intk = results[2] is List
          ? (results[2] as List)
          : (results[2] is Map && (results[2] as Map)['items'] is List
              ? ((results[2] as Map)['items'] as List)
              : const []);

      if (!mounted) return;
      final parsedPoints = pts
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      final parsedListings = lst
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      setState(() {
        _points = parsedPoints;
        _listings = parsedListings;
        _intakes = intk
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        if (parsedPoints.isNotEmpty) {
          _selectedPointId = parsedPoints.first['id']?.toString();
        }
        if (parsedListings.isNotEmpty) {
          _selectedListingId = parsedListings.first['id']?.toString();
          _selectedListingVersion =
              (parsedListings.first['version'] is num)
                  ? (parsedListings.first['version'] as num).toInt()
                  : 1;
        }
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

  Future<void> _submitIntake() async {
    if (_selectedListingId == null || _selectedPointId == null) {
      setState(() {
        _error =
            'Vui lòng chọn bài đăng kênh đấu giá và điểm tiếp nhận kiểm định ViaPoint TP.HCM.';
      });
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/auction-intakes',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('intake'),
        body: {
          'listingId': _selectedListingId,
          'expectedListingVersion': _selectedListingVersion,
          'pointId': _selectedPointId,
          'startPrice': int.tryParse(_startPriceCtrl.text.trim()) ?? 50000,
          'step': _step,
          'buyNowPrice': int.tryParse(_buyNowPriceCtrl.text.trim()),
        },
      );
      await _loadInitialData();
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _notice =
            'Đã tạo hồ sơ bàn giao sách đấu giá tại trạm ViaPoint thành công!';
      });
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
      header: const TopNavbar(subtitle: 'GỬI SÁCH ĐẤU GIÁ'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về sàn đấu giá',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/auctions'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Gửi sách đấu giá qua trạm ViaPoint',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: 6),
          const AppText(
            'Sách đấu giá bắt buộc được tiếp nhận và kiểm định thực tế tại 1 trong 2 điểm quản lý TP.HCM trước khi mở phiên.',
            kind: AppTextKind.small,
          ),
          const SizedBox(height: AppSpace.lg),
          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          if (_notice != null) ...[
            Notice(message: _notice!, tone: NoticeTone.success),
            const SizedBox(height: AppSpace.md),
          ],
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải điểm tiếp nhận & hồ sơ…',
            )
          else
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
                  const AppText(
                    '1. Điểm tiếp nhận kiểm định TP.HCM (ViaPoint)',
                    kind: AppTextKind.bold,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _points.map((pt) {
                      final id = (pt['id'] ?? '').toString();
                      return AppChip(
                        title: (pt['name'] ?? 'Điểm ViaPoint TP.HCM').toString(),
                        wine: true,
                        selected: _selectedPointId == id,
                        onPressed: () => setState(() => _selectedPointId = id),
                      );
                    }).toList(),
                  ),
                  if (_listings.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.md),
                    const AppText(
                      'Ấn bản gửi đấu giá:',
                      kind: AppTextKind.bold,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _listings.map((lst) {
                        final id = (lst['id'] ?? '').toString();
                        final book = lst['book'] is Map
                            ? (lst['book'] as Map)
                            : const {};
                        return AppChip(
                          title: (book['title'] ?? lst['title'] ?? 'Sách đấu giá')
                              .toString(),
                          selected: _selectedListingId == id,
                          onPressed: () => setState(() {
                            _selectedListingId = id;
                            _selectedListingVersion = (lst['version'] is num)
                                ? (lst['version'] as num).toInt()
                                : 1;
                          }),
                        );
                      }).toList(),
                    ),
                  ],
                  const SizedBox(height: AppSpace.lg),
                  const AppText(
                    '2. Thiết lập mức giá đấu',
                    kind: AppTextKind.bold,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      AppChip(
                        title: 'Bước giá 10.000 ₫',
                        wine: true,
                        selected: _step == 10000,
                        onPressed: () => setState(() => _step = 10000),
                      ),
                      const SizedBox(width: 8),
                      AppChip(
                        title: 'Bước giá 50.000 ₫',
                        wine: true,
                        selected: _step == 50000,
                        onPressed: () => setState(() => _step = 50000),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    label: 'Giá khởi điểm (10.000 ₫ – 1.000.000 ₫)',
                    controller: _startPriceCtrl,
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    label: 'Giá mua ngay (Tùy chọn)',
                    controller: _buyNowPriceCtrl,
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 16),
                  AppButton(
                    title: 'Xem lại và gửi sách đấu giá',
                    wine: true,
                    busy: _submitting,
                    onPressed: _submitIntake,
                  ),
                  if (_intakes.isNotEmpty) ...[
                    const Divider(height: 28),
                    const AppText(
                      'Hồ sơ gửi đấu giá đang hoạt động',
                      kind: AppTextKind.heading,
                      color: StitchTokens.wine,
                    ),
                    const SizedBox(height: 8),
                    ..._intakes.map((intk) {
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: AppText(
                          'Hồ sơ #${(intk['id'] ?? '').toString()}',
                          kind: AppTextKind.bold,
                        ),
                        subtitle: AppText(
                          'Trạng thái: ${intk['state'] ?? intk['status'] ?? 'PendingHandover'}',
                          kind: AppTextKind.small,
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

