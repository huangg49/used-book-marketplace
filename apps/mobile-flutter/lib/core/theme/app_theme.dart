import 'package:flutter/material.dart';

/// Brand v1.1 palette ("Dấu chuyền tay") + Stitch wine/gold tokens
/// Synchronized with `packages/brand/v1.1/identity.tokens.json` and
/// `apps/mobile-react-native/src/core/ui/theme.ts`.
abstract final class AppColors {
  static const Color forest = Color(0xFF214B40);
  static const Color paper = Color(0xFFF5EFDF);
  static const Color terracotta = Color(0xFFC15A39);
  static const Color ink = Color(0xFF202C27);
  static const Color leaf = Color(0xFFD5DFA4);
  static const Color surface = Color(0xFFFFFCF4);
  static const Color muted = Color(0xFF58685E);
  static const Color rustText = Color(0xFF963F28);
  static const Color border = Color(0xFF788477);
  static const Color rule = Color(0xFFD5D8C8);
  static const Color error = Color(0xFFA32D34);
  static const Color errorSurface = Color(0xFFFCEDEE);
  static const Color success = Color(0xFF255A43);
  static const Color successSurface = Color(0xFFE8EFDF);
  static const Color warning = Color(0xFF74520C);
  static const Color warningSurface = Color(0xFFF9EECF);
  static const Color info = Color(0xFF34556B);
  static const Color infoSurface = Color(0xFFEAF0F3);

  static const Color shelfCanvas = Color(0xFFF6F8F3);
  static const Color shelfEdge = Color(0xFFB5C3AC);
  static const Color navigationSelected = Color(0xFFF7EBE8);
  static const Color navigationSelectedText = Color(0xFF5C0202);
}

abstract final class StitchTokens {
  static const Color wine = Color(0xFF5C0202);
  static const Color wineDark = Color(0xFF360000);
  static const Color wineDeep = Color(0xFF440000);
  static const Color wineMid = Color(0xFF6A0404);
  static const Color wineLight = Color(0xFF8D1919);

  static const Color gold = Color(0xFFFFDF97);
  static const Color goldLight = Color(0xFFFFF8E7);
  static const Color goldDark = Color(0xFFB08D2F);
  static const Color goldAccent = Color(0xFFF4CB67);
  static const Color goldMedal = Color(0xFFEAC25F);
  static const Color goldBronze = Color(0xFFB78103);
  static const Color goldVeryLight = Color(0xFFFFF2D1);

  static const Color creamBg = Color(0xFFF7F3ED);
  static const Color whiteSurface = Color(0xFFFFFFFF);
  static const Color cardBorder = Color(0xFFE8E4DA);
  static const Color flashRed = Color(0xFFD32F2F);
  static const Color flashRedBg = Color(0xFFFFEBEE);
  static const Color likeNewGreen = Color(0xFF1B5E20);
  static const Color likeNewGreenBg = Color(0xFFE8F5E9);
  static const Color verifiedGreen = Color(0xFF2E7D32);
  static const Color forestGreen = Color(0xFF3D7A57);
  static const Color tagExchangeBg = Color(0xFFFFF8E1);
  static const Color tagExchangeText = Color(0xFFE65100);
  static const Color orangeDeep = Color(0xFFF4511E);
  static const Color darkRed = Color(0xFFB71C1C);
  static const Color brickRed = Color(0xFFA63A2E);

  static const Color parchment = Color(0xFFFAF7F2);
  static const Color canvasMuted = Color(0xFFF2EDE4);
  static const Color roseWarmSurface = Color(0xFFFFF8F6);
  static const Color peachBorder = Color(0xFFDEC0BB);
  static const Color roseWarmTag = Color(0xFFFFEBE8);
  static const Color roseParchment = Color(0xFFF7EBE8);
  static const Color warmCard = Color(0xFFF0EAE1);
  static const Color warmIvory = Color(0xFFFFFDF8);
  static const Color deepCocoa = Color(0xFF57423E);
  static const Color borderWarm = Color(0xFFDDD5C7);
  static const Color warmUmber = Color(0xFF735650);
  static const Color darkWood = Color(0xFF2B1D19);
  static const Color charcoalBrown = Color(0xFF271813);
  static const Color darkTaupe = Color(0xFF4A3F3B);
  static const Color creamParchment = Color(0xFFEBE6DE);
  static const Color paperBorder = Color(0xFFEAE3D6);
  static const Color offWhiteWarm = Color(0xFFFAF7F5);
  static const Color warningNoteBg = Color(0xFFFDF5E6);
  static const Color warningNoteBorder = Color(0xFFF0E0C0);
  static const Color successLightBg = Color(0xFFF4F7EE);
  static const Color successLightBorder = Color(0xFFC5D8B8);
  static const Color exchangeCarrierSurface = Color(0xFFF0F7FF);
  static const Color exchangeCarrierBorder = Color(0xFF70A6FF);
  static const Color exchangeCarrierInk = Color(0xFF1E40AF);
}

abstract final class AppSpace {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double section = 32;
  static const double page = 40;
}

abstract final class AppRadius {
  static const double book = 2;
  static const double record = 4;
  static const double small = 4;
  static const double card = 6;
  static const double control = 8;
  static const double sheet = 20;
  static const double pill = 24;
}

abstract final class AppMetrics {
  static const double touch = 48;
  static const double control = 52;
  static const double content = 540;
  static const double wideContent = 980;
  static const double shelfCover = 196;
  static const double sheet = 520;
}

enum AppTextKind {
  bookTitle,
  bookHeading,
  searchTitle,
  shelfTitle,
  shelfPrice,
  reading,
  annotation,
  stamp,
  bookPrice,
  body,
  small,
  label,
  navigationLabel,
  title,
  heading,
  card,
  bold,
  price,
}

