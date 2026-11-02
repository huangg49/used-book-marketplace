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
    (id: 'buy_now', label: 'Có Mua ngay'),
    (id: 'ending_soon', label: 'Sắp kết thúc'),
    (id: 'upcoming', label: 'Sắp diễn ra'),
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
      var list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (list.isEmpty) {
        try {
          final up = await client.publicRequest('/auctions?phase=upcoming');
          if (up is Map &&
              up['items'] is List &&
              (up['items'] as List).isNotEmpty) {
            list = up['items'] as List;
          }
        } catch (_) {}
      }
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

  String _formatRemainingTime(String? endAtStr) {
    if (endAtStr == null || endAtStr.isEmpty) return 'Đang mở';
    try {
      final end = DateTime.parse(endAtStr).toLocal();
      final now = DateTime.now();
      final diff = end.difference(now);
      if (diff.isNegative) return 'Đã kết thúc';
      if (diff.inDays > 0) return '${diff.inDays} ngày nữa';
      if (diff.inHours > 0) return '${diff.inHours} giờ nữa';
      if (diff.inMinutes > 0) return '${diff.inMinutes} phút nữa';
      return '${diff.inSeconds} giây';
    } catch (_) {
      return 'Đang mở';
    }
  }

  void _showAuctionRulesModal() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: const BoxDecoration(
          color: Color(0xFFFFFDF8),
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFDCCFBF),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Quy chế đấu giá Lật Lại',
                  style: TextStyle(
                    fontFamily: 'Lora',
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                    color: StitchTokens.wine,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _buildRuleItem(
              icon: Icons.storefront_outlined,
              title: '1. Kiểm định thực tế tại trạm ViaPoint',
              desc:
                  'Mọi ấn bản đấu giá bắt buộc phải gửi tới trạm quản lý ViaPoint TP.HCM để chuyên viên xác thực bản sách, tính toàn vẹn và trang bản quyền trước khi mở phiên.',
            ),
            const SizedBox(height: 10),
            _buildRuleItem(
              icon: Icons.shield_outlined,
              title: '2. Ký quỹ bảo chứng & Hoàn cọc 100%',
              desc:
                  'Bạn đọc cần nạp tiền cọc bảo chứng tương ứng mức khởi điểm để tham gia trả giá. Khoản cọc được lưu giữ an toàn và hoàn trả 100% tự động nếu không thắng phiên.',
            ),
            const SizedBox(height: 10),
            _buildRuleItem(
              icon: Icons.flash_on_rounded,
              title: '3. Bước giá & Quyền Mua Ngay',
              desc:
                  'Mỗi lượt trả giá tuân theo bước giá quy định (10.000 ₫ – 50.000 ₫). Người tham gia có thể chọn "Mua ngay" để chốt sở hữu ấn bản lập tức mà không cần đợi hết giờ.',
            ),
            const SizedBox(height: 18),
            AppButton(
              title: 'Tôi đã hiểu',
              wine: true,
              onPressed: () => Navigator.of(ctx).pop(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRuleItem({
    required IconData icon,
    required String title,
    required String desc,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFBF7F0),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFEADBCE)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: StitchTokens.roseWarmSurface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: StitchTokens.wine, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.wine,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  desc,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Color(0xFF635650),
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _auctions.where((a) {
      final q = _searchCtrl.text.trim().toLowerCase();
      if (q.isNotEmpty) {
        final book = a['book'] is Map ? (a['book'] as Map) : const {};
        final title =
            (book['title'] ?? a['title'] ?? '').toString().toLowerCase();
        final authors = book['authors'] is List
            ? (book['authors'] as List).join(' ').toLowerCase()
            : (book['author'] ?? '').toString().toLowerCase();
        if (!title.contains(q) && !authors.contains(q)) return false;
      }
      if (_selectedTab == 'buy_now') {
        return a['buyNowPrice'] != null;
      }
      if (_selectedTab == 'ending_soon') {
        final end = a['endAt']?.toString();
        if (end == null) return false;
        final diff = DateTime.tryParse(end)?.difference(DateTime.now());
        return diff != null && !diff.isNegative && diff.inHours < 24;
      }
      if (_selectedTab == 'upcoming') {
        final state = (a['state'] ?? '').toString();
        return state == 'Upcoming' || state == 'Pending';
      }
      return true;
    }).toList();

    // Sắp xếp
    if (_selectedSort == 'price_asc') {
      filtered.sort((a, b) {
        final pa = (a['currentPrice'] ?? a['startingPrice'] ?? 0) as num;
        final pb = (b['currentPrice'] ?? b['startingPrice'] ?? 0) as num;
        return pa.compareTo(pb);
      });
    } else if (_selectedSort == 'price_desc') {
      filtered.sort((a, b) {
        final pa = (a['currentPrice'] ?? a['startingPrice'] ?? 0) as num;
        final pb = (b['currentPrice'] ?? b['startingPrice'] ?? 0) as num;
        return pb.compareTo(pa);
      });
    }

    return AppScreen(
      currentNavPath: '/auctions',
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(subtitle: 'SÀN ĐẤU GIÁ'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Bento Header Sàn Đấu Giá
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [
                  Color(0xFF680B0B),
                  StitchTokens.wine,
                  Color(0xFF450606)
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x335C0202),
                  blurRadius: 10,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(
                          Icons.gavel_rounded,
                          size: 15,
                          color: StitchTokens.gold,
                        ),
                        SizedBox(width: 6),
                        Text(
                          'SÀN ĐẤU GIÁ SÁCH HIẾM & SÁCH CỔ',
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                            color: StitchTokens.gold,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0x33FFFFFF),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0x55FFFFFF)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: Color(0xFF4ADE80),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            'LIVE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Sách Cũ Đang Đấu Giá',
                  style: TextStyle(
                    fontFamily: 'Lora',
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Ấn bản giá trị được kiểm định tại trạm ViaPoint TP.HCM. Bảo lưu tiền cọc an toàn qua ví ký quỹ.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFFF3ECE1),
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    InkWell(
                      onTap: () => context.push('/send-to-auction'),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 7.5,
                        ),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [StitchTokens.gold, StitchTokens.goldLight],
                          ),
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x33DDA74F),
                              blurRadius: 4,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(
                              Icons.add_circle_outline_rounded,
                              size: 15,
                              color: StitchTokens.wineDark,
                            ),
                            SizedBox(width: 5),
                            Text(
                              'Gửi sách đấu giá',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: StitchTokens.wineDark,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    InkWell(
                      onTap: () => context.push('/my-auctions'),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 7.5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0x2EFFFFFF),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: const Color(0x40FFFFFF)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(
                              Icons.history_rounded,
                              size: 15,
                              color: Colors.white,
                            ),
                            SizedBox(width: 5),
                            Text(
                              'Phiên của tôi',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    InkWell(
                      onTap: _showAuctionRulesModal,
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 7.5,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0x1AFFFFFF),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(
                              Icons.info_outline_rounded,
                              size: 14,
                              color: StitchTokens.goldLight,
                            ),
                            SizedBox(width: 4),
                            Text(
                              'Quy chế',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: StitchTokens.goldLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),

          // 2. Banner Bảo chứng kiểm định ViaPoint
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF9F5EC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFEADBCE)),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: StitchTokens.roseWarmSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: StitchTokens.peachBorder),
                  ),
                  child: const Icon(
                    Icons.verified_outlined,
                    color: StitchTokens.wine,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        'Kiểm định ViaPoint & Ký quỹ an toàn',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: StitchTokens.wine,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        '100% sách được thẩm định tại trạm trước khi mở phiên. Cọc bảo chứng hoàn trả nếu không thắng.',
                        style: TextStyle(
                          fontSize: 11,
                          color: Color(0xFF635650),
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),

          // 3. Thanh tìm kiếm
          SearchField(
            controller: _searchCtrl,
            placeholder: 'Tìm tên ấn bản, tác giả đấu giá…',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.sm),

          // 4. Thanh lọc phân loại & sắp xếp
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ..._tabs.map((t) {
                  final isSelected = _selectedTab == t.id;
                  final count = t.id == 'all'
                      ? _auctions.length
                      : (t.id == 'buy_now'
                          ? _auctions
                              .where((a) => a['buyNowPrice'] != null)
                              .length
                          : null);
                  final label = count != null ? '${t.label} ($count)' : t.label;

                  return Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: AppChip(
                      title: label,
                      wine: true,
                      selected: isSelected,
                      onPressed: () => setState(() => _selectedTab = t.id),
                    ),
                  );
                }),
                AppChip(
                  title: _selectedSort == 'price_asc'
                      ? 'Giá tăng dần'
                      : (_selectedSort == 'price_desc'
                          ? 'Giá giảm dần'
                          : 'Mới nhất'),
                  icon: Icons.sort_rounded,
                  selected: _selectedSort != 'newest',
                  wine: true,
                  onPressed: () {
                    setState(() {
                      if (_selectedSort == 'newest') {
                        _selectedSort = 'price_asc';
                      } else if (_selectedSort == 'price_asc') {
                        _selectedSort = 'price_desc';
                      } else {
                        _selectedSort = 'newest';
                      }
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
            // 5. Empty State cao cấp với quy trình 3 bước
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFDF8),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: StitchTokens.peachBorder),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0C5C0202),
                    blurRadius: 10,
                    offset: Offset(0, 3),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: StitchTokens.roseWarmSurface,
                      shape: BoxShape.circle,
                      border: Border.all(color: StitchTokens.peachBorder),
                    ),
                    child: const Icon(
                      Icons.gavel_rounded,
                      color: StitchTokens.wine,
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Hiện chưa có phiên đấu giá nào đang mở',
                    style: TextStyle(
                      fontFamily: 'Lora',
                      fontSize: 16.5,
                      fontWeight: FontWeight.w700,
                      color: StitchTokens.wine,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Các phiên trước đã kết thúc. Sách đấu giá bắt buộc phải qua trạm kiểm định ViaPoint TP.HCM trước khi mở phiên mới.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: Color(0xFF6B5C55),
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Quy trình 3 bước kiểm định
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF7F2E8),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFE8DFCE)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'QUY TRÌNH ĐẤU GIÁ MINH BẠCH TẠI LẬT LẠI',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: StitchTokens.wine,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildStepRow(
                          number: '1',
                          title: 'Ký gửi:',
                          desc:
                              'Đăng ký thông tin ấn bản & gửi tới trạm ViaPoint TP.HCM',
                        ),
                        const SizedBox(height: 6),
                        _buildStepRow(
                          number: '2',
                          title: 'Kiểm định:',
                          desc:
                              'Chuyên viên kiểm tra trang, bìa, bản quyền & chốt giá sàn',
                        ),
                        const SizedBox(height: 6),
                        _buildStepRow(
                          number: '3',
                          title: 'Mở sàn:',
                          desc:
                              'Đấu giá công khai toàn sàn, bảo lưu tiền cọc an toàn',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    alignment: WrapAlignment.center,
                    children: [
                      AppButton(
                        title: '+ Gửi sách đi đấu giá',
                        wine: true,
                        onPressed: () => context.push('/send-to-auction'),
                      ),
                      AppButton(
                        title: 'Phiên của tôi',
                        secondary: true,
                        wine: true,
                        onPressed: () => context.push('/my-auctions'),
                      ),
                    ],
                  ),
                ],
              ),
            )
          else
            // 6. Lưới thẻ phiên đấu giá 2 cột cao cấp
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
                    final author = (book['authors'] is List
                            ? (book['authors'] as List).join(', ')
                            : (book['author'] ?? ''))
                        .toString();
                    final currentPrice = (auction['currentPrice'] ??
                        auction['startingPrice'] ??
                        0) as num;
                    final buyNow = auction['buyNowPrice'] is num
                        ? (auction['buyNowPrice'] as num)
                        : null;
                    final bidderCount = (auction['bidderCount'] ??
                        auction['bidsCount'] ??
                        0) as num;
                    final remainingText =
                        _formatRemainingTime(auction['endAt']?.toString());

                    return SizedBox(
                      width: width,
                      child: InkWell(
                        onTap: () => context.push('/auction?id=$id'),
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: StitchTokens.peachBorder),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x0A000000),
                                blurRadius: 6,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Khung ảnh bìa sách
                              ClipRRect(
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(14),
                                ),
                                child: Stack(
                                  children: [
                                    SizedBox(
                                      height: 135,
                                      width: double.infinity,
                                      child: BookCoverPhoto(
                                        item: auction,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                    // Badge LIVE
                                    Positioned(
                                      top: 8,
                                      left: 8,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: StitchTokens.wine,
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Container(
                                              width: 5,
                                              height: 5,
                                              decoration: const BoxDecoration(
                                                color: StitchTokens.gold,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                            const SizedBox(width: 4),
                                            const Text(
                                              'LIVE',
                                              style: TextStyle(
                                                fontSize: 9.5,
                                                fontWeight: FontWeight.w800,
                                                color: StitchTokens.goldLight,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                    // Thời gian còn lại
                                    Positioned(
                                      bottom: 6,
                                      left: 8,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: const Color(0xCC000000),
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(
                                              Icons.access_time_rounded,
                                              size: 11,
                                              color: Colors.white,
                                            ),
                                            const SizedBox(width: 3),
                                            Text(
                                              remainingText,
                                              style: const TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.w600,
                                                color: Colors.white,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontFamily: 'Lora',
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: StitchTokens.deepCocoa,
                                        height: 1.3,
                                      ),
                                    ),
                                    if (author.isNotEmpty) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        author,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: Color(0xFF8C7E77),
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 8),
                                    const Text(
                                      'DẪN GIÁ HIỆN TẠI',
                                      style: TextStyle(
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w800,
                                        color: StitchTokens.wine,
                                        letterSpacing: 0.4,
                                      ),
                                    ),
                                    Text(
                                      formatVnd(currentPrice),
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w900,
                                        color: StitchTokens.wine,
                                      ),
                                    ),
                                    if (buyNow != null) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        '⚡ Mua ngay: ${formatVnd(buyNow)}',
                                        style: const TextStyle(
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.forest,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 8),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          '$bidderCount lượt trả',
                                          style: const TextStyle(
                                            fontSize: 10.5,
                                            color: Color(0xFF8C7E77),
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 8,
                                            vertical: 3.5,
                                          ),
                                          decoration: BoxDecoration(
                                            color: StitchTokens.wine,
                                            borderRadius:
                                                BorderRadius.circular(6),
                                          ),
                                          child: const Text(
                                            'Đặt giá',
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: Colors.white,
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

  Widget _buildStepRow({
    required String number,
    required String title,
    required String desc,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 18,
          height: 18,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: StitchTokens.wine,
            shape: BoxShape.circle,
          ),
          child: Text(
            number,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: StitchTokens.goldLight,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: const TextStyle(
                fontSize: 11.5,
                color: Color(0xFF4A3E39),
                height: 1.35,
              ),
              children: [
                TextSpan(
                  text: '$title ',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.wine,
                  ),
                ),
                TextSpan(text: desc),
              ],
            ),
          ),
        ),
      ],
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

