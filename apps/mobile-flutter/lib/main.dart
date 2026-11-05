import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/router.dart';
import 'core/theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: UsedBooksApp()));
}

class UsedBooksApp extends ConsumerWidget {
  const UsedBooksApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'Lật Lại · Tiệm Sách Cũ',
      debugShowCheckedModeBanner: false,
      theme: buildLatLaiTheme(),
      routerConfig: router,
    );
  }
}
