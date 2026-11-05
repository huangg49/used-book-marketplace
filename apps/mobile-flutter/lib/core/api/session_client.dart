import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiError implements Exception {
  const ApiError({
    required this.status,
    required this.code,
    required this.message,
    this.requestId,
    this.details,
  });

  final int status;
  final String code;
  final String message;
  final String? requestId;
  final Object? details;

  @override
  String toString() => message;
}

String _friendlyFieldPathName(String path) {
  if (path.contains('mediaIds')) {
    return 'Ảnh bản sách (cần tối thiểu 1 ảnh bìa)';
  }
  if (path.contains('description')) {
    return 'Mô tả bản sách (tối thiểu 30 ký tự)';
  }
  if (path.contains('salePrice')) return 'Giá bán (10.000đ - 1.000.000đ)';
  if (path.contains('exchangeValue')) {
    return 'Giá trị trao đổi (10.000đ - 1.000.000đ)';
  }
  if (path.contains('originAddressId') || path.contains('fulfillment')) {
    return 'Địa chỉ lấy hàng';
  }
  if (path.contains('bookId')) return 'Đầu sách trong thư viện';
  if (path.contains('pages')) return 'Tình trạng trang sách';
  if (path.contains('coverNote')) return 'Tình trạng bìa sách';
  if (path.contains('notes')) return 'Ghi chú tình trạng';
  if (path.contains('accessories')) return 'Phụ kiện kèm theo';
  if (path.contains('readable')) return 'Khả năng đọc rõ';
  if (path.contains('ownershipDeclared')) return 'Cam kết quyền sở hữu';
  final cleaned = path.replaceAll(RegExp(r'^/+(content/)?'), '');
  return cleaned.isNotEmpty ? cleaned : path;
}

String presentErrorMessage(Object? error) {
  if (error is ApiError) {
    if (error.details is List && (error.details as List).isNotEmpty) {
      final detailsList = (error.details as List).whereType<Map>().toList();
      final errMsgs = detailsList
          .map((d) {
            final p = (d['path'] ?? '').toString();
            final m = (d['message'] ?? '').toString();
            final label = _friendlyFieldPathName(p);
            return label.isNotEmpty ? '$label: $m' : m;
          })
          .where((m) => m.isNotEmpty)
          .join('\n');
      if (errMsgs.isNotEmpty) return '${error.message}\n$errMsgs';
    }
    return error.message;
  }
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final msg = (data['message'] ?? 'Dữ liệu không hợp lệ.').toString();
      final errors = data['fieldErrors'] ?? data['errors'] ?? data['details'];
      if (errors is List && errors.isNotEmpty) {
        final details = errors
            .whereType<Map>()
            .map((e) {
              final p = e['path']?.toString() ?? '';
              final m = e['message']?.toString() ?? '';
              final label = _friendlyFieldPathName(p);
              return label.isNotEmpty ? '$label: $m' : m;
            })
            .where((s) => s.isNotEmpty)
            .join('\n');
        if (details.isNotEmpty) return '$msg\n$details';
      }
      return msg;
    }
    return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
  if (error is Exception) {
    return error.toString().replaceFirst('Exception: ', '');
  }
  return 'Yêu cầu chưa thực hiện được. Vui lòng thử lại.';
}

