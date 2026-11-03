import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/models/catalog_taxonomy.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

class ShelfScreen extends ConsumerStatefulWidget {
  const ShelfScreen({super.key});

  @override
  ConsumerState<ShelfScreen> createState() => _ShelfScreenState();
}

class _ShelfScreenState extends ConsumerState<ShelfScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  String _selectedCategory = '';
  String _selectedMode = '';
  String _selectedCondition = '';
  String _selectedSort = 'newest';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];
  List<Map<String, dynamic>> _liveAuctions = const [];
  String? _nextCursor;
  final List<String> _cursors = [''];
  bool _showPromoBanner = true;

  static const _categories = [
    (id: '', label: 'Tất cả'),
    (id: 'Văn học', label: 'Văn học'),
    (id: 'Kinh tế', label: 'Kinh tế'),
    (id: 'Kỹ năng', label: 'Kỹ năng sống'),
    (id: 'Thiếu nhi', label: 'Thiếu nhi'),
    (id: 'Truyện tranh', label: 'Manga / Comic'),
    (id: 'Ngoại văn', label: 'Ngoại văn'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadShelfAndAuctions);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadShelfAndAuctions() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final params = <String>[
        'bundleSupport=whole-v1',
        'sort=$_selectedSort',
        if (_searchCtrl.text.trim().isNotEmpty)
          'q=${Uri.encodeQueryComponent(_searchCtrl.text.trim())}',
        if (_selectedMode.isNotEmpty)
          'mode=${Uri.encodeQueryComponent(_selectedMode)}',
        if (_selectedCondition.isNotEmpty)
          'condition=${Uri.encodeQueryComponent(_selectedCondition)}',
        if (_cursors.last.isNotEmpty)
          'cursor=${Uri.encodeQueryComponent(_cursors.last)}',
      ];
      final results = await Future.wait<dynamic>([
        client.publicRequest('/listings?${params.join('&')}'),
        client.publicRequest('/auctions').catchError((_) => null),
      ]);
      final shelfData = results[0];
      final rawItems = (shelfData is Map && shelfData['items'] is List)
          ? (shelfData['items'] as List)
          : const [];
      final auctionData = results[1];
      final rawAuctions = (auctionData is Map && auctionData['items'] is List)
          ? (auctionData['items'] as List)
          : const [];

      if (!mounted) return;
      setState(() {
        _items = rawItems
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _nextCursor = (shelfData is Map && shelfData['nextCursor'] is String)
            ? shelfData['nextCursor'] as String
            : null;
        _liveAuctions = rawAuctions
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .where((a) => a['state'] == 'Active')
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

  void _resetAndLoad() {
    _cursors
      ..clear()
      ..add('');
    _loadShelfAndAuctions();
  }

  @override
  Widget build(BuildContext context) {
    final hasCriteria = _searchCtrl.text.trim().isNotEmpty ||
        _selectedCategory.isNotEmpty ||
        _selectedMode.isNotEmpty ||
        _selectedCondition.isNotEmpty ||
        _selectedSort != 'newest';

    return AppScreen(
      currentNavPath: '/',
      padding: EdgeInsets.zero,
      maxWidth: AppMetrics.wideContent,
      header: TopNavbar(
        leading: SearchField(
          controller: _searchCtrl,
          placeholder: 'Tìm tên sách, tác giả, bộ sách…',
          onSubmitted: (_) => _resetAndLoad(),
          onClear: _resetAndLoad,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Hero Promo Banner (Đã thu gọn, có nút tắt)
            if (_showPromoBanner) ...[
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpace.md,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [StitchTokens.wine, StitchTokens.wineDark],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: StitchTokens.goldDark.withValues(alpha: 0.6),
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: StitchTokens.gold.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.auto_stories_rounded,
                        color: StitchTokens.gold,
                        size: 16,
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: InkWell(
                        onTap: () => context.push('/guide'),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text(
                              'DẤU CHUYỀN TAY · TP.HCM, BÌNH DƯƠNG & VŨNG TÀU',
                              style: TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: StitchTokens.gold,
                                letterSpacing: 0.3,
                              ),
                            ),
                            const SizedBox(height: 2),
                            const AppText(
                              'Mỗi cuốn sách cũ là một hành trình được lật lại',
                              kind: AppTextKind.bold,
                              color: Colors.white,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpace.xs),
                    InkWell(
                      onTap: () => _showInspectionModal(context),
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: StitchTokens.gold,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x1F000000),
                              blurRadius: 3,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.verified_user_rounded,
                              size: 14,
                              color: StitchTokens.wineDark,
                            ),
                            SizedBox(width: 4),
                            AppText(
                              'Kiểm định',
                              kind: AppTextKind.label,
                              color: StitchTokens.wineDark,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    InkWell(
                      onTap: () => setState(() => _showPromoBanner = false),
                      borderRadius: BorderRadius.circular(16),
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: Icon(
                          Icons.close_rounded,
                          size: 16,
                          color: StitchTokens.goldLight.withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpace.md),
            ],

            // 2. Quick Action 4 Shortcuts matching HomeShortcuts
            Row(
              children: [
                _ShortcutTile(
                  icon: Icons.gavel_rounded,
                  label: 'Đấu giá',
                  color: StitchTokens.wine,
                  onTap: () => context.go('/auctions'),
                ),
                const SizedBox(width: AppSpace.sm),
                _ShortcutTile(
                  icon: Icons.auto_awesome_rounded,
                  label: 'Mới đăng',
                  color: AppColors.forest,
                  onTap: () {
                    setState(() => _selectedSort = 'newest');
                    _resetAndLoad();
                  },
                ),
                const SizedBox(width: AppSpace.sm),
                _ShortcutTile(
                  icon: Icons.swap_horiz_rounded,
                  label: 'Đổi sách',
                  color: StitchTokens.orangeDeep,
                  onTap: () => context.go('/search?mode=Both'),
                ),
                const SizedBox(width: AppSpace.sm),
                _ShortcutTile(
                  icon: Icons.workspace_premium_rounded,
                  label: 'Như mới',
                  color: StitchTokens.goldBronze,
                  onTap: () {
                    setState(() => _selectedCondition = 'LikeNew');
                    _resetAndLoad();
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpace.lg),

            // 3. Live Book Auctions Section matching HomeFlashDeals
            Container(
              padding: const EdgeInsets.all(AppSpace.lg),
              decoration: BoxDecoration(
                color: StitchTokens.roseWarmSurface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: StitchTokens.peachBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Row(
                          children: [
                            Icon(
                              Icons.gavel_rounded,
                              color: StitchTokens.wine,
                              size: 20,
                            ),
                            SizedBox(width: 8),
                            Flexible(
                              child: AppText(
                                'Phiên đấu giá đang diễn ra',
                                kind: AppTextKind.card,
                                color: StitchTokens.wine,
                              ),
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () => context.go('/auctions'),
                        child: const AppText(
                          'Xem tất cả →',
                          kind: AppTextKind.small,
                          color: StitchTokens.wine,
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                  if (_liveAuctions.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpace.sm),
                      child: AppText(
                        'Các phiên đấu giá sách hiếm đã kiểm định tại trạm ViaPoint sẽ hiển thị tại đây.',
                        kind: AppTextKind.small,
                      ),
                    )
                  else
                    SizedBox(
                      height: 156,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _liveAuctions.length,
                        separatorBuilder: (_, _) =>
                            const SizedBox(width: AppSpace.md),
                        itemBuilder: (context, index) {
                          final auction = _liveAuctions[index];
                          final book = auction['book'] is Map
                              ? Map<String, dynamic>.from(
                                  auction['book'] as Map,
                                )
                              : const <String, dynamic>{};
                          final currentPrice = (auction['currentPrice'] ??
                                  auction['startingPrice'] ??
                                  0) as num;
                          return InkWell(
                            onTap: () => context
                                .push('/auction?id=${auction['id'] ?? ''}'),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: 240,
                              padding: const EdgeInsets.all(AppSpace.md),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: StitchTokens.peachBorder,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceEvenly,
                                children: [
                                  AppText(
                                    (book['title'] ??
                                            auction['title'] ??
                                            'Ấn bản đấu giá')
                                        .toString(),
                                    kind: AppTextKind.bold,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  AppText(
                                    'Giá hiện tại: ${formatVnd(currentPrice)}',
                                    kind: AppTextKind.shelfPrice,
                                    color: StitchTokens.wine,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const AppText(
                                    'Đã kiểm định ViaPoint · Đặt giá ngay',
                                    kind: AppTextKind.label,
                                    color: AppColors.forest,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.lg),

            // 4. Category Chips matching HomeCategoryTabs
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _categories.map((cat) {
                  final selected = _selectedCategory == cat.id;
                  return Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: AppChip(
                      title: cat.label,
                      wine: true,
                      selected: selected,
                      onPressed: () {
                        setState(() {
                          _selectedCategory = cat.id;
                          _searchCtrl.text = cat.id;
                        });
                        _resetAndLoad();
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: AppSpace.md),

            if (hasCriteria)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: AppSpace.md),
                  child: AppChip(
                    title: 'Xóa tìm kiếm và bộ lọc',
                    selected: false,
                    onPressed: () {
                      setState(() {
                        _searchCtrl.clear();
                        _selectedCategory = '';
                        _selectedMode = '';
                        _selectedCondition = '';
                        _selectedSort = 'newest';
                      });
                      _resetAndLoad();
                    },
                  ),
                ),
              ),

            if (_error != null) ...[
              Notice(message: _error!, tone: NoticeTone.error),
              const SizedBox(height: AppSpace.md),
            ],

            if (_loading)
              const StatePanel(loading: true, title: 'Đang tải sách…')
            else if (_items.isEmpty)
              StatePanel(
                icon: Icons.menu_book_rounded,
                title: hasCriteria
                    ? 'Không tìm thấy sách phù hợp'
                    : 'Chưa có sách được đăng',
                message: hasCriteria
                    ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.'
                    : 'Bạn có thể chuẩn bị bài đăng cho những cuốn đã đọc xong.',
                actionLabel: hasCriteria
                    ? 'Xóa tìm kiếm và bộ lọc'
                    : 'Mở kệ sách của tôi',
                onAction: () {
                  if (hasCriteria) {
                    setState(() {
                      _searchCtrl.clear();
                      _selectedCategory = '';
                      _selectedMode = '';
                      _selectedCondition = '';
                      _selectedSort = 'newest';
                    });
                    _resetAndLoad();
                  } else {
                    context.go('/drafts');
                  }
                },
              )
            else ...[
              LayoutBuilder(
                builder: (context, constraints) {
                  final cols = constraints.maxWidth >= 760
                      ? 4
                      : constraints.maxWidth >= 520
                          ? 3
                          : 2;
                  final spacing = 12.0;
                  final itemWidth =
                      (constraints.maxWidth - spacing * (cols - 1)) / cols;
                  return Wrap(
                    spacing: spacing,
                    runSpacing: spacing,
                    children: _items.map((item) {
                      return SizedBox(
                        width: itemWidth,
                        child: BookCard(
                          item: item,
                          onOpen: () =>
                              context.push('/book?id=${item['id'] ?? ''}'),
                        ),
                      );
                    }).toList(),
                  );
                },
              ),
              const SizedBox(height: AppSpace.lg),
              Row(
                children: [
                  if (_cursors.length > 1) ...[
                    Expanded(
                      child: AppButton(
                        title: 'Trang trước',
                        secondary: true,
                        onPressed: () {
                          setState(() {
                            _cursors.removeLast();
                          });
                          _loadShelfAndAuctions();
                        },
                      ),
                    ),
                    const SizedBox(width: AppSpace.md),
                  ],
                  if (_nextCursor != null && _nextCursor!.isNotEmpty)
                    Expanded(
                      child: AppButton(
                        title: 'Trang tiếp',
                        wine: true,
                        onPressed: () {
                          setState(() {
                            _cursors.add(_nextCursor!);
                          });
                          _loadShelfAndAuctions();
                        },
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: AppSpace.lg),
            const AppText(
              'Ảnh và tình trạng do người đăng cung cấp. Xem chi tiết sách trước khi quyết định. Mở chi tiết để xem thao tác hiện được hỗ trợ và nơi theo dõi giao dịch.',
              kind: AppTextKind.small,
              color: AppColors.muted,
            ),
          ],
        ),
      ),
    );
  }
}

class _ShortcutTile extends StatelessWidget {
  const _ShortcutTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: StitchTokens.cardBorder),
          ),
          child: Column(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 20, color: color),
              ),
              const SizedBox(height: 6),
              AppText(
                label,
                kind: AppTextKind.label,
                color: StitchTokens.darkWood,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _showInspectionModal(BuildContext context) {
  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surface,
      title: const AppText(
        'Quy trình kiểm định & Bảo vệ 72h',
        kind: AppTextKind.heading,
        color: StitchTokens.wine,
      ),
      content: const Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppText(
            '1. Ký quỹ an toàn: Tiền thanh toán được giữ trong Quỹ ký quỹ Lật Lại cho đến khi bạn xác nhận sách đúng mô tả.',
          ),
          SizedBox(height: AppSpace.sm),
          AppText(
            '2. Kiểm định tại trạm ViaPoint: Bắt buộc đối với sách đấu giá và tùy chọn đối với mua bán / trao đổi thông thường tại 2 điểm quản lý TP.HCM.',
          ),
          SizedBox(height: AppSpace.sm),
          AppText(
            '3. Khu vực lưu hành: TP.HCM, Bình Dương và Vũng Tàu.',
          ),
        ],
      ),
      actions: [
        AppButton(
          title: 'Đã hiểu',
          wine: true,
          compact: true,
          onPressed: () => Navigator.of(ctx).pop(),
        ),
      ],
    ),
  );
}

/// SearchScreen (`/search`) matching `apps/mobile-react-native/src/features/search/search-screen.tsx`
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({
    super.key,
    this.initialQuery = '',
    this.initialMode = '',
  });

  final String initialQuery;
  final String initialMode;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _searchCtrl;
  String _categoryId = '';
  Map<String, List<String>> _selectedFacets = const {};
  String _language = '';
  late String _mode;
  String _condition = '';
  String _sort = 'newest';
  String _minSalePrice = '';
  String _maxSalePrice = '';
  String _minExchangeValue = '';
  String _maxExchangeValue = '';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];

  static const _modes = [
    (id: '', title: 'Tất cả hình thức'),
    (id: 'Sale', title: 'Mua sách'),
    (id: 'Exchange', title: 'Đổi sách'),
    (id: 'Both', title: 'Bán hoặc đổi'),
  ];

  static const _conditions = [
    (id: '', title: 'Mọi tình trạng'),
    (id: 'LikeNew', title: 'Như mới (90%+)'),
    (id: 'Good', title: 'Còn tốt (75-90%)'),
    (id: 'Fair', title: 'Đã dùng nhiều (50-75%)'),
    (id: 'Worn', title: 'Cũ nhiều (< 50%)'),
  ];

  static const _sorts = [
    (id: 'newest', title: 'Mới đăng nhất'),
    (id: 'salePriceAsc', title: 'Giá bán: Thấp đến cao'),
    (id: 'salePriceDesc', title: 'Giá bán: Cao đến thấp'),
    (id: 'exchangeValueAsc', title: 'Giá đổi: Thấp đến cao'),
    (id: 'exchangeValueDesc', title: 'Giá đổi: Cao đến thấp'),
  ];

  int get _activeFilterCount {
    int count = 0;
    if (_categoryId.isNotEmpty) count++;
    for (final list in _selectedFacets.values) {
      count += list.length;
    }
    if (_language.isNotEmpty) count++;
    if (_condition.isNotEmpty) count++;
    if (_minSalePrice.isNotEmpty || _maxSalePrice.isNotEmpty) count++;
    if (_minExchangeValue.isNotEmpty || _maxExchangeValue.isNotEmpty) count++;
    return count;
  }

  String _categoryLabel(String id) {
    return CatalogTaxonomy.getLabel(id);
  }

  String _facetOptionLabel(String facetId, String optionId) {
    final cat = CatalogTaxonomy.getCategory(_categoryId);
    if (cat != null) {
      for (final f in cat.facets) {
        if (f.id == facetId) {
          for (final o in f.options) {
            if (o.id == optionId) return '${f.label}: ${o.label}';
          }
        }
      }
    }
    return optionId;
  }

  String _conditionLabel(String id) {
    return _conditions
        .firstWhere((c) => c.id == id, orElse: () => (id: id, title: id))
        .title;
  }

  String _formatCompactPrice(String price) {
    final numVal = int.tryParse(price);
    if (numVal == null) return price;
    if (numVal >= 1000) {
      return '${(numVal / 1000).toStringAsFixed(0)}k đ';
    }
    return '$numVal đ';
  }

  @override
  void initState() {
    super.initState();
    _searchCtrl = TextEditingController(text: widget.initialQuery);
    _mode = widget.initialMode;
    Future.microtask(_search);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _resetFilters() {
    setState(() {
      _categoryId = '';
      _selectedFacets = const {};
      _language = '';
      _condition = '';
      _minSalePrice = '';
      _maxSalePrice = '';
      _minExchangeValue = '';
      _maxExchangeValue = '';
    });
    _search();
  }

  Future<void> _search() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final params = <String>[
        'bundleSupport=whole-v1',
        'sort=$_sort',
        if (_searchCtrl.text.trim().isNotEmpty)
          'q=${Uri.encodeQueryComponent(_searchCtrl.text.trim())}',
        if (_categoryId.isNotEmpty)
          'categoryId=${Uri.encodeQueryComponent(_categoryId)}',
        if (_selectedFacets.isNotEmpty)
          'facets=${Uri.encodeQueryComponent(jsonEncode(_selectedFacets))}',
        if (_language.isNotEmpty)
          'language=${Uri.encodeQueryComponent(_language)}',
        if (_mode.isNotEmpty) 'mode=${Uri.encodeQueryComponent(_mode)}',
        if (_condition.isNotEmpty)
          'condition=${Uri.encodeQueryComponent(_condition)}',
        if (_minSalePrice.isNotEmpty)
          'minSalePrice=${Uri.encodeQueryComponent(_minSalePrice)}',
        if (_maxSalePrice.isNotEmpty)
          'maxSalePrice=${Uri.encodeQueryComponent(_maxSalePrice)}',
        if (_minExchangeValue.isNotEmpty)
          'minExchangeValue=${Uri.encodeQueryComponent(_minExchangeValue)}',
        if (_maxExchangeValue.isNotEmpty)
          'maxExchangeValue=${Uri.encodeQueryComponent(_maxExchangeValue)}',
      ];
      final res = await client.publicRequest('/listings?${params.join('&')}');
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

  void _openFilterModal(BuildContext context) {
    final currentCat = CatalogTaxonomy.getCategory(_categoryId);
    String draftRootId = currentCat?.id ?? '';
    String draftChildId = _categoryId.contains('.') ? _categoryId : '';
    final draftFacets = <String, List<String>>{
      for (final entry in _selectedFacets.entries)
        entry.key: List<String>.from(entry.value),
    };
    String draftLanguage = _language;
    String draftCondition = _condition;
    final minSaleCtrl = TextEditingController(text: _minSalePrice);
    final maxSaleCtrl = TextEditingController(text: _maxSalePrice);
    final minExchangeCtrl = TextEditingController(text: _minExchangeValue);
    final maxExchangeCtrl = TextEditingController(text: _maxExchangeValue);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final selectedRoot = draftRootId.isNotEmpty
                ? CatalogTaxonomy.rootCategories
                    .cast<TaxonomyCategory?>()
                    .firstWhere((c) => c?.id == draftRootId, orElse: () => null)
                : null;

            return Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.85,
              ),
              decoration: const BoxDecoration(
                color: Color(0xFFFDFBF7),
                borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 16,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drag handle
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(top: 10, bottom: 6),
                      decoration: BoxDecoration(
                        color: Colors.black26,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                  // Header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 6, 8, 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Icon(
                              Icons.tune_rounded,
                              size: 20,
                              color: StitchTokens.wine,
                            ),
                            SizedBox(width: 8),
                            Text(
                              'Bộ lọc tìm kiếm',
                              style: TextStyle(
                                fontFamily: 'Lora',
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: StitchTokens.wine,
                              ),
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            TextButton(
                              onPressed: () {
                                setModalState(() {
                                  draftRootId = '';
                                  draftChildId = '';
                                  draftFacets.clear();
                                  draftLanguage = '';
                                  draftCondition = '';
                                  minSaleCtrl.clear();
                                  maxSaleCtrl.clear();
                                  minExchangeCtrl.clear();
                                  maxExchangeCtrl.clear();
                                });
                              },
                              child: const Text(
                                'Thiết lập lại',
                                style: TextStyle(
                                  color: StitchTokens.wine,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.close_rounded),
                              tooltip: 'Đóng',
                              onPressed: () => Navigator.of(ctx).pop(),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: Color(0x1A5C0202)),

                  // Scrollable Filter Sections
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // 1. Danh mục chính
                          _filterSectionHeader('DANH MỤC CHÍNH'),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _filterChip(
                                label: 'Tất cả danh mục',
                                selected: draftRootId.isEmpty,
                                onTap: () => setModalState(() {
                                  draftRootId = '';
                                  draftChildId = '';
                                  draftFacets.clear();
                                }),
                              ),
                              ...CatalogTaxonomy.rootCategories.map((c) {
                                final isSelected = draftRootId == c.id;
                                return _filterChip(
                                  label: c.label,
                                  selected: isSelected,
                                  onTap: () => setModalState(() {
                                    if (isSelected) {
                                      draftRootId = '';
                                      draftChildId = '';
                                      draftFacets.clear();
                                    } else {
                                      draftRootId = c.id;
                                      draftChildId = '';
                                      draftFacets.clear();
                                    }
                                  }),
                                );
                              }),
                            ],
                          ),

                          // 1b. Danh mục con / Nhóm sách
                          if (selectedRoot != null && selectedRoot.children.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF7F2EB),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: const Color(0x2E5C0202)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Row(
                                    children: [
                                      const Icon(
                                        Icons.subdirectory_arrow_right_rounded,
                                        size: 16,
                                        color: StitchTokens.wine,
                                      ),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          'CHUYÊN MỤC CON (${selectedRoot.label.toUpperCase()})',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                            color: StitchTokens.wine,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 10),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: [
                                      _filterChip(
                                        label: 'Tất cả ${selectedRoot.label.toLowerCase()}',
                                        selected: draftChildId.isEmpty,
                                        onTap: () => setModalState(
                                          () => draftChildId = '',
                                        ),
                                      ),
                                      ...selectedRoot.children.map((child) {
                                        final isChildSelected =
                                            draftChildId == child.id;
                                        return _filterChip(
                                          label: child.label,
                                          selected: isChildSelected,
                                          onTap: () => setModalState(() {
                                            draftChildId = isChildSelected
                                                ? ''
                                                : child.id;
                                          }),
                                        );
                                      }),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],

                          // 1c. Thể loại / Thuộc tính riêng (Facets)
                          if (selectedRoot != null && selectedRoot.facets.isNotEmpty) ...[
                            for (final facet in selectedRoot.facets) ...[
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFAF6F0),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: const Color(0x245C0202)),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Row(
                                      children: [
                                        const Icon(
                                          Icons.category_outlined,
                                          size: 15,
                                          color: StitchTokens.wine,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          facet.label.toUpperCase(),
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                            color: StitchTokens.wine,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        if (draftFacets[facet.id]?.isNotEmpty == true) ...[
                                          const SizedBox(width: 6),
                                          Text(
                                            '(${draftFacets[facet.id]!.length} đã chọn)',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                              color: StitchTokens.darkWood,
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: facet.options.map((opt) {
                                        final isOptSelected =
                                            draftFacets[facet.id]?.contains(opt.id) ==
                                                true;
                                        return _filterChip(
                                          label: opt.label,
                                          selected: isOptSelected,
                                          onTap: () => setModalState(() {
                                            final current = List<String>.from(
                                              draftFacets[facet.id] ?? [],
                                            );
                                            if (current.contains(opt.id)) {
                                              current.remove(opt.id);
                                              if (current.isEmpty) {
                                                draftFacets.remove(facet.id);
                                              } else {
                                                draftFacets[facet.id] = current;
                                              }
                                            } else {
                                              current.add(opt.id);
                                              draftFacets[facet.id] = current;
                                            }
                                          }),
                                        );
                                      }).toList(),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                          const SizedBox(height: 18),

                          // 2. Ngôn ngữ của sách
                          _filterSectionHeader('NGÔN NGỮ CỦA SÁCH'),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _filterChip(
                                label: 'Tất cả ngôn ngữ',
                                selected: draftLanguage.isEmpty,
                                onTap: () => setModalState(
                                  () => draftLanguage = '',
                                ),
                              ),
                              ...CatalogTaxonomy.languageOptions.map((lang) {
                                final isSelected = draftLanguage == lang.id;
                                return _filterChip(
                                  label: lang.label,
                                  selected: isSelected,
                                  onTap: () => setModalState(
                                    () => draftLanguage =
                                        isSelected ? '' : lang.id,
                                  ),
                                );
                              }),
                            ],
                          ),
                          const SizedBox(height: 18),

                          // 3. Tình trạng sách
                          _filterSectionHeader('TÌNH TRẠNG SÁCH'),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: _conditions.map((cond) {
                              final isSelected = draftCondition == cond.id;
                              return _filterChip(
                                label: cond.title,
                                selected: isSelected,
                                onTap: () => setModalState(
                                  () => draftCondition =
                                      isSelected ? '' : cond.id,
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 18),

                          // 4. Khoảng giá bán (VND) - Luôn hiển thị
                          _filterSectionHeader('KHOẢNG GIÁ BÁN (VND)'),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: _priceTextField(
                                  controller: minSaleCtrl,
                                  label: 'Từ (đ)',
                                  placeholder: '10.000',
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 8),
                                child: Text('—',
                                    style: TextStyle(
                                        color: Color(0xFF8A7D73),
                                        fontSize: 16)),
                              ),
                              Expanded(
                                child: _priceTextField(
                                  controller: maxSaleCtrl,
                                  label: 'Đến (đ)',
                                  placeholder: '500.000',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            children: [50000, 100000, 200000, 500000]
                                .map((price) {
                              final isSelected =
                                  minSaleCtrl.text.isEmpty &&
                                      maxSaleCtrl.text == price.toString();
                              return InkWell(
                                onTap: () {
                                  setModalState(() {
                                    minSaleCtrl.clear();
                                    maxSaleCtrl.text = price.toString();
                                  });
                                },
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isSelected
                                        ? StitchTokens.wine
                                        : const Color(0xFFF0EAE1),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '≤ ${(price / 1000).toStringAsFixed(0)}k',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: isSelected
                                          ? Colors.white
                                          : StitchTokens.darkWood,
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 18),

                          // 5. Khoảng giá trị đổi (VND) - Luôn hiển thị
                          _filterSectionHeader('KHOẢNG GIÁ TRỊ ĐỔI (VND)'),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: _priceTextField(
                                  controller: minExchangeCtrl,
                                  label: 'Từ (đ)',
                                  placeholder: '10.000',
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 8),
                                child: Text('—',
                                    style: TextStyle(
                                        color: Color(0xFF8A7D73),
                                        fontSize: 16)),
                              ),
                              Expanded(
                                child: _priceTextField(
                                  controller: maxExchangeCtrl,
                                  label: 'Đến (đ)',
                                  placeholder: '500.000',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            children: [50000, 100000, 200000, 500000]
                                .map((price) {
                              final isSelected =
                                  minExchangeCtrl.text.isEmpty &&
                                      maxExchangeCtrl.text == price.toString();
                              return InkWell(
                                onTap: () {
                                  setModalState(() {
                                    minExchangeCtrl.clear();
                                    maxExchangeCtrl.text = price.toString();
                                  });
                                },
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isSelected
                                        ? StitchTokens.wine
                                        : const Color(0xFFF0EAE1),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '≤ ${(price / 1000).toStringAsFixed(0)}k',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: isSelected
                                          ? Colors.white
                                          : StitchTokens.darkWood,
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 18),
                        ],
                      ),
                    ),
                  ),

                  // Bottom Action Button
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(
                        top: BorderSide(color: Color(0x1F000000)),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: StitchTokens.wine),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            onPressed: () {
                              setModalState(() {
                                draftRootId = '';
                                draftChildId = '';
                                draftFacets.clear();
                                draftLanguage = '';
                                draftCondition = '';
                                minSaleCtrl.clear();
                                maxSaleCtrl.clear();
                                minExchangeCtrl.clear();
                                maxExchangeCtrl.clear();
                              });
                            },
                            child: const Text(
                              'Xóa bộ lọc',
                              style: TextStyle(
                                color: StitchTokens.wine,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: StitchTokens.wine,
                              foregroundColor: StitchTokens.gold,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            onPressed: () {
                              setState(() {
                                _categoryId = draftChildId.isNotEmpty
                                    ? draftChildId
                                    : draftRootId;
                                _selectedFacets = {
                                  for (final entry in draftFacets.entries)
                                    if (entry.value.isNotEmpty)
                                      entry.key: List.from(entry.value),
                                };
                                _language = draftLanguage;
                                _condition = draftCondition;
                                _minSalePrice = minSaleCtrl.text.trim();
                                _maxSalePrice = maxSaleCtrl.text.trim();
                                _minExchangeValue =
                                    minExchangeCtrl.text.trim();
                                _maxExchangeValue =
                                    maxExchangeCtrl.text.trim();
                              });
                              Navigator.of(ctx).pop();
                              _search();
                            },
                            child: const Text(
                              'Áp dụng bộ lọc',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  static Widget _filterSectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: StitchTokens.wine,
        letterSpacing: 0.6,
      ),
    );
  }

  static Widget _filterChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? StitchTokens.wine : const Color(0xFFF4EEE6),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? StitchTokens.wineDark : const Color(0x225C0202),
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? StitchTokens.gold : const Color(0xFF382E2B),
          ),
        ),
      ),
    );
  }

  static Widget _priceTextField({
    required TextEditingController controller,
    required String label,
    required String placeholder,
  }) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      style: const TextStyle(fontSize: 13, color: Color(0xFF261E1A)),
      decoration: InputDecoration(
        labelText: label,
        hintText: placeholder,
        labelStyle: const TextStyle(fontSize: 12, color: Color(0xFF7A6E65)),
        hintStyle: const TextStyle(fontSize: 12, color: Color(0xFFB0A499)),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0x335C0202)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: StitchTokens.wine, width: 1.5),
        ),
        isDense: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeCount = _activeFilterCount;

    return AppScreen(
      currentNavPath: '/search',
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Search row with integrated Filter Icon Button
          Row(
            children: [
              Expanded(
                child: SearchField(
                  controller: _searchCtrl,
                  placeholder: 'Nhập tên sách, tác giả, nhà xuất bản…',
                  onSubmitted: (_) => _search(),
                  onClear: _search,
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: () => _openFilterModal(context),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: activeCount > 0
                        ? StitchTokens.wine
                        : const Color(0xFFFFFDF8),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: activeCount > 0
                          ? StitchTokens.wineDark
                          : const Color(0x335C0202),
                      width: 1.2,
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x0F000000),
                        blurRadius: 4,
                        offset: Offset(0, 1),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.tune_rounded,
                        size: 20,
                        color: activeCount > 0
                            ? StitchTokens.gold
                            : StitchTokens.wine,
                      ),
                      if (activeCount > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1.5,
                          ),
                          decoration: BoxDecoration(
                            color: StitchTokens.gold,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '$activeCount',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: StitchTokens.wineDark,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Horizontal Mode selector (outside filter modal)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _modes.map((m) {
                final isSelected = _mode == m.id;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: InkWell(
                    onTap: () {
                      if (_mode != m.id) {
                        setState(() => _mode = m.id);
                        _search();
                      }
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 7.5,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? StitchTokens.wine
                            : const Color(0xFFF7F2EB),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isSelected
                              ? StitchTokens.wineDark
                              : const Color(0x285C0202),
                          width: isSelected ? 1.4 : 1,
                        ),
                        boxShadow: isSelected
                            ? const [
                                BoxShadow(
                                  color: Color(0x225C0202),
                                  blurRadius: 4,
                                  offset: Offset(0, 2),
                                )
                              ]
                            : null,
                      ),
                      child: Text(
                        m.id.isEmpty ? 'Tất cả' : m.title,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected
                              ? StitchTokens.gold
                              : const Color(0xFF382E2B),
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Divider(
              height: 1,
              thickness: 1,
              color: Color(0x1F5C0202),
            ),
          ),

          // Horizontal Sort quick selector (outside filter modal)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 5.5,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0x125C0202),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.swap_vert_rounded,
                        size: 15,
                        color: StitchTokens.wine,
                      ),
                      SizedBox(width: 4),
                      Text(
                        'Sắp xếp:',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: StitchTokens.wine,
                        ),
                      ),
                    ],
                  ),
                ),
                ..._sorts.map((s) {
                  final isSelected = _sort == s.id;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: InkWell(
                      onTap: () {
                        if (_sort != s.id) {
                          setState(() => _sort = s.id);
                          _search();
                        }
                      },
                      borderRadius: BorderRadius.circular(8),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5.5,
                        ),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? StitchTokens.wine
                              : const Color(0xFFF4EEE6),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isSelected
                                ? StitchTokens.wineDark
                                : const Color(0x225C0202),
                            width: 1,
                          ),
                        ),
                        child: Text(
                          s.title,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: isSelected
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: isSelected
                                ? StitchTokens.gold
                                : const Color(0xFF382E2B),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),

          // Active filter tags strip
          if (activeCount > 0) ...[
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  if (_categoryId.isNotEmpty)
                    _ActiveFilterTag(
                      label: _categoryLabel(_categoryId),
                      onRemove: () {
                        setState(() {
                          _categoryId = '';
                          _selectedFacets = const {};
                        });
                        _search();
                      },
                    ),
                  for (final entry in _selectedFacets.entries)
                    for (final optId in entry.value)
                      _ActiveFilterTag(
                        label: _facetOptionLabel(entry.key, optId),
                        onRemove: () {
                          setState(() {
                            final current = List<String>.from(
                              _selectedFacets[entry.key] ?? [],
                            );
                            current.remove(optId);
                            final nextFacets =
                                Map<String, List<String>>.from(_selectedFacets);
                            if (current.isEmpty) {
                              nextFacets.remove(entry.key);
                            } else {
                              nextFacets[entry.key] = current;
                            }
                            _selectedFacets = nextFacets;
                          });
                          _search();
                        },
                      ),
                  if (_language.isNotEmpty)
                    _ActiveFilterTag(
                      label:
                          'Ngôn ngữ: ${CatalogTaxonomy.getLanguageLabel(_language)}',
                      onRemove: () {
                        setState(() => _language = '');
                        _search();
                      },
                    ),
                  if (_condition.isNotEmpty)
                    _ActiveFilterTag(
                      label: _conditionLabel(_condition),
                      onRemove: () {
                        setState(() => _condition = '');
                        _search();
                      },
                    ),
                  if (_maxSalePrice.isNotEmpty)
                    _ActiveFilterTag(
                      label: 'Giá bán ≤ ${_formatCompactPrice(_maxSalePrice)}',
                      onRemove: () {
                        setState(() => _maxSalePrice = '');
                        _search();
                      },
                    ),
                  if (_minSalePrice.isNotEmpty)
                    _ActiveFilterTag(
                      label: 'Giá bán ≥ ${_formatCompactPrice(_minSalePrice)}',
                      onRemove: () {
                        setState(() => _minSalePrice = '');
                        _search();
                      },
                    ),
                  if (_maxExchangeValue.isNotEmpty)
                    _ActiveFilterTag(
                      label: 'Đổi ≤ ${_formatCompactPrice(_maxExchangeValue)}',
                      onRemove: () {
                        setState(() => _maxExchangeValue = '');
                        _search();
                      },
                    ),
                  TextButton(
                    onPressed: _resetFilters,
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                    ),
                    child: const Text(
                      'Xóa tất cả',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: StitchTokens.wine,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpace.md),

          if (_error != null) Notice(message: _error!, tone: NoticeTone.error),
          if (_loading)
            const StatePanel(loading: true, title: 'Đang lọc kệ sách…')
          else if (_items.isEmpty)
            StatePanel(
              title: 'Không có bản sách khớp bộ lọc',
              message: 'Thử đổi từ khóa hoặc thiết lập lại bộ lọc.',
              actionLabel: 'Đặt lại bộ lọc',
              onAction: _resetFilters,
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                final cols = constraints.maxWidth >= 760
                    ? 4
                    : constraints.maxWidth >= 520
                        ? 3
                        : 2;
                const spacing = 12.0;
                final width =
                    (constraints.maxWidth - spacing * (cols - 1)) / cols;
                return Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: _items.map((item) {
                    return SizedBox(
                      width: width,
                      child: BookCard(
                        item: item,
                        onOpen: () =>
                            context.push('/book?id=${item['id'] ?? ''}'),
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

class _ActiveFilterTag extends StatelessWidget {
  const _ActiveFilterTag({required this.label, required this.onRemove});

  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.fromLTRB(10, 4, 6, 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF3ECE4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x335C0202)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: StitchTokens.darkWood,
            ),
          ),
          const SizedBox(width: 4),
          InkWell(
            onTap: onRemove,
            borderRadius: BorderRadius.circular(12),
            child: const Icon(
              Icons.close_rounded,
              size: 14,
              color: StitchTokens.wine,
            ),
          ),
        ],
      ),
    );
  }
}


/// BookScreen (`/book`) matching `apps/mobile-react-native/src/features/shelf/book-screen.tsx`
/// Includes whole-bundle manifest (`bundle.items`), exchange criteria, condition dossier,
/// seller reputation link, Add to Cart, Start Negotiation Chat, Buy Now, and Propose Exchange.
class BookScreen extends ConsumerStatefulWidget {
  const BookScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends ConsumerState<BookScreen> {
  bool _loading = true;
  String? _error;
  String? _actionMessage;
  bool _actionBusy = false;
  bool _savedWishlist = false;
  Map<String, dynamic>? _listing;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadBook);
  }

  Future<void> _loadBook() async {
    if (widget.id.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Mã bài đăng không hợp lệ.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final data = await client
          .publicRequest('/listings/${widget.id}?bundleSupport=whole-v1');
      if (!mounted) return;
      setState(() {
        _listing = Map<String, dynamic>.from(data as Map);
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

  Future<void> _handleBuyNow() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) {
      context.push('/account');
      return;
    }
    if (_listing == null) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _BuyNowBottomSheet(
        listing: _listing!,
      ),
    );
  }

  Future<void> _handleToggleWishlist() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) {
      context.push('/account');
      return;
    }
    final client = ref.read(sessionClientProvider);
    try {
      if (_savedWishlist) {
        await client.request(
          '/me/wishlist/listings/${widget.id}',
          method: 'DELETE',
          idempotencyKey: generateIdempotencyKey('wishlist-del'),
        );
      } else {
        await client.request(
          '/me/wishlist/listings/${widget.id}',
          method: 'PUT',
          idempotencyKey: generateIdempotencyKey('wishlist-add'),
          body: {
            'wantsToExchange': false,
            'receiveNotifications': true,
          },
        );
      }
      if (!mounted) return;
      setState(() {
        _savedWishlist = !_savedWishlist;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = presentErrorMessage(e));
    }
  }

  Future<void> _handleOpenConversation() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) {
      context.push('/account');
      return;
    }
    if (_listing == null) return;
    setState(() {
      _actionBusy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final mode = (_listing!['mode'] ?? 'Sale').toString();
      final intent = mode == 'Exchange' ? 'Exchange' : 'Negotiation';
      final res = await client.request(
        '/listings/${widget.id}/purchase-conversations',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('conv-open'),
        body: {
          'expectedVersion': _listing!['version'] ?? 1,
          'intent': intent,
        },
      );
      if (!mounted) return;
      setState(() => _actionBusy = false);
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
        _actionBusy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final item = _listing;
    final book = item?['book'] is Map
        ? Map<String, dynamic>.from(item!['book'] as Map)
        : const <String, dynamic>{};
    final bundle = item?['bundle'] is Map
        ? Map<String, dynamic>.from(item!['bundle'] as Map)
        : null;
    final seller = item?['seller'] is Map
        ? Map<String, dynamic>.from(item!['seller'] as Map)
        : const <String, dynamic>{};
    final isOwner = session.isAuthenticated &&
        seller['id'] != null &&
        seller['id'].toString() == session.user?.id;
    final mode = (item?['mode'] ?? 'Sale').toString();
    final canBuy = mode == 'Sale' || mode == 'Both';
    final canExchange = mode == 'Exchange' || mode == 'Both';

    return AppScreen(
      header: const TopNavbar(),
      child: _loading
          ? const StatePanel(loading: true, title: 'Đang tải thông tin sách…')
          : item == null
              ? StatePanel(
                  title: 'Không tìm thấy sách',
                  message: _error ??
                      'Bài đăng không còn hiển thị ở đường dẫn này. Hãy quay lại kệ sách để khám phá cuốn khác.',
                  actionLabel: 'Về kệ sách',
                  onAction: () => context.go('/'),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          BackAction(
                            title: 'Về kệ sách',
                            compact: true,
                            onPressed: () => context.canPop()
                                ? context.pop()
                                : context.go('/'),
                          ),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                onPressed: _handleToggleWishlist,
                                iconSize: 18,
                                padding: const EdgeInsets.all(4),
                                constraints: const BoxConstraints(
                                  minWidth: 32,
                                  minHeight: 32,
                                ),
                                visualDensity: VisualDensity.compact,
                                icon: Icon(
                                  _savedWishlist
                                      ? Icons.bookmark_rounded
                                      : Icons.bookmark_border_rounded,
                                  color: StitchTokens.wine,
                                ),
                                tooltip: 'Lưu sách yêu thích',
                              ),
                              const SizedBox(width: 4),
                              IconButton(
                                onPressed: () => context.push('/cart'),
                                iconSize: 18,
                                padding: const EdgeInsets.all(4),
                                constraints: const BoxConstraints(
                                  minWidth: 32,
                                  minHeight: 32,
                                ),
                                visualDensity: VisualDensity.compact,
                                icon: const Icon(
                                  Icons.shopping_bag_outlined,
                                  color: StitchTokens.wine,
                                ),
                                tooltip: 'Giỏ sách',
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpace.sm),
                    if (_error != null) ...[
                      Notice(message: _error!, tone: NoticeTone.error),
                      const SizedBox(height: AppSpace.md),
                    ],
                    if (_actionMessage != null) ...[
                      Notice(
                        message: _actionMessage!,
                        tone: NoticeTone.success,
                      ),
                      const SizedBox(height: AppSpace.md),
                    ],

                    // Main Book Dossier Card
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
                          Center(
                            child: Container(
                              constraints: const BoxConstraints(maxHeight: 260),
                              child: AspectRatio(
                                aspectRatio: 3 / 4,
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(12),
                                  child: BookCoverPhoto(item: item),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpace.lg),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: StitchTokens.wine,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: AppText(
                                  bundle != null
                                      ? 'BỘ SÁCH NGUYÊN BỘ'
                                      : formatModeLabel(mode).toUpperCase(),
                                  kind: AppTextKind.label,
                                  color: StitchTokens.gold,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.successSurface,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: AppText(
                                  'Tình trạng: ${formatConditionLabel(item['condition']?.toString())}',
                                  kind: AppTextKind.label,
                                  color: AppColors.forest,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpace.md),
                          AppText(
                            (bundle?['title'] ??
                                    book['title'] ??
                                    'Ấn bản sách cũ')
                                .toString(),
                            kind: AppTextKind.bookTitle,
                            color: StitchTokens.darkWood,
                          ),
                          const SizedBox(height: 4),
                          AppText(
                            (book['authors'] is List && (book['authors'] as List).isNotEmpty
                                    ? 'Tác giả: ${(book['authors'] as List).join(' · ')}'
                                    : (book['authors'] != null && book['authors'].toString().isNotEmpty
                                        ? 'Tác giả: ${book['authors']}'
                                        : (book['publisher'] != null
                                            ? 'NXB: ${book['publisher']}'
                                            : 'Đang cập nhật tác giả')))
                                .toString(),
                            kind: AppTextKind.body,
                            color: AppColors.muted,
                          ),
                          const Divider(height: AppSpace.xxl),
                          if (item['salePrice'] is num)
                            AppText(
                              'Giá niêm yết: ${formatVnd(item['salePrice'] as num)}',
                              kind: AppTextKind.bookPrice,
                              color: StitchTokens.wine,
                            ),
                          if (item['exchangeValue'] is num) ...[
                            const SizedBox(height: 4),
                            AppText(
                              'Giá trị quy đổi: ${formatVnd(item['exchangeValue'] as num)}',
                              kind: AppTextKind.bold,
                              color: StitchTokens.warmUmber,
                            ),
                          ],
                          const SizedBox(height: AppSpace.md),
                          _MetadataRow(
                            label: 'Bìa & gáy sách',
                            value: (item['coverAndSpine'] ??
                                    item['conditionNotes'] ??
                                    'Còn tốt, nguyên vẹn')
                                .toString(),
                          ),
                          _MetadataRow(
                            label: 'Ruột & số trang',
                            value: (item['pages'] ?? 'Đủ trang, rõ chữ')
                                .toString(),
                          ),
                          _MetadataRow(
                            label: 'Ghi chú người bán',
                            value: (item['notes'] ??
                                    item['description'] ??
                                    'Sách bảo quản kỹ trên kệ gia đình.')
                                .toString(),
                          ),
                          _MetadataRow(
                            label: 'Khu vực giao nhận',
                            value: ((item['fulfillment'] is Map
                                        ? (item['fulfillment'] as Map)['name']
                                        : null) ??
                                    'TP. Hồ Chí Minh / Bình Dương / Vũng Tàu')
                                .toString(),
                          ),
                        ],
                      ),
                    ),

                    // Whole-Bundle Manifest if present
                    if (bundle != null && bundle['items'] is List) ...[
                      const SizedBox(height: AppSpace.lg),
                      Container(
                        padding: const EdgeInsets.all(AppSpace.lg),
                        decoration: BoxDecoration(
                          color: StitchTokens.roseWarmSurface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: StitchTokens.peachBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppText(
                              'Danh mục bộ sách (${(bundle['items'] as List).length} cuốn · Bán nguyên bộ)',
                              kind: AppTextKind.card,
                              color: StitchTokens.wine,
                            ),
                            const SizedBox(height: AppSpace.sm),
                            ...(bundle['items'] as List)
                                .whereType<Map>()
                                .map((rawBook) {
                              final b = Map<String, dynamic>.from(rawBook);
                              return Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 6,
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.auto_stories_outlined,
                                      size: 16,
                                      color: StitchTokens.wine,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: AppText(
                                        (b['title'] ?? 'Cuốn trong bộ')
                                            .toString(),
                                        kind: AppTextKind.bold,
                                      ),
                                    ),
                                    AppText(
                                      formatConditionLabel(
                                        b['condition']?.toString(),
                                      ),
                                      kind: AppTextKind.small,
                                      color: AppColors.forest,
                                    ),
                                  ],
                                ),
                              );
                            }),
                          ],
                        ),
                      ),
                    ],

                    // Seller card
                    const SizedBox(height: AppSpace.lg),
                    Container(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: StitchTokens.cardBorder),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: StitchTokens.wine,
                            child: AppText(
                              ((seller['displayName'] ?? 'N').toString().isNotEmpty
                                      ? (seller['displayName'] ?? 'N')
                                          .toString()[0]
                                      : 'N')
                                  .toUpperCase(),
                              kind: AppTextKind.bold,
                              color: StitchTokens.gold,
                            ),
                          ),
                          const SizedBox(width: AppSpace.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AppText(
                                  (seller['displayName'] ?? 'Người bán Lật Lại')
                                      .toString(),
                                  kind: AppTextKind.bold,
                                ),
                                const AppText(
                                  'Thành viên giao dịch có bảo đảm ký quỹ 72h',
                                  kind: AppTextKind.small,
                                  color: AppColors.muted,
                                ),
                              ],
                            ),
                          ),
                          if (seller['id'] != null)
                            AppButton(
                              title: 'Hồ sơ uy tín',
                              secondary: true,
                              wine: true,
                              compact: true,
                              onPressed: () => context.push(
                                '/reputation?sellerId=${seller['id']}',
                              ),
                            ),
                        ],
                      ),
                    ),

                    const SizedBox(height: AppSpace.xl),

                    // Action Buttons (Matching BookBottomBar)
                    if (isOwner)
                      Container(
                        padding: const EdgeInsets.all(AppSpace.lg),
                        decoration: BoxDecoration(
                          color: AppColors.infoSurface,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const AppText(
                              'Đây là bài đăng của bạn.',
                              kind: AppTextKind.bold,
                              color: AppColors.info,
                            ),
                            const SizedBox(height: AppSpace.sm),
                            AppButton(
                              title: 'Quản lý trong Kệ sách của tôi',
                              wine: true,
                              onPressed: () => context.push('/drafts'),
                            ),
                          ],
                        ),
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (canBuy) ...[
                            Row(
                              children: [
                                Expanded(
                                  child: AppButton(
                                    title: 'Mua ngay',
                                    wine: true,
                                    busy: _actionBusy,
                                    icon: Icons.bolt_rounded,
                                    onPressed: _handleBuyNow,
                                  ),
                                ),
                                const SizedBox(width: AppSpace.md),
                                Expanded(
                                  child: AppButton(
                                    title: 'Thương lượng & Mua',
                                    secondary: true,
                                    wine: true,
                                    busy: _actionBusy,
                                    icon: Icons.handshake_outlined,
                                    onPressed: _handleOpenConversation,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpace.sm),
                          ],
                          if (canExchange)
                            AppButton(
                              title: 'Đề nghị đổi sách',
                              icon: Icons.swap_horiz_rounded,
                              onPressed: () => context
                                  .push('/exchange-compose?book=${widget.id}'),
                            ),
                        ],
                      ),
                  ],
                ),
    );
  }
}

class _BuyNowBottomSheet extends ConsumerStatefulWidget {
  const _BuyNowBottomSheet({required this.listing});

  final Map<String, dynamic> listing;

  @override
  ConsumerState<_BuyNowBottomSheet> createState() => _BuyNowBottomSheetState();
}

class _BuyNowBottomSheetState extends ConsumerState<_BuyNowBottomSheet> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  int _addressBookVersion = 0;
  List<Map<String, dynamic>> _addresses = const [];
  Map<String, dynamic>? _selectedAddress;

  num _walletBalance = 0;

  bool _quoteLoading = false;
  Map<String, dynamic>? _quote;
  String? _quoteError;

  bool _bundleAcknowledged = true;
  bool _addingAddress = false;

  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _phoneCtrl = TextEditingController();
  final TextEditingController _detailCtrl = TextEditingController();
  String _localityCode = 'Q1';
  bool _savingAddress = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_initData);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _detailCtrl.dispose();
    super.dispose();
  }

  Future<void> _initData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final futures = await Future.wait([
        client.request('/me/addresses').catchError((_) => null),
        client.request('/me/wallet').catchError((_) => null),
      ]);

      final addrRes = futures[0];
      final walletRes = futures[1];

      int bookVer = 0;
      List<Map<String, dynamic>> addrList = [];
      if (addrRes is Map) {
        bookVer = (addrRes['version'] is num)
            ? (addrRes['version'] as num).toInt()
            : 0;
        final rawItems =
            addrRes['items'] is List ? (addrRes['items'] as List) : const [];
        addrList = rawItems
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      num balance = 0;
      if (walletRes is Map) {
        balance = (walletRes['available'] ??
                walletRes['availableBalance'] ??
                walletRes['balance'] ??
                0) as num;
      }

      if (!mounted) return;

      Map<String, dynamic>? defaultAddr;
      if (addrList.isNotEmpty) {
        defaultAddr = addrList.firstWhere(
          (a) => a['isDefault'] == true,
          orElse: () => addrList.first,
        );
      }

      setState(() {
        _addressBookVersion = bookVer;
        _addresses = addrList;
        _selectedAddress = defaultAddr;
        _walletBalance = balance;
        _loading = false;
        _addingAddress = addrList.isEmpty;
      });

      if (_selectedAddress != null) {
        await _fetchQuote(_selectedAddress!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _fetchQuote(Map<String, dynamic> addr) async {
    setState(() {
      _quoteLoading = true;
      _quoteError = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final listingId = widget.listing['id']?.toString() ?? '';
      final listingVer = (widget.listing['version'] is num)
          ? (widget.listing['version'] as num).toInt()
          : 1;
      final revisionId = (widget.listing['revisionId'] ??
              widget.listing['currentRevisionId'] ??
              '')
          .toString();
      final addrId = addr['id']?.toString() ?? '';
      final addrVer =
          (addr['version'] is num) ? (addr['version'] as num).toInt() : 1;
      final isBundle = widget.listing['bundle'] != null;

      final quoteRes = await client.request(
        '/listings/$listingId/quotes',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('buy-quote'),
        body: {
          'expectedListingVersion': listingVer,
          'expectedListingRevisionId': revisionId,
          'destinationAddressId': addrId,
          'expectedDestinationAddressVersion': addrVer,
          'method': 'DirectDelivery',
          if (isBundle) 'acknowledgeWholeBundle': true,
        },
      );

      final quoteId = (quoteRes is Map)
          ? (quoteRes['entityId'] ?? quoteRes['id'])?.toString()
          : null;

      Map<String, dynamic>? finalQuote;
      if (quoteId != null && quoteId.isNotEmpty) {
        try {
          final quoteDetail = await client.request('/me/quotes/$quoteId');
          if (quoteDetail is Map) {
            finalQuote = Map<String, dynamic>.from(quoteDetail);
          }
        } catch (detailErr) {
          debugPrint('Get quote detail error: $detailErr');
        }
      }

      if (finalQuote == null && quoteRes is Map) {
        finalQuote = Map<String, dynamic>.from(quoteRes);
      }

      if (!mounted) return;
      setState(() {
        _quote = finalQuote;
        _quoteLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _quote = null;
        _quoteLoading = false;
        _quoteError = presentErrorMessage(e);
      });
    }
  }

  Future<void> _saveNewAddress() async {
    if (_nameCtrl.text.trim().isEmpty ||
        _phoneCtrl.text.trim().length < 10 ||
        _detailCtrl.text.trim().isEmpty) {
      setState(() =>
          _error = 'Vui lòng điền đủ họ tên, SĐT (10 số) và địa chỉ chi tiết.');
      return;
    }
    setState(() {
      _savingAddress = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/me/addresses',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('addr-add'),
        body: {
          'expectedBookVersion': _addressBookVersion,
          'makeDefault': _addresses.isEmpty,
          'address': {
            'recipientName': _nameCtrl.text.trim(),
            'phone': _phoneCtrl.text.trim(),
            'serviceAreaCode': 'HCM-DEMO-v1',
            'localityCode': _localityCode,
            'detail': _detailCtrl.text.trim(),
          },
        },
      );

      final addrRes =
          await client.request('/me/addresses').catchError((_) => null);
      if (!mounted) return;

      int bookVer = _addressBookVersion + 1;
      List<Map<String, dynamic>> addrList = [];
      if (addrRes is Map) {
        bookVer = (addrRes['version'] is num)
            ? (addrRes['version'] as num).toInt()
            : bookVer;
        final rawItems =
            addrRes['items'] is List ? (addrRes['items'] as List) : const [];
        addrList = rawItems
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      final newAddrId = (res is Map && res['addressId'] != null)
          ? res['addressId'].toString()
          : (res is Map && res['entityId'] != null
              ? res['entityId'].toString()
              : null);

      Map<String, dynamic>? selected;
      if (newAddrId != null) {
        selected = addrList.firstWhere(
          (a) => a['id']?.toString() == newAddrId,
          orElse: () => addrList.isNotEmpty ? addrList.last : const {},
        );
      } else if (addrList.isNotEmpty) {
        selected = addrList.last;
      }

      setState(() {
        _addressBookVersion = bookVer;
        _addresses = addrList;
        _selectedAddress = selected;
        _addingAddress = false;
        _savingAddress = false;
        _nameCtrl.clear();
        _phoneCtrl.clear();
        _detailCtrl.clear();
      });

      if (_selectedAddress != null) {
        await _fetchQuote(_selectedAddress!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _savingAddress = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _submitBuyNow() async {
    if (_submitting) return;
    if (_selectedAddress == null) {
      setState(() => _error = 'Vui lòng chọn địa chỉ nhận hàng.');
      return;
    }
    if (widget.listing['bundle'] != null && !_bundleAcknowledged) {
      setState(() =>
          _error = 'Vui lòng xác nhận mua nguyên bộ sách trước khi tiếp tục.');
      return;
    }

    if (_quote == null) {
      await _fetchQuote(_selectedAddress!);
      if (_quote == null) {
        setState(() => _error = _quoteError ??
            'Chưa thể lấy báo giá giao dịch. Vui lòng kiểm tra địa chỉ và thử lại.');
        return;
      }
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final client = ref.read(sessionClientProvider);
    try {
      final quoteId = _quote!['id']?.toString() ?? '';
      final quoteVer =
          (_quote!['version'] is num) ? (_quote!['version'] as num).toInt() : 1;
      final listingVer = (_quote!['listingVersion'] is num)
          ? (_quote!['listingVersion'] as num).toInt()
          : 1;
      final revisionId = (_quote!['listingRevisionId'] ?? '').toString();

      final buyNowRes = await client.request(
        '/orders/buy-now',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('buy-order'),
        body: {
          'quoteId': quoteId,
          'expectedQuoteVersion': quoteVer,
          'expectedListingVersion': listingVer,
          'expectedListingRevisionId': revisionId,
        },
      );

      final map = buyNowRes is Map
          ? Map<String, dynamic>.from(buyNowRes)
          : const <String, dynamic>{};
      final orderId = (map['entityId'] ?? map['id'] ?? '').toString();
      if (orderId.isEmpty) {
        throw Exception('Không nhận được mã đơn hàng từ hệ thống.');
      }

      final amounts =
          _quote!['amounts'] is Map ? (_quote!['amounts'] as Map) : const {};
      final buyerTotal = (amounts['buyerTotal'] ?? 0) as num;

      bool paidSuccess = false;
      if (_walletBalance >= buyerTotal) {
        try {
          await client.request(
            '/orders/$orderId/pay',
            method: 'POST',
            idempotencyKey: generateIdempotencyKey('order-pay'),
            body: {'expectedVersion': 1},
          );
          paidSuccess = true;
        } catch (payErr) {
          debugPrint('Immediate wallet payment error: $payErr');
        }
      }

      if (!mounted) return;
      Navigator.of(context).pop();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(paidSuccess
              ? '✓ Mua ngay và thanh toán Escrow thành công!'
              : '✓ Đã tạo đơn mua ngay thành công! Vui lòng hoàn tất thanh toán.'),
          backgroundColor: AppColors.forest,
          behavior: SnackBarBehavior.floating,
        ),
      );

      context.push('/orders/$orderId');
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
    final book = widget.listing['book'] is Map
        ? Map<String, dynamic>.from(widget.listing['book'] as Map)
        : const <String, dynamic>{};
    final bundle = widget.listing['bundle'] is Map
        ? Map<String, dynamic>.from(widget.listing['bundle'] as Map)
        : null;
    final title = (bundle?['title'] ?? book['title'] ?? 'Ấn bản sách cũ').toString();
    final author = (book['authors'] is List && (book['authors'] as List).isNotEmpty
            ? (book['authors'] as List).join(' · ')
            : (book['authors'] ?? 'Đang cập nhật tác giả'))
        .toString();

    final salePrice = (widget.listing['salePrice'] is num)
        ? (widget.listing['salePrice'] as num)
        : 0;
    final amounts = _quote?['amounts'] is Map
        ? Map<String, dynamic>.from(_quote!['amounts'] as Map)
        : null;
    final bookPrice = (amounts?['bookPrice'] is num)
        ? (amounts!['bookPrice'] as num)
        : salePrice;
    final buyerTotal = (amounts?['buyerTotal'] is num)
        ? (amounts!['buyerTotal'] as num)
        : bookPrice;
    final isWalletSufficient = _walletBalance >= buyerTotal && buyerTotal > 0;

    final session = ref.watch(sessionProvider);
    final currentUserId = session.user?.id;
    final sellerId = widget.listing['seller'] is Map
        ? widget.listing['seller']['id']?.toString()
        : widget.listing['ownerId']?.toString();
    final isOwner =
        currentUserId != null && sellerId != null && currentUserId == sellerId;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 10, bottom: 6),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Modal Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: StitchTokens.wine.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.bolt_rounded,
                        color: StitchTokens.wine, size: 22),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Xác nhận Mua ngay',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: StitchTokens.wine,
                          ),
                        ),
                        Text(
                          'Ký quỹ Escrow bảo vệ người mua đến khi nhận sách',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // Scrollable Content
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_error != null) ...[
                      Notice(message: _error!, tone: NoticeTone.error),
                      const SizedBox(height: 12),
                    ],

                    // 1. Book Summary Card
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: StitchTokens.parchment,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: StitchTokens.peachBorder),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: 52,
                            height: 70,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: BookCoverPhoto(item: widget.listing),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: StitchTokens.darkWood,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  author,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.muted,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Text(
                                      formatVnd(widget.listing['salePrice'] as num?),
                                      style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        color: StitchTokens.wine,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.successSurface,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        formatConditionLabel(widget.listing['condition']?.toString()),
                                        style: const TextStyle(
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.forest,
                                        ),
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

                    if (bundle != null) ...[
                      const SizedBox(height: 8),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _bundleAcknowledged,
                        activeColor: StitchTokens.wine,
                        title: const Text(
                          'Tôi xác nhận mua nguyên bộ sách (không hỗ trợ tách lẻ).',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        onChanged: (v) =>
                            setState(() => _bundleAcknowledged = v ?? false),
                      ),
                    ],

                    const SizedBox(height: 16),

                    // 2. Delivery Address Section
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Expanded(
                          child: Text(
                            'ĐỊA CHỈ NHẬN HÀNG (DIRECTDELIVERY)',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5,
                              color: StitchTokens.darkWood,
                            ),
                          ),
                        ),
                        if (!_addingAddress && _addresses.isNotEmpty)
                          InkWell(
                            onTap: () => setState(() => _addingAddress = true),
                            child: const Text(
                              '+ Thêm mới',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: StitchTokens.wine,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    if (_loading)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    else if (_addingAddress) ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: StitchTokens.cardBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            AppTextField(
                              label: 'Tên người nhận',
                              requiredField: true,
                              controller: _nameCtrl,
                            ),
                            const SizedBox(height: 10),
                            AppTextField(
                              label: 'Số điện thoại',
                              requiredField: true,
                              controller: _phoneCtrl,
                              keyboardType: TextInputType.phone,
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'KHU VỰC VẬN CHUYỂN',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: StitchTokens.darkWood,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                ('Q1', 'Quận 1'),
                                ('Q3', 'Quận 3'),
                                ('THUDUC', 'TP. Thủ Đức'),
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
                            const SizedBox(height: 10),
                            AppTextField(
                              label: 'Địa chỉ chi tiết (số nhà, đường, phường)',
                              requiredField: true,
                              controller: _detailCtrl,
                            ),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                if (_addresses.isNotEmpty) ...[
                                  Expanded(
                                    child: AppButton(
                                      title: 'Hủy',
                                      secondary: true,
                                      compact: true,
                                      onPressed: () =>
                                          setState(() => _addingAddress = false),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                ],
                                Expanded(
                                  flex: 2,
                                  child: AppButton(
                                    title: 'Lưu & Chọn địa chỉ này',
                                    wine: true,
                                    compact: true,
                                    busy: _savingAddress,
                                    onPressed: _saveNewAddress,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ] else if (_addresses.isEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: StitchTokens.parchment,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: StitchTokens.peachBorder),
                        ),
                        child: Column(
                          children: [
                            const Text(
                              'Bạn chưa có địa chỉ nhận hàng nào.',
                              style: TextStyle(fontSize: 12.5),
                            ),
                            const SizedBox(height: 8),
                            AppButton(
                              title: '+ Thêm địa chỉ nhận hàng',
                              wine: true,
                              compact: true,
                              onPressed: () =>
                                  setState(() => _addingAddress = true),
                            ),
                          ],
                        ),
                      ),
                    ] else ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: StitchTokens.parchment,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: StitchTokens.peachBorder),
                        ),
                        child: Column(
                          children: [
                            ..._addresses.map((addr) {
                              final isSelected =
                                  _selectedAddress?['id'] == addr['id'];
                              return InkWell(
                                onTap: () {
                                  setState(() => _selectedAddress = addr);
                                  _fetchQuote(addr);
                                },
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 4),
                                  child: Row(
                                    children: [
                                      Icon(
                                        isSelected
                                            ? Icons.radio_button_checked_rounded
                                            : Icons.radio_button_off_rounded,
                                        color: isSelected
                                            ? StitchTokens.wine
                                            : Colors.grey,
                                        size: 20,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Text(
                                                  '${addr['recipientName']} · ${addr['phone']}',
                                                  style: const TextStyle(
                                                    fontSize: 12.5,
                                                    fontWeight: FontWeight.w700,
                                                    color: StitchTokens.darkWood,
                                                  ),
                                                ),
                                                if (addr['isDefault'] == true) ...[
                                                  const SizedBox(width: 6),
                                                  Container(
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                            horizontal: 4,
                                                            vertical: 1),
                                                    decoration: BoxDecoration(
                                                      color: StitchTokens.wine
                                                          .withValues(alpha: 0.1),
                                                      borderRadius:
                                                          BorderRadius.circular(4),
                                                    ),
                                                    child: const Text(
                                                      'Mặc định',
                                                      style: TextStyle(
                                                        fontSize: 9.5,
                                                        color: StitchTokens.wine,
                                                        fontWeight: FontWeight.w600,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ],
                                            ),
                                            Text(
                                              '${addr['detail']}, ${addr['localityCode']}',
                                              style: const TextStyle(
                                                fontSize: 11.5,
                                                color: AppColors.muted,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 16),

                    // 3. Pricing & Shipping Quote
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: StitchTokens.cardBorder),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.receipt_long_outlined,
                                  size: 16, color: StitchTokens.wine),
                              SizedBox(width: 6),
                              Text(
                                'CHI TIẾT THANH TOÁN',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.5,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Expanded(
                                child: Text('Tiền sách:',
                                    style: TextStyle(
                                        fontSize: 12.5, color: AppColors.muted)),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                formatVnd(bookPrice),
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Expanded(
                                child: Text(
                                  'Tổng thanh toán:',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w700,
                                    color: StitchTokens.darkWood,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                formatVnd(buyerTotal),
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  color: StitchTokens.wine,
                                ),
                              ),
                            ],
                          ),
                          if (_quoteLoading) ...[
                            const SizedBox(height: 8),
                            const Row(
                              children: [
                                SizedBox(
                                  width: 12,
                                  height: 12,
                                  child: CircularProgressIndicator(strokeWidth: 1.5),
                                ),
                                SizedBox(width: 6),
                                Text(
                                  'Đang đồng bộ báo giá…',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: AppColors.muted,
                                  ),
                                ),
                              ],
                            ),
                          ],
                          if (_quoteError != null) ...[
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: AppColors.error.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: AppColors.error.withValues(alpha: 0.25),
                                ),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.info_outline,
                                      size: 14, color: AppColors.error),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      _quoteError!,
                                      style: const TextStyle(
                                        fontSize: 11.5,
                                        color: AppColors.error,
                                      ),
                                    ),
                                  ),
                                  if (_selectedAddress != null && !isOwner) ...[
                                    const SizedBox(width: 6),
                                    InkWell(
                                      onTap: () => _fetchQuote(_selectedAddress!),
                                      child: const Text(
                                        'Thử lại',
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
                                          color: StitchTokens.wine,
                                          decoration: TextDecoration.underline,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // 4. Wallet & Escrow Information
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isWalletSufficient
                            ? AppColors.successSurface
                            : const Color(0xFFFFF9E6),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isWalletSufficient
                              ? const Color(0xFFC7E5CD)
                              : const Color(0xFFFFE099),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.account_balance_wallet_outlined,
                                      size: 16,
                                      color: isWalletSufficient
                                          ? AppColors.forest
                                          : const Color(0xFFB45309),
                                    ),
                                    const SizedBox(width: 6),
                                    const Text(
                                      'Ví Lật Lại (Escrow):',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                formatVnd(_walletBalance),
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: isWalletSufficient
                                      ? AppColors.forest
                                      : const Color(0xFFB45309),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  isWalletSufficient
                                      ? '✓ Đủ số dư ví để thanh toán ngay. Tiền sẽ được giữ an toàn tại Escrow cho đến khi bạn nhận sách.'
                                      : '⚠️ Số dư ví chưa đủ. Bạn vẫn có thể bấm Mua ngay để đặt giữ đơn hàng rồi nạp ví sau.',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: isWalletSufficient
                                        ? AppColors.forest
                                        : const Color(0xFF92400E),
                                  ),
                                ),
                              ),
                              if (!isWalletSufficient) ...[
                                const SizedBox(width: 8),
                                InkWell(
                                  onTap: () {
                                    Navigator.of(context).pop();
                                    context.push('/wallet');
                                  },
                                  child: const Text(
                                    'Nạp ví ↗',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w700,
                                      color: StitchTokens.wine,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Fixed Bottom Action Button
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    offset: const Offset(0, -2),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: AppButton(
                title: isOwner
                    ? 'Bạn là người bán cuốn sách này'
                    : amounts != null && isWalletSufficient
                        ? 'Thanh toán & Đặt mua ngay (${formatVnd(buyerTotal)})'
                        : (amounts != null
                            ? 'Xác nhận đặt đơn (${formatVnd(buyerTotal)})'
                            : 'Xác nhận Mua ngay'),
                wine: !isOwner,
                disabled: isOwner,
                busy: _submitting,
                icon: Icons.bolt_rounded,
                onPressed:
                    (_quote != null && !_quoteLoading && !_submitting && !isOwner)
                        ? _submitBuyNow
                        : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  const _MetadataRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: AppText(
              '$label:',
              kind: AppTextKind.small,
              color: AppColors.muted,
            ),
          ),
          Expanded(
            child: AppText(
              value,
              kind: AppTextKind.bold,
            ),
          ),
        ],
      ),
    );
  }
}

/// GuideScreen (`/guide`) matching `apps/mobile-react-native/src/features/navigation/guide-screen.tsx`
class GuideScreen extends StatelessWidget {
  const GuideScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AppScreen(
      header: const TopNavbar(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Quay lại',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/'),
          ),
          const SizedBox(height: AppSpace.sm),
          const AppText(
            'Hướng dẫn mua, bán, đổi và đấu giá trên Lật Lại',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          const _GuideStepCard(
            number: '01',
            title: 'Mua bán & Thương lượng trực tiếp (DirectDelivery / ViaPoint)',
            description:
                'Mở trang sách, nhấn "Thương lượng & Mua" để trao đổi tình trạng sách và thống nhất giá với người bán. Khi người mua gửi địa chỉ nhận sách (TP.HCM, Bình Dương, Vũng Tàu) và chốt giá, người bán tạo đơn trực tiếp ngay trong phòng thương lượng.',
          ),
          const SizedBox(height: AppSpace.md),
          const _GuideStepCard(
            number: '02',
            title: 'Đổi sách đôi bên (Book Exchange)',
            description:
                'Chọn sách có gắn nhãn "Đổi" hoặc "Bán hoặc đổi", chọn cuốn sách đã duyệt trên kệ của bạn để đề nghị đổi kèm phần bù chênh lệch (nếu có). Cả hai bên đặt cọc bảo đảm và có thể hủy đồng thuận trước khi hoàn tất.',
          ),
          const SizedBox(height: AppSpace.md),
          const _GuideStepCard(
            number: '03',
            title: 'Đấu giá sách hiếm qua trạm ViaPoint',
            description:
                'Sách gửi đấu giá bắt buộc được bàn giao và kiểm định thực tế tại 2 điểm quản lý ViaPoint TP.HCM trước khi mở phiên. Người đặt giá có thể đặt thủ công, đặt tự động (Auto-bid) hoặc Mua ngay.',
          ),
          const SizedBox(height: AppSpace.md),
          const _GuideStepCard(
            number: '04',
            title: 'Quỹ ký quỹ & Quy trình bảo vệ 72h',
            description:
                'Tiền thanh toán và tiền cọc được giữ trong sổ cái bất biến (Ledger). Sau khi nhận sách, người mua có 72 giờ để kiểm tra và xác nhận hoàn tất hoặc mở yêu cầu hỗ trợ / khiếu nại.',
          ),
        ],
      ),
    );
  }
}

class _GuideStepCard extends StatelessWidget {
  const _GuideStepCard({
    required this.number,
    required this.title,
    required this.description,
  });

  final String number;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: StitchTokens.cardBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: StitchTokens.wine,
              borderRadius: BorderRadius.circular(10),
            ),
            child: AppText(
              number,
              kind: AppTextKind.bold,
              color: StitchTokens.gold,
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(title, kind: AppTextKind.bold, color: AppColors.forest),
                const SizedBox(height: 6),
                AppText(description, kind: AppTextKind.small),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
