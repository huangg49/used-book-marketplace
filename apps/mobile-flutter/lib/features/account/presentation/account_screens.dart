import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../auth/presentation/auth_screens.dart';

/// AccountScreen (`/account`) synchronized with Web's `AccountOverviewPage.tsx`,
/// `DashboardGreeting.tsx`, `DashboardStats.tsx`, `DashboardMyBooks.tsx`,
/// `DashboardOrders.tsx`, `DashboardSidebar.tsx`, and `MemberWorkPage.tsx`.
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key, this.returnBookId});

  final String? returnBookId;

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  String _selectedLane = '';
  String _shelfFilter = 'Approved';
  String _orderTab = 'Buyer';

  bool _workLoading = false;
  bool _statsLoading = false;
  List<Map<String, dynamic>> _workItems = const [];
  List<Map<String, dynamic>> _myListings = const [];
  List<Map<String, dynamic>> _myOrders = const [];
  Map<String, dynamic> _wallet = const {'available': 0, 'transactionHeld': 0};

  bool _logoutBusy = false;
  String? _error;

  static const _lanes = [
    (id: '', label: 'Tất cả việc'),
    (id: 'DirectOrders', label: 'Đơn trực tiếp'),
    (id: 'Exchanges', label: 'Đổi sách'),
    (id: 'Auctions', label: 'Đấu giá'),
  ];

  static const _shelfTabs = [
    (id: 'Approved', label: 'Đang hiển thị'),
    (id: 'PendingReview', label: 'Chờ duyệt'),
    (id: 'Draft', label: 'Bản nháp'),
    (id: 'All', label: 'Tất cả'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadDashboardData);
  }

  Future<void> _loadDashboardData() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) return;
    await Future.wait([_loadWorkItemsIfAuth(), _loadStatsAndOverview()]);
  }

  Future<void> _loadStatsAndOverview() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) return;
    setState(() => _statsLoading = true);
    final client = ref.read(sessionClientProvider);
    try {
      final modParam = _shelfFilter != 'All'
          ? '&moderation=${Uri.encodeQueryComponent(_shelfFilter)}'
          : '';
      final results = await Future.wait<dynamic>([
        client
            .request('/me/wallet')
            .catchError((_) => const <String, dynamic>{}),
        client
            .request('/me/listings?channel=Marketplace&limit=20$modParam')
            .catchError((_) => const <String, dynamic>{}),
        client
            .request('/me/orders?limit=10')
            .catchError((_) => const <String, dynamic>{}),
      ]);

      if (!mounted) return;
      final walletMap = results[0] is Map
          ? Map<String, dynamic>.from(results[0] as Map)
          : const <String, dynamic>{};
      final rawListings =
          (results[1] is Map && (results[1] as Map)['items'] is List)
          ? ((results[1] as Map)['items'] as List)
          : const [];
      final rawOrders =
          (results[2] is Map && (results[2] as Map)['items'] is List)
          ? ((results[2] as Map)['items'] as List)
          : const [];

      setState(() {
        _wallet = walletMap;
        _myListings = rawListings
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _myOrders = rawOrders
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _statsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _statsLoading = false);
    }
  }

  Future<void> _loadWorkItemsIfAuth() async {
    final session = ref.read(sessionProvider);
    if (!session.isAuthenticated) return;
    setState(() => _workLoading = true);
    final client = ref.read(sessionClientProvider);
    try {
      final query = _selectedLane.isNotEmpty
          ? '?lane=${Uri.encodeQueryComponent(_selectedLane)}&limit=5'
          : '?limit=5';
      final res = await client.request('/me/work-items$query');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (!mounted) return;
      setState(() {
        _workItems = list
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _workLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _workLoading = false);
    }
  }

  Future<void> _logout() async {
    if (_logoutBusy) return;
    setState(() {
      _logoutBusy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.logout();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = presentErrorMessage(e));
    } finally {
      if (mounted) setState(() => _logoutBusy = false);
    }
  }

  String _listingTitle(Map<String, dynamic> item) {
    final rev = item['currentRevision'] is Map
        ? Map<String, dynamic>.from(item['currentRevision'] as Map)
        : null;
    final content = rev?['content'] is Map
        ? Map<String, dynamic>.from(rev!['content'] as Map)
        : item;
    final bundle = content['bundle'] is Map
        ? Map<String, dynamic>.from(content['bundle'] as Map)
        : null;
    final book = (rev?['book'] ?? item['book']) is Map
        ? Map<String, dynamic>.from((rev?['book'] ?? item['book']) as Map)
        : null;
    return (bundle?['title'] ??
            book?['title'] ??
            content['title'] ??
            item['title'] ??
            'Bản thảo sách')
        .toString();
  }

  String _listingAuthor(Map<String, dynamic> item) {
    final rev = item['currentRevision'] is Map
        ? Map<String, dynamic>.from(item['currentRevision'] as Map)
        : null;
    final content = rev?['content'] is Map
        ? Map<String, dynamic>.from(rev!['content'] as Map)
        : item;
    final book = (rev?['book'] ?? item['book']) is Map
        ? Map<String, dynamic>.from((rev?['book'] ?? item['book']) as Map)
        : null;
    final authors = book?['authors'];
    if (authors is List && authors.isNotEmpty) {
      return authors.map((e) => e.toString()).join(', ');
    }
    return (content['author'] ?? item['author'] ?? 'Đang cập nhật').toString();
  }

  int _listingPrice(Map<String, dynamic> item) {
    final rev = item['currentRevision'] is Map
        ? Map<String, dynamic>.from(item['currentRevision'] as Map)
        : null;
    final content = rev?['content'] is Map
        ? Map<String, dynamic>.from(rev!['content'] as Map)
        : item;
    final raw = content['salePrice'] ?? item['salePrice'] ?? 0;
    return raw is num ? raw.toInt() : int.tryParse(raw.toString()) ?? 0;
  }

  String _listingModeration(Map<String, dynamic> item) {
    final state = item['state'] is Map
        ? Map<String, dynamic>.from(item['state'] as Map)
        : null;
    return (state?['moderation'] ?? item['moderation'] ?? 'Approved')
        .toString();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    if (session.status == SessionStatus.loading) {
      return const AppScreen(
        currentNavPath: '/account',
        header: TopNavbar(),
        child: StatePanel(
          wine: true,
          loading: true,
          title: 'Đang kiểm tra phiên đăng nhập…',
        ),
      );
    }

    if (!session.isAuthenticated) {
      return LoginScreen(returnBookId: widget.returnBookId);
    }

    final user = session.user!;
    final isLocked = user.isLocked;
    final isActive = user.status == 'ACTIVE';
    final initial = user.displayName.trim().isNotEmpty
        ? user.displayName.trim().characters.first.toUpperCase()
        : 'L';

    final availableVnd = (_wallet['available'] is num)
        ? (_wallet['available'] as num).toInt()
        : 0;
    final heldVnd = (_wallet['transactionHeld'] is num)
        ? (_wallet['transactionHeld'] as num).toInt()
        : 0;
    final latXu = availableVnd ~/ 1000;

    final totalBooks = _myListings.length;
    final totalShelfValue = _myListings.fold<int>(
      0,
      (sum, item) => sum + _listingPrice(item),
    );

    final filteredOrders = _myOrders.where((o) {
      final role = (o['role'] ?? 'Buyer').toString();
      return role.toLowerCase() == _orderTab.toLowerCase();
    }).toList();

    return AppScreen(
      currentNavPath: '/account',
      header: const TopNavbar(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. HERO GREETING & IDENTITY PANEL (Matches Web DashboardGreeting + Sidebar Identity)
          Container(
            padding: const EdgeInsets.all(AppSpace.lg),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFFDF9), Color(0xFFF6EFE6)],
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFE6D5C3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0D360000),
                  blurRadius: 14,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Badges Row
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: StitchTokens.wine.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.verified_user_rounded,
                            size: 13,
                            color: StitchTokens.wine,
                          ),
                          SizedBox(width: 5),
                          Text(
                            'HỘI VIÊN LẬT LẠI',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: StitchTokens.wine,
                              letterSpacing: 0.5,
                            ),
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
                        color: isActive
                            ? StitchTokens.likeNewGreenBg
                            : StitchTokens.flashRedBg,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isActive
                                  ? StitchTokens.verifiedGreen
                                  : StitchTokens.flashRed,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            isActive
                                ? 'ĐANG HOẠT ĐỘNG'
                                : (isLocked
                                      ? 'KHÓA GIAO DỊCH MỚI'
                                      : 'HẠN CHẾ GIAO DỊCH'),
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: isActive
                                  ? StitchTokens.likeNewGreen
                                  : StitchTokens.flashRed,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.md),

                // Avatar + Greeting Title
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    GestureDetector(
                      onTap: () => context.push('/profile'),
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [StitchTokens.wine, StitchTokens.wineDark],
                          ),
                          border: Border.all(
                            color: StitchTokens.goldDark,
                            width: 2,
                          ),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x265C0202),
                              blurRadius: 8,
                              offset: Offset(0, 3),
                            ),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          initial,
                          style: const TextStyle(
                            color: StitchTokens.gold,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const AppText(
                            'Tổng quan của bạn',
                            kind: AppTextKind.title,
                            color: StitchTokens.wine,
                            style: TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          AppText(
                            'Chào mừng trở lại, ${user.displayName}',
                            kind: AppTextKind.bold,
                            color: StitchTokens.deepCocoa,
                            style: const TextStyle(fontSize: 14),
                          ),
                          const SizedBox(height: 2),
                          const AppText(
                            'Quản lý sách, giao dịch và các phiên đấu giá của bạn.',
                            kind: AppTextKind.small,
                            color: AppColors.muted,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                if (!isActive) ...[
                  const SizedBox(height: AppSpace.md),
                  Notice(
                    tone: NoticeTone.warning,
                    message: isLocked
                        ? 'Tài khoản đang bị khóa. Bạn vẫn có thể xem ví và thực hiện các nghĩa vụ được phép trong giao dịch cũ.'
                        : 'Tài khoản đang bị hạn chế một số hoạt động. Các nghĩa vụ trong giao dịch cũ vẫn phụ thuộc quyền hiện tại.',
                  ),
                ],

                const SizedBox(height: AppSpace.lg),

                // Quick Action CTAs Row (Matches Web DashboardGreeting CTAs)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      if (isActive) ...[
                        _QuickCtaButton(
                          icon: Icons.add_rounded,
                          label: 'Đăng sách',
                          primary: true,
                          onTap: () => context.go('/drafts'),
                        ),
                        const SizedBox(width: 8),
                      ],
                      _QuickCtaButton(
                        icon: Icons.account_balance_wallet_outlined,
                        label: 'Ví Lật-Xu',
                        onTap: () => context.push('/wallet'),
                      ),
                      const SizedBox(width: 8),
                      if (!isLocked) ...[
                        _QuickCtaButton(
                          icon: Icons.local_library_outlined,
                          label: 'Kệ sách',
                          onTap: () => context.go('/drafts'),
                        ),
                        const SizedBox(width: 8),
                      ],
                      _QuickCtaButton(
                        icon: Icons.shopping_bag_outlined,
                        label: 'Giỏ sách',
                        onTap: () => context.push('/cart'),
                      ),
                      const SizedBox(width: 8),
                      _QuickCtaButton(
                        icon: Icons.person_outline_rounded,
                        label: 'Hồ sơ & bảo mật',
                        onTap: () => context.push('/profile'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // 2. TOP 3 STATISTIC CARDS IN 1 ROW
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _WineStatCard(
                    label: 'SỐ DƯ KHẢ DỤNG',
                    value: _statsLoading ? '…' : formatVnd(availableVnd),
                    icon: Icons.account_balance_wallet_outlined,
                    badgeText: '+$latXu Lật-Xu',
                    actionText: 'Mở ví',
                    onTap: () => context.push('/wallet'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _WhiteStatCard(
                    label: 'TẠM GIỮ (ESCROW)',
                    value: _statsLoading ? '…' : formatVnd(heldVnd),
                    icon: Icons.verified_user_outlined,
                    footerText: 'Bảo lưu an toàn',
                    onTap: () => context.push('/wallet'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _WineStatCard(
                    label: 'GIÁ TRỊ KỆ SÁCH',
                    value: _statsLoading
                        ? '…'
                        : (totalShelfValue > 0
                              ? formatVnd(totalShelfValue)
                              : '$totalBooks cuốn'),
                    icon: Icons.local_library_outlined,
                    badgeText: '$totalBooks ấn phẩm',
                    actionText: 'Kệ sách',
                    onTap: () => context.go('/drafts'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // 3. WORK INBOX ("Việc của tôi" / "Việc đang chờ")
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE6D5C3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0A000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _RedSectionHeader(
                  title: 'Việc của tôi',
                  subtitle: 'Việc đang chờ bạn xử lý theo nhóm giao dịch',
                  icon: Icons.assignment_turned_in_outlined,
                  trailing: InkWell(
                    onTap: _loadWorkItemsIfAuth,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.28),
                        ),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.refresh_rounded,
                            size: 14,
                            color: Colors.white,
                          ),
                          SizedBox(width: 4),
                          Text(
                            'Cập nhật',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpace.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: _lanes.map((lane) {
                            return Padding(
                              padding: const EdgeInsets.only(
                                right: AppSpace.sm,
                              ),
                              child: AppChip(
                                title: lane.label,
                                wine: true,
                                selected: _selectedLane == lane.id,
                                onPressed: () {
                                  setState(() => _selectedLane = lane.id);
                                  _loadWorkItemsIfAuth();
                                },
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: AppSpace.md),
                      if (_workLoading)
                        const Padding(
                          padding: EdgeInsets.all(AppSpace.md),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else if (_workItems.isEmpty)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            vertical: AppSpace.lg,
                            horizontal: AppSpace.md,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFAF7F2),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFEDE4D7)),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.check_circle_outline_rounded,
                                size: 26,
                                color: StitchTokens.goldBronze,
                              ),
                              SizedBox(height: 6),
                              AppText(
                                'Chưa có việc cần xử lý gấp trong nhóm này.',
                                kind: AppTextKind.bold,
                                color: StitchTokens.deepCocoa,
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 13),
                              ),
                              SizedBox(height: 2),
                              AppText(
                                'Những nhóm khác và đánh giá sau giao dịch có nơi theo dõi riêng bên dưới.',
                                kind: AppTextKind.small,
                                color: AppColors.muted,
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        )
                      else
                        ..._workItems.map((item) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: AppSpace.sm),
                            child: InkWell(
                              onTap: () => context.push('/orders'),
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                padding: const EdgeInsets.all(AppSpace.md),
                                decoration: BoxDecoration(
                                  color: StitchTokens.roseWarmSurface,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: StitchTokens.peachBorder,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          AppText(
                                            (item['title'] ??
                                                    'Giao dịch đang chờ')
                                                .toString(),
                                            kind: AppTextKind.bold,
                                            color: StitchTokens.wine,
                                          ),
                                          if (item['reason'] != null) ...[
                                            const SizedBox(height: 4),
                                            AppText(
                                              item['reason'].toString(),
                                              kind: AppTextKind.small,
                                              color: StitchTokens.deepCocoa,
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: StitchTokens.peachBorder,
                                        ),
                                      ),
                                      child: const Text(
                                        'Mở chi tiết',
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
                                          color: StitchTokens.wine,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // 4. MY BOOKS OVERVIEW (Matches Web DashboardMyBooks: "Kệ cập nhật gần đây")
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE6D5C3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0A000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _RedSectionHeader(
                  title: 'Kệ cập nhật gần đây',
                  subtitle: 'Quản lý hiện trạng niêm yết và giao lưu tác phẩm.',
                  icon: Icons.menu_book_rounded,
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpace.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF3ECE2),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: _shelfTabs.map((tab) {
                              final selected = _shelfFilter == tab.id;
                              return GestureDetector(
                                onTap: () {
                                  setState(() => _shelfFilter = tab.id);
                                  _loadStatsAndOverview();
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: selected
                                        ? Colors.white
                                        : Colors.transparent,
                                    borderRadius: BorderRadius.circular(8),
                                    boxShadow: selected
                                        ? const [
                                            BoxShadow(
                                              color: Color(0x14000000),
                                              blurRadius: 4,
                                              offset: Offset(0, 1),
                                            ),
                                          ]
                                        : null,
                                  ),
                                  child: Text(
                                    tab.label,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: selected
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                      color: selected
                                          ? StitchTokens.wine
                                          : StitchTokens.deepCocoa,
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpace.md),
                      if (_myListings.isEmpty)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(AppSpace.lg),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFAF7F2),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFEDE4D7)),
                          ),
                          child: Column(
                            children: [
                              const Icon(
                                Icons.auto_stories_outlined,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              const SizedBox(height: 8),
                              const AppText(
                                'Một chỗ trống cho cuốn sách đầu tiên.',
                                kind: AppTextKind.bold,
                                color: StitchTokens.wine,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 4),
                              const AppText(
                                'Đăng cuốn đã đọc xong để tìm người đọc tiếp theo.',
                                kind: AppTextKind.small,
                                color: AppColors.muted,
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 12),
                              AppButton(
                                title: 'Đăng cuốn đầu tiên',
                                wine: true,
                                compact: true,
                                onPressed: () => context.go('/drafts'),
                              ),
                            ],
                          ),
                        )
                      else
                        ..._myListings.take(3).map((item) {
                          final price = _listingPrice(item);
                          final mod = _listingModeration(item);
                          return Padding(
                            padding: const EdgeInsets.only(bottom: AppSpace.sm),
                            child: InkWell(
                              onTap: () => context.go('/drafts'),
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFAF7F2),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: const Color(0xFFE8DFD1),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 44,
                                      height: 58,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF0EAE1),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: const Color(0xFFE4DACD),
                                        ),
                                      ),
                                      clipBehavior: Clip.antiAlias,
                                      child: BookCoverPhoto(
                                        item: item,
                                        isMine: true,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          AppText(
                                            _listingTitle(item),
                                            kind: AppTextKind.bold,
                                            color: StitchTokens.wine,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 2),
                                          AppText(
                                            _listingAuthor(item),
                                            kind: AppTextKind.small,
                                            color: AppColors.muted,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Text(
                                                price > 0
                                                    ? formatVnd(price)
                                                    : 'Thỏa thuận',
                                                style: const TextStyle(
                                                  fontSize: 12.5,
                                                  fontWeight: FontWeight.w800,
                                                  color: StitchTokens.wine,
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      horizontal: 6,
                                                      vertical: 2,
                                                    ),
                                                decoration: BoxDecoration(
                                                  color: mod == 'Approved'
                                                      ? StitchTokens
                                                            .likeNewGreenBg
                                                      : const Color(0xFFFFF8E1),
                                                  borderRadius:
                                                      BorderRadius.circular(4),
                                                ),
                                                child: Text(
                                                  mod == 'Approved'
                                                      ? 'Đang mở bán'
                                                      : mod,
                                                  style: TextStyle(
                                                    fontSize: 10,
                                                    fontWeight: FontWeight.w700,
                                                    color: mod == 'Approved'
                                                        ? StitchTokens
                                                              .likeNewGreen
                                                        : StitchTokens
                                                              .tagExchangeText,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
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
                      const SizedBox(height: 6),
                      InkWell(
                        onTap: () => context.go('/drafts'),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                'Quản lý toàn bộ Kệ sách của tôi',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.wine,
                                ),
                              ),
                              SizedBox(width: 4),
                              Icon(
                                Icons.arrow_forward_rounded,
                                size: 15,
                                color: StitchTokens.wine,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // 5. DIRECT ORDERS TRACKING (Matches Web DashboardOrders: "Theo dõi đơn hàng")
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE6D5C3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0A000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _RedSectionHeader(
                  title: 'Theo dõi đơn hàng',
                  subtitle: 'Đơn trực tiếp gần đây',
                  icon: Icons.local_shipping_outlined,
                  trailing: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.22),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final entry in const [
                          ('Buyer', 'Đơn mua'),
                          ('Seller', 'Đơn bán'),
                        ])
                          GestureDetector(
                            onTap: () => setState(() => _orderTab = entry.$1),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: _orderTab == entry.$1
                                    ? Colors.white
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                entry.$2,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: _orderTab == entry.$1
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: _orderTab == entry.$1
                                      ? StitchTokens.wine
                                      : Colors.white,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpace.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (filteredOrders.isEmpty)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(AppSpace.md),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFAF7F2),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFEDE4D7)),
                          ),
                          child: AppText(
                            'Chưa có ${_orderTab == 'Buyer' ? 'đơn mua' : 'đơn bán'} trong danh sách gần đây.',
                            kind: AppTextKind.small,
                            color: AppColors.muted,
                            textAlign: TextAlign.center,
                          ),
                        )
                      else
                        ...filteredOrders.take(3).map((order) {
                          final id = (order['id'] ?? '').toString();
                          final shortId = id.length > 8
                              ? id.substring(0, 8)
                              : id;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: AppSpace.sm),
                            child: InkWell(
                              onTap: () => context.push('/orders?id=$id'),
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFAF7F2),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: const Color(0xFFE8DFD1),
                                  ),
                                ),
                                child: Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          AppText(
                                            (order['title'] ?? 'Đơn #$shortId')
                                                .toString(),
                                            kind: AppTextKind.bold,
                                            color: StitchTokens.wine,
                                          ),
                                          const SizedBox(height: 2),
                                          AppText(
                                            (order['state'] ?? 'Đang xử lý')
                                                .toString(),
                                            kind: AppTextKind.small,
                                            color: AppColors.muted,
                                          ),
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
                      const SizedBox(height: 6),
                      InkWell(
                        onTap: () => context.push('/orders'),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                'Xem toàn bộ đơn trực tiếp',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.wine,
                                ),
                              ),
                              SizedBox(width: 4),
                              Icon(
                                Icons.arrow_forward_rounded,
                                size: 15,
                                color: StitchTokens.wine,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // 6. TIẾP TỤC GIAO DỊCH (Matches Web MemberWorkPage + DashboardSidebar)
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE6D5C3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0A000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _RedSectionHeader(
                  title: 'Tiếp tục giao dịch',
                  subtitle: 'Đơn trực tiếp, trao đổi và đơn đấu giá có nơi theo dõi riêng.',
                  icon: Icons.sync_alt_rounded,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.lg,
                    vertical: AppSpace.sm,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _WineMenuRow(
                        title: 'Đơn mua/bán trực tiếp',
                        description: 'Thanh toán, xác nhận và theo dõi đơn mua hoặc đơn bán.',
                        icon: Icons.shopping_bag_outlined,
                        onTap: () => context.push('/orders'),
                      ),
                      _WineMenuRow(
                        title: 'Trao đổi của tôi',
                        description:
                            'Đề nghị đã gửi, nhận được và giao dịch đang đổi.',
                        icon: Icons.swap_horiz_rounded,
                        onTap: () => context.push('/exchanges'),
                      ),
                      _WineMenuRow(
                        title: 'Đấu giá của tôi',
                        description: 'Phiên đã tham gia, sách gửi đấu giá và đơn thắng đấu giá.',
                        icon: Icons.gavel_rounded,
                        onTap: () => context.push('/my-auctions'),
                      ),
                      if (!isLocked)
                        _WineMenuRow(
                          title: 'Trò chuyện',
                          description: 'Thương lượng và trao đổi trong đúng hội thoại giao dịch.',
                          icon: Icons.chat_bubble_outline_rounded,
                          onTap: () => context.push('/chat-inbox'),
                        ),
                      if (!isLocked)
                        _WineMenuRow(
                          title: 'Kệ sách của tôi',
                          description: 'Bản nháp, bài chờ duyệt, bài cần sửa và sách đang hiển thị.',
                          icon: Icons.local_library_outlined,
                          onTap: () => context.go('/drafts'),
                          showDivider: false,
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // 7. KHÔNG GIAN CÁ NHÂN & BẢO MẬT (Matches Web DashboardSidebar & Account Links)
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE6D5C3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0A000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _RedSectionHeader(
                  title: 'Thông tin và đánh giá',
                  subtitle: 'Hồ sơ cá nhân, ví Lật-Xu, địa chỉ giao nhận và uy tín thành viên.',
                  icon: Icons.manage_accounts_outlined,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.lg,
                    vertical: AppSpace.sm,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _WineMenuRow(
                        title: 'Sửa hồ sơ và email',
                        description: 'Cập nhật tên hiển thị, số điện thoại và bảo mật email.',
                        icon: Icons.person_outline_rounded,
                        onTap: () => context.push('/profile'),
                      ),
                      _WineMenuRow(
                        title: 'Ví của tôi',
                        description: 'Số dư khả dụng, khoản tạm giữ (Escrow) và lịch sử biến động.',
                        icon: Icons.account_balance_wallet_outlined,
                        onTap: () => context.push('/wallet'),
                      ),
                      if (!isLocked) ...[
                        _WineMenuRow(
                          title: 'Địa chỉ của tôi',
                          description: 'Quản lý sổ địa chỉ giao nhận tại TP.HCM, Bình Dương & Vũng Tàu.',
                          icon: Icons.location_on_outlined,
                          onTap: () => context.push('/addresses'),
                        ),
                        _WineMenuRow(
                          title: 'Sách yêu thích',
                          description:
                              'Danh sách các bản sách bạn đã lưu theo dõi.',
                          icon: Icons.favorite_border_rounded,
                          onTap: () => context.push('/wishlist'),
                        ),
                        _WineMenuRow(
                          title: 'Đánh giá giao dịch & hồ sơ uy tín',
                          description: 'Xem nhận xét từ bạn đọc và đánh giá giao dịch đã hoàn tất.',
                          icon: Icons.star_outline_rounded,
                          onTap: () => context.push('/reviews'),
                        ),
                      ],
                      _WineMenuRow(
                        title: 'Hỗ trợ & phản ánh',
                        description: 'Gửi yêu cầu hỗ trợ hoặc khiếu nại về đơn hàng, giao dịch.',
                        icon: Icons.support_agent_rounded,
                        onTap: () => context.push('/support'),
                      ),
                      _WineMenuRow(
                        title: 'Cách mua, bán, đổi và đấu giá',
                        description: 'Cẩm nang hướng dẫn quy trình giao dịch và kiểm định ViaPoint.',
                        icon: Icons.help_outline_rounded,
                        onTap: () => context.push('/guide'),
                        showDivider: false,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],

          // Logout Button
          AppButton(
            title: 'Đăng xuất khỏi tài khoản',
            secondary: true,
            wine: true,
            icon: Icons.logout_rounded,
            busy: _logoutBusy,
            onPressed: _logout,
          ),
          const SizedBox(height: AppSpace.md),
        ],
      ),
    );
  }
}

class _QuickCtaButton extends StatelessWidget {
  const _QuickCtaButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: primary ? StitchTokens.wine : const Color(0xFFEDE3D5),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 16,
                color: primary ? StitchTokens.gold : StitchTokens.wine,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: primary ? Colors.white : StitchTokens.wine,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WineStatCard extends StatelessWidget {
  const _WineStatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.badgeText,
    required this.actionText,
    required this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final String badgeText;
  final String actionText;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF680B0B), StitchTokens.wine, Color(0xFF450202)],
          ),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF831A1A)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x22450202),
              blurRadius: 8,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: Color(0xD9F5EDDC),
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.18),
                        ),
                      ),
                      child: Icon(
                        icon,
                        size: 13,
                        color: const Color(0xFFFCEEED),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    maxLines: 1,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 1,
                  color: Colors.white.withValues(alpha: 0.15),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(
                        badgeText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: StitchTokens.gold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Text(
                        actionText,
                        style: const TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WhiteStatCard extends StatelessWidget {
  const _WhiteStatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.footerText,
    required this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final String footerText;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE6D5C3)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0A000000),
              blurRadius: 8,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: AppColors.muted,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: const Color(0xFFFBF5EF),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: const Color(0xFFECDACB)),
                      ),
                      child: Icon(icon, size: 13, color: StitchTokens.wine),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    maxLines: 1,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: StitchTokens.wine,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 1, color: const Color(0x80EBD9C8)),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 5,
                            height: 5,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: StitchTokens.verifiedGreen,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              footerText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.muted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WineMenuRow extends StatelessWidget {
  const _WineMenuRow({
    required this.title,
    required this.description,
    required this.icon,
    required this.onTap,
    this.showDivider = true,
  });

  final String title;
  final String description;
  final IconData icon;
  final VoidCallback onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: showDivider
              ? const Border(bottom: BorderSide(color: Color(0xFFEDE4D7)))
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFFBF5EF),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFECDACB)),
              ),
              child: Icon(icon, size: 20, color: StitchTokens.wine),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppText(
                    title,
                    kind: AppTextKind.bold,
                    color: StitchTokens.wine,
                    style: const TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 2),
                  AppText(
                    description,
                    kind: AppTextKind.small,
                    color: AppColors.muted,
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              Icons.chevron_right_rounded,
              color: StitchTokens.wine,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }
}

