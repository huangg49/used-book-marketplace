import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// DraftsScreen (`/drafts`) matching `apps/mobile-react-native/src/features/drafts/drafts-screen.tsx`
/// and the 5-step `DraftEditor` with prominent green check / red X stepper indicators.
class DraftsScreen extends ConsumerStatefulWidget {
  const DraftsScreen({super.key, this.initialDraftId});

  final String? initialDraftId;

  @override
  ConsumerState<DraftsScreen> createState() => _DraftsScreenState();
}

class _DraftsScreenState extends ConsumerState<DraftsScreen> {
  static final Map<String, Map<String, dynamic>> _bookCache = {};

  String _moderationFilter = '';
  bool _loading = true;
  bool _creating = false;
  String? _error;
  List<Map<String, dynamic>> _allListings = const [];
  List<Map<String, dynamic>> _items = const [];
  Map<String, dynamic>? _editingDraft;

  int _totalCount = 0;
  int _draftCount = 0;
  int _pendingCount = 0;
  int _approvedCount = 0;
  int _rejectedCount = 0;

  static String _extractModeration(Map<String, dynamic> item) {
    if (item['state'] is Map) {
      final s = item['state'] as Map;
      if (s['moderation'] != null) return s['moderation'].toString();
    }
    return (item['moderation'] ?? item['status'] ?? 'Draft').toString();
  }

  Map<String, dynamic> _normalizeItem(Map<String, dynamic> raw) {
    final currentRev =
        raw['currentRevision'] is Map ? raw['currentRevision'] as Map : null;
    final content = currentRev?['content'] is Map
        ? currentRev!['content'] as Map
        : (raw['content'] is Map ? raw['content'] as Map : null);

    final moderation = _extractModeration(raw);
    final mode = (content?['mode'] ?? raw['mode'] ?? '').toString();
    final condition =
        (content?['condition'] ?? raw['condition'] ?? 'Good').toString();
    final salePrice = content?['salePrice'] ?? raw['salePrice'];
    final exchangeValue = content?['exchangeValue'] ?? raw['exchangeValue'];
    final bundle = content?['bundle'] ?? raw['bundle'];
    final bookId = content?['bookId']?.toString() ?? raw['bookId']?.toString();
    final mediaIds = content?['mediaIds'] is List
        ? (content!['mediaIds'] as List)
        : (raw['mediaIds'] is List ? raw['mediaIds'] as List : const []);
    final photos = mediaIds.isNotEmpty
        ? mediaIds.map((m) => {'id': m.toString()}).toList()
        : (raw['photos'] ?? const []);

    final cachedBook = bookId != null ? _bookCache[bookId] : null;
    final book = cachedBook ??
        (content?['book'] is Map
            ? Map<String, dynamic>.from(content!['book'] as Map)
            : (raw['book'] is Map
                ? Map<String, dynamic>.from(raw['book'] as Map)
                : null));

    return {
      ...raw,
      'id': raw['id'],
      'version': raw['version'] ?? 1,
      'moderation': moderation,
      'status': moderation,
      'mode': mode,
      'condition': condition,
      'salePrice': salePrice,
      'exchangeValue': exchangeValue,
      'bundle': bundle,
      'bookId': bookId,
      'book': book,
      'photos': photos,
      'mediaIds': mediaIds,
    };
  }