class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.roles,
    required this.status,
    this.phone,
    this.bio,
    this.avatarUrl,
    this.emailVerified = true,
    this.version = 1,
  });

  factory CurrentUser.fromJson(Map<String, dynamic> json) {
    final rawRoles = json['roles'];
    final roles = rawRoles is List
        ? rawRoles.map((e) => e.toString()).toList()
        : <String>['MEMBER'];
    return CurrentUser(
      id: (json['id'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      displayName: (json['displayName'] ?? json['email'] ?? 'Bạn đọc')
          .toString(),
      roles: roles,
      status: (json['status'] ?? 'ACTIVE').toString(),
      phone: json['phone']?.toString(),
      bio: json['bio']?.toString(),
      avatarUrl: json['avatarUrl']?.toString(),
      emailVerified: json['emailVerified'] == null
          ? true
          : json['emailVerified'] == true,
      version: (json['version'] is num) ? (json['version'] as num).toInt() : 1,
    );
  }

  final String id;
  final String email;
  final String displayName;
  final List<String> roles;
  final String status;
  final String? phone;
  final String? bio;
  final String? avatarUrl;
  final bool emailVerified;
  final int version;

  bool get isLocked => status == 'LOCKED';
}

enum SessionStatus { loading, anonymous, authenticated, unavailable }

class SessionState {
  const SessionState._({required this.status, this.user, this.message});

  const SessionState.loading() : this._(status: SessionStatus.loading);
  const SessionState.anonymous() : this._(status: SessionStatus.anonymous);
  const SessionState.authenticated(CurrentUser user)
    : this._(status: SessionStatus.authenticated, user: user);
  const SessionState.unavailable(String message)
    : this._(status: SessionStatus.unavailable, message: message);

  final SessionStatus status;
  final CurrentUser? user;
  final String? message;

  bool get isAuthenticated =>
      status == SessionStatus.authenticated && user != null;
}

abstract interface class TokenStorage {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

/// Follows ADR & AGENTS.md:
/// - Access token is ALWAYS memory-only.
/// - Native stores refresh token in SecureStorage; Web keeps tokens memory-only.
class PlatformTokenStorage implements TokenStorage {
  PlatformTokenStorage([FlutterSecureStorage? secureStorage])
    : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  static const _refreshKey = 'latlai.refresh_token.v1';
  final FlutterSecureStorage _secureStorage;
  String? _memoryFallback;

  @override
  Future<String?> read() async {
    if (kIsWeb) return _memoryFallback;
    try {
      return await _secureStorage.read(key: _refreshKey);
    } catch (_) {
      return _memoryFallback;
    }
  }

  @override
  Future<void> write(String token) async {
    _memoryFallback = token;
    if (kIsWeb) return;
    try {
      await _secureStorage.write(key: _refreshKey, value: token);
    } catch (_) {
      // Fallback to memory in test/unsupported desktop runners
    }
  }

  @override
  Future<void> clear() async {
    _memoryFallback = null;
    if (kIsWeb) return;
    try {
      await _secureStorage.delete(key: _refreshKey);
    } catch (_) {}
  }
}

String resolveDefaultApiBaseUrl() {
  const envUrl = String.fromEnvironment('API_BASE_URL');
  if (envUrl.isNotEmpty) {
    return envUrl.replaceAll(RegExp(r'/$'), '');
  }
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000/api/v1';
  }
  return 'http://localhost:3000/api/v1';
}

String generateIdempotencyKey([String? prefix]) {
  Random random;
  try {
    random = Random.secure();
  } catch (_) {
    random = Random();
  }
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  // RFC 4122 v4 UUID: version 4 (0100) and variant 10xx
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}';
}