TextStyle styleForKind(AppTextKind kind, {Color? color}) {
  final effectiveColor = color ??
      switch (kind) {
        AppTextKind.title ||
        AppTextKind.heading ||
        AppTextKind.bookTitle ||
        AppTextKind.bookHeading =>
          AppColors.forest,
        AppTextKind.price ||
        AppTextKind.bookPrice ||
        AppTextKind.shelfPrice =>
          StitchTokens.wine,
        AppTextKind.annotation || AppTextKind.small => AppColors.muted,
        _ => AppColors.ink,
      };

  return switch (kind) {
    AppTextKind.title => TextStyle(
        fontSize: 28,
        height: 36 / 28,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.searchTitle => TextStyle(
        fontSize: 26,
        height: 34 / 26,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.heading => TextStyle(
        fontSize: 21,
        height: 29 / 21,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.bookTitle => TextStyle(
        fontSize: 22,
        height: 30 / 22,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.bookHeading => TextStyle(
        fontSize: 19,
        height: 27 / 19,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.price || AppTextKind.bookPrice => TextStyle(
        fontSize: 20,
        height: 28 / 20,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.shelfPrice => TextStyle(
        fontSize: 16,
        height: 22 / 16,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.card => TextStyle(
        fontSize: 17,
        height: 24 / 17,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.shelfTitle => TextStyle(
        fontSize: 14,
        height: 19 / 14,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.reading => TextStyle(
        fontSize: 16,
        height: 25 / 16,
        fontWeight: FontWeight.w400,
        color: effectiveColor,
      ),
    AppTextKind.bold => TextStyle(
        fontSize: 15,
        height: 22 / 15,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.body => TextStyle(
        fontSize: 15,
        height: 22 / 15,
        fontWeight: FontWeight.w400,
        color: effectiveColor,
      ),
    AppTextKind.stamp => TextStyle(
        fontSize: 13,
        height: 19 / 13,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.annotation => TextStyle(
        fontSize: 13,
        height: 19 / 13,
        fontWeight: FontWeight.w400,
        color: effectiveColor,
      ),
    AppTextKind.navigationLabel => TextStyle(
        fontSize: 11.5,
        height: 16 / 11.5,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
    AppTextKind.small => TextStyle(
        fontSize: 12,
        height: 18 / 12,
        fontWeight: FontWeight.w400,
        color: effectiveColor,
      ),
    AppTextKind.label => TextStyle(
        fontSize: 11,
        height: 16 / 11,
        fontWeight: FontWeight.w700,
        color: effectiveColor,
      ),
  };
}

String formatVnd(num? amount) {
  if (amount == null || amount.isNaN || amount < 0) {
    return 'Chưa có giá';
  }
  final intVal = amount.round();
  final digits = intVal.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    final posFromRight = digits.length - i;
    buffer.write(digits[i]);
    if (posFromRight > 1 && posFromRight % 3 == 1) {
      buffer.write('.');
    }
  }
  return '${buffer.toString()} ₫';
}

String formatConditionLabel(String? condition) {
  return switch (condition) {
    'LikeNew' => 'Như mới',
    'Good' => 'Còn tốt',
    'Fair' => 'Đã dùng nhiều',
    'Worn' => 'Cũ nhiều',
    _ => condition?.isNotEmpty == true ? condition! : 'Còn tốt',
  };
}

String formatModeLabel(String? mode) {
  return switch (mode) {
    'Sale' => 'Bán',
    'Exchange' => 'Đổi sách',
    'Both' => 'Bán hoặc đổi',
    'Auction' => 'Đấu giá',
    _ => mode ?? 'Bán',
  };
}

ThemeData buildLatLaiTheme() {
  final focusSide = WidgetStateProperty.resolveWith<BorderSide?>((states) {
    if (!states.contains(WidgetState.focused) ||
        states.contains(WidgetState.disabled)) {
      return null;
    }
    return const BorderSide(color: StitchTokens.wine, width: 2);
  });
  final onWineFocusSide = WidgetStateProperty.resolveWith<BorderSide?>((states) {
    if (!states.contains(WidgetState.focused) ||
        states.contains(WidgetState.disabled)) {
      return null;
    }
    return const BorderSide(color: AppColors.surface, width: 2);
  });
  final focusStyle = ButtonStyle(
    side: focusSide,
    animationDuration: const Duration(milliseconds: 140),
  );
  final filledFocusStyle = ButtonStyle(
    side: onWineFocusSide,
    animationDuration: const Duration(milliseconds: 140),
  );
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: StitchTokens.creamBg,
    colorScheme: const ColorScheme.light(
      primary: StitchTokens.wine,
      onPrimary: StitchTokens.gold,
      secondary: AppColors.forest,
      onSecondary: AppColors.paper,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
      error: AppColors.error,
      onError: Colors.white,
    ),
    dividerColor: AppColors.rule,
    focusColor: StitchTokens.wine.withValues(alpha: 0.12),
    inputDecorationTheme: InputDecorationThemeData(
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: const BorderSide(color: StitchTokens.wine, width: 2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: const BorderSide(color: AppColors.error, width: 2),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: focusStyle),
    outlinedButtonTheme: OutlinedButtonThemeData(style: focusStyle),
    iconButtonTheme: IconButtonThemeData(style: focusStyle),
    filledButtonTheme: FilledButtonThemeData(style: filledFocusStyle),
    elevatedButtonTheme: ElevatedButtonThemeData(style: filledFocusStyle),
    segmentedButtonTheme: SegmentedButtonThemeData(style: focusStyle),
    appBarTheme: const AppBarTheme(
      backgroundColor: StitchTokens.wine,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
  );
}