  List<({String id, String label, int count})> get _filterTabs => [
        (id: '', label: 'Tất cả', count: _totalCount),
        (id: 'Draft', label: 'Bản nháp', count: _draftCount),
        (id: 'PendingReview', label: 'Chờ duyệt', count: _pendingCount),
        (id: 'Rejected', label: 'Cần sửa', count: _rejectedCount),
        (id: 'Approved', label: 'Đang niêm yết', count: _approvedCount),
      ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadDrafts);
  }

  Future<void> _loadDrafts() async {
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
      final res =
          await client.request('/me/listings?channel=Marketplace&limit=50');
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (!mounted) return;
      final parsed = list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      _allListings = parsed;
      _totalCount = parsed.length;
      _draftCount =
          parsed.where((d) => _extractModeration(d) == 'Draft').length;
      _pendingCount =
          parsed.where((d) => _extractModeration(d) == 'PendingReview').length;
      _approvedCount =
          parsed.where((d) => _extractModeration(d) == 'Approved').length;
      _rejectedCount =
          parsed.where((d) => _extractModeration(d) == 'Rejected').length;

      final filtered = _moderationFilter.isEmpty
          ? parsed
          : parsed
              .where((d) => _extractModeration(d) == _moderationFilter)
              .toList();

      _items = filtered.map(_normalizeItem).toList();
      _loading = false;

      if (widget.initialDraftId != null && _editingDraft == null) {
        final match = parsed
            .where((d) => d['id']?.toString() == widget.initialDraftId)
            .toList();
        if (match.isNotEmpty) _editingDraft = match.first;
      }
      setState(() {});

      // Background fetch book identities if missing in cache
      final missingBookIds = <String>{};
      for (final item in _items) {
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
            _items = filtered.map(_normalizeItem).toList();
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

  Future<void> _archiveDraft(String id, int version) async {
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/listings/$id/archive',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('draft-archive'),
        body: {'expectedVersion': version},
      );
      await _loadDrafts();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(presentErrorMessage(e)),
            backgroundColor: StitchTokens.darkRed,
          ),
        );
      }
    }
  }

  void _confirmDelete(
    BuildContext context,
    String id,
    int version,
    String title,
  ) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFFFFFDF8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text(
          'Xóa bài đăng',
          style: TextStyle(
            fontFamily: 'Lora',
            fontWeight: FontWeight.w700,
            color: StitchTokens.wine,
          ),
        ),
        content: Text(
          'Bạn có chắc chắn muốn xóa bài đăng "${title.isNotEmpty ? title : 'Chưa đặt tên'}" không? Thao tác này không thể hoàn tác.',
          style: const TextStyle(fontSize: 14, color: Color(0xFF382E2B)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Hủy',
                style: TextStyle(color: StitchTokens.darkWood)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: StitchTokens.darkRed,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              Navigator.of(ctx).pop();
              _archiveDraft(id, version);
            },
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
  }

  void _createNewDraft() {
    setState(() {
      _creating = false;
      _error = null;
      _editingDraft = {
        'id': null,
        'version': 1,
        'state': {'moderation': 'Draft'},
        'currentRevision': {
          'content': {
            'bookId': null,
            'mode': 'Sale',
            'condition': 'Good',
            'pages': '',
            'coverNote': '',
            'notes': '',
            'accessories': '',
            'description': '',
            'readable': true,
            'hasMissingPages': false,
            'missingEssentialContent': false,
            'salePrice': null,
            'exchangeValue': null,
            'exchangePreferences': null,
            'mediaIds': <String>[],
          },
        },
      };
    });
  }

  Future<void> _openDraftEditor(Map<String, dynamic> item) async {
    final id = (item['id'] ?? '').toString();
    if (id.isEmpty) return;
    final client = ref.read(sessionClientProvider);
    try {
      final detail = await client.request('/me/listings/$id');
      if (!mounted) return;
      setState(() {
        _editingDraft =
            detail is Map ? Map<String, dynamic>.from(detail) : item;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _editingDraft = item);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    if (!session.isAuthenticated) {
      return AppScreen(
        currentNavPath: '/drafts',
        header: const TopNavbar(),
        child: StatePanel(
          wine: true,
          title: 'Đăng nhập để quản lý & đăng sách',
          message:
              'Tạo bản nháp, định giá bằng AI và đăng bán hoặc trao đổi sách trên kệ Lật Lại.',
          actionLabel: 'Đăng nhập ngay',
          onAction: () => context.go('/account'),
        ),
      );
    }

    if (_editingDraft != null) {
      return _DraftEditorScreen(
        draft: _editingDraft!,
        onClose: () {
          setState(() => _editingDraft = null);
          _loadDrafts();
        },
      );
    }

    return AppScreen(
      currentNavPath: '/drafts',
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header Bento matching `drafts-screen.tsx`
          Container(
            padding: const EdgeInsets.all(AppSpace.xl),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [StitchTokens.wine, StitchTokens.wineDark],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppText(
                  'TỦ SÁCH CỦA TÔI · QUẢN LÝ BÀI ĐĂNG',
                  kind: AppTextKind.label,
                  color: StitchTokens.gold,
                ),
                const SizedBox(height: 6),
                const AppText(
                  'Kệ sách của tôi',
                  kind: AppTextKind.bookTitle,
                  color: Colors.white,
                ),
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    _StatPill(
                      label: 'Tổng ấn bản',
                      value: '$_totalCount',
                    ),
                    const SizedBox(width: AppSpace.sm),
                    _StatPill(
                      label: 'Chờ duyệt',
                      value: '$_pendingCount',
                      indicatorColor: StitchTokens.goldMedal,
                    ),
                    const SizedBox(width: AppSpace.sm),
                    _StatPill(
                      label: 'Đang bán',
                      value: '$_approvedCount',
                      indicatorColor: StitchTokens.forestGreen,
                    ),
                    const SizedBox(width: AppSpace.sm),
                    _StatPill(
                      label: 'Cần sửa',
                      value: '$_rejectedCount',
                      indicatorColor: StitchTokens.brickRed,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.lg),
                Center(
                  child: AppButton(
                    title: '+ Đăng Sách Mới Ngay',
                    busy: _creating,
                    onPressed: _createNewDraft,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          // Filter Chips with counts matching React Native
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _filterTabs.map((f) {
                final isSelected = _moderationFilter == f.id;
                return Padding(
                  padding: const EdgeInsets.only(right: AppSpace.sm),
                  child: AppChip(
                    title: '${f.label} (${f.count})',
                    wine: true,
                    selected: isSelected,
                    onPressed: () {
                      setState(() {
                        _moderationFilter = f.id;
                        final filtered = _moderationFilter.isEmpty
                            ? _allListings
                            : _allListings
                                .where((d) =>
                                    _extractModeration(d) == _moderationFilter)
                                .toList();
                        _items = filtered.map(_normalizeItem).toList();
                      });
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: AppSpace.lg),

          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],

          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải kệ sách của bạn…',
            )
          else if (_items.isEmpty)
            StatePanel(
              wine: true,
              icon: Icons.library_add_outlined,
              title: 'Chưa có bài đăng nào trong mục này',
              message:
                  'Các ấn bản bạn tạo, gửi duyệt hoặc đang niêm yết sẽ xuất hiện tại đây.',
              actionLabel: '+ Đăng Sách Mới Ngay',
              actionBusy: _creating,
              onAction: _createNewDraft,
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
                    final mod = (item['moderation'] ?? 'Draft').toString();
                    final isRejected = mod == 'Rejected';
                    final isApproved = mod == 'Approved';
                    final isPending = mod == 'PendingReview';
                    final actionLabel = isRejected
                        ? 'Sửa bài'
                        : isPending
                            ? 'Chi tiết'
                            : isApproved
                                ? 'Xem sách'
                                : 'Hoàn thiện';
                    final version = (item['version'] is num)
                        ? (item['version'] as num).toInt()
                        : 1;
                    final id = (item['id'] ?? '').toString();
                    final title = (item['bundle']?['title'] ??
                            item['book']?['title'] ??
                            item['title'] ??
                            'Chưa chọn đầu sách')
                        .toString();

                    return SizedBox(
                      width: width,
                      child: BookCard(
                        item: item,
                        variant: 'management',
                        actionTitle: actionLabel,
                        onOpen: () {
                          if (isApproved) {
                            context.push('/book?id=$id');
                          } else {
                            _openDraftEditor(item);
                          }
                        },
                        onActionPress: () {
                          if (isApproved) {
                            context.push('/book?id=$id');
                          } else {
                            _openDraftEditor(item);
                          }
                        },
                        onDelete: () =>
                            _confirmDelete(context, id, version, title),
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

class _StatPill extends StatelessWidget {
  const _StatPill({
    required this.label,
    required this.value,
    this.indicatorColor,
  });

  final String label;
  final String value;
  final Color? indicatorColor;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: StitchTokens.gold.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (indicatorColor != null) ...[
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(right: 4),
                    decoration: BoxDecoration(
                      color: indicatorColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
                AppText(
                  value,
                  kind: AppTextKind.heading,
                  color: StitchTokens.gold,
                  style: const TextStyle(fontSize: 18),
                ),
              ],
            ),
            const SizedBox(height: 2),
            AppText(
              label,
              kind: AppTextKind.label,
              color: Colors.white,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

/// 5-Step DraftEditor matching `apps/mobile-react-native/src/features/drafts/draft-editor.tsx`
/// and `apps/user-web/src/features/listings/SellBookPage.tsx` (prominent green check & red X stepper).
class _DraftEditorScreen extends ConsumerStatefulWidget {
  const _DraftEditorScreen({
    required this.draft,
    required this.onClose,
  });

  final Map<String, dynamic> draft;
  final VoidCallback onClose;

  @override
  ConsumerState<_DraftEditorScreen> createState() => _DraftEditorScreenState();
}

class _DraftEditorScreenState extends ConsumerState<_DraftEditorScreen> {
  int _currentStep = 0;
  final Set<int> _visitedSteps = {0};

  late final TextEditingController _titleCtrl;
  late final TextEditingController _authorCtrl;
  late final TextEditingController _publisherCtrl;
  late final TextEditingController _isbnCtrl;
  late final TextEditingController _coverNoteCtrl;
  late final TextEditingController _pagesNoteCtrl;
  late final TextEditingController _descriptionCtrl;
  late final TextEditingController _salePriceCtrl;
  late final TextEditingController _exchangeValueCtrl;
  late final TextEditingController _wantedGenreCtrl;

  bool _isBundle = false;
  String? _draftId;
  String? _bookId;
  List<String> _mediaIds = [];
  Map<String, dynamic>? _bundle;
  String _condition = 'Good';
  bool _readable = true;
  bool _hasMissingPages = false;
  bool _missingEssentialContent = false;
  String _mode = 'Sale';
  bool _ownershipDeclared = false;
  bool _hasCoverPhoto = false;

  bool _saving = false;
  String? _error;
  String? _success;
  late int _version;

  static const _steps = [
    (index: 0, title: 'Thông tin sách'),
    (index: 1, title: 'Ảnh bản sách'),
    (index: 2, title: 'Tình trạng'),
    (index: 3, title: 'Bán hoặc đổi'),
    (index: 4, title: 'Kiểm tra'),
  ];

  static const _stepShortTitles = [
    'Thông tin',
    'Ảnh sách',
    'Tình trạng',
    'Giá & đổi',
    'Kiểm tra',
  ];

  Widget _buildStepNode(int index) {
    final active = _currentStep == index;
    final valid = _isStepValid(index);
    final visited = _visitedSteps.contains(index);
    final showError = !valid && visited && !active;

    if (valid) {
      return Container(
        width: 26,
        height: 26,
        decoration: const BoxDecoration(
          color: Color(0xFF1F7A3E),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Color(0x331F7A3E),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: const Icon(
          Icons.check_rounded,
          size: 16,
          color: Colors.white,
        ),
      );
    }

    if (showError) {
      return Container(
        width: 26,
        height: 26,
        decoration: const BoxDecoration(
          color: Color(0xFFB42318),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Color(0x33B42318),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: const Icon(
          Icons.close_rounded,
          size: 15,
          color: Colors.white,
        ),
      );
    }

    if (active) {
      return Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF680B0B), StitchTokens.wine],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          shape: BoxShape.circle,
          border: Border.all(color: StitchTokens.gold, width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x405C0202),
              blurRadius: 6,
              offset: Offset(0, 2),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Text(
          '${index + 1}',
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: StitchTokens.goldLight,
          ),
        ),
      );
    }

    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        color: const Color(0xFFF3ECE2),
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFFDED3C4)),
      ),
      alignment: Alignment.center,
      child: Text(
        '${index + 1}',
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: StitchTokens.deepCocoa,
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    final content = widget.draft['currentRevision'] is Map &&
            (widget.draft['currentRevision'] as Map)['content'] is Map
        ? Map<String, dynamic>.from(
            (widget.draft['currentRevision'] as Map)['content'] as Map,
          )
        : (widget.draft['content'] is Map
            ? Map<String, dynamic>.from(widget.draft['content'] as Map)
            : widget.draft);
    final book = content['book'] is Map
        ? Map<String, dynamic>.from(content['book'] as Map)
        : const <String, dynamic>{};

    final rawId = widget.draft['id'];
    _draftId = (rawId != null && rawId.toString().isNotEmpty)
        ? rawId.toString()
        : null;
    _version = (widget.draft['version'] is num)
        ? (widget.draft['version'] as num).toInt()
        : 1;
    _bookId = content['bookId']?.toString();
    _mediaIds = content['mediaIds'] is List
        ? (content['mediaIds'] as List).map((e) => e.toString()).toList()
        : <String>[];
    _bundle = content['bundle'] is Map
        ? Map<String, dynamic>.from(content['bundle'] as Map)
        : null;
    _isBundle = _bundle != null;

    final initialTitle = (book['title'] ?? content['title'] ?? '').toString();
    final hasLoadedBook = initialTitle.trim().isNotEmpty;

    // Khung 2: Không tự động đánh dấu xanh nếu người dùng chưa chủ động thêm/tải ảnh
    final hasRealPhotos = hasLoadedBook &&
        _mediaIds.isNotEmpty &&
        (content['photos'] is List && (content['photos'] as List).isNotEmpty);
    _hasCoverPhoto = hasRealPhotos;

    _titleCtrl = TextEditingController(text: initialTitle);
    _authorCtrl = TextEditingController(
      text: (book['authors'] is List
              ? (book['authors'] as List).join(', ')
              : (book['author'] ?? ''))
          .toString(),
    );
    _publisherCtrl = TextEditingController(
      text: (book['publisher'] ?? '').toString(),
    );
    _isbnCtrl = TextEditingController(
      text: (book['isbn'] ?? '').toString(),
    );
    _coverNoteCtrl = TextEditingController(
      text: (content['coverNote'] ?? '').toString(),
    );
    _pagesNoteCtrl = TextEditingController(
      text: (content['pages'] ?? '').toString(),
    );
    _descriptionCtrl = TextEditingController(
      text: (content['description'] ?? '').toString(),
    );

    // Khung 4: Không tự động điền giá mẫu nếu đây là bản nháp chưa hoàn chỉnh thông tin
    _salePriceCtrl = TextEditingController(
      text: hasLoadedBook && content['salePrice'] != null
          ? content['salePrice'].toString()
          : '',
    );
    _exchangeValueCtrl = TextEditingController(
      text: hasLoadedBook && content['exchangeValue'] != null
          ? content['exchangeValue'].toString()
          : '',
    );
    _wantedGenreCtrl = TextEditingController();
    _condition = (content['condition'] ?? 'Good').toString();
    _mode = (content['mode'] ?? 'Sale').toString();
  }

  bool get _hasEnteredData {
    return _titleCtrl.text.trim().isNotEmpty ||
        _authorCtrl.text.trim().isNotEmpty ||
        _publisherCtrl.text.trim().isNotEmpty ||
        _isbnCtrl.text.trim().isNotEmpty ||
        _coverNoteCtrl.text.trim().isNotEmpty ||
        _pagesNoteCtrl.text.trim().isNotEmpty ||
        _descriptionCtrl.text.trim().isNotEmpty ||
        _salePriceCtrl.text.trim().isNotEmpty ||
        _exchangeValueCtrl.text.trim().isNotEmpty ||
        _wantedGenreCtrl.text.trim().isNotEmpty ||
        _bookId != null ||
        _mediaIds.isNotEmpty;
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _authorCtrl.dispose();
    _publisherCtrl.dispose();
    _isbnCtrl.dispose();
    _coverNoteCtrl.dispose();
    _pagesNoteCtrl.dispose();
    _descriptionCtrl.dispose();
    _salePriceCtrl.dispose();
    _exchangeValueCtrl.dispose();
    _wantedGenreCtrl.dispose();
    super.dispose();
  }

  bool _isPriceValid(String text) {
    final clean = text.trim();
    if (clean.isEmpty) return false;
    final val = int.tryParse(clean);
    return val != null && val >= 10000 && val <= 10000000;
  }

  bool _isStepValid(int step) {
    return switch (step) {
      0 => _titleCtrl.text.trim().isNotEmpty &&
          _authorCtrl.text.trim().isNotEmpty,
      1 => _hasCoverPhoto && _mediaIds.isNotEmpty,
      2 => _condition.isNotEmpty &&
          _readable &&
          !_missingEssentialContent &&
          _coverNoteCtrl.text.trim().isNotEmpty,
      3 => switch (_mode) {
          'Sale' => _isPriceValid(_salePriceCtrl.text),
          'Exchange' => _isPriceValid(_exchangeValueCtrl.text),
          'Both' =>
            _isPriceValid(_salePriceCtrl.text) &&
            _isPriceValid(_exchangeValueCtrl.text),
          _ => false,
        },
      4 => _ownershipDeclared,
      _ => false,
    };
  }

  void _selectStep(int index) {
    setState(() {
      _visitedSteps.add(_currentStep);
      _visitedSteps.add(index);
      _currentStep = index;
    });
  }

  Map<String, dynamic> _buildContentPayload() {
    final salePrice = int.tryParse(_salePriceCtrl.text.trim());
    final exchangeValue = int.tryParse(_exchangeValueCtrl.text.trim());
    return {
      'bookId': _bookId,
      if (_bundle != null) 'bundle': _bundle,
      'mode': _mode,
      'condition': _condition,
      'pages': _pagesNoteCtrl.text.trim(),
      'coverNote': _coverNoteCtrl.text.trim(),
      'notes': '',
      'accessories': '',
      'description': _descriptionCtrl.text.trim(),
      'readable': _readable,
      'hasMissingPages': _hasMissingPages,
      'missingEssentialContent': _missingEssentialContent,
      'salePrice': (_mode == 'Sale' || _mode == 'Both') ? salePrice : null,
      'exchangeValue':
          (_mode == 'Exchange' || _mode == 'Both') ? exchangeValue : null,
      'exchangePreferences': _mode != 'Sale' &&
              _wantedGenreCtrl.text.trim().isNotEmpty
          ? {
              'targetCategory': _wantedGenreCtrl.text.trim(),
              'targetAuthor': null,
              'targetDescription': null,
            }
          : null,
      'mediaIds': _mediaIds,
    };
  }

  Future<void> _saveDraft({bool submitForReview = false}) async {
    if (_draftId == null && !_hasEnteredData) {
      setState(() {
        _error = 'Vui lòng nhập thông tin sách trước khi lưu bản nháp.';
      });
      return;
    }

    if (submitForReview && !_ownershipDeclared) {
      setState(() {
        _error =
            'Vui lòng tích xác nhận quyền sở hữu và cam kết thông tin trung thực ở Bước 5.';
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
      if (_bookId == null &&
          _titleCtrl.text.trim().isNotEmpty &&
          _authorCtrl.text.trim().isNotEmpty) {
        try {
          final catRes = await client.request(
            '/catalog/requests',
            method: 'POST',
            idempotencyKey: generateIdempotencyKey('catalog-req'),
            body: {
              'metadata': {
                'title': _titleCtrl.text.trim(),
                'authors': _authorCtrl.text
                    .split(',')
                    .map((e) => e.trim())
                    .where((e) => e.isNotEmpty)
                    .toList(),
                if (_publisherCtrl.text.trim().isNotEmpty)
                  'publisher': _publisherCtrl.text.trim(),
                if (_isbnCtrl.text.trim().isNotEmpty)
                  'isbn': _isbnCtrl.text.trim(),
              },
            },
          );
          if (catRes is Map && catRes['entityId'] != null) {
            _bookId = catRes['entityId'].toString();
          }
        } catch (_) {}
      }

      if (_draftId == null) {
        final createRes = await client.request(
          '/listings',
          method: 'POST',
          idempotencyKey: generateIdempotencyKey('draft-create'),
          body: {
            'content': _buildContentPayload(),
          },
        );
        final createMap =
            createRes is Map ? Map<String, dynamic>.from(createRes) : const {};
        final newId =
            (createMap['entityId'] ?? createMap['id'] ?? '').toString();
        if (newId.isEmpty) {
          throw Exception('Không tạo được bản nháp trên hệ thống.');
        }
        _draftId = newId;
        _version = 1;
      } else {
        final saved = await client.request(
          '/listings/$_draftId/draft',
          method: 'PUT',
          idempotencyKey: generateIdempotencyKey('draft-save'),
          body: {
            'expectedVersion': _version,
            'content': _buildContentPayload(),
          },
        );
        if (saved is Map && saved['version'] is num) {
          _version = (saved['version'] as num).toInt();
        } else {
          _version++;
        }
      }

      if (submitForReview) {
        final submitted = await client.request(
          '/listings/$_draftId/submit',
          method: 'POST',
          idempotencyKey: generateIdempotencyKey('draft-submit'),
          body: {
            'expectedVersion': _version,
            'ownershipDeclared': true,
          },
        );
        if (submitted is Map && submitted['version'] is num) {
          _version = (submitted['version'] as num).toInt();
        } else {
          _version++;
        }
      }
      if (!mounted) return;
      setState(() {
        _saving = false;
        _success = submitForReview
            ? 'Đã lưu và gửi bài đăng chờ kiểm duyệt!'
            : 'Đã lưu bản nháp thành công.';
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
    return AppScreen(
      maxWidth: AppMetrics.wideContent,
      header: const TopNavbar(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Về sách của tôi',
            onPressed: widget.onClose,
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Phiếu thông tin sách',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),

          // 5-Step Connected Progress Bar on 1 Single Row
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (int i = 0; i < _steps.length; i++) ...[
                      Expanded(
                        child: InkWell(
                          onTap: () => _selectStep(i),
                          borderRadius: BorderRadius.circular(8),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                children: [
                                  // Left connecting line
                                  Expanded(
                                    child: Container(
                                      height: 2.5,
                                      color: i == 0
                                          ? Colors.transparent
                                          : (_isStepValid(i - 1)
                                              ? const Color(0xFF1F7A3E)
                                              : const Color(0xFFE4DACD)),
                                    ),
                                  ),
                                  // Step circle node
                                  _buildStepNode(i),
                                  // Right connecting line
                                  Expanded(
                                    child: Container(
                                      height: 2.5,
                                      color: i == _steps.length - 1
                                          ? Colors.transparent
                                          : (_isStepValid(i)
                                              ? const Color(0xFF1F7A3E)
                                              : const Color(0xFFE4DACD)),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _stepShortTitles[i],
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: _currentStep == i
                                      ? FontWeight.w800
                                      : (_isStepValid(i)
                                          ? FontWeight.w700
                                          : FontWeight.w500),
                                  color: _currentStep == i
                                      ? StitchTokens.wine
                                      : (_isStepValid(i)
                                          ? const Color(0xFF1F7A3E)
                                          : (!_isStepValid(i) &&
                                                  _visitedSteps.contains(i)
                                              ? const Color(0xFFB42318)
                                              : AppColors.muted)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                // Thanh tiến trình loading (Progress Bar)
                Builder(
                  builder: (context) {
                    final validCount =
                        [0, 1, 2, 3, 4].where(_isStepValid).length;
                    final progressRatio = validCount / 5.0;
                    final progressPercent = (progressRatio * 100).toInt();
                    final isCurrentValid = _isStepValid(_currentStep);

                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFFDF8),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: StitchTokens.peachBorder),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x0A5C0202),
                            blurRadius: 4,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Flexible(
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      validCount == 5
                                          ? Icons.check_circle_rounded
                                          : Icons.hourglass_top_rounded,
                                      size: 15,
                                      color: validCount == 5
                                          ? const Color(0xFF1F7A3E)
                                          : StitchTokens.wine,
                                    ),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: Text(
                                        'Bước ${_currentStep + 1}/5: ${_steps[_currentStep].title}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: StitchTokens.wine,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '$validCount/5 bước ($progressPercent%)',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: validCount == 5
                                      ? const Color(0xFF1F7A3E)
                                      : StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          // Thanh loading tiến trình
                          ClipRRect(
                            borderRadius: BorderRadius.circular(5),
                            child: Container(
                              height: 7,
                              color: const Color(0xFFEDE4D8),
                              child: LayoutBuilder(
                                builder: (ctx, constraints) {
                                  return Align(
                                    alignment: Alignment.centerLeft,
                                    child: AnimatedContainer(
                                      duration:
                                          const Duration(milliseconds: 300),
                                      curve: Curves.easeOutCubic,
                                      width:
                                          constraints.maxWidth * progressRatio,
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: validCount == 5
                                              ? const [
                                                  Color(0xFF1F7A3E),
                                                  Color(0xFF2E9E55),
                                                ]
                                              : const [
                                                  StitchTokens.wine,
                                                  Color(0xFFB42318),
                                                ],
                                        ),
                                        borderRadius: BorderRadius.circular(5),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  isCurrentValid
                                      ? 'Đã điền đủ thông tin bước này'
                                      : 'Vui lòng hoàn thiện bước hiện tại',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w500,
                                    color: isCurrentValid
                                        ? const Color(0xFF1F7A3E)
                                        : const Color(0xFF8C7E77),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: isCurrentValid
                                      ? const Color(0xFFE8F5E9)
                                      : const Color(0xFFFBEAE8),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  isCurrentValid ? '✓ Hợp lệ' : '✕ Cần điền',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: isCurrentValid
                                        ? const Color(0xFF1F7A3E)
                                        : const Color(0xFFB42318),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
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

          // Step Content Card
          Container(
            padding: const EdgeInsets.all(AppSpace.xl),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: StitchTokens.cardBorder),
            ),
            child: switch (_currentStep) {
              0 => _buildStep0BookInfo(),
              1 => _buildStep1Media(),
              2 => _buildStep2Condition(),
              3 => _buildStep3Pricing(),
              _ => _buildStep4Review(),
            },
          ),
          const SizedBox(height: AppSpace.lg),

          // Bottom Action Bar matching `ActionBar` in RN
          Wrap(
            spacing: AppSpace.md,
            runSpacing: AppSpace.sm,
            alignment: WrapAlignment.spaceBetween,
            children: [
              if (_currentStep > 0)
                AppButton(
                  title: 'Trước',
                  secondary: true,
                  onPressed: () => _selectStep(_currentStep - 1),
                ),
              AppButton(
                title: 'Lưu nháp',
                secondary: true,
                wine: true,
                busy: _saving,
                onPressed: () => _saveDraft(submitForReview: false),
              ),
              if (_currentStep < 4)
                AppButton(
                  title: 'Tiếp theo',
                  wine: true,
                  onPressed: () => _selectStep(_currentStep + 1),
                )
              else
                AppButton(
                  title: 'Lưu và gửi duyệt',
                  wine: true,
                  busy: _saving,
                  onPressed: () => _saveDraft(submitForReview: true),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStep0BookInfo() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: [
            const AppText(
              '1. Thông tin đầu sách',
              kind: AppTextKind.heading,
              color: StitchTokens.wine,
            ),
            AppChip(
              title: _isBundle ? 'Chuyển sang sách lẻ' : 'Đăng bộ sách',
              wine: true,
              selected: _isBundle,
              onPressed: () => setState(() => _isBundle = !_isBundle),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.md),
        Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            color: StitchTokens.roseWarmSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: StitchTokens.peachBorder),
          ),
          child: const Row(
            children: [
              Icon(Icons.auto_fix_high_rounded, color: StitchTokens.wine),
              SizedBox(width: AppSpace.sm),
              Expanded(
                child: AppText(
                  'Điền nhanh từ ảnh: Tải ảnh bìa để AI tự động nhận diện tên sách, tác giả và nhà xuất bản.',
                  kind: AppTextKind.small,
                  color: StitchTokens.wine,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.md),
        AppTextField(
          label: _isBundle ? 'Tên bộ sách' : 'Tên ấn bản sách',
          requiredField: true,
          controller: _titleCtrl,
          placeholder: 'Ví dụ: Mắt Biếc',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.md),
        AppTextField(
          label: 'Tác giả (ngăn cách bằng dấu phẩy)',
          requiredField: true,
          controller: _authorCtrl,
          placeholder: 'Ví dụ: Nguyễn Nhật Ánh',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.md),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                label: 'Nhà xuất bản',
                controller: _publisherCtrl,
                placeholder: 'NXB Trẻ',
              ),
            ),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: AppTextField(
                label: 'Mã ISBN',
                controller: _isbnCtrl,
                placeholder: '978-604-1-...',
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStep1Media() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppText(
          '2. Hình ảnh thực tế ấn bản',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: 6),
        const AppText(
          'Ảnh bìa bản sách * và ảnh phụ chụp rõ gáy sách, mép giấy, trang bản quyền.',
          kind: AppTextKind.small,
        ),
        const SizedBox(height: AppSpace.lg),
        Container(
          padding: const EdgeInsets.all(AppSpace.xl),
          decoration: BoxDecoration(
            color: StitchTokens.parchment,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: StitchTokens.peachBorder),
          ),
          child: Column(
            children: [
              Icon(
                _hasCoverPhoto
                    ? Icons.check_circle_rounded
                    : Icons.add_a_photo_outlined,
                size: 42,
                color: _hasCoverPhoto
                    ? const Color(0xFF1F7A3E)
                    : StitchTokens.wine,
              ),
              const SizedBox(height: AppSpace.sm),
              AppText(
                _hasCoverPhoto
                    ? 'Đã đính kèm ảnh bìa thực tế'
                    : 'Chưa có ảnh bìa bản sách',
                kind: AppTextKind.bold,
              ),
              const SizedBox(height: AppSpace.md),
              Wrap(
                spacing: AppSpace.sm,
                children: [
                  AppButton(
                    title: _hasCoverPhoto ? 'Thay ảnh bìa' : '+ Chọn ảnh bìa',
                    wine: true,
                    compact: true,
                    onPressed: () {
                      setState(() {
                        _hasCoverPhoto = true;
                        if (_mediaIds.isEmpty) {
                          _mediaIds = ['cover-photo-${DateTime.now().millisecondsSinceEpoch}'];
                        }
                      });
                    },
                  ),
                  if (_hasCoverPhoto)
                    AppButton(
                      title: 'Xóa bìa',
                      secondary: true,
                      compact: true,
                      onPressed: () {
                        setState(() {
                          _hasCoverPhoto = false;
                          _mediaIds = [];
                        });
                      },
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStep2Condition() {
    const grades = [
      (id: 'LikeNew', label: 'BẬC A - Như Mới (Like New)'),
      (id: 'Good', label: 'BẬC B - Tốt (Good)'),
      (id: 'Fair', label: 'BẬC C - Khá (Fair)'),
      (id: 'Worn', label: 'BẬC D - Cũ nhiều (Worn)'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppText(
          '3. Đánh giá tình trạng sách',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: AppSpace.md),
        Wrap(
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: grades.map((g) {
            return AppChip(
              title: g.label,
              wine: true,
              selected: _condition == g.id,
              onPressed: () => setState(() => _condition = g.id),
            );
          }).toList(),
        ),
        const SizedBox(height: AppSpace.lg),
        const AppText('KHẢO CHỨNG BẢN SÁCH', kind: AppTextKind.label),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _readable,
          activeColor: StitchTokens.wine,
          title: const AppText('Nội dung có còn đọc rõ?'),
          onChanged: (v) => setState(() => _readable = v ?? true),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _hasMissingPages,
          activeColor: StitchTokens.wine,
          title: const AppText('Sách có thiếu trang?'),
          onChanged: (v) => setState(() => _hasMissingPages = v ?? false),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _missingEssentialContent,
          activeColor: StitchTokens.wine,
          title: const AppText('Có thiếu phần nội dung trọng yếu?'),
          onChanged: (v) =>
              setState(() => _missingEssentialContent = v ?? false),
        ),
        const SizedBox(height: AppSpace.md),
        AppTextField(
          label: 'Bìa & gáy sách',
          requiredField: true,
          controller: _coverNoteCtrl,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.md),
        AppTextField(
          label: 'Ruột sách & số trang',
          controller: _pagesNoteCtrl,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpace.md),
        AppTextField(
          label: 'Chi tiết ấn bản & mô tả thêm',
          multiline: true,
          controller: _descriptionCtrl,
        ),
      ],
    );
  }

  Widget _buildStep3Pricing() {
    const modes = [
      (id: 'Sale', label: 'Bán trực tiếp'),
      (id: 'Exchange', label: 'Trao đổi Sách'),
      (id: 'Both', label: 'Cả bán & đổi'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppText(
          '4. Phương thức giao dịch & Định giá',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: AppSpace.md),
        Wrap(
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: modes.map((m) {
            return AppChip(
              title: m.label,
              wine: true,
              selected: _mode == m.id,
              onPressed: () => setState(() => _mode = m.id),
            );
          }).toList(),
        ),
        const SizedBox(height: AppSpace.lg),
        if (_mode == 'Sale' || _mode == 'Both') ...[
          AppTextField(
            label: 'GIÁ BÁN ĐỀ XUẤT (VND)',
            requiredField: true,
            controller: _salePriceCtrl,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.sm),
          Container(
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(
              color: AppColors.successSurface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const AppText(
              'Gợi ý giá bán: Dựa trên tình trạng ấn bản, mức giá hợp lý trên sàn từ 45.000 ₫ – 85.000 ₫.',
              kind: AppTextKind.small,
              color: AppColors.forest,
            ),
          ),
          const SizedBox(height: AppSpace.md),
        ],
        if (_mode == 'Exchange' || _mode == 'Both') ...[
          AppTextField(
            label: 'GIÁ TRỊ QUY ĐỔI / ĐỐI CHIẾU (VND)',
            requiredField: true,
            controller: _exchangeValueCtrl,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.md),
          AppTextField(
            label: '🎯 TIÊU CHÍ ĐỔI SÁCH MONG MUỐN (TÙY CHỌN)',
            controller: _wantedGenreCtrl,
            placeholder: 'Thể loại hoặc tác giả bạn muốn nhận đổi…',
          ),
        ],
      ],
    );
  }

  Widget _buildStep4Review() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppText(
          '5. Kiểm tra & Cam kết trước khi đăng',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: AppSpace.md),
        Container(
          padding: const EdgeInsets.all(AppSpace.lg),
          decoration: BoxDecoration(
            color: StitchTokens.parchment,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: StitchTokens.cardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppText(
                'Tựa sách: ${_titleCtrl.text.trim()}',
                kind: AppTextKind.bold,
              ),
              const SizedBox(height: 4),
              AppText('Tác giả: ${_authorCtrl.text.trim()}'),
              const SizedBox(height: 4),
              AppText(
                'Tình trạng: ${formatConditionLabel(_condition)} · Hình thức: ${formatModeLabel(_mode)}',
              ),
              if (_mode == 'Sale' || _mode == 'Both') ...[
                const SizedBox(height: 4),
                AppText(
                  'Giá bán: ${formatVnd(int.tryParse(_salePriceCtrl.text.trim()))}',
                  kind: AppTextKind.bold,
                  color: StitchTokens.wine,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpace.md),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _ownershipDeclared,
          activeColor: StitchTokens.wine,
          title: const AppText(
            'Tôi có quyền sở hữu và cam kết thông tin trung thực với tình trạng thực tế của cuốn sách.',
            kind: AppTextKind.small,
          ),
          onChanged: (v) => setState(() => _ownershipDeclared = v ?? false),
        ),
      ],
    );
  }
}

