import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/session_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

/// LoginScreen matching `apps/mobile-react-native/src/features/auth/login-screen.tsx`
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.returnBookId});

  final String? returnBookId;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _rememberSession = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Vui lòng nhập đầy đủ Email và mật khẩu.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.login(email: email, password: password);
      if (!mounted) return;
      setState(() => _busy = false);
      if (widget.returnBookId != null && widget.returnBookId!.isNotEmpty) {
        context.go('/book?id=${widget.returnBookId}');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  void _quickFill(String email, String password) {
    setState(() {
      _emailCtrl.text = email;
      _passwordCtrl.text = password;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AppScreen(
      currentNavPath: '/account',
      backgroundColor: StitchTokens.wineDark,
      backgroundDecoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [StitchTokens.wine, StitchTokens.wineDark, Color(0xFF220000)],
        ),
      ),
      header: const TopNavbar(borderRadius: BorderRadius.zero),
      child: Container(
        padding: const EdgeInsets.all(AppSpace.xl),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF480202), Color(0xFF2A0000)],
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: StitchTokens.goldDark.withValues(alpha: 0.55),
            width: 1.2,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x4D000000),
              blurRadius: 20,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppText(
              'Lại gặp nhau rồi.',
              kind: AppTextKind.title,
              color: Colors.white,
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            const AppText(
              'Đăng nhập để đăng sách và kết nối người yêu sách Sài Gòn.',
              color: StitchTokens.goldLight,
              style: TextStyle(fontSize: 12.5),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_error != null) ...[
              Notice(message: _error!, tone: NoticeTone.error),
              const SizedBox(height: AppSpace.md),
            ],
            AppTextField(
              label: 'Tên đăng nhập hoặc Email',
              labelColor: StitchTokens.gold,
              focusedBorderColor: StitchTokens.gold,
              placeholder: 'nguyentuan@latlai.vn',
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: AppSpace.md),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const AppText(
                      'Mật khẩu',
                      kind: AppTextKind.bold,
                      color: StitchTokens.gold,
                    ),
                    TextButton(
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                      child: AppText(
                        _obscurePassword ? 'Hiện' : 'Ẩn',
                        kind: AppTextKind.small,
                        color: StitchTokens.gold,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                AppTextField(
                  placeholder: 'Nhập mật khẩu của bạn',
                  controller: _passwordCtrl,
                  obscureText: _obscurePassword,
                  focusedBorderColor: StitchTokens.gold,
                ),
              ],
            ),
            const SizedBox(height: AppSpace.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Checkbox(
                      value: _rememberSession,
                      activeColor: StitchTokens.goldDark,
                      checkColor: Colors.white,
                      side: BorderSide(
                        color: StitchTokens.gold.withValues(alpha: 0.6),
                      ),
                      onChanged: (v) =>
                          setState(() => _rememberSession = v ?? true),
                    ),
                    const AppText(
                      'Ghi nhớ phiên',
                      kind: AppTextKind.small,
                      color: StitchTokens.goldLight,
                    ),
                  ],
                ),
                TextButton(
                  onPressed: () => context.push('/forgot-password'),
                  child: const AppText(
                    'Quên mật khẩu?',
                    kind: AppTextKind.small,
                    color: StitchTokens.gold,
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            AppButton(
              title: 'Đăng nhập',
              gold: true,
              busy: _busy,
              onPressed: _submit,
            ),
            const SizedBox(height: AppSpace.md),
            Center(
              child: TextButton(
                onPressed: () => context.push('/register'),
                child: const AppText(
                  'Chưa có tài khoản độc giả? Đăng ký ngay',
                  kind: AppTextKind.bold,
                  color: StitchTokens.gold,
                ),
              ),
            ),
            if (kDebugMode) ...[
              Divider(
                height: AppSpace.xxl,
                color: StitchTokens.goldDark.withValues(alpha: 0.35),
              ),
              const AppText(
                'Đăng nhập nhanh (Dev):',
                kind: AppTextKind.label,
                color: StitchTokens.goldLight,
              ),
              const SizedBox(height: AppSpace.sm),
              Wrap(
                spacing: AppSpace.sm,
                runSpacing: AppSpace.sm,
                children: [
                  AppChip(
                    title: 'Nguyễn Đại',
                    selected: false,
                    gold: true,
                    onPressed: () =>
                        _quickFill('dai.member@latlai.local', 'MemberPass123!'),
                  ),
                  AppChip(
                    title: 'Nguyễn Tú',
                    selected: false,
                    gold: true,
                    onPressed: () =>
                        _quickFill('tu.member@latlai.local', 'MemberPass123!'),
                  ),
                  AppChip(
                    title: 'Member Seed',
                    selected: false,
                    gold: true,
                    onPressed: () =>
                        _quickFill('member@latlai.local', 'MemberPass123!'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// RegisterScreen (`/register`) matching `apps/mobile-react-native/src/features/auth/register-screen.tsx`
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _passwordCtrl = TextEditingController();
  final TextEditingController _confirmCtrl = TextEditingController();
  final TextEditingController _otpCtrl = TextEditingController();

  bool _acceptedRules = false;
  bool _busy = false;
  String? _error;
  String? _challengeId;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  String _passwordStrengthLabel(String pass) {
    if (pass.isEmpty) return '';
    if (pass.length < 10) return 'Quá ngắn (tối thiểu 10 ký tự)';
    if (pass.length < 12) return 'Độ an toàn: Trung bình';
    return 'Độ an toàn: Tốt';
  }

  Future<void> _submitRegister() async {
    final name = _nameCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    final confirm = _confirmCtrl.text;

    if (name.isEmpty || email.isEmpty || password.length < 10) {
      setState(() {
        _error = 'Vui lòng nhập họ tên, email và mật khẩu từ 10 đến 128 ký tự.';
      });
      return;
    }
    if (password != confirm) {
      setState(() => _error = 'Mật khẩu nhập lại không khớp.');
      return;
    }
    if (!_acceptedRules) {
      setState(() {
        _error = 'Bạn cần đồng ý Quy chế hoạt động & Tiêu chuẩn Lật Lại.';
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.publicRequest(
        '/auth/otp/register',
        method: 'POST',
        body: {
          'email': email,
          'password': password,
          'displayName': name,
          'acceptedRules': true,
        },
      );
      if (!mounted) return;
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      setState(() {
        _busy = false;
        _challengeId = (map['challengeId'] ?? 'challenge').toString();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _submitVerifyOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Vui lòng nhập mã xác thực OTP gồm 6 chữ số.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.publicRequest(
        '/auth/otp/verify-email',
        method: 'POST',
        body: {'challengeId': _challengeId, 'code': code},
      );
      await client.login(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      if (!mounted) return;
      setState(() => _busy = false);
      context.go('/account');
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
    final isOtpStep = _challengeId != null;
    final strengthLabel = _passwordStrengthLabel(_passwordCtrl.text);

    return AppScreen(
      currentNavPath: '/account',
      backgroundColor: StitchTokens.wineDark,
      backgroundDecoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [StitchTokens.wine, StitchTokens.wineDark, Color(0xFF220000)],
        ),
      ),
      header: const TopNavbar(borderRadius: BorderRadius.zero),
      child: Container(
        padding: const EdgeInsets.all(AppSpace.xl),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF480202), Color(0xFF2A0000)],
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: StitchTokens.goldDark.withValues(alpha: 0.55),
            width: 1.2,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x4D000000),
              blurRadius: 20,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppText(
              isOtpStep ? 'Xác minh email' : 'Tạo tài khoản mới',
              kind: AppTextKind.title,
              color: Colors.white,
              style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            AppText(
              isOtpStep
                  ? 'Nhập mã 6 số gửi tới: ${_emailCtrl.text.trim()}'
                  : 'Mở ra trang sách đầu tiên của bạn tại Lật Lại.',
              color: StitchTokens.goldLight,
              style: const TextStyle(fontSize: 12.5),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_error != null) ...[
              Notice(message: _error!, tone: NoticeTone.error),
              const SizedBox(height: AppSpace.md),
            ],
            if (!isOtpStep) ...[
              AppTextField(
                label: 'Họ và tên / Bút danh',
                labelColor: StitchTokens.gold,
                focusedBorderColor: StitchTokens.gold,
                requiredField: true,
                controller: _nameCtrl,
                placeholder: 'Ví dụ: Nguyễn Minh Tuấn',
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Địa chỉ Email',
                labelColor: StitchTokens.gold,
                focusedBorderColor: StitchTokens.gold,
                requiredField: true,
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                placeholder: 'nguyentuan@latlai.vn',
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Mật khẩu (10 - 128 ký tự)',
                labelColor: StitchTokens.gold,
                focusedBorderColor: StitchTokens.gold,
                requiredField: true,
                controller: _passwordCtrl,
                obscureText: true,
                hint: strengthLabel.isNotEmpty
                    ? strengthLabel
                    : 'Tối thiểu 10 ký tự.',
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Nhập lại mật khẩu',
                labelColor: StitchTokens.gold,
                focusedBorderColor: StitchTokens.gold,
                requiredField: true,
                controller: _confirmCtrl,
                obscureText: true,
              ),
              const SizedBox(height: AppSpace.md),
              Row(
                children: [
                  Checkbox(
                    value: _acceptedRules,
                    activeColor: StitchTokens.goldDark,
                    checkColor: Colors.white,
                    side: BorderSide(
                      color: StitchTokens.gold.withValues(alpha: 0.6),
                    ),
                    onChanged: (v) =>
                        setState(() => _acceptedRules = v ?? false),
                  ),
                  const Expanded(
                    child: AppText(
                      'Đồng ý Quy chế hoạt động & Tiêu chuẩn Lật Lại',
                      kind: AppTextKind.small,
                      color: StitchTokens.goldLight,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.md),
              AppButton(
                title: 'Tạo tài khoản',
                gold: true,
                busy: _busy,
                onPressed: _submitRegister,
              ),
              const SizedBox(height: AppSpace.sm),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/account'),
                  child: const AppText(
                    'Đã có tài khoản? Đăng nhập',
                    kind: AppTextKind.bold,
                    color: StitchTokens.gold,
                  ),
                ),
              ),
            ] else ...[
              AppTextField(
                label: 'Mã xác thực OTP (6 số)',
                labelColor: StitchTokens.gold,
                focusedBorderColor: StitchTokens.gold,
                requiredField: true,
                controller: _otpCtrl,
                keyboardType: TextInputType.number,
                placeholder: '123456',
              ),
              const SizedBox(height: AppSpace.lg),
              AppButton(
                title: 'Xác minh email & Hoàn tất',
                gold: true,
                busy: _busy,
                onPressed: _submitVerifyOtp,
              ),
              const SizedBox(height: AppSpace.sm),
              AppButton(
                title: 'Sửa email đăng ký',
                secondary: true,
                gold: true,
                onPressed: () => setState(() => _challengeId = null),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// ForgotPasswordScreen (`/forgot-password`) matching `apps/mobile-react-native/src/features/auth/forgot-password-screen.tsx`
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _codeCtrl = TextEditingController();
  final TextEditingController _passwordCtrl = TextEditingController();
  final TextEditingController _confirmCtrl = TextEditingController();

  bool _busy = false;
  String? _error;
  String? _challengeId;
  bool _done = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _codeCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Vui lòng nhập Email khôi phục.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      final res = await client.publicRequest(
        '/auth/otp/request',
        method: 'POST',
        body: {'email': email, 'purpose': 'ResetPassword'},
      );
      if (!mounted) return;
      final map = res is Map ? Map<String, dynamic>.from(res) : const {};
      setState(() {
        _busy = false;
        _challengeId = (map['challengeId'] ?? 'reset').toString();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = presentErrorMessage(e);
      });
    }
  }

  Future<void> _resetPassword() async {
    if (_codeCtrl.text.trim().length != 6) {
      setState(() => _error = 'Mã xác nhận phải gồm 6 chữ số.');
      return;
    }
    if (_passwordCtrl.text.length < 10) {
      setState(() => _error = 'Mật khẩu mới cần từ 10 đến 128 ký tự.');
      return;
    }
    if (_passwordCtrl.text != _confirmCtrl.text) {
      setState(() => _error = 'Mật khẩu nhập lại không khớp.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = ref.read(sessionClientProvider);
    try {
      await client.publicRequest(
        '/auth/otp/reset-password',
        method: 'POST',
        body: {
          'challengeId': _challengeId,
          'code': _codeCtrl.text.trim(),
          'password': _passwordCtrl.text,
        },
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _done = true;
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
    return AppScreen(
      currentNavPath: '/account',
      backgroundColor: StitchTokens.wineDark,
      backgroundDecoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [StitchTokens.wine, StitchTokens.wineDark, Color(0xFF220000)],
        ),
      ),
      header: const TopNavbar(borderRadius: BorderRadius.zero),
      child: Container(
        padding: const EdgeInsets.all(AppSpace.xl),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF480202), Color(0xFF2A0000)],
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: StitchTokens.goldDark.withValues(alpha: 0.55),
            width: 1.2,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x4D000000),
              blurRadius: 20,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            BackAction(
              title: 'Về đăng nhập',
              color: StitchTokens.goldLight,
              onPressed: () =>
                  context.canPop() ? context.pop() : context.go('/account'),
            ),
            const SizedBox(height: AppSpace.sm),
            AppText(
              _done ? 'Mật khẩu đã được đổi' : 'Quên mật khẩu',
              kind: AppTextKind.title,
              color: Colors.white,
              style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpace.md),
            if (_error != null) ...[
              Notice(message: _error!, tone: NoticeTone.error),
              const SizedBox(height: AppSpace.md),
            ],
            if (_done) ...[
              const Notice(
                message: 'Mật khẩu mới đã được cập nhật thành công. Bạn có thể đăng nhập ngay.',
                tone: NoticeTone.success,
              ),
              const SizedBox(height: AppSpace.lg),
              AppButton(
                title: 'Đăng nhập bằng mật khẩu mới',
                gold: true,
                onPressed: () => context.go('/account'),
              ),
            ] else ...[
              AppTextField(
                label: 'Email khôi phục',
                labelColor: StitchTokens.gold,
                focusedBorderColor: StitchTokens.gold,
                requiredField: true,
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                placeholder: 'nguyentuan@latlai.vn',
              ),
              const SizedBox(height: AppSpace.md),
              if (_challengeId != null) ...[
                AppTextField(
                  label: 'Mã xác nhận (6 số)',
                  labelColor: StitchTokens.gold,
                  focusedBorderColor: StitchTokens.gold,
                  requiredField: true,
                  controller: _codeCtrl,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: AppSpace.md),
                AppTextField(
                  label: 'Mật khẩu mới',
                  labelColor: StitchTokens.gold,
                  focusedBorderColor: StitchTokens.gold,
                  hint: 'Từ 10 đến 128 ký tự.',
                  requiredField: true,
                  controller: _passwordCtrl,
                  obscureText: true,
                ),
                const SizedBox(height: AppSpace.md),
                AppTextField(
                  label: 'Nhập lại mật khẩu mới',
                  labelColor: StitchTokens.gold,
                  focusedBorderColor: StitchTokens.gold,
                  requiredField: true,
                  controller: _confirmCtrl,
                  obscureText: true,
                ),
                const SizedBox(height: AppSpace.lg),
                AppButton(
                  title: 'Đặt mật khẩu mới',
                  gold: true,
                  busy: _busy,
                  onPressed: _resetPassword,
                ),
                const SizedBox(height: AppSpace.sm),
              ],
              AppButton(
                title: _challengeId == null ? 'Gửi mã khôi phục' : 'Gửi mã mới',
                secondary: _challengeId != null,
                gold: true,
                busy: _busy,
                onPressed: _requestCode,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