class _RedSectionHeader extends StatelessWidget {
  const _RedSectionHeader({
    required this.title,
    required this.subtitle,
    this.icon,
    this.trailing,
  });

  final String title;
  final String subtitle;
  final IconData? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF680B0B), StitchTokens.wine, Color(0xFF450202)],
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
              ),
              child: Icon(icon, size: 17, color: Colors.white),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppText(
                  title,
                  kind: AppTextKind.heading,
                  color: Colors.white,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                AppText(
                  subtitle,
                  kind: AppTextKind.small,
                  color: const Color(0xD9F5EDDC),
                  style: const TextStyle(fontSize: 11),
                ),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
  }
}

/// ProfileScreen (`/profile`) synchronized with Web's `ProfilePage.tsx` and `MemberProfileEditor.tsx`
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final TextEditingController _displayNameCtrl = TextEditingController();
  final TextEditingController _phoneCtrl = TextEditingController();
  final TextEditingController _newEmailCtrl = TextEditingController();
  final TextEditingController _currentPasswordCtrl = TextEditingController();
  final TextEditingController _emailOtpCtrl = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _success;
  int _version = 1;
  String _currentEmail = '';
  String _savedDisplayName = '';
  String _savedPhone = '';
  String? _pendingEmailChangeId;
  String? _pendingEmailTarget;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadProfile);
  }

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _phoneCtrl.dispose();
    _newEmailCtrl.dispose();
    _currentPasswordCtrl.dispose();
    _emailOtpCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final data = await client.request('/me/profile');
      final map = data is Map ? Map<String, dynamic>.from(data) : const {};
      final pending = map['pendingEmailChange'] is Map
          ? Map<String, dynamic>.from(map['pendingEmailChange'] as Map)
          : null;
      if (!mounted) return;
      final name = (map['displayName'] ?? '').toString();
      final phone = (map['contactPhone'] ?? '').toString();
      setState(() {
        _displayNameCtrl.text = name;
        _phoneCtrl.text = phone;
        _savedDisplayName = name;
        _savedPhone = phone;
        _currentEmail = (map['email'] ?? '').toString();
        _version = (map['version'] is num)
            ? (map['version'] as num).toInt()
            : 1;
        _pendingEmailChangeId = pending?['id']?.toString();
        _pendingEmailTarget = pending?['email']?.toString();
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

  void _resetDraft() {
    setState(() {
      _displayNameCtrl.text = _savedDisplayName;
      _phoneCtrl.text = _savedPhone;
      _error = null;
      _success = null;
    });
  }

  Future<void> _saveProfile() async {
    if (_displayNameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Nhập tên hiển thị từ 1 đến 80 ký tự.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/profile',
        method: 'PUT',
        idempotencyKey: generateIdempotencyKey('profile-save'),
        body: {
          'expectedVersion': _version,
          'displayName': _displayNameCtrl.text.trim(),
          'contactPhone': _phoneCtrl.text.trim().isEmpty
              ? null
              : _phoneCtrl.text.trim(),
        },
      );
      await client.reloadUser().catchError((_) => client.snapshot.user!);
      await _loadProfile();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _success = 'Đã lưu hồ sơ.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _requestEmailChange() async {
    if (_newEmailCtrl.text.trim().isEmpty ||
        _currentPasswordCtrl.text.isEmpty) {
      setState(() {
        _error = 'Vui lòng nhập Email mới và mật khẩu hiện tại.';
      });
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/me/profile/email-changes',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('email-chg'),
        body: {
          'expectedVersion': _version,
          'email': _newEmailCtrl.text.trim(),
          'password': _currentPasswordCtrl.text,
        },
      );
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      await _loadProfile();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _currentPasswordCtrl.clear();
        _pendingEmailChangeId =
            (map['entityId'] ?? _pendingEmailChangeId ?? 'pending').toString();
        _success = 'Nếu email phù hợp, mã xác nhận đã được gửi đến địa chỉ mới. Email đăng nhập hiện tại chưa thay đổi.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _confirmEmailChange() async {
    if (_emailOtpCtrl.text.trim().length != 6) {
      setState(() => _error = 'Mã xác nhận gồm 6 chữ số.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/me/profile/email-changes/confirm',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('email-confirm'),
        body: {
          'changeId': _pendingEmailChangeId,
          'code': _emailOtpCtrl.text.trim(),
        },
      );
      await client.reloadUser().catchError((_) => client.snapshot.user!);
      await _loadProfile();
      if (!mounted) return;
      setState(() {
        _saving = false;
        _pendingEmailChangeId = null;
        _emailOtpCtrl.clear();
        _newEmailCtrl.clear();
        _success = 'Đã xác minh và đổi email đăng nhập. Các phiên đăng nhập khác đã được thu hồi.';
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
    final session = ref.watch(sessionProvider);
    final user = session.user;
    final statusLabel = switch (user?.status) {
      'RESTRICTED' => 'Đang hạn chế giao dịch mới',
      'LOCKED' => 'Đang khóa giao dịch mới',
      _ => 'Đang hoạt động',
    };
    final displayInitial =
        (_displayNameCtrl.text.trim().isNotEmpty
                ? _displayNameCtrl.text.trim()
                : (user?.displayName ?? 'L'))
            .characters
            .first
            .toUpperCase();

    return AppScreen(
      currentNavPath: '/account',
      header: const TopNavbar(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về tổng quan tài khoản',
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/account'),
          ),
          const SizedBox(height: AppSpace.sm),

          // Heading matching Web ProfilePage.tsx
          const AppText(
            'HỒ SƠ CỦA TÔI',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 4),
          const AppText(
            'Thông tin tài khoản của bạn tại Lật Lại.',
            color: AppColors.muted,
          ),
          const SizedBox(height: AppSpace.lg),

          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          if (_success != null) ...[
            Notice(message: _success!, tone: NoticeTone.success),
            const SizedBox(height: AppSpace.md),
          ],

          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải hồ sơ…',
            )
          else ...[
            // Main Paper Section matching Web `section.paper`
            Container(
              padding: const EdgeInsets.all(AppSpace.xl),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE6D5C3)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0A000000),
                    blurRadius: 12,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Identity Header inside Paper
                  Container(
                    padding: const EdgeInsets.only(bottom: AppSpace.lg),
                    decoration: const BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Color(0xFFEDE4D7)),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: const Color(0xFFF0E2CA),
                            border: Border.all(
                              color: StitchTokens.goldDark.withValues(
                                alpha: 0.4,
                              ),
                              width: 1.5,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            displayInitial,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              color: StitchTokens.wine,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              AppText(
                                _displayNameCtrl.text.trim().isNotEmpty
                                    ? _displayNameCtrl.text.trim()
                                    : (user?.displayName ?? 'Bạn đọc'),
                                kind: AppTextKind.heading,
                                color: StitchTokens.wine,
                                style: const TextStyle(fontSize: 20),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: user?.status == 'ACTIVE'
                                          ? StitchTokens.verifiedGreen
                                          : StitchTokens.flashRed,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: AppText(
                                      statusLabel,
                                      kind: AppTextKind.small,
                                      color: AppColors.muted,
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
                  const SizedBox(height: AppSpace.lg),

                  // Profile Editor Form
                  AppTextField(
                    label: 'Tên hiển thị',
                    requiredField: true,
                    controller: _displayNameCtrl,
                    placeholder: 'Tên hiển thị với đối tác giao dịch',
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpace.md),
                  AppTextField(
                    label: 'Số điện thoại liên hệ (không bắt buộc)',
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    placeholder: '0901234567',
                    hint: 'Thông tin này không thay địa chỉ hoặc số điện thoại của đơn đã tạo.',
                  ),
                  const SizedBox(height: AppSpace.lg),
                  AppButton(
                    title: _saving ? 'Đang xử lý…' : 'Lưu hồ sơ',
                    wine: true,
                    busy: _saving,
                    onPressed: _saveProfile,
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: AppButton(
                          title: 'Khôi phục bản đang xem',
                          secondary: true,
                          wine: true,
                          compact: true,
                          onPressed: _saving ? null : _resetDraft,
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: AppButton(
                          title: 'Tải bản mới',
                          secondary: true,
                          wine: true,
                          compact: true,
                          onPressed: _saving ? null : _loadProfile,
                        ),
                      ),
                    ],
                  ),

                  // Email Section matching Web `.emailSection`
                  const SizedBox(height: AppSpace.xl),
                  Container(
                    padding: const EdgeInsets.only(top: AppSpace.xl),
                    decoration: const BoxDecoration(
                      border: Border(top: BorderSide(color: Color(0xFFEDE4D7))),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const AppText(
                          'Email đăng nhập',
                          kind: AppTextKind.heading,
                          color: StitchTokens.wine,
                        ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFAF7F2),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFE6D5C3)),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.mail_outline_rounded,
                                size: 16,
                                color: StitchTokens.wine,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _currentEmail.isNotEmpty
                                      ? _currentEmail
                                      : (user?.email ?? ''),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: StitchTokens.deepCocoa,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        const AppText(
                          'Email mới chỉ thay thế địa chỉ này sau khi xác minh bằng mã 6 số.',
                          kind: AppTextKind.small,
                          color: AppColors.muted,
                        ),
                        const SizedBox(height: AppSpace.md),
                        AppTextField(
                          label: 'Email mới',
                          controller: _newEmailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          placeholder: 'emailmoi@latlai.vn',
                        ),
                        const SizedBox(height: AppSpace.md),
                        AppTextField(
                          label: 'Mật khẩu hiện tại',
                          controller: _currentPasswordCtrl,
                          obscureText: true,
                          placeholder: 'Nhập mật khẩu để xác nhận',
                        ),
                        const SizedBox(height: AppSpace.md),
                        AppButton(
                          title: 'Gửi mã đến email mới',
                          secondary: true,
                          wine: true,
                          busy: _saving,
                          onPressed: _requestEmailChange,
                        ),
                        if (_pendingEmailChangeId != null) ...[
                          const SizedBox(height: AppSpace.lg),
                          Container(
                            padding: const EdgeInsets.all(AppSpace.md),
                            decoration: BoxDecoration(
                              color: StitchTokens.roseWarmSurface,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: StitchTokens.peachBorder,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                AppText(
                                  _pendingEmailTarget != null
                                      ? 'Mã xác nhận đã gửi đến $_pendingEmailTarget.'
                                      : 'Nhập mã 6 số đã gửi đến địa chỉ email mới.',
                                  kind: AppTextKind.small,
                                  color: StitchTokens.wine,
                                ),
                                const SizedBox(height: AppSpace.sm),
                                AppTextField(
                                  label: 'Mã xác nhận (6 số)',
                                  controller: _emailOtpCtrl,
                                  keyboardType: TextInputType.number,
                                  placeholder: '123456',
                                ),
                                const SizedBox(height: AppSpace.md),
                                AppButton(
                                  title: 'Xác minh và đổi email',
                                  wine: true,
                                  busy: _saving,
                                  onPressed: _confirmEmailChange,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),

                  // Security Section matching Web `.security` in ProfilePage.tsx
                  const SizedBox(height: AppSpace.xl),
                  Container(
                    padding: const EdgeInsets.only(top: AppSpace.xl),
                    decoration: const BoxDecoration(
                      border: Border(top: BorderSide(color: Color(0xFFEDE4D7))),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const AppText(
                          'Đăng nhập & bảo mật',
                          kind: AppTextKind.heading,
                          color: StitchTokens.wine,
                        ),
                        const SizedBox(height: 4),
                        const AppText(
                          'Đặt lại mật khẩu qua mã xác nhận gửi đến email của bạn.',
                          kind: AppTextKind.small,
                          color: AppColors.muted,
                        ),
                        const SizedBox(height: AppSpace.md),
                        InkWell(
                          onTap: () => context.push('/forgot-password'),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 11,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFBF5EF),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: const Color(0xFFECDACB),
                              ),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.key_rounded,
                                  size: 18,
                                  color: StitchTokens.wine,
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Đặt lại mật khẩu',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w700,
                                    color: StitchTokens.wine,
                                  ),
                                ),
                                SizedBox(width: 6),
                                Icon(
                                  Icons.arrow_forward_rounded,
                                  size: 16,
                                  color: StitchTokens.wine,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: AppSpace.lg),

            // Footer Shelf Links matching Web ProfilePage.tsx `.shelfLink`
            _ProfileShelfLink(
              icon: Icons.local_library_outlined,
              prefix: 'Quản lý sách đã đăng trong ',
              highlight: 'Kệ sách của tôi',
              onTap: () => context.go('/drafts'),
            ),
            const SizedBox(height: AppSpace.sm),
            _ProfileShelfLink(
              icon: Icons.swap_horiz_rounded,
              prefix: 'Theo dõi các lời đề nghị trong ',
              highlight: 'Trao đổi của tôi',
              onTap: () => context.push('/exchanges'),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProfileShelfLink extends StatelessWidget {
  const _ProfileShelfLink({
    required this.icon,
    required this.prefix,
    required this.highlight,
    required this.onTap,
  });

  final IconData icon;
  final String prefix;
  final String highlight;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE6D5C3)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 20, color: StitchTokens.wine),
              const SizedBox(width: 12),
              Expanded(
                child: RichText(
                  text: TextSpan(
                    style: const TextStyle(
                      fontSize: 13.5,
                      color: StitchTokens.wine,
                      height: 1.4,
                    ),
                    children: [
                      TextSpan(text: prefix),
                      TextSpan(
                        text: highlight,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
              ),
              const Icon(
                Icons.arrow_forward_rounded,
                size: 18,
                color: StitchTokens.wine,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
