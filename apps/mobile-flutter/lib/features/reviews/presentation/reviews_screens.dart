import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// ReviewsScreen (`/reviews`) matching `apps/mobile-react-native/src/features/reviews/reviews-screen.tsx`
class ReviewsScreen extends ConsumerStatefulWidget {
  const ReviewsScreen({super.key, this.initialType, this.initialTransactionId});

  final String? initialType;
  final String? initialTransactionId;

  @override
  ConsumerState<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends ConsumerState<ReviewsScreen> {
  String _selectedType = 'DirectOrder';
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String? _notice;
  List<Map<String, dynamic>> _transactions = const [];
  Map<String, dynamic>? _activeTx;
  int _partnerRating = 5;
  int _bookRating = 5;
  final TextEditingController _commentCtrl = TextEditingController();

  static const _types = [
    (id: 'DirectOrder', label: 'Đơn trực tiếp'),
    (id: 'Exchange', label: 'Trao đổi sách'),
    (id: 'PointOrder', label: 'Đấu giá ViaPoint'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.initialType != null && widget.initialType!.isNotEmpty) {
      _selectedType = widget.initialType!;
    }
    Future.microtask(_loadReviewTransactions);
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadReviewTransactions() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.request(
        '/me/review-transactions?type=$_selectedType&limit=10',
      );
      final list = (res is Map && res['items'] is List)
          ? (res['items'] as List)
          : const [];
      if (!mounted) return;
      setState(() {
        _transactions = list
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

  Future<void> _submitReview(String txType, String txId) async {
    setState(() {
      _submitting = true;
      _error = null;
      _notice = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.request(
        '/transactions/$txType/$txId/reviews',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('review'),
        body: {
          'partnerRating': _partnerRating,
          'bookRating': _bookRating,
          'comment': _commentCtrl.text.trim(),
        },
      );
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _activeTx = null;
        _notice = 'Đã lưu đánh giá giao dịch thành công!';
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
    final session = ref.watch(sessionProvider);
    final myId = session.user?.id ?? '';

    return AppScreen(
      header: const TopNavbar(subtitle: 'ĐÁNH GIÁ & UY TÍN'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: _activeTx != null ? 'Về danh sách đánh giá' : 'Về tài khoản',
            onPressed: () {
              if (_activeTx != null) {
                setState(() => _activeTx = null);
              } else if (context.canPop()) {
                context.pop();
              } else {
                context.go('/account');
              }
            },
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Đánh giá của tôi',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.sm),
          if (myId.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(
                title: 'Xem hồ sơ uy tín của tôi',
                secondary: true,
                wine: true,
                compact: true,
                onPressed: () => context.push('/reputation?sellerId=$myId'),
              ),
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
          if (_activeTx != null)
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
                    'Đánh giá giao dịch với ${_activeTx!['partnerName'] ?? 'đối tác'}',
                    kind: AppTextKind.heading,
                    color: StitchTokens.wine,
                  ),
                  const SizedBox(height: 12),
                  const AppText('Điểm đối tác:', kind: AppTextKind.bold),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: [1, 2, 3, 4, 5].map((score) {
                      return AppChip(
                        title: '$score/5',
                        wine: true,
                        selected: _partnerRating == score,
                        onPressed: () => setState(() => _partnerRating = score),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                  const AppText('Điểm sách nhận:', kind: AppTextKind.bold),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: [1, 2, 3, 4, 5].map((score) {
                      return AppChip(
                        title: '$score/5',
                        wine: true,
                        selected: _bookRating == score,
                        onPressed: () => setState(() => _bookRating = score),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    label: 'Nhận xét (không bắt buộc)',
                    multiline: true,
                    controller: _commentCtrl,
                  ),
                  const SizedBox(height: 16),
                  AppButton(
                    title: 'Lưu đánh giá',
                    wine: true,
                    busy: _submitting,
                    onPressed: () => _submitReview(
                      (_activeTx!['transactionType'] ?? _selectedType)
                          .toString(),
                      (_activeTx!['transactionId'] ?? '').toString(),
                    ),
                  ),
                ],
              ),
            )
          else ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _types.map((t) {
                  return Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: AppChip(
                      title: t.label,
                      wine: true,
                      selected: _selectedType == t.id,
                      onPressed: () {
                        setState(() => _selectedType = t.id);
                        _loadReviewTransactions();
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_loading)
              const StatePanel(
                wine: true,
                loading: true,
                title: 'Đang tải giao dịch đủ điều kiện đánh giá…',
              )
            else if (_transactions.isEmpty)
              const StatePanel(
                wine: true,
                icon: Icons.rate_review_outlined,
                title: 'Chưa có giao dịch hoàn tất để đánh giá',
                message: 'Chỉ các giao dịch đã hoàn tất thực tế trên hệ thống mới mở quyền viết đánh giá.',
              )
            else
              ..._transactions.map((tx) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpace.md),
                  child: ListTile(
                    tileColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: const BorderSide(color: StitchTokens.cardBorder),
                    ),
                    title: AppText(
                      'Đánh giá giao dịch với ${tx['partnerName'] ?? 'đối tác'}',
                      kind: AppTextKind.bold,
                    ),
                    subtitle: AppText(
                      'Mã ${tx['transactionId'] ?? ''}',
                      kind: AppTextKind.small,
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => setState(() => _activeTx = tx),
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}

/// ReputationScreen (`/reputation`) matching `apps/mobile-react-native/src/features/reviews/reputation-screen.tsx`
class ReputationScreen extends ConsumerStatefulWidget {
  const ReputationScreen({super.key, required this.memberId});

  final String memberId;

  @override
  ConsumerState<ReputationScreen> createState() => _ReputationScreenState();
}

class _ReputationScreenState extends ConsumerState<ReputationScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _reputation;

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadReputation);
  }

  Future<void> _loadReputation() async {
    if (widget.memberId.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Chưa chọn thành viên để xem hồ sơ uy tín.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.publicRequest(
        '/members/${widget.memberId}/reputation?limit=10',
      );
      if (!mounted) return;
      setState(() {
        _reputation = res is Map ? Map<String, dynamic>.from(res) : null;
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
    final rep = _reputation;
    final items = (rep?['items'] is List) ? (rep!['items'] as List) : const [];

    return AppScreen(
      header: const TopNavbar(subtitle: 'HỒ SƠ UY TÍN'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: 'Quay lại',
            onPressed: () => context.canPop() ? context.pop() : context.go('/'),
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Hồ sơ uy tín',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
          ),
          const SizedBox(height: AppSpace.md),
          if (_error != null) Notice(message: _error!, tone: NoticeTone.error),
          if (_loading)
            const StatePanel(
              wine: true,
              loading: true,
              title: 'Đang tải hồ sơ uy tín…',
            )
          else if (rep != null) ...[
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
                    (rep['displayName'] ?? 'Thành viên Lật Lại').toString(),
                    kind: AppTextKind.bookTitle,
                    color: StitchTokens.wine,
                  ),
                  const Divider(height: 24),
                  AppText(
                    'Giao dịch hoàn tất: ${rep['completedTransactions'] ?? 0}',
                    kind: AppTextKind.bold,
                  ),
                  const SizedBox(height: 4),
                  AppText(
                    'Điểm đối tác: ${rep['partnerRating'] ?? 'Chưa có'} (${rep['partnerRatingCount'] ?? 0} lượt)',
                  ),
                  const SizedBox(height: 4),
                  AppText(
                    'Chất lượng sách đã cung cấp: ${rep['bookRating'] ?? 'Chưa có'} (${rep['bookRatingCount'] ?? 0} lượt)',
                  ),
                  const SizedBox(height: 4),
                  AppText(
                    'Vi phạm đã xác minh: ${rep['verifiedViolations'] ?? 0}',
                    color: AppColors.muted,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.lg),
            const AppText(
              'Đánh giá công khai đã duyệt',
              kind: AppTextKind.heading,
            ),
            const SizedBox(height: AppSpace.sm),
            if (items.isEmpty)
              const AppText(
                'Chưa có đánh giá công khai nào.',
                kind: AppTextKind.small,
              )
            else
              ...items.whereType<Map>().map((r) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: StitchTokens.cardBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppText(
                        'Điểm đối tác: ${r['partnerRating'] ?? 5}/5',
                        kind: AppTextKind.bold,
                        color: StitchTokens.wine,
                      ),
                      if (r['comment'] != null) ...[
                        const SizedBox(height: 4),
                        AppText(r['comment'].toString()),
                      ],
                    ],
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}

/// SupportCenterScreen (`/support`) matching the new web feature `apps/user-web/src/features/support/SupportPages.tsx`
/// Includes case list, filters, NewSupportCase form with readable transaction selector (`GET /me/support-targets`), and case detail replies.
class SupportCenterScreen extends ConsumerStatefulWidget {
  const SupportCenterScreen({super.key});

  @override
  ConsumerState<SupportCenterScreen> createState() =>
      _SupportCenterScreenState();
}

class _SupportCenterScreenState extends ConsumerState<SupportCenterScreen> {
  bool _composing = false;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  String? _notice;
  String _selectedKind = 'TransactionIssue';
  String _selectedTargetType = 'DirectOrder';
  String? _selectedTargetId;
  final TextEditingController _titleCtrl = TextEditingController();
  final TextEditingController _descCtrl = TextEditingController();
  List<Map<String, dynamic>> _cases = const [];
  List<Map<String, dynamic>> _targetOptions = const [];

  static const _kinds = [
    (id: 'TransactionIssue', label: 'Vấn đề giao dịch'),
    (id: 'Feedback', label: 'Góp ý sản phẩm'),
    (id: 'Bug', label: 'Báo lỗi kỹ thuật'),
    (id: 'Violation', label: 'Báo cáo vi phạm'),
  ];

  @override
  void initState() {
    super.initState();
    Future.microtask(_loadCasesAndTargets);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadCasesAndTargets() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final results = await Future.wait<dynamic>([
        client
            .request('/me/support-cases?limit=20')
            .catchError((_) => const {}),
        client
            .request('/me/support-targets?type=$_selectedTargetType&limit=10')
            .catchError((_) => const {}),
      ]);
      final caseList =
          (results[0] is Map && (results[0] as Map)['items'] is List)
          ? ((results[0] as Map)['items'] as List)
          : const [];
      final targetList =
          (results[1] is Map && (results[1] as Map)['items'] is List)
          ? ((results[1] as Map)['items'] as List)
          : const [];
      if (!mounted) return;
      setState(() {
        _cases = caseList
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _targetOptions = targetList
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

  Future<void> _submitCase() async {
    if (_titleCtrl.text.trim().length < 3 ||
        _descCtrl.text.trim().length < 10) {
      setState(() {
        _error = 'Vui lòng nhập tiêu đề (tối thiểu 3 ký tự) và nội dung chi tiết (tối thiểu 10 ký tự).';
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
        '/me/support-cases',
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('support'),
        body: {
          'kind': _selectedKind,
          'title': _titleCtrl.text.trim(),
          'description': _descCtrl.text.trim(),
          'target': _selectedTargetId != null
              ? {'type': _selectedTargetType, 'id': _selectedTargetId}
              : null,
        },
      );
      _titleCtrl.clear();
      _descCtrl.clear();
      await _loadCasesAndTargets();
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _composing = false;
        _notice = 'Đã gửi yêu cầu hỗ trợ tới đội ngũ Lật Lại.';
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
      header: const TopNavbar(subtitle: 'HỖ TRỢ & PHẢN ÁNH'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BackAction(
            title: _composing ? '← Yêu cầu của tôi' : 'Về tài khoản',
            onPressed: () {
              if (_composing) {
                setState(() => _composing = false);
              } else if (context.canPop()) {
                context.pop();
              } else {
                context.go('/account');
              }
            },
          ),
          const SizedBox(height: AppSpace.xs),
          const AppText(
            'Lật lại · Đồng hành cùng bạn',
            kind: AppTextKind.label,
            color: AppColors.muted,
          ),
          AppText(
            _composing ? 'Gửi yêu cầu mới' : 'Hỗ trợ & phản ánh',
            kind: AppTextKind.title,
            color: StitchTokens.wine,
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
          if (_composing)
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
                  const AppText('Loại yêu cầu', kind: AppTextKind.bold),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _kinds.map((k) {
                      return AppChip(
                        title: k.label,
                        wine: true,
                        selected: _selectedKind == k.id,
                        onPressed: () => setState(() => _selectedKind = k.id),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    label: 'Tiêu đề',
                    requiredField: true,
                    controller: _titleCtrl,
                    placeholder: 'Tóm tắt ngắn gọn vấn đề cần hỗ trợ',
                  ),
                  const SizedBox(height: 14),
                  const AppText(
                    'Đối tượng giao dịch liên quan (Tùy chọn)',
                    kind: AppTextKind.bold,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children:
                        [
                          ('DirectOrder', 'Đơn trực tiếp'),
                          ('Exchange', 'Đổi sách'),
                          ('PointOrder', 'Đơn đấu giá'),
                        ].map((t) {
                          return AppChip(
                            title: t.$2,
                            selected: _selectedTargetType == t.$1,
                            onPressed: () {
                              setState(() {
                                _selectedTargetType = t.$1;
                                _selectedTargetId = null;
                              });
                              _loadCasesAndTargets();
                            },
                          );
                        }).toList(),
                  ),
                  if (_targetOptions.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ..._targetOptions.map((opt) {
                      final target = opt['target'] is Map
                          ? Map<String, dynamic>.from(opt['target'] as Map)
                          : const <String, dynamic>{};
                      final id = (target['id'] ?? '').toString();
                      final selected = _selectedTargetId == id;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          selected
                              ? Icons.radio_button_checked_rounded
                              : Icons.radio_button_off_rounded,
                          color: StitchTokens.wine,
                        ),
                        title: AppText(
                          (opt['label'] ?? 'Giao dịch #$id').toString(),
                          kind: AppTextKind.bold,
                        ),
                        subtitle: AppText(
                          (opt['description'] ?? '').toString(),
                          kind: AppTextKind.small,
                        ),
                        onTap: () => setState(() => _selectedTargetId = id),
                      );
                    }),
                  ],
                  const SizedBox(height: 14),
                  AppTextField(
                    label: 'Nội dung chi tiết',
                    requiredField: true,
                    multiline: true,
                    controller: _descCtrl,
                    placeholder: 'Mô tả rõ sự việc hoặc vấn đề bạn gặp phải…',
                  ),
                  const SizedBox(height: 16),
                  AppButton(
                    title: 'Gửi yêu cầu',
                    wine: true,
                    busy: _submitting,
                    onPressed: _submitCase,
                  ),
                ],
              ),
            )
          else ...[
            AppButton(
              title: 'Gửi yêu cầu mới',
              wine: true,
              onPressed: () => setState(() => _composing = true),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_loading)
              const StatePanel(
                wine: true,
                loading: true,
                title: 'Đang tải hồ sơ hỗ trợ…',
              )
            else if (_cases.isEmpty)
              const StatePanel(
                wine: true,
                icon: Icons.support_agent_rounded,
                title: 'Chưa có yêu cầu hỗ trợ nào',
                message: 'Gửi góp ý, báo lỗi kỹ thuật, phản ánh vấn đề giao dịch hoặc báo cáo vi phạm để đội ngũ Lật Lại hỗ trợ bạn.',
              )
            else
              ..._cases.map((c) {
                return Container(
                  margin: const EdgeInsets.only(bottom: AppSpace.md),
                  padding: const EdgeInsets.all(AppSpace.lg),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: StitchTokens.cardBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          AppText(
                            (c['title'] ?? 'Hồ sơ hỗ trợ').toString(),
                            kind: AppTextKind.bold,
                          ),
                          AppText(
                            (c['state'] ?? 'Open').toString(),
                            kind: AppTextKind.label,
                            color: StitchTokens.wine,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      AppText(
                        (c['description'] ?? '').toString(),
                        kind: AppTextKind.small,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                );
              }),
          ],
        ],
      ),
    );
  }
}
