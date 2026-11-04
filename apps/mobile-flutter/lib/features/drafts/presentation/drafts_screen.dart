import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/session_client.dart';
import '../../../core/models/catalog_taxonomy.dart';
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
    final currentRev = raw['currentRevision'] is Map
        ? raw['currentRevision'] as Map
        : null;
    final content = currentRev?['content'] is Map
        ? currentRev!['content'] as Map
        : (raw['content'] is Map ? raw['content'] as Map : null);

    final moderation = _extractModeration(raw);
    final mode = (content?['mode'] ?? raw['mode'] ?? '').toString();
    final condition = (content?['condition'] ?? raw['condition'] ?? 'Good')
        .toString();
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
    final book =
        cachedBook ??
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
      final res = await client.request(
        '/me/listings?channel=Marketplace&limit=50',
      );
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
      _draftCount = parsed
          .where((d) => _extractModeration(d) == 'Draft')
          .length;
      _pendingCount = parsed
          .where((d) => _extractModeration(d) == 'PendingReview')
          .length;
      _approvedCount = parsed
          .where((d) => _extractModeration(d) == 'Approved')
          .length;
      _rejectedCount = parsed
          .where((d) => _extractModeration(d) == 'Rejected')
          .length;

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
            child: const Text(
              'Hủy',
              style: TextStyle(color: StitchTokens.darkWood),
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: StitchTokens.darkRed,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
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
      final merged = detail is Map
          ? Map<String, dynamic>.from(detail)
          : Map<String, dynamic>.from(item);
      if (merged['book'] == null && item['book'] != null) {
        merged['book'] = item['book'];
      }
      final bId =
          (merged['currentRevision']?['content']?['bookId'] ?? merged['bookId'])
              ?.toString();
      if (merged['book'] == null &&
          bId != null &&
          _bookCache.containsKey(bId)) {
        merged['book'] = _bookCache[bId];
      }
      setState(() {
        _editingDraft = merged;
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
          message: 'Tạo bản nháp, định giá bằng AI và đăng bán hoặc trao đổi sách trên kệ Lật Lại.',
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
                    _StatPill(label: 'Tổng ấn bản', value: '$_totalCount'),
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
                                  .where(
                                    (d) =>
                                        _extractModeration(d) ==
                                        _moderationFilter,
                                  )
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
              message: 'Các ấn bản bạn tạo, gửi duyệt hoặc đang niêm yết sẽ xuất hiện tại đây.',
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
                    final title =
                        (item['bundle']?['title'] ??
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
          border: Border.all(color: StitchTokens.gold.withValues(alpha: 0.3)),
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
  const _DraftEditorScreen({required this.draft, required this.onClose});

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
  late final TextEditingController _seriesCtrl;
  late final TextEditingController _catalogSearchCtrl;
  late final TextEditingController _coverNoteCtrl;
  late final TextEditingController _pagesNoteCtrl;
  late final TextEditingController _notesCtrl;
  late final TextEditingController _accessoriesCtrl;
  late final TextEditingController _descriptionCtrl;
  late final TextEditingController _salePriceCtrl;
  late final TextEditingController _exchangeValueCtrl;
  late final TextEditingController _targetCategoryCtrl;
  late final TextEditingController _targetAuthorCtrl;
  late final TextEditingController _targetDescriptionCtrl;

  // Bundle controllers
  late final TextEditingController _bundleFromCtrl;
  late final TextEditingController _bundleToCtrl;

  // Mode and entry states
  String _entryMode = 'catalog'; // 'catalog' | 'manual'
  Map<String, dynamic>? _selectedCatalogBook;
  bool _searchingCatalog = false;
  List<Map<String, dynamic>> _catalogResults = [];

  // Classification states
  String? _categoryId;
  String _language = 'vi';
  final Map<String, List<String>> _selectedAttributes = {};

  // Bundle state
  bool _isBundle = false;
  List<Map<String, String>> _bundleItems = [
    {'label': 'Tập 1', 'condition': 'Good', 'notes': ''},
    {'label': 'Tập 2', 'condition': 'Good', 'notes': ''},
  ];

  // Media state
  final ImagePicker _picker = ImagePicker();
  bool _hasCoverPhoto = false;
  String _coverAlign = 'center';
  List<String> _mediaIds = [];
  String? _coverPhotoPath;
  final List<String> _supportPhotoPaths = [];
  final Map<String, String> _uploadedMediaCache = {};

  // Condition state
  String _condition = 'Good';
  bool? _readable = true;
  bool? _hasMissingPages = false;
  bool? _missingEssentialContent = false;

  // Pricing & Transaction mode
  String _mode = 'Sale'; // 'Sale' | 'Exchange' | 'Both'
  bool _showPreview = false;
  bool _ownershipDeclared = false;

  // Fulfillment & addresses
  String? _selectedOriginAddressId;
  List<Map<String, dynamic>> _savedAddresses = [];
  List<Map<String, dynamic>> _serviceLocalities = [];
  bool _showAddAddressDialog = false;
  final _recipientNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _detailAddressCtrl = TextEditingController();
  String? _selectedLocalityCode;

  String? _draftId;
  String? _bookId;
  bool _saving = false;
  bool _autoSaving = false;
  DateTime? _lastAutoSavedAt;
  Timer? _autoSaveTimer;
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
        decoration: BoxDecoration(
          color: const Color(0xFF16A34A),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33000000),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: const Icon(Icons.check_rounded, size: 16, color: Colors.white),
      );
    }

    if (showError) {
      return Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: const Color(0xFFDC2626),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33000000),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: const Icon(Icons.close_rounded, size: 15, color: Colors.white),
      );
    }

    if (active) {
      return Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF360000), Color(0xFF5C0202)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          shape: BoxShape.circle,
          border: Border.all(color: StitchTokens.gold, width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x60000000),
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
            color: StitchTokens.gold,
          ),
        ),
      );
    }

    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
      ),
      alignment: Alignment.center,
      child: Text(
        '${index + 1}',
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    final content =
        widget.draft['currentRevision'] is Map &&
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

    // Bundle restoration
    if (content['bundle'] is Map) {
      final b = Map<String, dynamic>.from(content['bundle'] as Map);
      _isBundle = true;
      if (b['items'] is List && (b['items'] as List).isNotEmpty) {
        _bundleItems = (b['items'] as List).map((it) {
          final m = it is Map ? it : {};
          return {
            'label': (m['label'] ?? '').toString(),
            'condition': (m['condition'] ?? 'Good').toString(),
            'notes': (m['notes'] ?? '').toString(),
          };
        }).toList();
      }
    } else {
      _isBundle = false;
    }

    final initialTitle = (book['title'] ?? content['title'] ?? '').toString();
    _entryMode =
        (initialTitle.isNotEmpty && (_bookId == null || _bookId!.isEmpty))
        ? 'manual'
        : 'catalog';

    // Photos
    _hasCoverPhoto = _mediaIds.isNotEmpty;

    // Controllers
    _titleCtrl = TextEditingController(text: initialTitle);
    _authorCtrl = TextEditingController(
      text:
          (book['authors'] is List
                  ? (book['authors'] as List).join(', ')
                  : (book['author'] ?? ''))
              .toString(),
    );
    _publisherCtrl = TextEditingController(
      text: (book['publisher'] ?? '').toString(),
    );
    _isbnCtrl = TextEditingController(text: (book['isbn'] ?? '').toString());
    _seriesCtrl = TextEditingController(
      text: (content['series'] ?? '').toString(),
    );
    _catalogSearchCtrl = TextEditingController();
    _coverNoteCtrl = TextEditingController(
      text: (content['coverNote'] ?? '').toString(),
    );
    _pagesNoteCtrl = TextEditingController(
      text: (content['pages'] ?? '').toString(),
    );
    _notesCtrl = TextEditingController(
      text: (content['notes'] ?? '').toString(),
    );
    _accessoriesCtrl = TextEditingController(
      text: (content['accessories'] ?? '').toString(),
    );
    _descriptionCtrl = TextEditingController(
      text: (content['description'] ?? '').toString(),
    );

    _bundleFromCtrl = TextEditingController(text: '1');
    _bundleToCtrl = TextEditingController(text: '10');

    _salePriceCtrl = TextEditingController(
      text: content['salePrice'] != null ? content['salePrice'].toString() : '',
    );
    _exchangeValueCtrl = TextEditingController(
      text: content['exchangeValue'] != null
          ? content['exchangeValue'].toString()
          : '',
    );

    final prefs = content['exchangePreferences'] is Map
        ? Map<String, dynamic>.from(content['exchangePreferences'] as Map)
        : null;
    _targetCategoryCtrl = TextEditingController(
      text: (prefs?['targetCategory'] ?? '').toString(),
    );
    _targetAuthorCtrl = TextEditingController(
      text: (prefs?['targetAuthor'] ?? '').toString(),
    );
    _targetDescriptionCtrl = TextEditingController(
      text: (prefs?['targetDescription'] ?? '').toString(),
    );

    _condition = (content['condition'] ?? 'Good').toString();
    _mode = _isBundle ? 'Sale' : (content['mode'] ?? 'Sale').toString();
    _readable = content['readable'] is bool
        ? content['readable'] as bool
        : true;
    _hasMissingPages = content['hasMissingPages'] is bool
        ? content['hasMissingPages'] as bool
        : false;
    _missingEssentialContent = content['missingEssentialContent'] is bool
        ? content['missingEssentialContent'] as bool
        : false;

    // Classification
    _categoryId = content['categoryId']?.toString() ?? 'literature';
    _language = (content['language'] ?? 'vi').toString();

    // Fulfillment address
    if (content['fulfillment'] is Map) {
      _selectedOriginAddressId =
          (content['fulfillment'] as Map)['originAddressId']?.toString();
    }

    final controllers = [
      _titleCtrl,
      _authorCtrl,
      _publisherCtrl,
      _isbnCtrl,
      _seriesCtrl,
      _coverNoteCtrl,
      _pagesNoteCtrl,
      _notesCtrl,
      _accessoriesCtrl,
      _descriptionCtrl,
      _salePriceCtrl,
      _exchangeValueCtrl,
      _targetCategoryCtrl,
      _targetAuthorCtrl,
      _targetDescriptionCtrl,
    ];
    for (final ctrl in controllers) {
      ctrl.addListener(_onFieldChanged);
    }

    _loadFulfillmentData();
    if (_bookId != null && _bookId!.isNotEmpty) {
      _loadBookDetails();
    }
  }

  Future<void> _loadBookDetails() async {
    if (_bookId == null || _bookId!.isEmpty) return;
    try {
      final client = ref.read(sessionClientProvider);
      dynamic b;
      try {
        b = await client.publicRequest('/catalog/books/$_bookId');
      } catch (_) {
        try {
          final req = await client.request('/me/catalog-requests/$_bookId');
          if (req is Map && req['currentRevision'] is Map) {
            b = (req['currentRevision'] as Map)['metadata'];
          }
        } catch (_) {}
      }
      if (b is Map && mounted) {
        setState(() {
          _selectedCatalogBook = Map<String, dynamic>.from(b);
          if (_titleCtrl.text.trim().isEmpty) {
            _titleCtrl.text = (b['title'] ?? '').toString();
          }
          if (_authorCtrl.text.trim().isEmpty) {
            final authors = b['authors'] is List
                ? (b['authors'] as List).join(', ')
                : (b['author'] ?? '').toString();
            _authorCtrl.text = authors;
          }
          if (_publisherCtrl.text.trim().isEmpty && b['publisher'] != null) {
            _publisherCtrl.text = b['publisher'].toString();
          }
          if (_isbnCtrl.text.trim().isEmpty && b['isbn'] != null) {
            _isbnCtrl.text = b['isbn'].toString();
          }
          if (b['categoryId'] != null) {
            _categoryId = b['categoryId'].toString();
          }
        });
      }
    } catch (_) {}
  }

  String _categoryLabel(String? id) {
    if (id == null) return 'Văn học';
    for (final cat in CatalogTaxonomy.rootCategories) {
      if (cat.id == id) return cat.label;
      for (final ch in cat.children) {
        if (ch.id == id) return ch.label;
      }
    }
    return 'Văn học';
  }

  Future<void> _loadFulfillmentData() async {
    try {
      final client = ref.read(sessionClientProvider);
      final addrs = await client.request('/me/addresses');
      final areas = await client.request('/service-areas');
      if (!mounted) return;
      setState(() {
        if (addrs is Map && addrs['items'] is List) {
          _savedAddresses = List<Map<String, dynamic>>.from(
            addrs['items'] as List,
          );
          if (_selectedOriginAddressId == null && _savedAddresses.isNotEmpty) {
            _selectedOriginAddressId = _savedAddresses.first['id']?.toString();
          }
        }
        if (areas is Map && areas['localities'] is List) {
          _serviceLocalities = List<Map<String, dynamic>>.from(
            areas['localities'] as List,
          );
          if (_serviceLocalities.isNotEmpty && _selectedLocalityCode == null) {
            _selectedLocalityCode = _serviceLocalities.first['code']
                ?.toString();
          }
        }
      });
    } catch (_) {}
  }

  Future<void> _searchCatalog(String query) async {
    final q = query.trim();
    if (q.length < 2) {
      setState(() => _catalogResults = []);
      return;
    }
    setState(() => _searchingCatalog = true);
    try {
      final client = ref.read(sessionClientProvider);
      final res = await client.publicRequest(
        '/catalog/books?q=${Uri.encodeComponent(q)}&limit=6',
      );
      if (!mounted) return;
      if (res is Map && res['items'] is List) {
        setState(() {
          _catalogResults = List<Map<String, dynamic>>.from(
            res['items'] as List,
          );
          _searchingCatalog = false;
        });
      } else {
        setState(() {
          _catalogResults = [];
          _searchingCatalog = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _searchingCatalog = false);
    }
  }

  void _onSelectCatalogBook(Map<String, dynamic> b) {
    setState(() {
      _selectedCatalogBook = b;
      _bookId = b['id']?.toString();
      _titleCtrl.text = (b['title'] ?? '').toString();
      final authors = b['authors'] is List
          ? (b['authors'] as List).join(', ')
          : (b['author'] ?? '').toString();
      _authorCtrl.text = authors;
      if (b['publisher'] != null) {
        _publisherCtrl.text = b['publisher'].toString();
      }
      if (b['isbn'] != null) _isbnCtrl.text = b['isbn'].toString();
      if (b['categoryId'] != null) _categoryId = b['categoryId'].toString();
      _catalogResults = [];
    });
    _scheduleAutoSave();
  }

  void _showCoverPhotoSourcePicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            color: StitchTokens.parchment,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.muted.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Chọn ảnh bìa bài viết',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: StitchTokens.wine,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                      color: AppColors.muted,
                    ),
                  ],
                ),
                const Text(
                  'Chọn ảnh bìa thực tế từ máy hoặc chọn ảnh mẫu để thử nghiệm:',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(ctx);
                          _pickCoverFromSource(ImageSource.camera);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.camera_alt_outlined,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Chụp ảnh',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(ctx);
                          _pickCoverFromSource(ImageSource.gallery);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.photo_library_outlined,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Thư viện ảnh',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(ctx);
                          _showImageUrlInputDialog(isCover: true);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.link_rounded,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Nhập link',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                const Text(
                  'Hoặc chọn nhanh bìa sách mẫu:',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.darkWood,
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 90,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _buildSampleCoverTile(
                        ctx,
                        title: 'Mắt Biếc',
                        url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=400',
                      ),
                      _buildSampleCoverTile(
                        ctx,
                        title: 'Dế Mèn',
                        url: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=400',
                      ),
                      _buildSampleCoverTile(
                        ctx,
                        title: 'Truyện Kiều',
                        url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=400',
                      ),
                      _buildSampleCoverTile(
                        ctx,
                        title: 'Số Đỏ',
                        url: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?q=80&w=400',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSampleCoverTile(
    BuildContext ctx, {
    required String title,
    required String url,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: InkWell(
        onTap: () {
          Navigator.pop(ctx);
          _applyCoverPhotoUrl(url);
        },
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 65,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: StitchTokens.cardBorder),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  color: StitchTokens.parchment,
                  child: const Icon(Icons.book, size: 20),
                ),
              ),
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  color: Colors.black54,
                  child: Text(
                    title,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _applyCoverPhotoUrl(String url) {
    setState(() {
      _coverPhotoPath = url;
      _hasCoverPhoto = true;
    });
    _scheduleAutoSave();
  }

  void _applySupportPhotoUrl(String url) {
    if (_supportPhotoPaths.length + (_hasCoverPhoto ? 1 : 0) < 8) {
      setState(() {
        _supportPhotoPaths.add(url);
      });
      _scheduleAutoSave();
    }
  }

  Future<void> _pickCoverFromSource(ImageSource source) async {
    try {
      final XFile? file = await _picker.pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 2000,
        imageQuality: 88,
      );
      if (file != null) {
        setState(() {
          _coverPhotoPath = file.path;
          _hasCoverPhoto = true;
        });
        _scheduleAutoSave();
      }
    } catch (e) {
      debugPrint('Error picking cover photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Không thể mở ${source == ImageSource.camera ? 'máy ảnh' : 'thư viện'}: $e.\nBạn có thể dán link ảnh hoặc chọn ảnh mẫu.',
            ),
            backgroundColor: StitchTokens.wine,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  void _showImageUrlInputDialog({required bool isCover}) {
    final ctrl = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dCtx) => AlertDialog(
        title: Text(
          isCover ? 'Nhập link ảnh bìa' : 'Nhập link ảnh phụ',
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            color: StitchTokens.wine,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Dán đường dẫn ảnh trực tiếp (JPG, PNG, WebP):',
              style: TextStyle(fontSize: 12.5),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: ctrl,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'https://example.com/cover.jpg',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dCtx),
            child: const Text('Hủy'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: StitchTokens.wine,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              final url = ctrl.text.trim();
              if (url.isNotEmpty) {
                Navigator.pop(dCtx);
                if (isCover) {
                  _applyCoverPhotoUrl(url);
                } else {
                  _applySupportPhotoUrl(url);
                }
              }
            },
            child: const Text('Áp dụng'),
          ),
        ],
      ),
    );
  }

  void _showSupportPhotoPickerOptions() {
    final supportCount = _supportPhotoPaths.length;
    final remaining = 8 - (_hasCoverPhoto ? 1 : 0) - supportCount;
    if (remaining <= 0) return;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            color: StitchTokens.parchment,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.muted.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Thêm ảnh chi tiết ($supportCount/7 ảnh phụ)',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: StitchTokens.wine,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                      color: AppColors.muted,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(ctx);
                          _pickSupportFromSource(ImageSource.camera);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.camera_alt_outlined,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Chụp ảnh',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(ctx);
                          _pickSupportFromSource(ImageSource.gallery);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.photo_library_outlined,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Thư viện ảnh',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: () {
                          Navigator.pop(ctx);
                          _showImageUrlInputDialog(isCover: false);
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: StitchTokens.cardBorder),
                          ),
                          child: const Column(
                            children: [
                              Icon(
                                Icons.link_rounded,
                                size: 28,
                                color: StitchTokens.wine,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Nhập link',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: StitchTokens.darkWood,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickSupportFromSource(ImageSource source) async {
    final supportCount = _supportPhotoPaths.length;
    final remaining = 8 - (_hasCoverPhoto ? 1 : 0) - supportCount;
    if (remaining <= 0) return;

    try {
      if (source == ImageSource.camera) {
        final XFile? file = await _picker.pickImage(
          source: ImageSource.camera,
          maxWidth: 1600,
          maxHeight: 2000,
          imageQuality: 88,
        );
        if (file != null) {
          setState(() {
            _supportPhotoPaths.add(file.path);
          });
          _scheduleAutoSave();
        }
      } else {
        final List<XFile> files = await _picker.pickMultiImage(
          maxWidth: 1600,
          maxHeight: 2000,
          imageQuality: 88,
          limit: remaining,
        );
        if (files.isNotEmpty) {
          setState(() {
            for (final f in files) {
              if (_supportPhotoPaths.length + (_hasCoverPhoto ? 1 : 0) < 8) {
                _supportPhotoPaths.add(f.path);
              }
            }
          });
          _scheduleAutoSave();
        }
      }
    } catch (e) {
      debugPrint('Error picking support photos: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Không thể chọn ảnh: $e.\nBạn có thể dán link ảnh trực tiếp.',
            ),
            backgroundColor: StitchTokens.wine,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Future<void> _pickSupportPhotos() async {
    _showSupportPhotoPickerOptions();
  }

  bool get _hasEnteredData {
    return _titleCtrl.text.trim().isNotEmpty ||
        _authorCtrl.text.trim().isNotEmpty ||
        _publisherCtrl.text.trim().isNotEmpty ||
        _isbnCtrl.text.trim().isNotEmpty ||
        _seriesCtrl.text.trim().isNotEmpty ||
        _coverNoteCtrl.text.trim().isNotEmpty ||
        _pagesNoteCtrl.text.trim().isNotEmpty ||
        _notesCtrl.text.trim().isNotEmpty ||
        _accessoriesCtrl.text.trim().isNotEmpty ||
        _descriptionCtrl.text.trim().isNotEmpty ||
        _salePriceCtrl.text.trim().isNotEmpty ||
        _exchangeValueCtrl.text.trim().isNotEmpty ||
        _targetCategoryCtrl.text.trim().isNotEmpty ||
        _bookId != null ||
        _mediaIds.isNotEmpty;
  }

  @override
  void dispose() {
    _autoSaveTimer?.cancel();
    final controllers = [
      _titleCtrl,
      _authorCtrl,
      _publisherCtrl,
      _isbnCtrl,
      _seriesCtrl,
      _coverNoteCtrl,
      _pagesNoteCtrl,
      _notesCtrl,
      _accessoriesCtrl,
      _descriptionCtrl,
      _salePriceCtrl,
      _exchangeValueCtrl,
      _targetCategoryCtrl,
      _targetAuthorCtrl,
      _targetDescriptionCtrl,
    ];
    for (final ctrl in controllers) {
      ctrl.removeListener(_onFieldChanged);
      ctrl.dispose();
    }
    _catalogSearchCtrl.dispose();
    _bundleFromCtrl.dispose();
    _bundleToCtrl.dispose();
    _recipientNameCtrl.dispose();
    _phoneCtrl.dispose();
    _detailAddressCtrl.dispose();
    super.dispose();
  }

  void _onFieldChanged() {
    if (!mounted) return;
    setState(() {});
    _scheduleAutoSave();
  }

  void _scheduleAutoSave() {
    if (!_hasEnteredData) return;
    _autoSaveTimer?.cancel();
    _autoSaveTimer = Timer(const Duration(milliseconds: 1500), () {
      if (mounted && _hasEnteredData && !_saving && !_autoSaving) {
        _saveDraft(isAutoSave: true);
      }
    });
  }

  Future<void> _handleClose() async {
    _autoSaveTimer?.cancel();
    if (_hasEnteredData) {
      if (_autoSaving) {
        int waited = 0;
        while (_autoSaving && waited < 30) {
          await Future.delayed(const Duration(milliseconds: 100));
          waited++;
        }
      }
      if (!_saving && !_autoSaving) {
        try {
          await _saveDraft(isAutoSave: true);
        } catch (e) {
          debugPrint('Exit save error: $e');
        }
      }
    }
    if (mounted) {
      widget.onClose();
    }
  }

  bool _isPriceValid(String text) {
    final clean = text.trim();
    if (clean.isEmpty) return false;
    final val = int.tryParse(clean);
    return val != null && val >= 10000 && val <= 1000000;
  }

  bool _isStepValid(int step) {
    return switch (step) {
      0 =>
        _isBundle
            ? (_titleCtrl.text.trim().isNotEmpty && _bundleItems.length >= 2)
            : (_selectedCatalogBook != null ||
                  (_titleCtrl.text.trim().isNotEmpty &&
                      _authorCtrl.text.trim().isNotEmpty &&
                      _categoryId != null &&
                      _categoryId!.isNotEmpty)),
      1 =>
        _hasCoverPhoto &&
            _coverPhotoPath != null &&
            _coverPhotoPath!.isNotEmpty,
      2 =>
        _condition.isNotEmpty &&
            _pagesNoteCtrl.text.trim().isNotEmpty &&
            _coverNoteCtrl.text.trim().isNotEmpty &&
            _notesCtrl.text.trim().isNotEmpty &&
            _accessoriesCtrl.text.trim().isNotEmpty &&
            _descriptionCtrl.text.trim().length >= 30 &&
            _readable == true &&
            _hasMissingPages != null &&
            _missingEssentialContent == false,
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
    if (index < 0 || index >= _steps.length) return;
    setState(() {
      _visitedSteps.add(_currentStep);
      _visitedSteps.add(index);
      _currentStep = index;
    });
    if (_hasEnteredData) {
      _scheduleAutoSave();
    }
  }

  Map<String, dynamic> _buildContentPayload() {
    final salePrice = int.tryParse(_salePriceCtrl.text.trim());
    final exchangeValue = int.tryParse(_exchangeValueCtrl.text.trim());

    // Resolve fulfillment origin address and its version compliant with OpenAPI ListingFulfillment
    Map<String, dynamic>? fulfillmentPayload;
    if (_selectedOriginAddressId != null && _mode != 'Exchange') {
      final match = _savedAddresses.firstWhere(
        (a) => a['id']?.toString() == _selectedOriginAddressId,
        orElse: () => <String, dynamic>{},
      );
      final v = match['version'];
      final addrVersion = (v is num) ? v.toInt() : null;
      if (addrVersion != null) {
        fulfillmentPayload = {
          'originAddressId': _selectedOriginAddressId,
          'originAddressVersion': addrVersion,
          'method': 'DirectDelivery',
        };
      }
    }

    return {
      'bookId': _bookId,
      if (_isBundle)
        'bundle': {
          'title': _titleCtrl.text.trim(),
          'wholeOnly': true,
          'exclusiveOwnershipDeclared': true,
          'items': _bundleItems,
        },
      'mode': _isBundle ? 'Sale' : _mode,
      'condition': _condition,
      'pages': _pagesNoteCtrl.text.trim(),
      'coverNote': _coverNoteCtrl.text.trim(),
      'notes': _notesCtrl.text.trim().isEmpty
          ? 'Không có'
          : _notesCtrl.text.trim(),
      'accessories': _accessoriesCtrl.text.trim().isEmpty
          ? 'Không có'
          : _accessoriesCtrl.text.trim(),
      'description': _descriptionCtrl.text.trim(),
      'readable': _readable ?? true,
      'hasMissingPages': _hasMissingPages ?? false,
      'missingEssentialContent': _missingEssentialContent ?? false,
      'salePrice': (_mode == 'Sale' || _mode == 'Both' || _isBundle)
          ? salePrice
          : null,
      'exchangeValue': (!_isBundle && (_mode == 'Exchange' || _mode == 'Both'))
          ? exchangeValue
          : null,
      'exchangePreferences':
          !_isBundle &&
              _mode != 'Sale' &&
              (_targetCategoryCtrl.text.trim().isNotEmpty ||
                  _targetAuthorCtrl.text.trim().isNotEmpty ||
                  _targetDescriptionCtrl.text.trim().isNotEmpty)
          ? {
              'targetCategory': _targetCategoryCtrl.text.trim().isEmpty
                  ? null
                  : _targetCategoryCtrl.text.trim(),
              'targetAuthor': _targetAuthorCtrl.text.trim().isEmpty
                  ? null
                  : _targetAuthorCtrl.text.trim(),
              'targetDescription': _targetDescriptionCtrl.text.trim().isEmpty
                  ? null
                  : _targetDescriptionCtrl.text.trim(),
            }
          : null,
      'mediaIds': _mediaIds,
      'fulfillment': fulfillmentPayload,
    };
  }

  void _handleValidationError(String msg, int step) {
    if (!mounted) return;
    setState(() {
      _error = msg;
    });
    if (step != _currentStep) {
      _selectStep(step);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: const Color(0xFFB42318),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  Future<void> _createInitialDraft(SessionClient client) async {
    final payload = _buildContentPayload();
    final createPayload = Map<String, dynamic>.from(payload);
    createPayload['mediaIds'] = const <String>[];

    final createRes = await client.request(
      '/listings',
      method: 'POST',
      idempotencyKey: generateIdempotencyKey('draft-create'),
      body: {'content': createPayload},
    );
    final createMap = createRes is Map
        ? Map<String, dynamic>.from(createRes)
        : const {};
    final newId = (createMap['entityId'] ?? createMap['id'] ?? '').toString();
    if (newId.isEmpty) {
      throw Exception('Không tạo được bản nháp trên hệ thống.');
    }
    _draftId = newId;
    _version = 1;
  }

  Future<String?> _uploadSinglePhoto({
    required String listingId,
    required String pathOrUrl,
  }) async {
    final client = ref.read(sessionClientProvider);
    Uint8List bytes;
    String mimeType = 'image/jpeg';
    final lower = pathOrUrl.toLowerCase();
    if (lower.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (lower.endsWith('.webp')) {
      mimeType = 'image/webp';
    }

    try {
      if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        final dio = Dio();
        final res = await dio.get<List<int>>(
          pathOrUrl,
          options: Options(responseType: ResponseType.bytes),
        );
        if (res.data == null || res.data!.isEmpty) return null;
        bytes = Uint8List.fromList(res.data!);
      } else {
        final file = File(pathOrUrl);
        if (!await file.exists()) return null;
        bytes = await file.readAsBytes();
      }

      if (bytes.isEmpty) return null;
      final sha256Hex = sha256.convert(bytes).toString();
      final createKey = generateIdempotencyKey('media-create');
      final uploadKey = generateIdempotencyKey('media-upload');
      final finalizeKey = generateIdempotencyKey('media-fin');

      // 1. Create Media intent
      final createRes = await client.request(
        '/listings/$listingId/media',
        method: 'POST',
        idempotencyKey: createKey,
        body: {
          'expectedVersion': _version,
          'mimeType': mimeType,
          'byteSize': bytes.length,
          'sha256': sha256Hex,
        },
      );
      if (createRes is! Map || createRes['entityId'] == null) {
        return null;
      }
      final mediaId = createRes['entityId'].toString();

      // 2. Get upload ticket
      final ticketRes = await client.request(
        '/listings/$listingId/media/$mediaId/upload-ticket',
        method: 'GET',
      );
      if (ticketRes is! Map || ticketRes['path'] == null) {
        return null;
      }
      final uploadPath = ticketRes['path'].toString();
      final grantHeaders = ticketRes['headers'] is Map
          ? Map<String, dynamic>.from(ticketRes['headers'] as Map)
          : const <String, dynamic>{};

      final Map<String, String> putHeaders = {
        'Content-Type': mimeType,
        'Idempotency-Key': uploadKey,
      };
      grantHeaders.forEach((k, v) {
        putHeaders[k.toString()] = v.toString();
      });

      // 3. Upload content binary
      final uploadRes = await client.request(
        uploadPath,
        method: 'PUT',
        headers: putHeaders,
        body: bytes,
      );

      // 4. Finalize
      int mVersion = (uploadRes is Map && uploadRes['version'] is num)
          ? (uploadRes['version'] as num).toInt()
          : 2;
      try {
        final mediaDetail = await client.request(
          '/me/listings/$listingId/media/$mediaId',
          method: 'GET',
        );
        if (mediaDetail is Map && mediaDetail['version'] is num) {
          mVersion = (mediaDetail['version'] as num).toInt();
        }
      } catch (_) {}

      await client.request(
        '/listings/$listingId/media/$mediaId/finalize',
        method: 'POST',
        idempotencyKey: finalizeKey,
        body: {'expectedVersion': mVersion},
      );

      // Wait for media worker to transition status to Ready
      bool isReady = false;
      for (int i = 0; i < 20; i++) {
        await Future.delayed(const Duration(milliseconds: 500));
        try {
          final poll = await client.request(
            '/me/listings/$listingId/media/$mediaId',
            method: 'GET',
          );
          if (poll is Map) {
            if (poll['status'] == 'Ready') {
              isReady = true;
              break;
            }
            if (poll['status'] == 'Failed') {
              final failure =
                  poll['failureCode']?.toString() ?? 'Lỗi xử lý ảnh';
              throw Exception(
                'Xử lý ảnh không thành công: $failure. Vui lòng chọn ảnh khác.',
              );
            }
          }
        } catch (e) {
          if (e.toString().contains('Xử lý ảnh không thành công')) rethrow;
        }
      }

      if (!isReady) {
        throw Exception(
          'Ảnh chưa xử lý xong trên máy chủ. Vui lòng thử lại sau giây lát.',
        );
      }

      return mediaId;
    } catch (e) {
      debugPrint('Upload single photo error: $e');
      rethrow;
    }
  }

  Future<void> _saveDraft({
    bool submitForReview = false,
    bool isAutoSave = false,
  }) async {
    if (_saving || (isAutoSave && _autoSaving)) return;
    if (_draftId == null && !_hasEnteredData) {
      if (!isAutoSave) {
        setState(() {
          _error = 'Vui lòng nhập thông tin sách trước khi lưu bản nháp.';
        });
      }
      return;
    }

    // Client-side pre-flight validations when submitting for review
    if (submitForReview) {
      if (!_isStepValid(0)) {
        _handleValidationError(
          'Vui lòng điền đủ thông tin ấn bản sách ở Bước 1.',
          0,
        );
        return;
      }
      if (!_hasCoverPhoto ||
          _coverPhotoPath == null ||
          _coverPhotoPath!.isEmpty) {
        _handleValidationError(
          'Vui lòng chọn ảnh bìa thực tế của sách ở Bước 2.',
          1,
        );
        return;
      }
      if (_descriptionCtrl.text.trim().length < 30) {
        _handleValidationError(
          'Mô tả chung phải có tối thiểu 30 ký tự (hiện có ${_descriptionCtrl.text.trim().length}/30 ký tự) ở Bước 3.',
          2,
        );
        return;
      }
      if (!_isStepValid(2)) {
        _handleValidationError(
          'Vui lòng hoàn thiện đánh giá tình trạng sách ở Bước 3.',
          2,
        );
        return;
      }
      if (!_isStepValid(3)) {
        _handleValidationError(
          'Vui lòng nhập giá bán/giá đổi hợp lệ từ 10.000 ₫ đến 1.000.000 ₫ ở Bước 4.',
          3,
        );
        return;
      }
      if (_mode != 'Exchange' && _selectedOriginAddressId == null) {
        _handleValidationError(
          'Vui lòng chọn hoặc thêm địa chỉ nơi gửi sách ở Bước 4.',
          3,
        );
        return;
      }
      if (!_ownershipDeclared) {
        _handleValidationError(
          'Vui lòng tích xác nhận quyền sở hữu và cam kết thông tin trung thực ở Bước 5.',
          4,
        );
        return;
      }
    }

    setState(() {
      if (isAutoSave) {
        _autoSaving = true;
      } else {
        _saving = true;
        _error = null;
        _success = null;
      }
    });
    final client = ref.read(sessionClientProvider);
    try {
      if (_bookId == null &&
          _titleCtrl.text.trim().isNotEmpty &&
          _authorCtrl.text.trim().isNotEmpty) {
        try {
          final catLabel = _categoryLabel(_categoryId);
          final cleanIsbn = _isbnCtrl.text.trim();
          final isbnVal = cleanIsbn.isEmpty ? null : cleanIsbn;
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
                'publisher': _publisherCtrl.text.trim().isEmpty
                    ? null
                    : _publisherCtrl.text.trim(),
                'publicationYear': DateTime.now().year,
                'language': _language.isNotEmpty ? _language : 'vi',
                'edition': null,
                'category': catLabel,
                'categoryId': _categoryId ?? 'literature',
                'isbn': isbnVal,
              },
            },
          );
          if (catRes is Map && catRes['entityId'] != null) {
            _bookId = catRes['entityId'].toString();
          }
        } catch (e) {
          debugPrint('Catalog request error: $e');
        }
      }

      if (_draftId == null) {
        await _createInitialDraft(client);
      }

      // Upload photos to server if available
      final validMediaIds = <String>[];
      if (_coverPhotoPath != null &&
          _coverPhotoPath!.isNotEmpty &&
          _draftId != null) {
        String? coverMediaId = _uploadedMediaCache[_coverPhotoPath!];
        if (coverMediaId == null) {
          coverMediaId = await _uploadSinglePhoto(
            listingId: _draftId!,
            pathOrUrl: _coverPhotoPath!,
          );
          if (coverMediaId != null) {
            _uploadedMediaCache[_coverPhotoPath!] = coverMediaId;
          }
        }
        if (coverMediaId != null) {
          validMediaIds.add(coverMediaId);
        }
      }

      for (final sp in _supportPhotoPaths) {
        if (_draftId == null) break;
        String? supportMediaId = _uploadedMediaCache[sp];
        if (supportMediaId == null) {
          supportMediaId = await _uploadSinglePhoto(
            listingId: _draftId!,
            pathOrUrl: sp,
          );
          if (supportMediaId != null) {
            _uploadedMediaCache[sp] = supportMediaId;
          }
        }
        if (supportMediaId != null && !validMediaIds.contains(supportMediaId)) {
          validMediaIds.add(supportMediaId);
        }
      }

      _mediaIds = validMediaIds;

      if (submitForReview && _mediaIds.isEmpty) {
        throw Exception(
          'Chưa có ảnh bìa hợp lệ được xử lý trên máy chủ. Vui lòng kiểm tra lại ảnh ở Bước 2.',
        );
      }

      // Save draft with current content
      final saved = await client.request(
        '/listings/$_draftId/draft',
        method: 'PUT',
        idempotencyKey: generateIdempotencyKey('draft-save'),
        body: {'expectedVersion': _version, 'content': _buildContentPayload()},
      );
      if (saved is Map && saved['version'] is num) {
        _version = (saved['version'] as num).toInt();
      } else {
        _version++;
      }

      if (submitForReview) {
        final submitted = await client.request(
          '/listings/$_draftId/submit',
          method: 'POST',
          idempotencyKey: generateIdempotencyKey('draft-submit'),
          body: {'expectedVersion': _version, 'ownershipDeclared': true},
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
        _autoSaving = false;
        _lastAutoSavedAt = DateTime.now();
        if (!isAutoSave) {
          _success = submitForReview
              ? 'Đã lưu và gửi bài đăng chờ kiểm duyệt thành công!'
              : 'Đã lưu bản nháp thành công.';
        }
      });
      if (!isAutoSave) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              submitForReview
                  ? '✓ Đã lưu và gửi bài đăng chờ kiểm duyệt thành công!'
                  : '✓ Đã lưu bản nháp thành công.',
            ),
            backgroundColor: AppColors.forest,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      if (submitForReview) {
        await Future.delayed(const Duration(milliseconds: 1400));
        if (mounted) widget.onClose();
      }
    } catch (e) {
      if (!mounted) return;
      final errMsg = presentErrorMessage(e);
      setState(() {
        _saving = false;
        _autoSaving = false;
        _error = errMsg;
      });
      if (!isAutoSave) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errMsg),
            backgroundColor: const Color(0xFFB42318),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
          ),
        );
      }
      debugPrint('Save draft error: $e');
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              BackAction(title: 'Về sách của tôi', onPressed: _handleClose),
              if (_autoSaving)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.5,
                        color: StitchTokens.wine,
                      ),
                    ),
                    SizedBox(width: 6),
                    AppText(
                      'Đang tự động lưu…',
                      kind: AppTextKind.small,
                      color: StitchTokens.wine,
                      style: TextStyle(fontSize: 11),
                    ),
                  ],
                )
              else if (_lastAutoSavedAt != null)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.cloud_done_outlined,
                      size: 15,
                      color: AppColors.forest,
                    ),
                    const SizedBox(width: 4),
                    AppText(
                      'Đã tự lưu ${_lastAutoSavedAt!.hour.toString().padLeft(2, '0')}:${_lastAutoSavedAt!.minute.toString().padLeft(2, '0')}',
                      kind: AppTextKind.small,
                      color: AppColors.forest,
                      style: const TextStyle(fontSize: 11),
                    ),
                  ],
                )
              else if (_error != null)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(
                      Icons.error_outline_rounded,
                      size: 15,
                      color: Color(0xFFB42318),
                    ),
                    SizedBox(width: 4),
                    AppText(
                      'Lỗi lưu',
                      kind: AppTextKind.small,
                      color: Color(0xFFB42318),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                )
              else if (_hasEnteredData)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(
                      Icons.cloud_queue_rounded,
                      size: 15,
                      color: AppColors.muted,
                    ),
                    SizedBox(width: 4),
                    AppText(
                      'Chưa lưu',
                      kind: AppTextKind.small,
                      color: AppColors.muted,
                      style: TextStyle(fontSize: 11),
                    ),
                  ],
                ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),

          // 5-Step Connected Progress Bar on 1 Single Row (Signature Red Background)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF5C0202), Color(0xFF7A0E0E)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: StitchTokens.gold.withValues(alpha: 0.3),
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x255C0202),
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
                                                ? const Color(0xFF4ADE80)
                                                : Colors.white.withValues(
                                                    alpha: 0.25,
                                                  )),
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
                                                ? const Color(0xFF4ADE80)
                                                : Colors.white.withValues(
                                                    alpha: 0.25,
                                                  )),
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
                                      ? StitchTokens.gold
                                      : (_isStepValid(i)
                                            ? const Color(0xFF86EFAC)
                                            : (!_isStepValid(i) &&
                                                      _visitedSteps.contains(i)
                                                  ? const Color(0xFFFCA5A5)
                                                  : Colors.white.withValues(
                                                      alpha: 0.75,
                                                    ))),
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
                    final validCount = [
                      0,
                      1,
                      2,
                      3,
                      4,
                    ].where(_isStepValid).length;
                    final progressRatio = validCount / 5.0;
                    final progressPercent = (progressRatio * 100).toInt();
                    final isCurrentValid = _isStepValid(_currentStep);

                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: StitchTokens.gold.withValues(alpha: 0.3),
                        ),
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
                                          ? const Color(0xFF4ADE80)
                                          : StitchTokens.gold,
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
                                          color: Colors.white,
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
                                      ? const Color(0xFF4ADE80)
                                      : StitchTokens.gold,
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
                              color: Colors.white.withValues(alpha: 0.15),
                              child: LayoutBuilder(
                                builder: (ctx, constraints) {
                                  return Align(
                                    alignment: Alignment.centerLeft,
                                    child: AnimatedContainer(
                                      duration: const Duration(
                                        milliseconds: 300,
                                      ),
                                      curve: Curves.easeOutCubic,
                                      width:
                                          constraints.maxWidth * progressRatio,
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: validCount == 5
                                              ? const [
                                                  Color(0xFF16A34A),
                                                  Color(0xFF4ADE80),
                                                ]
                                              : const [
                                                  StitchTokens.goldDark,
                                                  StitchTokens.gold,
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
                                        ? const Color(0xFF86EFAC)
                                        : Colors.white.withValues(alpha: 0.75),
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
                                      ? const Color(0x3316A34A)
                                      : const Color(0x33DC2626),
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(
                                    color: isCurrentValid
                                        ? const Color(0x664ADE80)
                                        : const Color(0x66FCA5A5),
                                  ),
                                ),
                                child: Text(
                                  isCurrentValid ? '✓ Hợp lệ' : '✕ Cần điền',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: isCurrentValid
                                        ? const Color(0xFF86EFAC)
                                        : const Color(0xFFFECACA),
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
          const SizedBox(height: AppSpace.md),

          // Collapsible Live Preview Card matching Web `Xem bản nháp`
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: StitchTokens.peachBorder),
            ),
            child: Column(
              children: [
                InkWell(
                  onTap: () => setState(() => _showPreview = !_showPreview),
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 11,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.menu_book_rounded,
                              size: 17,
                              color: StitchTokens.wine,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _showPreview
                                  ? 'Thu gọn bản nháp'
                                  : 'Xem bản nháp',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: StitchTokens.wine,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: StitchTokens.parchment,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: StitchTokens.peachBorder,
                                ),
                              ),
                              child: Text(
                                '${_hasCoverPhoto ? 1 + _supportPhotoPaths.length : 0}/8 ảnh',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: StitchTokens.deepCocoa,
                                ),
                              ),
                            ),
                          ],
                        ),
                        Icon(
                          _showPreview
                              ? Icons.keyboard_arrow_up_rounded
                              : Icons.keyboard_arrow_down_rounded,
                          color: StitchTokens.wine,
                        ),
                      ],
                    ),
                  ),
                ),
                if (_showPreview)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: const BoxDecoration(
                      color: Color(0xFFFFFDF8),
                      border: Border(top: BorderSide(color: Color(0xFFF0E5D8))),
                      borderRadius: BorderRadius.only(
                        bottomLeft: Radius.circular(14),
                        bottomRight: Radius.circular(14),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _titleCtrl.text.trim().isEmpty
                              ? 'Chưa có tên sách'
                              : _titleCtrl.text.trim(),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: StitchTokens.wine,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Tác giả: ${_authorCtrl.text.trim().isEmpty ? "Chưa có tác giả" : _authorCtrl.text.trim()}',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: StitchTokens.darkWood,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: StitchTokens.parchment,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'Tình trạng: ${formatConditionLabel(_condition)}',
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: StitchTokens.parchment,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _isBundle
                                    ? 'Bộ ${_bundleItems.length} cuốn'
                                    : formatModeLabel(_mode),
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (_salePriceCtrl.text.trim().isNotEmpty)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFE8F5E9),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Giá bán: ${formatVnd(int.tryParse(_salePriceCtrl.text.trim()))}',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF1F7A3E),
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
          const SizedBox(height: AppSpace.md),

          if (_error != null) ...[
            Notice(message: _error!, tone: NoticeTone.error),
            const SizedBox(height: AppSpace.md),
          ],
          if (_success != null) ...[
            Notice(message: _success!, tone: NoticeTone.success),
            const SizedBox(height: AppSpace.md),
          ],

          // Step Content Card with Archival Stamp Header
          Container(
            padding: const EdgeInsets.all(AppSpace.xl),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: StitchTokens.cardBorder),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x065C0202),
                  blurRadius: 10,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Archival Slip Header (Logo + "Phiếu thông tin sách" + Rotated "BẢN NHÁP" Stamp)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 24,
                          height: 24,
                          decoration: BoxDecoration(
                            color: StitchTokens.wine,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          alignment: Alignment.center,
                          child: const Text(
                            'L',
                            style: TextStyle(
                              color: StitchTokens.goldLight,
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Hồ sơ kiểm mục ấn bản',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.3,
                            color: StitchTokens.wine,
                          ),
                        ),
                      ],
                    ),
                    Transform.rotate(
                      angle: -0.07,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF5F5),
                          border: Border.all(
                            color: StitchTokens.wine,
                            width: 1.2,
                          ),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'BẢN NHÁP',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.0,
                            color: StitchTokens.wine,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  'Bước ${_currentStep + 1}/5 · ${_steps[_currentStep].title}',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.muted,
                  ),
                ),
                const Divider(height: 24, color: Color(0xFFEDE4D8)),
                switch (_currentStep) {
                  0 => _buildStep0BookInfo(),
                  1 => _buildStep1Media(),
                  2 => _buildStep2Condition(),
                  3 => _buildStep3Pricing(),
                  _ => _buildStep4Review(),
                },
              ],
            ),
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
        // Sách lẻ vs Bộ sách Segmented Tabs
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: const Color(0xFFF3ECE2),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () {
                    if (!_isBundle) return;
                    setState(() {
                      _isBundle = false;
                      _mode = 'Sale';
                    });
                  },
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: !_isBundle ? Colors.white : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      boxShadow: !_isBundle
                          ? const [
                              BoxShadow(
                                color: Color(0x0F000000),
                                blurRadius: 4,
                                offset: Offset(0, 1),
                              ),
                            ]
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'Sách lẻ',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: !_isBundle
                            ? FontWeight.w800
                            : FontWeight.w600,
                        color: !_isBundle
                            ? StitchTokens.wine
                            : StitchTokens.darkWood,
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: InkWell(
                  onTap: () {
                    if (_isBundle) return;
                    setState(() {
                      _isBundle = true;
                      _mode = 'Sale';
                    });
                  },
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: _isBundle ? Colors.white : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      boxShadow: _isBundle
                          ? const [
                              BoxShadow(
                                color: Color(0x0F000000),
                                blurRadius: 4,
                                offset: Offset(0, 1),
                              ),
                            ]
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'Bộ sách',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: _isBundle
                            ? FontWeight.w800
                            : FontWeight.w600,
                        color: _isBundle
                            ? StitchTokens.wine
                            : StitchTokens.darkWood,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Đổi lựa chọn vẫn giữ thông tin bộ trong phiên này. Bộ sách chỉ bán nguyên bộ, không đổi sách hoặc đấu giá.',
          style: TextStyle(fontSize: 11, color: AppColors.muted),
        ),
        const SizedBox(height: AppSpace.md),

        // Khi chọn "Bộ sách" -> Bundle Editor
        if (_isBundle) ...[
          AppTextField(
            label: 'Tên bộ sách',
            requiredField: true,
            controller: _titleCtrl,
            placeholder: 'Ví dụ: Naruto — trọn bộ tập 1 đến 20',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.md),
          Container(
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(
              color: StitchTokens.parchment,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: StitchTokens.peachBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Tạo nhanh danh sách tập liên tiếp',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.wine,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: AppTextField(
                        label: 'Từ tập',
                        controller: _bundleFromCtrl,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: AppTextField(
                        label: 'Đến tập',
                        controller: _bundleToCtrl,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Padding(
                      padding: const EdgeInsets.only(top: 18),
                      child: AppButton(
                        title: 'Thêm dãy',
                        wine: true,
                        compact: true,
                        onPressed: () {
                          final from =
                              int.tryParse(_bundleFromCtrl.text.trim()) ?? 1;
                          final to =
                              int.tryParse(_bundleToCtrl.text.trim()) ?? from;
                          if (to >= from && to - from <= 50) {
                            setState(() {
                              _bundleItems.clear();
                              for (int i = from; i <= to; i++) {
                                _bundleItems.add({
                                  'label': 'Tập $i',
                                  'condition': 'Good',
                                  'notes': '',
                                });
                              }
                            });
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Danh sách ${_bundleItems.length} cuốn sẽ giao (tối thiểu 2 cuốn):',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              InkWell(
                onTap: () {
                  setState(() {
                    _bundleItems.add({
                      'label': 'Tập ${_bundleItems.length + 1}',
                      'condition': 'Good',
                      'notes': '',
                    });
                  });
                },
                child: const Text(
                  '+ Thêm cuốn',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.wine,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (int i = 0; i < _bundleItems.length; i++) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFDF8),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFEDE4D8)),
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: TextFormField(
                      initialValue: _bundleItems[i]['label'],
                      decoration: InputDecoration(
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 8,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                        labelText: 'Cuốn ${i + 1}',
                      ),
                      onChanged: (v) => _bundleItems[i]['label'] = v,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      isDense: true,
                      initialValue: _bundleItems[i]['condition'],
                      items: const [
                        DropdownMenuItem(
                          value: 'LikeNew',
                          child: Text(
                            'Như mới',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                        DropdownMenuItem(
                          value: 'Good',
                          child: Text('Tốt', style: TextStyle(fontSize: 12)),
                        ),
                        DropdownMenuItem(
                          value: 'Fair',
                          child: Text('Khá', style: TextStyle(fontSize: 12)),
                        ),
                        DropdownMenuItem(
                          value: 'Worn',
                          child: Text('Cũ', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                      onChanged: (v) {
                        if (v != null) {
                          setState(() => _bundleItems[i]['condition'] = v);
                        }
                      },
                      decoration: InputDecoration(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 8,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                    ),
                  ),
                  if (_bundleItems.length > 2) ...[
                    const SizedBox(width: 4),
                    IconButton(
                      icon: const Icon(
                        Icons.close_rounded,
                        size: 18,
                        color: Color(0xFFB42318),
                      ),
                      onPressed: () => setState(() => _bundleItems.removeAt(i)),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ] else ...[
          // Khi chọn "Sách lẻ"
          if (_selectedCatalogBook != null) ...[
            Container(
              padding: const EdgeInsets.all(AppSpace.md),
              decoration: BoxDecoration(
                color: const Color(0xFFF0FDF4),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF86EFAC)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(
                        Icons.check_circle_rounded,
                        color: Color(0xFF16A34A),
                        size: 18,
                      ),
                      SizedBox(width: 6),
                      Text(
                        'Đầu sách đã xác nhận trong thư viện Lật Lại',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF16A34A),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _selectedCatalogBook!['title']?.toString() ?? '',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: StitchTokens.wine,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Tác giả: ${_authorCtrl.text}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: StitchTokens.darkWood,
                    ),
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: () {
                      setState(() {
                        _selectedCatalogBook = null;
                        _entryMode = 'catalog';
                      });
                    },
                    child: const Text(
                      'Chọn đầu sách khác →',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: StitchTokens.wine,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ] else ...[
            // Toggle Cách điền: Tìm sách có sẵn vs Tự nhập
            Row(
              children: [
                Expanded(
                  child: AppChip(
                    title: '📖 Tìm sách có sẵn',
                    wine: true,
                    selected: _entryMode == 'catalog',
                    onPressed: () => setState(() => _entryMode = 'catalog'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: AppChip(
                    title: '✏️ Tự nhập thông tin',
                    wine: true,
                    selected: _entryMode == 'manual',
                    onPressed: () => setState(() => _entryMode = 'manual'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),

            // Điền nhanh từ ảnh Card
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
                      'Điền nhanh từ ảnh: Chụp/tải ảnh bìa để tự động nhận diện tên sách, tác giả và nhà xuất bản.',
                      kind: AppTextKind.small,
                      color: StitchTokens.wine,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.md),

            if (_entryMode == 'catalog') ...[
              AppTextField(
                label: 'Tìm cuốn sách trong thư viện Lật Lại',
                controller: _catalogSearchCtrl,
                placeholder: 'Nhập tên sách hoặc tác giả (ít nhất 2 ký tự)…',
                onChanged: _searchCatalog,
              ),
              if (_searchingCatalog)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                ),
              if (_catalogResults.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  constraints: const BoxConstraints(maxHeight: 220),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: StitchTokens.peachBorder),
                    boxShadow: const [
                      BoxShadow(color: Color(0x0A000000), blurRadius: 6),
                    ],
                  ),
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _catalogResults.length,
                    separatorBuilder: (_, _) =>
                        const Divider(height: 1, color: Color(0xFFEDE4D8)),
                    itemBuilder: (ctx, idx) {
                      final b = _catalogResults[idx];
                      final authors = b['authors'] is List
                          ? (b['authors'] as List).join(', ')
                          : (b['author'] ?? '');
                      return ListTile(
                        dense: true,
                        title: Text(
                          b['title']?.toString() ?? '',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        subtitle: Text(
                          authors.toString(),
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: AppColors.muted,
                          ),
                        ),
                        trailing: const Icon(
                          Icons.arrow_forward_ios_rounded,
                          size: 13,
                          color: StitchTokens.wine,
                        ),
                        onTap: () => _onSelectCatalogBook(b),
                      );
                    },
                  ),
                ),
              ],
              const SizedBox(height: 8),
              InkWell(
                onTap: () => setState(() => _entryMode = 'manual'),
                child: const Text(
                  'Không thấy sách? Tự nhập theo bìa →',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.wine,
                  ),
                ),
              ),
            ] else ...[
              // Manual Form Fields
              AppTextField(
                label: 'Tên ấn bản sách',
                requiredField: true,
                controller: _titleCtrl,
                placeholder: 'Ví dụ: Mắt Biếc, Truyện Kiều',
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Tác giả (ngăn cách bằng dấu phẩy)',
                requiredField: true,
                controller: _authorCtrl,
                placeholder: 'Ví dụ: Nguyễn Nhật Ánh, Nguyễn Du',
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpace.md),

              // Phân loại đầu sách (Root category dropdown)
              DropdownButtonFormField<String>(
                initialValue: _categoryId,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: 'Danh mục sách *',
                  labelStyle: const TextStyle(
                    color: StitchTokens.darkWood,
                    fontWeight: FontWeight.w600,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                ),
                items: CatalogTaxonomy.rootCategories.map((cat) {
                  return DropdownMenuItem(
                    value: cat.id,
                    child: Text(
                      cat.label,
                      style: const TextStyle(fontSize: 13.5),
                    ),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() {
                      _categoryId = val;
                      _selectedAttributes.clear();
                    });
                    _scheduleAutoSave();
                  }
                },
              ),
              const SizedBox(height: AppSpace.md),

              // Ngôn ngữ của sách
              DropdownButtonFormField<String>(
                initialValue: _language,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: 'Ngôn ngữ của sách *',
                  labelStyle: const TextStyle(
                    color: StitchTokens.darkWood,
                    fontWeight: FontWeight.w600,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                ),
                items: CatalogTaxonomy.languageOptions.map((opt) {
                  return DropdownMenuItem(
                    value: opt.id,
                    child: Text(
                      opt.label,
                      style: const TextStyle(fontSize: 13.5),
                    ),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _language = val);
                    _scheduleAutoSave();
                  }
                },
              ),
              const SizedBox(height: AppSpace.md),

              // Bộ truyện / Series (if literature, manga, light-novel, etc.)
              if ([
                'literature',
                'manga',
                'light-novel',
                'children',
              ].contains(_categoryId)) ...[
                AppTextField(
                  label: 'Bộ truyện / Series (nếu có)',
                  controller: _seriesCtrl,
                  placeholder: 'Ví dụ: Thám tử lừng danh Conan',
                ),
                const SizedBox(height: AppSpace.md),
              ],

              // Dynamic Facets for selected Category
              Builder(
                builder: (context) {
                  final cat = CatalogTaxonomy.getCategory(_categoryId ?? '');
                  if (cat == null || cat.facets.isEmpty) {
                    return const SizedBox.shrink();
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final facet in cat.facets) ...[
                        Text(
                          facet.label,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: StitchTokens.darkWood,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: facet.options.map((opt) {
                            final selectedList =
                                _selectedAttributes[facet.id] ?? [];
                            final isSel = selectedList.contains(opt.id);
                            return FilterChip(
                              label: Text(
                                opt.label,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: isSel
                                      ? Colors.white
                                      : StitchTokens.darkWood,
                                ),
                              ),
                              selected: isSel,
                              selectedColor: StitchTokens.wine,
                              backgroundColor: StitchTokens.parchment,
                              onSelected: (selected) {
                                setState(() {
                                  if (selected) {
                                    _selectedAttributes[facet.id] = [
                                      ...selectedList,
                                      opt.id,
                                    ];
                                  } else {
                                    _selectedAttributes[facet.id] = selectedList
                                        .where((x) => x != opt.id)
                                        .toList();
                                  }
                                });
                              },
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 10),
                      ],
                    ],
                  );
                },
              ),

              Row(
                children: [
                  Expanded(
                    child: AppTextField(
                      label: 'Nhà xuất bản',
                      controller: _publisherCtrl,
                      placeholder: 'NXB Trẻ, Kim Đồng…',
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
          ],
        ],
      ],
    );
  }

  Widget _buildStep1Media() {
    final supportCount = _hasCoverPhoto
        ? (_mediaIds.length > 1 ? _mediaIds.length - 1 : 0)
        : _mediaIds.length;
    final totalPhotos = (_hasCoverPhoto ? 1 : 0) + supportCount;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppText(
          '2. Hình ảnh thực tế ấn bản',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: 4),
        const Text(
          'Ảnh bìa (tỷ lệ chuẩn 3:4) và ảnh phụ chụp rõ gáy sách, mép giấy, trang bản quyền (tối đa 8 ảnh).',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: AppSpace.lg),

        // Khung Ảnh Bìa (3:4 aspect ratio)
        Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFDF8),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: StitchTokens.peachBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Ảnh bìa bài viết (3:4) *',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: StitchTokens.wine,
                    ),
                  ),
                  if (_hasCoverPhoto)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5E9),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        '✓ Đã có ảnh bìa',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1F7A3E),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Center(
                child: Material(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  child: InkWell(
                    onTap: _showCoverPhotoSourcePicker,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 140,
                      height: 186, // 3:4 ratio
                      decoration: BoxDecoration(
                        color: StitchTokens.parchment,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: StitchTokens.cardBorder,
                          width: 1.5,
                        ),
                      ),
                      child: _hasCoverPhoto
                          ? Stack(
                              fit: StackFit.expand,
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child:
                                      _coverPhotoPath != null &&
                                          _coverPhotoPath!.isNotEmpty
                                      ? (_coverPhotoPath!.startsWith(
                                                  'http://',
                                                ) ||
                                                _coverPhotoPath!.startsWith(
                                                  'https://',
                                                ) ||
                                                kIsWeb
                                            ? Image.network(
                                                _coverPhotoPath!,
                                                fit: BoxFit.cover,
                                                alignment: _coverAlign == 'left'
                                                    ? Alignment.centerLeft
                                                    : _coverAlign == 'right'
                                                    ? Alignment.centerRight
                                                    : Alignment.center,
                                                errorBuilder: (_, _, _) =>
                                                    const Center(
                                                      child: Icon(
                                                        Icons
                                                            .broken_image_outlined,
                                                        size: 40,
                                                        color: AppColors.muted,
                                                      ),
                                                    ),
                                              )
                                            : Image.file(
                                                File(_coverPhotoPath!),
                                                fit: BoxFit.cover,
                                                alignment: _coverAlign == 'left'
                                                    ? Alignment.centerLeft
                                                    : _coverAlign == 'right'
                                                    ? Alignment.centerRight
                                                    : Alignment.center,
                                                errorBuilder: (_, _, _) =>
                                                    const Center(
                                                      child: Icon(
                                                        Icons
                                                            .broken_image_outlined,
                                                        size: 40,
                                                        color: AppColors.muted,
                                                      ),
                                                    ),
                                              ))
                                      : Align(
                                          alignment: _coverAlign == 'left'
                                              ? Alignment.centerLeft
                                              : _coverAlign == 'right'
                                              ? Alignment.centerRight
                                              : Alignment.center,
                                          child: const Icon(
                                            Icons.book_rounded,
                                            size: 70,
                                            color: StitchTokens.wine,
                                          ),
                                        ),
                                ),
                                Positioned(
                                  top: 6,
                                  right: 6,
                                  child: InkWell(
                                    onTap: () {
                                      setState(() {
                                        _hasCoverPhoto = false;
                                        _coverPhotoPath = null;
                                        if (_mediaIds.isNotEmpty) {
                                          _mediaIds.removeAt(0);
                                        }
                                      });
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.all(4),
                                      decoration: const BoxDecoration(
                                        color: Colors.black87,
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(
                                        Icons.close_rounded,
                                        size: 14,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(
                                  Icons.add_a_photo_outlined,
                                  size: 36,
                                  color: StitchTokens.wine,
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Bìa bài viết\n(3:4)',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: AppColors.muted,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                AppButton(
                                  title: '+ Chọn bìa',
                                  wine: true,
                                  compact: true,
                                  onPressed: _showCoverPhotoSourcePicker,
                                ),
                              ],
                            ),
                    ),
                  ),
                ),
              ),
              if (_hasCoverPhoto) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'Căn vị trí: ',
                      style: TextStyle(fontSize: 11.5, color: AppColors.muted),
                    ),
                    const SizedBox(width: 6),
                    ChoiceChip(
                      label: const Text('Trái', style: TextStyle(fontSize: 11)),
                      selected: _coverAlign == 'left',
                      onSelected: (_) => setState(() => _coverAlign = 'left'),
                    ),
                    const SizedBox(width: 4),
                    ChoiceChip(
                      label: const Text('Giữa', style: TextStyle(fontSize: 11)),
                      selected: _coverAlign == 'center',
                      onSelected: (_) => setState(() => _coverAlign = 'center'),
                    ),
                    const SizedBox(width: 4),
                    ChoiceChip(
                      label: const Text('Phải', style: TextStyle(fontSize: 11)),
                      selected: _coverAlign == 'right',
                      onSelected: (_) => setState(() => _coverAlign = 'right'),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpace.md),

        // Khung Ảnh Phụ (Tối đa 7 ảnh phụ)
        Text(
          'Ảnh chi tiết khác ($supportCount/7 ảnh phụ)',
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: StitchTokens.wine,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (int i = 0; i < supportCount; i++)
              Container(
                width: 75,
                height: 75,
                decoration: BoxDecoration(
                  color: StitchTokens.parchment,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: StitchTokens.cardBorder),
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(7),
                      child: i < _supportPhotoPaths.length
                          ? (_supportPhotoPaths[i].startsWith('http://') ||
                                    _supportPhotoPaths[i].startsWith(
                                      'https://',
                                    ) ||
                                    kIsWeb
                                ? Image.network(
                                    _supportPhotoPaths[i],
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => const Center(
                                      child: Icon(
                                        Icons.broken_image_outlined,
                                        size: 24,
                                        color: AppColors.muted,
                                      ),
                                    ),
                                  )
                                : Image.file(
                                    File(_supportPhotoPaths[i]),
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => const Center(
                                      child: Icon(
                                        Icons.broken_image_outlined,
                                        size: 24,
                                        color: AppColors.muted,
                                      ),
                                    ),
                                  ))
                          : Center(
                              child: Text(
                                'Ảnh ${i + 1}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                    ),
                    Positioned(
                      top: 3,
                      right: 3,
                      child: InkWell(
                        onTap: () {
                          setState(() {
                            if (i < _supportPhotoPaths.length) {
                              _supportPhotoPaths.removeAt(i);
                            }
                            final removeIdx = _hasCoverPhoto ? i + 1 : i;
                            if (removeIdx < _mediaIds.length) {
                              _mediaIds.removeAt(removeIdx);
                            }
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.all(2),
                          decoration: const BoxDecoration(
                            color: Colors.black87,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close_rounded,
                            size: 13,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (totalPhotos < 8)
              InkWell(
                onTap: _pickSupportPhotos,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 75,
                  height: 75,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFAF6F0),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: StitchTokens.peachBorder,
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.add_photo_alternate_outlined,
                        size: 24,
                        color: StitchTokens.wine,
                      ),
                      SizedBox(height: 2),
                      Text(
                        '+ Thêm',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: StitchTokens.wine,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '$totalPhotos/8 ảnh · JPEG, PNG, WebP · tối đa 10 MB/ảnh.',
          style: const TextStyle(fontSize: 11, color: AppColors.muted),
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
          '3. Tình trạng thực tế ấn bản',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: 4),
        const Text(
          'Kể rõ những dấu vết đã có trên cuốn sách để người đọc sau hoàn toàn yên tâm.',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: AppSpace.md),

        // Mức độ đã qua sử dụng
        Wrap(
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: grades.map((g) {
            return AppChip(
              title: g.label,
              wine: true,
              selected: _condition == g.id,
              onPressed: () {
                setState(() => _condition = g.id);
                _scheduleAutoSave();
              },
            );
          }).toList(),
        ),
        const SizedBox(height: AppSpace.lg),

        // 3 Câu hỏi thẩm định tình trạng bắt buộc (Có / Không)
        Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            color: StitchTokens.parchment,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: StitchTokens.peachBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'KIỂM TRA ĐIỀU KIỆN ĐĂNG SÁCH *',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: StitchTokens.wine,
                ),
              ),
              const SizedBox(height: 8),

              // Q1: readable
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Text(
                      '1. Nội dung có đọc rõ không?',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      ChoiceChip(
                        label: const Text(
                          'Có',
                          style: TextStyle(fontSize: 11.5),
                        ),
                        selected: _readable == true,
                        onSelected: (_) {
                          setState(() => _readable = true);
                          _scheduleAutoSave();
                        },
                      ),
                      const SizedBox(width: 4),
                      ChoiceChip(
                        label: const Text(
                          'Không',
                          style: TextStyle(fontSize: 11.5),
                        ),
                        selected: _readable == false,
                        onSelected: (_) {
                          setState(() => _readable = false);
                          _scheduleAutoSave();
                        },
                      ),
                    ],
                  ),
                ],
              ),
              const Divider(height: 16, color: Color(0xFFEDE4D8)),

              // Q2: hasMissingPages
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Text(
                      '2. Sách có thiếu trang không?',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      ChoiceChip(
                        label: const Text(
                          'Có',
                          style: TextStyle(fontSize: 11.5),
                        ),
                        selected: _hasMissingPages == true,
                        onSelected: (_) {
                          setState(() => _hasMissingPages = true);
                          _scheduleAutoSave();
                        },
                      ),
                      const SizedBox(width: 4),
                      ChoiceChip(
                        label: const Text(
                          'Không',
                          style: TextStyle(fontSize: 11.5),
                        ),
                        selected: _hasMissingPages == false,
                        onSelected: (_) {
                          setState(() => _hasMissingPages = false);
                          _scheduleAutoSave();
                        },
                      ),
                    ],
                  ),
                ],
              ),
              const Divider(height: 16, color: Color(0xFFEDE4D8)),

              // Q3: missingEssentialContent
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Text(
                      '3. Có thiếu phần nội dung trọng yếu?',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      ChoiceChip(
                        label: const Text(
                          'Có',
                          style: TextStyle(fontSize: 11.5),
                        ),
                        selected: _missingEssentialContent == true,
                        onSelected: (_) {
                          setState(() => _missingEssentialContent = true);
                          _scheduleAutoSave();
                        },
                      ),
                      const SizedBox(width: 4),
                      ChoiceChip(
                        label: const Text(
                          'Không',
                          style: TextStyle(fontSize: 11.5),
                        ),
                        selected: _missingEssentialContent == false,
                        onSelected: (_) {
                          setState(() => _missingEssentialContent = false);
                          _scheduleAutoSave();
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.md),

        // 5 Text Fields chuẩn Web
        AppTextField(
          label: 'Ruột sách *',
          requiredField: true,
          controller: _pagesNoteCtrl,
          placeholder: 'Giấy, độ rõ chữ, nếp gấp…',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          children:
              [
                'Giấy đẹp nguyên vẹn',
                'Có ố vàng nhẹ theo thời gian',
                'Không nếp gấp',
              ].map((txt) {
                return InkWell(
                  onTap: () => setState(() => _pagesNoteCtrl.text = txt),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: StitchTokens.parchment,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '+ $txt',
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: StitchTokens.wine,
                      ),
                    ),
                  ),
                );
              }).toList(),
        ),
        const SizedBox(height: AppSpace.md),

        AppTextField(
          label: 'Bìa và gáy *',
          requiredField: true,
          controller: _coverNoteCtrl,
          placeholder: 'Mép bìa, gáy sách, vết sờn…',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          children: ['Bìa cứng cáp', 'Mép bìa sờn nhẹ', 'Gáy sách thẳng đẹp']
              .map((txt) {
                return InkWell(
                  onTap: () => setState(() => _coverNoteCtrl.text = txt),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: StitchTokens.parchment,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '+ $txt',
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: StitchTokens.wine,
                      ),
                    ),
                  ),
                );
              })
              .toList(),
        ),
        const SizedBox(height: AppSpace.md),

        AppTextField(
          label: 'Ghi chú, đánh dấu *',
          requiredField: true,
          controller: _notesCtrl,
          placeholder:
              'Ghi rõ phần đã viết hoặc tô; không có thì ghi “Không có”.',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => setState(() => _notesCtrl.text = 'Không có'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: StitchTokens.parchment,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text(
              '+ Điền nhanh: "Không có"',
              style: TextStyle(fontSize: 10.5, color: StitchTokens.wine),
            ),
          ),
        ),
        const SizedBox(height: AppSpace.md),

        AppTextField(
          label: 'Phụ kiện *',
          requiredField: true,
          controller: _accessoriesCtrl,
          placeholder:
              'Bookmark, bìa áo, quà kèm; không có thì ghi “Không có”.',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => setState(() => _accessoriesCtrl.text = 'Không có'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: StitchTokens.parchment,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text(
              '+ Điền nhanh: "Không có"',
              style: TextStyle(fontSize: 10.5, color: StitchTokens.wine),
            ),
          ),
        ),
        const SizedBox(height: AppSpace.md),

        AppTextField(
          label: 'Mô tả chung (tối thiểu 30 ký tự) *',
          requiredField: true,
          multiline: true,
          controller: _descriptionCtrl,
          placeholder: 'Điều người đọc tiếp theo nên biết về ấn bản này…',
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerRight,
          child: Text(
            '${_descriptionCtrl.text.trim().length}/30 ký tự tối thiểu',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: _descriptionCtrl.text.trim().length >= 30
                  ? const Color(0xFF1F7A3E)
                  : const Color(0xFFB42318),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStep3Pricing() {
    const modes = [
      (id: 'Sale', label: 'Bán sách'),
      (id: 'Exchange', label: 'Đổi sách'),
      (id: 'Both', label: 'Bán hoặc đổi'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppText(
          '4. Phương thức giao dịch & Giá',
          kind: AppTextKind.heading,
          color: StitchTokens.wine,
        ),
        const SizedBox(height: 4),
        Text(
          _isBundle
              ? 'Bộ sách chỉ bán nguyên bộ, không tách cuốn.'
              : 'Chọn hình thức giao dịch phù hợp cho ấn bản của bạn.',
          style: const TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: AppSpace.md),

        if (!_isBundle) ...[
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: modes.map((m) {
              return AppChip(
                title: m.label,
                wine: true,
                selected: _mode == m.id,
                onPressed: () {
                  setState(() => _mode = m.id);
                  _scheduleAutoSave();
                },
              );
            }).toList(),
          ),
          const SizedBox(height: AppSpace.lg),
        ],

        // Nơi gửi sách (Origin Address) khi có Bán sách
        if (_mode != 'Exchange') ...[
          Container(
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFDF8),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: StitchTokens.peachBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(
                      Icons.local_shipping_outlined,
                      color: StitchTokens.wine,
                      size: 18,
                    ),
                    SizedBox(width: 6),
                    Text(
                      'Nơi gửi sách (Người giao hàng đến lấy) *',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: StitchTokens.wine,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (_savedAddresses.isNotEmpty) ...[
                  DropdownButtonFormField<String>(
                    initialValue: _selectedOriginAddressId,
                    isExpanded: true,
                    decoration: InputDecoration(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      filled: true,
                      fillColor: Colors.white,
                    ),
                    items: [
                      for (final a in _savedAddresses)
                        DropdownMenuItem(
                          value: a['id']?.toString(),
                          child: Text(
                            '${a["recipientName"]} · ${a["detail"]}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12.5),
                          ),
                        ),
                    ],
                    onChanged: (v) =>
                        setState(() => _selectedOriginAddressId = v),
                  ),
                  const SizedBox(height: 6),
                ],
                InkWell(
                  onTap: () => setState(
                    () => _showAddAddressDialog = !_showAddAddressDialog,
                  ),
                  child: Text(
                    _showAddAddressDialog
                        ? '▲ Ẩn nhập địa chỉ mới'
                        : '+ Nhập địa chỉ gửi sách mới',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: StitchTokens.wine,
                    ),
                  ),
                ),
                if (_showAddAddressDialog) ...[
                  const SizedBox(height: 10),
                  AppTextField(
                    label: 'Họ tên người gửi',
                    controller: _recipientNameCtrl,
                    placeholder: 'Nguyễn Văn A',
                  ),
                  const SizedBox(height: 8),
                  AppTextField(
                    label: 'Số điện thoại 10 chữ số',
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    placeholder: '0901234567',
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _selectedLocalityCode,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: 'Khu vực luân chuyển sách',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                    ),
                    items: _serviceLocalities.map((loc) {
                      return DropdownMenuItem(
                        value: loc['code']?.toString(),
                        child: Text(
                          loc['label']?.toString() ?? '',
                          style: const TextStyle(fontSize: 12.5),
                        ),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _selectedLocalityCode = v),
                  ),
                  const SizedBox(height: 8),
                  AppTextField(
                    label: 'Địa chỉ chi tiết (số nhà, đường, phường)',
                    controller: _detailAddressCtrl,
                    placeholder: 'Số 123 đường Lê Lợi, Phường Bến Nghé',
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),
        ],

        // Giá bán đề xuất
        if (_mode == 'Sale' || _mode == 'Both' || _isBundle) ...[
          AppTextField(
            label: _isBundle
                ? 'GIÁ CHO CẢ BỘ SÁCH (VNĐ) *'
                : 'GIÁ BÁN ĐỀ XUẤT (VNĐ) *',
            requiredField: true,
            controller: _salePriceCtrl,
            keyboardType: TextInputType.number,
            placeholder: '10.000 – 1.000.000 VNĐ',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            children: [35000, 50000, 75000, 120000].map((pr) {
              return InkWell(
                onTap: () =>
                    setState(() => _salePriceCtrl.text = pr.toString()),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: StitchTokens.parchment,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    formatVnd(pr),
                    style: const TextStyle(
                      fontSize: 11,
                      color: StitchTokens.wine,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: AppSpace.sm),
          Container(
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(
              color: AppColors.successSurface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const AppText(
              'Trợ lý định giá AI: Mức giá hợp lý cho ấn bản này trên thị trường là từ 45.000 ₫ – 85.000 ₫.',
              kind: AppTextKind.small,
              color: AppColors.forest,
            ),
          ),
          const SizedBox(height: AppSpace.md),
        ],

        // Giá trị quy đổi & Smart Matchmaking
        if (!_isBundle && (_mode == 'Exchange' || _mode == 'Both')) ...[
          AppTextField(
            label: 'GIÁ TRỊ QUY ĐỔI / ĐỐI CHIẾU (VNĐ) *',
            requiredField: true,
            controller: _exchangeValueCtrl,
            keyboardType: TextInputType.number,
            placeholder: '10.000 – 1.000.000 VNĐ',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpace.md),
          Container(
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFCBD5E1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '🎯 Tiêu chí đổi sách mong muốn (Tùy chọn)',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: StitchTokens.wine,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Nhập thể loại, tác giả hoặc mô tả để hệ thống Lật Lại hỗ trợ ghép đôi trao đổi thông minh (Smart Matchmaking).',
                  style: TextStyle(fontSize: 11.5, color: AppColors.muted),
                ),
                const SizedBox(height: 10),
                AppTextField(
                  label: 'Thể loại mong muốn',
                  controller: _targetCategoryCtrl,
                  placeholder: 'VD: Văn học, Kinh tế, Trinh thám…',
                ),
                const SizedBox(height: 8),
                AppTextField(
                  label: 'Tác giả mong muốn',
                  controller: _targetAuthorCtrl,
                  placeholder: 'VD: Haruki Murakami, Dan Brown…',
                ),
                const SizedBox(height: 8),
                AppTextField(
                  label: 'Ghi chú chi tiết mong muốn',
                  controller: _targetDescriptionCtrl,
                  placeholder: 'VD: Ưu tiên ấn bản còn mới hoặc bìa cứng…',
                ),
              ],
            ),
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
        const SizedBox(height: 4),
        const Text(
          'Xem lại một lượt toàn bộ thông tin. Bạn có thể bấm Chỉnh sửa ở từng mục.',
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: AppSpace.md),

        // Section 1: Thông tin đầu sách
        _buildReviewSection(
          title: 'Thông tin đầu sách',
          stepIndex: 0,
          children: [
            _reviewRow('Tên sách', _titleCtrl.text.trim()),
            _reviewRow('Tác giả', _authorCtrl.text.trim()),
            if (_isBundle)
              _reviewRow('Quy cách', 'Bộ ${_bundleItems.length} cuốn'),
            if (!_isBundle) ...[
              _reviewRow(
                'Danh mục',
                CatalogTaxonomy.getLabel(_categoryId ?? ''),
              ),
              _reviewRow(
                'Ngôn ngữ',
                CatalogTaxonomy.getLanguageLabel(_language),
              ),
              if (_seriesCtrl.text.trim().isNotEmpty)
                _reviewRow('Bộ truyện', _seriesCtrl.text.trim()),
            ],
          ],
        ),
        const SizedBox(height: AppSpace.md),

        // Section 2: Ảnh bản sách
        _buildReviewSection(
          title:
              'Ảnh bản sách · ${_hasCoverPhoto ? 1 + _supportPhotoPaths.length : 0}/8 ảnh',
          stepIndex: 1,
          children: [
            _reviewRow(
              'Ảnh bìa',
              _hasCoverPhoto ? 'Đã đính kèm (3:4)' : 'Chưa có ảnh bìa',
            ),
            _reviewRow('Ảnh phụ', '${_supportPhotoPaths.length} ảnh đính kèm'),
          ],
        ),
        const SizedBox(height: AppSpace.md),

        // Section 3: Tình trạng
        _buildReviewSection(
          title: 'Tình trạng bản sách',
          stepIndex: 2,
          children: [
            _reviewRow('Đánh giá', formatConditionLabel(_condition)),
            _reviewRow('Ruột sách', _pagesNoteCtrl.text.trim()),
            _reviewRow('Bìa và gáy', _coverNoteCtrl.text.trim()),
            _reviewRow('Ghi chú', _notesCtrl.text.trim()),
            _reviewRow('Phụ kiện', _accessoriesCtrl.text.trim()),
            _reviewRow('Nội dung đọc rõ', _readable == true ? 'Có' : 'Không'),
            _reviewRow(
              'Thiếu trang',
              _hasMissingPages == true ? 'Có' : 'Không',
            ),
            _reviewRow(
              'Thiếu nội dung chính',
              _missingEssentialContent == true ? 'Có' : 'Không',
            ),
          ],
        ),
        const SizedBox(height: AppSpace.md),

        // Section 4: Giá và giao dịch
        _buildReviewSection(
          title: _isBundle ? 'Giá cả bộ' : 'Phương thức giao dịch & Giá',
          stepIndex: 3,
          children: [
            _reviewRow(
              'Hình thức',
              _isBundle ? 'Bán trọn bộ' : formatModeLabel(_mode),
            ),
            if (_mode == 'Sale' || _mode == 'Both' || _isBundle)
              _reviewRow(
                'Giá bán',
                formatVnd(int.tryParse(_salePriceCtrl.text.trim())),
              ),
            if (!_isBundle && (_mode == 'Exchange' || _mode == 'Both'))
              _reviewRow(
                'Giá trị đổi',
                formatVnd(int.tryParse(_exchangeValueCtrl.text.trim())),
              ),
          ],
        ),
        const SizedBox(height: AppSpace.lg),

        // Policy note
        Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            color: const Color(0xFFFBF4E8),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: StitchTokens.peachBorder),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.shield_outlined, size: 18, color: StitchTokens.wine),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Chính sách kiểm duyệt Lật Lại: Bài đăng sẽ được đối soát thông tin và ảnh thực tế trước khi hiển thị công khai trên sàn.',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: StitchTokens.darkWood,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.md),

        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _ownershipDeclared,
          activeColor: StitchTokens.wine,
          title: const AppText(
            'Tôi có quyền sở hữu hợp pháp và cam kết thông tin trung thực với tình trạng thực tế của cuốn sách.',
            kind: AppTextKind.small,
          ),
          onChanged: (v) => setState(() => _ownershipDeclared = v ?? false),
        ),
      ],
    );
  }

  Widget _buildReviewSection({
    required String title,
    required int stepIndex,
    required List<Widget> children,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: StitchTokens.parchment,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: StitchTokens.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w800,
                  color: StitchTokens.wine,
                ),
              ),
              InkWell(
                onTap: () => _selectStep(stepIndex),
                child: const Row(
                  children: [
                    Text(
                      'Chỉnh sửa',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: StitchTokens.wine,
                      ),
                    ),
                    SizedBox(width: 2),
                    Icon(
                      Icons.arrow_forward_ios_rounded,
                      size: 11,
                      color: StitchTokens.wine,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? 'Chưa nhập' : value,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: StitchTokens.darkWood,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