class SessionClient {
  SessionClient({String? baseUrl, TokenStorage? storage, Dio? dio})
    : baseUrl = (baseUrl ?? resolveDefaultApiBaseUrl()).replaceAll(
        RegExp(r'/$'),
        '',
      ),
      _storage = storage ?? PlatformTokenStorage(),
      _dio =
          dio ??
          Dio(
            BaseOptions(
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 15),
              headers: const {'Content-Type': 'application/json'},
            ),
          );

  final String baseUrl;
  final TokenStorage _storage;
  final Dio _dio;

  SessionState _state = const SessionState.loading();
  final Set<VoidCallback> _listeners = <VoidCallback>{};
  String? _accessToken;
  String? _refreshToken;
  Future<void>? _refreshing;
  int _revision = 0;
  bool _signingOut = false;

  SessionState get snapshot => _state;
  String? get accessToken => _accessToken;

  VoidCallback subscribe(VoidCallback listener) {
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void _publish(SessionState next) {
    _state = next;
    for (final listener in List<VoidCallback>.from(_listeners)) {
      listener();
    }
  }

  Future<dynamic> _send(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String>? headers,
    String? bearerToken,
  }) async {
    final effectiveHeaders = <String, String>{
      'Content-Type': 'application/json',
      ...?headers,
      if (bearerToken != null && bearerToken.isNotEmpty)
        'Authorization': 'Bearer $bearerToken',
    };
    try {
      final response = await _dio.request<dynamic>(
        '$baseUrl$path',
        data: body,
        options: Options(
          method: method,
          headers: effectiveHeaders,
          validateStatus: (_) => true,
        ),
      );
      final statusCode = response.statusCode ?? 0;
      if (statusCode == 204) return null;
      final data = response.data;
      if (statusCode < 200 || statusCode >= 300) {
        final map = data is Map ? data : const <String, dynamic>{};
        throw ApiError(
          status: statusCode,
          code: (map['code'] ?? 'HTTP_ERROR').toString(),
          message:
              (map['message'] ??
                      'Yêu cầu chưa thực hiện được. Vui lòng thử lại.')
                  .toString(),
          requestId: map['requestId']?.toString(),
          details: map['fieldErrors'] ?? map['errors'] ?? map['details'],
        );
      }
      return data;
    } on ApiError {
      rethrow;
    } catch (_) {
      throw const ApiError(
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      );
    }
  }

  Future<void> _discard() async {
    _revision++;
    _accessToken = null;
    _refreshToken = null;
    _publish(const SessionState.anonymous());
    await _storage.clear();
  }

  Future<void> _accept(Map<String, dynamic> tokensJson, int revision) async {
    final nextAccess = (tokensJson['accessToken'] ?? '').toString();
    final nextRefresh = (tokensJson['refreshToken'] ?? '').toString();
    final rawUser = tokensJson['user'];
    final user = CurrentUser.fromJson(
      rawUser is Map<String, dynamic>
          ? rawUser
          : Map<String, dynamic>.from(rawUser as Map? ?? const {}),
    );
    if (revision != _revision) return;
    await _storage.write(nextRefresh);
    if (revision != _revision) return;
    _accessToken = nextAccess;
    _refreshToken = nextRefresh;
    _publish(SessionState.authenticated(user));
  }

  Future<void> restore() async {
    final revision = _revision;
    _publish(const SessionState.loading());
    try {
      final stored = await _storage.read();
      if (revision != _revision) return;
      _refreshToken = stored;
      if (stored == null || stored.isEmpty) {
        _publish(const SessionState.anonymous());
        return;
      }
      await _refresh();
    } catch (error) {
      if (revision != _revision) return;
      if (error is ApiError && error.status == 401) {
        await _discard();
        return;
      }
      _publish(SessionState.unavailable(presentErrorMessage(error)));
    }
  }

  Future<void> login({required String email, required String password}) async {
    if (_signingOut) {
      throw const ApiError(
        status: 401,
        code: 'SIGNING_OUT',
        message: 'Đang đăng xuất.',
      );
    }
    final revision = ++_revision;
    final body = await _send(
      '/auth/login',
      method: 'POST',
      body: {'email': email.trim(), 'password': password},
    );
    await _accept(Map<String, dynamic>.from(body as Map), revision);
  }

  Future<void> _refresh() {
    if (_refreshing != null) return _refreshing!;
    final revision = _revision;
    final token = _refreshToken;
    final future = () async {
      if (token == null || token.isEmpty) {
        throw const ApiError(
          status: 401,
          code: 'SESSION_EXPIRED',
          message: 'Vui lòng đăng nhập lại.',
        );
      }
      try {
        final body = await _send(
          '/auth/refresh',
          method: 'POST',
          body: {'refreshToken': token},
        );
        await _accept(Map<String, dynamic>.from(body as Map), revision);
      } catch (error) {
        if (error is ApiError && error.status == 401 && revision == _revision) {
          await _discard();
        }
        rethrow;
      }
    }();
    _refreshing = future.whenComplete(() => _refreshing = null);
    return _refreshing!;
  }

  Future<dynamic> publicRequest(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String>? headers,
  }) {
    return _send(path, method: method, body: body, headers: headers);
  }

  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String>? headers,
    String? idempotencyKey,
  }) async {
    if (_signingOut) {
      throw const ApiError(
        status: 401,
        code: 'SIGNING_OUT',
        message: 'Đang đăng xuất.',
      );
    }
    final revision = _revision;
    final originalToken = _accessToken;
    final effectiveHeaders = <String, String>{
      ...?headers,
      if (idempotencyKey != null && idempotencyKey.isNotEmpty)
        'Idempotency-Key': idempotencyKey,
    };
    try {
      final data = await _send(
        path,
        method: method,
        body: body,
        headers: effectiveHeaders,
        bearerToken: originalToken,
      );
      if (revision != _revision) {
        throw const ApiError(
          status: 401,
          code: 'SESSION_CHANGED',
          message: 'Phiên đăng nhập đã thay đổi.',
        );
      }
      return data;
    } on ApiError catch (error) {
      if (error.status != 401 ||
          error.code == 'SESSION_CHANGED' ||
          revision != _revision) {
        rethrow;
      }
      if (originalToken == _accessToken) {
        await _refresh();
      }
      if (revision != _revision || _accessToken == null) rethrow;
      try {
        return await _send(
          path,
          method: method,
          body: body,
          headers: effectiveHeaders,
          bearerToken: _accessToken,
        );
      } on ApiError catch (retryError) {
        if (retryError.status == 401 && revision == _revision) {
          await _discard();
        }
        rethrow;
      }
    }
  }

  Future<CurrentUser> reloadUser() async {
    final data = await request('/auth/me');
    final user = CurrentUser.fromJson(Map<String, dynamic>.from(data as Map));
    _publish(SessionState.authenticated(user));
    return user;
  }

  Future<void> logout() async {
    if (_signingOut) return;
    _signingOut = true;
    try {
      try {
        await _refreshing;
      } catch (_) {}
      final token = _refreshToken;
      if (token != null && token.isNotEmpty) {
        try {
          await _send(
            '/auth/logout',
            method: 'POST',
            body: {'refreshToken': token},
          );
        } catch (_) {}
      }
      await _discard();
    } finally {
      _signingOut = false;
    }
  }

  String resolveMediaUrl(String? rawUrl) {
    if (rawUrl == null || rawUrl.isEmpty) return '';
    if (rawUrl.startsWith('http://') ||
        rawUrl.startsWith('https://') ||
        rawUrl.startsWith('data:')) {
      return rawUrl;
    }
    final root = baseUrl.replaceAll(RegExp(r'/api/v1$'), '');
    if (rawUrl.startsWith('/')) return '$root$rawUrl';
    return '$baseUrl/$rawUrl';
  }

  static final Map<String, ({String url, DateTime expiresAt})> _mediaUrlCache =
      {};

  static String? getCachedMediaUrl(String key) {
    final cached = _mediaUrlCache[key];
    if (cached != null &&
        cached.expiresAt.isAfter(
          DateTime.now().add(const Duration(seconds: 30)),
        )) {
      return cached.url;
    }
    return null;
  }

  Future<String> resolveListingMediaUrl({
    required String listingId,
    required String mediaId,
    bool isMine = false,
  }) async {
    final key = '$listingId:$mediaId';
    final cached = getCachedMediaUrl(key);
    if (cached != null) return cached;

    try {
      final path = isMine
          ? '/me/listings/$listingId/media/$mediaId/read'
          : '/listings/$listingId/media/$mediaId/read';
      final res = isMine ? await request(path) : await publicRequest(path);
      if (res is Map && res['url'] is String) {
        final url = res['url'] as String;
        final expiresAtStr = res['expiresAt'] as String?;
        final expiresAt = expiresAtStr != null
            ? DateTime.tryParse(expiresAtStr) ??
                  DateTime.now().add(const Duration(minutes: 5))
            : DateTime.now().add(const Duration(minutes: 5));
        _mediaUrlCache[key] = (url: url, expiresAt: expiresAt);
        return url;
      }
    } catch (_) {}
    return '';
  }
}

final sessionClientProvider = Provider<SessionClient>((ref) {
  return SessionClient();
});

class SessionNotifier extends Notifier<SessionState> {
  late SessionClient _client;
  VoidCallback? _unsubscribe;

  @override
  SessionState build() {
    _client = ref.watch(sessionClientProvider);
    _unsubscribe?.call();
    _unsubscribe = _client.subscribe(() {
      state = _client.snapshot;
    });
    ref.onDispose(() {
      _unsubscribe?.call();
    });
    Future.microtask(() => _client.restore());
    return _client.snapshot;
  }

  SessionClient get client => _client;
}

final sessionProvider = NotifierProvider<SessionNotifier, SessionState>(
  SessionNotifier.new,
);
