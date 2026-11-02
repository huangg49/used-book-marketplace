import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/session_client.dart';
import '../theme/app_theme.dart';

class AppText extends StatelessWidget {
  const AppText(
    this.text, {
    super.key,
    this.kind = AppTextKind.body,
    this.color,
    this.style,
    this.textAlign,
    this.maxLines,
    this.overflow,
  });

  final String text;
  final AppTextKind kind;
  final Color? color;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    final baseStyle = styleForKind(kind, color: color);
    return Text(
      text,
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
      style: style != null ? baseStyle.merge(style) : baseStyle,
    );
  }
}

class BackAction extends StatelessWidget {
  const BackAction({
    super.key,
    required this.title,
    required this.onPressed,
    this.disabled = false,
    this.compact = false,
    this.color,
  });

  final String title;
  final VoidCallback onPressed;
  final bool disabled;
  final bool compact;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? StitchTokens.wine;
    return InkWell(
      onTap: disabled ? null : onPressed,
      borderRadius: BorderRadius.circular(AppRadius.control),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minHeight: compact ? 32 : AppMetrics.touch,
          minWidth: compact ? 32 : AppMetrics.touch,
        ),
        child: Padding(
          padding: EdgeInsets.symmetric(
            vertical: compact ? 4 : AppSpace.sm,
            horizontal: AppSpace.xs,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.arrow_back_rounded,
                size: compact ? 16 : 20,
                color: effectiveColor,
              ),
              SizedBox(width: compact ? 6 : AppSpace.sm),
              Flexible(
                child: AppText(
                  title,
                  kind: AppTextKind.bold,
                  color: effectiveColor,
                  style: compact
                      ? const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        )
                      : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


class ActionRow extends StatelessWidget {
  const ActionRow({
    super.key,
    required this.title,
    required this.description,
    required this.icon,
    required this.onPressed,
    this.badge,
  });

  final String title;
  final String description;
  final IconData icon;
  final VoidCallback onPressed;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      child: Container(
        constraints: const BoxConstraints(minHeight: AppMetrics.control),
        padding: const EdgeInsets.symmetric(vertical: AppSpace.lg),
        decoration: const BoxDecoration(
          border: Border(
            bottom: BorderSide(color: AppColors.rule, width: 1),
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpace.md),
              decoration: BoxDecoration(
                color: AppColors.successSurface,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 22, color: AppColors.forest),
            ),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: AppText(
                          title,
                          kind: AppTextKind.bold,
                          color: AppColors.forest,
                        ),
                      ),
                      if (badge != null && badge!.isNotEmpty) ...[
                        const SizedBox(width: AppSpace.sm),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: StitchTokens.wine,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: AppText(
                            badge!,
                            kind: AppTextKind.label,
                            color: StitchTokens.gold,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: AppSpace.xs),
                  AppText(
                    description,
                    kind: AppTextKind.small,
                    color: AppColors.muted,
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            const Icon(
              Icons.chevron_right_rounded,
              size: 22,
              color: AppColors.forest,
            ),
          ],
        ),
      ),
    );
  }
}

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.title,
    required this.onPressed,
    this.secondary = false,
    this.disabled = false,
    this.busy = false,
    this.destructive = false,
    this.wine = false,
    this.gold = false,
    this.icon,
    this.compact = false,
  });

  final String title;
  final VoidCallback? onPressed;
  final bool secondary;
  final bool disabled;
  final bool busy;
  final bool destructive;
  final bool wine;
  final bool gold;
  final IconData? icon;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final isDisabled = disabled || busy || onPressed == null;
    final Color bg = destructive
        ? AppColors.error
        : secondary
            ? (gold ? StitchTokens.gold.withValues(alpha: 0.12) : AppColors.surface)
            : gold
                ? StitchTokens.gold
                : wine
                    ? StitchTokens.wine
                    : AppColors.forest;
    final Color fg = (secondary && !destructive)
        ? (gold
            ? StitchTokens.goldLight
            : (wine ? StitchTokens.wine : AppColors.forest))
        : gold
            ? StitchTokens.wineDark
            : wine
                ? StitchTokens.gold
                : Colors.white;
    final Color borderColor = destructive
        ? AppColors.error
        : secondary
            ? (gold
                ? StitchTokens.gold.withValues(alpha: 0.45)
                : (wine ? StitchTokens.peachBorder : AppColors.border))
            : gold
                ? StitchTokens.goldDark
                : bg;

    return Opacity(
      opacity: isDisabled ? 0.55 : 1,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.control),
        child: InkWell(
          onTap: isDisabled ? null : onPressed,
          borderRadius: BorderRadius.circular(AppRadius.control),
          child: Container(
            constraints: BoxConstraints(
              minHeight: compact ? 40 : AppMetrics.control,
            ),
            padding: EdgeInsets.symmetric(
              horizontal: compact ? AppSpace.md : AppSpace.lg,
              vertical: compact ? AppSpace.sm : AppSpace.md,
            ),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.control),
              border: Border.all(color: borderColor, width: 1.2),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (busy) ...[
                  SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      valueColor: AlwaysStoppedAnimation<Color>(fg),
                    ),
                  ),
                  const SizedBox(width: AppSpace.sm),
                ] else if (icon != null) ...[
                  Icon(icon, size: 18, color: fg),
                  const SizedBox(width: AppSpace.sm),
                ],
                Flexible(
                  child: AppText(
                    title,
                    kind: compact ? AppTextKind.small : AppTextKind.bold,
                    color: fg,
                    textAlign: TextAlign.center,
                    style: compact
                        ? const TextStyle(fontWeight: FontWeight.w700)
                        : null,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.title,
    required this.selected,
    required this.onPressed,
    this.disabled = false,
    this.wine = false,
    this.gold = false,
    this.icon,
  });

  final String title;
  final bool selected;
  final VoidCallback onPressed;
  final bool disabled;
  final bool wine;
  final bool gold;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final activeBg = gold
        ? StitchTokens.gold
        : wine
            ? StitchTokens.wine
            : AppColors.forest;
    final activeColor = gold
        ? StitchTokens.wineDark
        : wine
            ? Colors.white
            : AppColors.paper;
    final inactiveBg = gold
        ? StitchTokens.wineDeep.withValues(alpha: 0.5)
        : selected
            ? activeBg
            : StitchTokens.parchment;
    final inactiveColor = gold
        ? StitchTokens.goldLight
        : wine
            ? StitchTokens.deepCocoa
            : AppColors.forest;
    final inactiveBorder = gold
        ? StitchTokens.goldDark.withValues(alpha: 0.45)
        : wine
            ? StitchTokens.peachBorder
            : AppColors.border;

    return InkWell(
      onTap: disabled ? null : onPressed,
      borderRadius: BorderRadius.circular(AppRadius.pill),
      child: Container(
        constraints: const BoxConstraints(minHeight: 38),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.md,
          vertical: AppSpace.sm,
        ),
        decoration: BoxDecoration(
          color: selected ? activeBg : inactiveBg,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          border: Border.all(
            color: selected ? activeBg : inactiveBorder,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 15,
                color: selected ? activeColor : inactiveColor,
              ),
              const SizedBox(width: 6),
            ],
            AppText(
              title,
              kind: AppTextKind.small,
              color: selected ? activeColor : inactiveColor,
              style: TextStyle(
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SearchField extends StatelessWidget {
  const SearchField({
    super.key,
    required this.controller,
    this.placeholder = 'Tìm theo tên sách, tác giả, ISBN…',
    this.onSubmitted,
    this.onChanged,
    this.onClear,
    this.height = 44,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onClear;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFDF8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x335C0202)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F000000),
            blurRadius: 4,
            offset: Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 20, color: Color(0xFF214B40)),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              onSubmitted: onSubmitted,
              textInputAction: TextInputAction.search,
              style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF261E1A),
                fontWeight: FontWeight.w500,
              ),
              decoration: InputDecoration(
                hintText: placeholder,
                hintStyle: const TextStyle(
                  fontSize: 13,
                  color: Color(0xFF8A7D73),
                ),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          if (controller.text.isNotEmpty)
            GestureDetector(
              onTap: () {
                controller.clear();
                onChanged?.call('');
                onClear?.call();
              },
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4),
                child: Icon(Icons.close_rounded, size: 18, color: Color(0xFF8A7D73)),
              ),
            ),
        ],
      ),
    );
  }
}


class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.label,
    this.hint,
    this.error,
    this.requiredField = false,
    this.controller,
    this.placeholder,
    this.obscureText = false,
    this.multiline = false,
    this.keyboardType,
    this.enabled = true,
    this.onChanged,
    this.labelColor,
    this.focusedBorderColor,
  });

  final String? label;
  final String? hint;
  final String? error;
  final bool requiredField;
  final TextEditingController? controller;
  final String? placeholder;
  final bool obscureText;
  final bool multiline;
  final TextInputType? keyboardType;
  final bool enabled;
  final ValueChanged<String>? onChanged;
  final Color? labelColor;
  final Color? focusedBorderColor;

  @override
  Widget build(BuildContext context) {
    final description = (error != null && error!.isNotEmpty) ? error : hint;
    final hasError = error != null && error!.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null && label!.isNotEmpty) ...[
          AppText(
            requiredField ? '$label *' : label!,
            kind: AppTextKind.bold,
            color: labelColor,
          ),
          const SizedBox(height: AppSpace.xs),
        ],
        TextField(
          controller: controller,
          obscureText: obscureText,
          maxLines: multiline ? 4 : 1,
          minLines: multiline ? 3 : 1,
          keyboardType: keyboardType,
          enabled: enabled,
          onChanged: onChanged,
          style: styleForKind(AppTextKind.body),
          decoration: InputDecoration(
            hintText: placeholder,
            hintStyle: styleForKind(AppTextKind.body, color: AppColors.muted),
            filled: true,
            fillColor: enabled ? AppColors.surface : const Color(0xFFF4F0E8),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: AppSpace.md,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.control),
              borderSide: BorderSide(
                color: hasError ? AppColors.error : AppColors.border,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.control),
              borderSide: BorderSide(
                color: hasError
                    ? AppColors.error
                    : (focusedBorderColor ?? StitchTokens.wine),
                width: 2,
              ),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadius.control),
              borderSide: const BorderSide(color: AppColors.rule),
            ),
          ),
        ),
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: AppSpace.xs),
          AppText(
            description,
            kind: AppTextKind.small,
            color: hasError ? AppColors.error : AppColors.muted,
          ),
        ],
      ],
    );
  }
}

enum NoticeTone { info, success, warning, error }

class Notice extends StatelessWidget {
  const Notice({
    super.key,
    required this.message,
    this.tone = NoticeTone.info,
    this.onDismiss,
  });

  final String message;
  final NoticeTone tone;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, icon) = switch (tone) {
      NoticeTone.error => (
          AppColors.errorSurface,
          AppColors.error,
          Icons.error_outline_rounded
        ),
      NoticeTone.warning => (
          AppColors.warningSurface,
          AppColors.warning,
          Icons.warning_amber_rounded
        ),
      NoticeTone.success => (
          AppColors.successSurface,
          AppColors.success,
          Icons.check_circle_outline_rounded
        ),
      NoticeTone.info => (
          AppColors.infoSurface,
          AppColors.info,
          Icons.info_outline_rounded
        ),
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadius.control),
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: fg),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: AppText(
              message,
              kind: AppTextKind.small,
              color: fg,
            ),
          ),
          if (onDismiss != null)
            InkWell(
              onTap: onDismiss,
              child: Icon(Icons.close_rounded, size: 18, color: fg),
            ),
        ],
      ),
    );
  }
}

class StatePanel extends StatelessWidget {
  const StatePanel({
    super.key,
    required this.title,
    this.message,
    this.icon = Icons.menu_book_rounded,
    this.loading = false,
    this.wine = false,
    this.actionLabel,
    this.onAction,
    this.actionBusy = false,
  });

  final String title;
  final String? message;
  final IconData icon;
  final bool loading;
  final bool wine;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool actionBusy;

  @override
  Widget build(BuildContext context) {
    final accent = wine ? StitchTokens.wine : AppColors.forest;
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: AppSpace.section,
        horizontal: AppSpace.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (loading)
            SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                valueColor: AlwaysStoppedAnimation<Color>(accent),
              ),
            )
          else
            Icon(icon, size: 38, color: accent),
          const SizedBox(height: AppSpace.lg),
          AppText(
            title,
            kind: AppTextKind.heading,
            color: wine ? StitchTokens.charcoalBrown : AppColors.ink,
            textAlign: TextAlign.center,
          ),
          if (message != null && message!.isNotEmpty) ...[
            const SizedBox(height: AppSpace.sm),
            AppText(
              message!,
              color: AppColors.muted,
              textAlign: TextAlign.center,
            ),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: AppSpace.lg),
            AppButton(
              title: actionLabel!,
              wine: wine,
              busy: actionBusy,
              onPressed: onAction,
            ),
          ],
        ],
      ),
    );
  }
}

/// Official Web/RN Brand Logo matching `apps/mobile-react-native/src/core/ui/brand-logo.tsx`
/// Displays the cropped owl + wordmark seamlessly on wine backgrounds.
class WebBrandLogo extends StatelessWidget {
  const WebBrandLogo({super.key, this.scale = 0.78});

  final double scale;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Lật Lại - Tiệm Sách Cũ',
      child: Image.asset(
        'assets/brand/lat-lai-horizontal-web.png',
        height: 36 * scale,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => Image.asset(
          'assets/brand/lat-lai-horizontal-white.png',
          height: 34 * scale,
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => _BrandLogoFallback(scale: scale),
        ),
      ),
    );
  }
}

class _BrandLogoFallback extends StatelessWidget {
  const _BrandLogoFallback({required this.scale});

  final double scale;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 36 * scale,
          height: 32 * scale,
          decoration: BoxDecoration(
            color: StitchTokens.gold,
            borderRadius: BorderRadius.circular(8 * scale),
          ),
          alignment: Alignment.center,
          child: Icon(
            Icons.auto_stories_rounded,
            color: StitchTokens.wineDark,
            size: 19 * scale,
          ),
        ),
        SizedBox(width: 8 * scale),
        Text(
          'Lật Lại',
          style: TextStyle(
            color: StitchTokens.gold,
            fontFamily: 'Lora',
            fontSize: 20 * scale,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}


/// TopNavbar matching `apps/mobile-react-native/src/core/ui/top-navbar.tsx`
/// Wine background (#5C0202), owl emblem + Lật Lại title + TP. HỒ CHÍ MINH,
/// notification bell & message inbox action buttons.
class TopNavbar extends ConsumerWidget {
  const TopNavbar({
    super.key,
    this.subtitle = 'TP. HỒ CHÍ MINH',
    this.notificationCount = 0,
    this.messageCount,
    this.onNotificationsPress,
    this.onMessagesPress,
    this.onLogoPress,
    this.bottom,
    this.leading,
    this.borderRadius,
  });

  final String subtitle;
  final int notificationCount;
  final int? messageCount;
  final VoidCallback? onNotificationsPress;
  final VoidCallback? onMessagesPress;
  final VoidCallback? onLogoPress;
  final Widget? bottom;
  final Widget? leading;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      decoration: BoxDecoration(
        color: StitchTokens.wine,
        borderRadius: borderRadius ??
            const BorderRadius.vertical(bottom: Radius.circular(18)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x26000000),
            blurRadius: 8,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                16,
                12,
                16,
                bottom != null ? 10 : 14,
              ),
              child: Row(
                children: [
                  if (leading != null)
                    Expanded(child: leading!)
                  else
                    Expanded(
                      child: InkWell(
                        onTap: onLogoPress ?? () => context.go('/'),
                        borderRadius: BorderRadius.circular(10),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const WebBrandLogo(scale: 0.78),
                            if (subtitle.isNotEmpty) ...[
                              Container(
                                width: 1,
                                height: 18,
                                margin: const EdgeInsets.symmetric(horizontal: 10),
                                color: const Color(0x66FFDF97),
                              ),
                              Flexible(
                                child: AppText(
                                  subtitle,
                                  kind: AppTextKind.label,
                                  color: StitchTokens.gold,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 0.8,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(width: 10),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _NavbarCircleIcon(
                        icon: Icons.notifications_none_rounded,
                        label: 'Thông báo',
                        badgeCount: notificationCount,
                        showDotWhenZero: true,
                        onTap: onNotificationsPress ??
                            () => _showNotificationsBottomSheet(context, ref),
                      ),
                      const SizedBox(width: 8),
                      _NavbarCircleIcon(
                        icon: Icons.chat_bubble_outline_rounded,
                        label: 'Tin nhắn',
                        badgeCount: messageCount ?? 0,
                        onTap: onMessagesPress ?? () => context.push('/chat-inbox'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (bottom != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                child: bottom!,
              ),
          ],
        ),
      ),
    );
  }
}



class _NavbarCircleIcon extends StatelessWidget {
  const _NavbarCircleIcon({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badgeCount = 0,
    this.showDotWhenZero = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final int badgeCount;
  final bool showDotWhenZero;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.14),
            shape: BoxShape.circle,
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, size: 20, color: Colors.white),
              if (badgeCount > 0)
                Positioned(
                  top: 4,
                  right: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: StitchTokens.gold,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: AppText(
                      badgeCount > 9 ? '9+' : '$badgeCount',
                      kind: AppTextKind.label,
                      color: StitchTokens.wineDark,
                      style: const TextStyle(fontSize: 9, height: 1.1),
                    ),
                  ),
                )
              else if (showDotWhenZero)
                Positioned(
                  top: 9,
                  right: 9,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: StitchTokens.gold,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

void _showNotificationsBottomSheet(BuildContext context, WidgetRef ref) {
  final session = ref.read(sessionProvider);
  final client = ref.read(sessionClientProvider);
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Padding(
        padding: const EdgeInsets.all(AppSpace.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const AppText(
                  'Thông báo của bạn',
                  kind: AppTextKind.heading,
                  color: StitchTokens.wine,
                ),
                IconButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            if (!session.isAuthenticated)
              StatePanel(
                wine: true,
                icon: Icons.notifications_none_rounded,
                title: 'Đăng nhập để xem thông báo',
                message:
                    'Cập nhật đơn hàng, đề nghị đổi sách, phiên đấu giá và tin nhắn mới sẽ xuất hiện tại đây.',
                actionLabel: 'Đăng nhập',
                onAction: () {
                  Navigator.of(ctx).pop();
                  context.push('/account');
                },
              )
            else
              FutureBuilder<dynamic>(
                future: client.request('/notifications'),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const StatePanel(
                      wine: true,
                      loading: true,
                      title: 'Đang tải thông báo…',
                    );
                  }
                  final data = snapshot.data;
                  final items = (data is Map && data['items'] is List)
                      ? (data['items'] as List)
                      : (data is List ? data : const []);
                  if (items.isEmpty) {
                    return const StatePanel(
                      wine: true,
                      icon: Icons.notifications_none_rounded,
                      title: 'Chưa có thông báo mới',
                      message:
                          'Khi có cập nhật về đơn hàng, thương lượng, trao đổi hoặc đấu giá, Lật Lại sẽ báo ngay tại đây.',
                    );
                  }
                  return ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 340),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(),
                      itemBuilder: (_, index) {
                        final raw = items[index];
                        final item = raw is Map
                            ? Map<String, dynamic>.from(raw)
                            : const <String, dynamic>{};
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const CircleAvatar(
                            backgroundColor: StitchTokens.roseParchment,
                            child: Icon(
                              Icons.notifications_active_outlined,
                              color: StitchTokens.wine,
                              size: 18,
                            ),
                          ),
                          title: AppText(
                            (item['title'] ?? 'Thông báo hệ thống').toString(),
                            kind: AppTextKind.bold,
                          ),
                          subtitle: AppText(
                            (item['message'] ?? item['body'] ?? '').toString(),
                            kind: AppTextKind.small,
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
          ],
        ),
      );
    },
  );
}

/// 5-tab MemberNavigation matching `apps/mobile-react-native/src/features/navigation/member-navigation.tsx`
/// Destinations:
/// - `/` ("Trang chủ")
/// - `/search` ("Tìm sách")
/// - `/drafts` ("Đăng sách" — elevated gold primary button with wineDark border)
/// - `/auctions` ("Đấu giá")
/// - `/account` ("Tài khoản")
class MemberNavigation extends StatelessWidget {
  const MemberNavigation({
    super.key,
    required this.currentPath,
  });

  final String currentPath;

  static const _items = [
    (href: '/', title: 'Trang chủ', icon: Icons.home_rounded, primary: false),
    (
      href: '/search',
      title: 'Tìm sách',
      icon: Icons.search_rounded,
      primary: false
    ),
    (
      href: '/drafts',
      title: 'Đăng sách',
      icon: Icons.add_rounded,
      primary: true
    ),
    (
      href: '/auctions',
      title: 'Đấu giá',
      icon: Icons.gavel_rounded,
      primary: false
    ),
    (
      href: '/account',
      title: 'Tài khoản',
      icon: Icons.person_outline_rounded,
      primary: false
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.rule, width: 1)),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.xs,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: _items.map((item) {
            final selected = currentPath == item.href;
            if (item.primary) {
              return Expanded(
                child: InkWell(
                  onTap: () => context.go(item.href),
                  borderRadius: BorderRadius.circular(AppRadius.control),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: StitchTokens.gold,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: StitchTokens.wineDark,
                              width: 3,
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x40000000),
                                blurRadius: 5,
                                offset: Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Icon(
                            item.icon,
                            size: 24,
                            color: StitchTokens.wineDark,
                          ),
                        ),
                        const SizedBox(height: 2),
                        AppText(
                          item.title,
                          kind: AppTextKind.navigationLabel,
                          color: StitchTokens.wine,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }

            final fg = selected
                ? AppColors.navigationSelectedText
                : AppColors.muted;
            return Expanded(
              child: InkWell(
                onTap: () => context.go(item.href),
                borderRadius: BorderRadius.circular(AppRadius.control),
                child: Container(
                  constraints: const BoxConstraints(
                    minHeight: AppMetrics.control,
                  ),
                  padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.navigationSelected
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppRadius.control),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(item.icon, size: 22, color: fg),
                      const SizedBox(height: 3),
                      AppText(
                        item.title,
                        kind: AppTextKind.navigationLabel,
                        color: fg,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

class AppScreen extends StatelessWidget {
  const AppScreen({
    super.key,
    required this.child,
    this.header,
    this.footer,
    this.currentNavPath,
    this.backgroundColor,
    this.backgroundDecoration,
    this.maxWidth = AppMetrics.content,
    this.padding,
  });

  final Widget child;
  final Widget? header;
  final Widget? footer;
  final String? currentNavPath;
  final Color? backgroundColor;
  final BoxDecoration? backgroundDecoration;
  final double? maxWidth;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final bg = backgroundColor ?? StitchTokens.creamBg;
    return Scaffold(
      backgroundColor: bg,
      body: Container(
        decoration: backgroundDecoration,
        child: SafeArea(
          bottom: currentNavPath == null && footer == null,
          child: Column(
            children: [
              ?header,
              Expanded(
                child: SingleChildScrollView(
                  padding: padding ??
                      const EdgeInsets.symmetric(
                        horizontal: AppSpace.lg,
                        vertical: AppSpace.lg,
                      ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: maxWidth ?? double.infinity,
                      ),
                    child: child,
                  ),
                ),
              ),
            ),
            ?footer,
            if (currentNavPath != null)
              MemberNavigation(currentPath: currentNavPath!),
          ],
        ),
      ),
    ),
  );
}
}

/// BookCard widget matching `apps/mobile-react-native/src/core/ui/book-card.tsx`
class BookCard extends ConsumerWidget {
  const BookCard({
    super.key,
    required this.item,
    this.onOpen,
    this.variant = 'shelf',
    this.actionTitle,
    this.onActionPress,
    this.onDelete,
  });

  final Map<String, dynamic> item;
  final VoidCallback? onOpen;
  final String variant;
  final String? actionTitle;
  final VoidCallback? onActionPress;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundle = item['bundle'] is Map
        ? Map<String, dynamic>.from(item['bundle'] as Map)
        : null;
    final book = item['book'] is Map
        ? Map<String, dynamic>.from(item['book'] as Map)
        : const <String, dynamic>{};

    final title = (bundle?['title'] ??
            book['title'] ??
            item['title'] ??
            'Chưa chọn đầu sách')
        .toString();
    final rawAuthors = book['authors'];
    final authorText = rawAuthors is List && rawAuthors.isNotEmpty
        ? rawAuthors.join(' · ')
        : (rawAuthors is String ? rawAuthors : (book['publisher'] ?? '').toString());

    final condition = (item['condition'] ?? 'Good').toString();
    final (condLabel, condBg) = switch (condition) {
      'LikeNew' => ('Như mới', StitchTokens.likeNewGreen),
      'Good' => ('Còn tốt', StitchTokens.goldBronze),
      'Fair' => ('Đã dùng nhiều', StitchTokens.darkTaupe),
      'Worn' => ('Cũ nhiều', StitchTokens.darkTaupe),
      _ => (formatConditionLabel(condition), StitchTokens.goldBronze),
    };

    final moderation = (item['moderation'] ?? item['status'] ?? 'Draft').toString();
    final (modLabel, modBg, modFg) = switch (moderation) {
      'PendingReview' => (
          'Chờ duyệt',
          const Color(0xFFFFF1ED),
          StitchTokens.goldDark
        ),
      'Rejected' => (
          'Cần sửa',
          const Color(0xFFFFDAD6),
          const Color(0xFF93000A)
        ),
      'Approved' || 'Published' || 'Active' => (
          'Đang bán',
          const Color(0xFFE1DEC2),
          const Color(0xFF1D1C0B)
        ),
      _ => ('Bản nháp', StitchTokens.parchment, StitchTokens.deepCocoa),
    };

    final mode = (item['mode'] ?? '').toString();
    final bundleItems = bundle?['items'] is List ? (bundle!['items'] as List) : null;
    final (modeLabel, modeBg) = bundleItems != null
        ? ('Bộ ${bundleItems.length} cuốn · Giá cả bộ', StitchTokens.wine)
        : switch (mode) {
            'Sale' => ('Bán', StitchTokens.wine),
            'Exchange' => ('Đổi', StitchTokens.orangeDeep),
            'Both' => ('Bán hoặc đổi', StitchTokens.darkRed),
            'Auction' => ('Đấu giá', StitchTokens.darkRed),
            _ => ('', StitchTokens.wine),
          };

    final salePrice = item['salePrice'] is num ? (item['salePrice'] as num) : null;
    final exchangeValue =
        item['exchangeValue'] is num ? (item['exchangeValue'] as num) : null;

    final fulfillment = item['fulfillment'] is Map
        ? Map<String, dynamic>.from(item['fulfillment'] as Map)
        : null;
    final locationText =
        (fulfillment?['name'] ?? item['location'] ?? 'TP.HCM').toString();

    return Material(
      color: StitchTokens.whiteSurface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: StitchTokens.creamParchment),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0F000000),
                blurRadius: 3,
                offset: Offset(0, 1),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 3 / 4,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    BookCoverPhoto(
                      item: item,
                      isMine: variant == 'management',
                    ),
                    Positioned(
                      top: 6,
                      left: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: variant == 'management' ? modBg : condBg,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: AppText(
                          variant == 'management' ? modLabel : condLabel,
                          kind: AppTextKind.label,
                          color:
                              variant == 'management' ? modFg : Colors.white,
                          style: const TextStyle(fontSize: 9.5),
                        ),
                      ),
                    ),
                    if (variant != 'management' && modeLabel.isNotEmpty)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: modeBg,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: AppText(
                            modeLabel,
                            kind: AppTextKind.label,
                            color: Colors.white,
                            style: const TextStyle(fontSize: 9.5),
                          ),
                        ),
                      ),
                    if (variant == 'management' && onDelete != null)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: InkWell(
                          onTap: onDelete,
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.94),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: StitchTokens.peachBorder,
                              ),
                            ),
                            child: const Icon(
                              Icons.delete_outline_rounded,
                              size: 15,
                              color: StitchTokens.darkRed,
                            ),
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
                    AppText(
                      title,
                      kind: AppTextKind.shelfTitle,
                      color: StitchTokens.darkWood,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (authorText.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      AppText(
                        'Tác giả: $authorText',
                        kind: AppTextKind.small,
                        color: AppColors.muted,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 6),
                    if (salePrice != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            const Text(
                              'Giá bán: ',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFF7A6E65),
                              ),
                            ),
                            Flexible(
                              child: Text(
                                formatVnd(salePrice),
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: StitchTokens.wine,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (exchangeValue != null)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          const Text(
                            'Giá đổi: ',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFF7A6E65),
                            ),
                          ),
                          Flexible(
                            child: Text(
                              formatVnd(exchangeValue),
                              style: TextStyle(
                                fontSize: salePrice != null ? 12 : 14,
                                fontWeight: FontWeight.w700,
                                color: StitchTokens.warmUmber,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    if (salePrice == null && exchangeValue == null)
                      const AppText(
                        'Trao đổi / thương lượng',
                        kind: AppTextKind.small,
                        color: StitchTokens.warmUmber,
                      ),
                    const SizedBox(height: 6),
                    if (variant == 'management' &&
                        (actionTitle != null || onActionPress != null))
                      SizedBox(
                        width: double.infinity,
                        child: AppButton(
                          title: actionTitle ?? 'Chi tiết',
                          wine: true,
                          compact: true,
                          secondary: moderation != 'Rejected',
                          onPressed: onActionPress ?? onOpen,
                        ),
                      )
                    else
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on_outlined,
                            size: 12,
                            color: AppColors.muted,
                          ),
                          const SizedBox(width: 3),
                          Expanded(
                            child: AppText(
                              locationText,
                              kind: AppTextKind.small,
                              color: AppColors.muted,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 10.5),
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
  }
}

class _BookCoverPlaceholder extends StatelessWidget {
  const _BookCoverPlaceholder();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = (constraints.maxWidth > 0
            ? (constraints.maxWidth * 0.45).clamp(16.0, 30.0)
            : 22.0);
        return Container(
          color: const Color(0xFFF0EAE1),
          alignment: Alignment.center,
          child: Icon(
            Icons.menu_book_rounded,
            size: size,
            color: const Color(0xFFB0A298),
          ),
        );
      },
    );
  }
}

/// Handles asynchronous resolution and caching of media photos for listings.
class BookCoverPhoto extends ConsumerStatefulWidget {
  const BookCoverPhoto({
    super.key,
    required this.item,
    this.fit = BoxFit.cover,
    this.isMine = false,
  });

  final Map<String, dynamic> item;
  final BoxFit fit;
  final bool isMine;

  @override
  ConsumerState<BookCoverPhoto> createState() => _BookCoverPhotoState();
}

class _BookCoverPhotoState extends ConsumerState<BookCoverPhoto> {
  String? _resolvedUrl;

  @override
  void initState() {
    super.initState();
    _loadCover();
  }

  @override
  void didUpdateWidget(covariant BookCoverPhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item['id'] != widget.item['id'] ||
        oldWidget.item['coverUrl'] != widget.item['coverUrl']) {
      _loadCover();
    }
  }

  Future<void> _loadCover() async {
    final client = ref.read(sessionClientProvider);

    // 1. Direct Cover URL inspection in item, book, revision, content
    final direct = _extractDirectCover(widget.item);
    if (direct != null && direct.isNotEmpty) {
      if (mounted) {
        setState(() {
          _resolvedUrl = client.resolveMediaUrl(direct);
        });
      }
      return;
    }

    final listingId =
        (widget.item['id'] ?? widget.item['listingId'] ?? '').toString();

    // 2. Photos / mediaIds inspection
    final mediaId = _extractMediaId(widget.item);

    if (listingId.isEmpty || mediaId == null || mediaId.isEmpty) {
      return;
    }

    final key = '$listingId:$mediaId';
    final cached = SessionClient.getCachedMediaUrl(key);
    if (cached != null) {
      if (mounted) {
        setState(() {
          _resolvedUrl = cached;
        });
      }
      return;
    }

    final url = await client.resolveListingMediaUrl(
      listingId: listingId,
      mediaId: mediaId,
      isMine: widget.isMine,
    );

    if (mounted && url.isNotEmpty) {
      setState(() {
        _resolvedUrl = url;
      });
    }
  }

  String? _extractDirectCover(Map<String, dynamic> item) {
    String? check(dynamic obj) {
      if (obj is Map) {
        for (final k in [
          'coverUrl',
          'coverImage',
          'imageUrl',
          'thumbnail',
          'photoUrl',
        ]) {
          final v = obj[k];
          if (v != null && v.toString().trim().isNotEmpty) {
            return v.toString().trim();
          }
        }
      }
      return null;
    }

    final direct = check(item);
    if (direct != null) return direct;

    final book = item['book'];
    final fromBook = check(book);
    if (fromBook != null) return fromBook;

    final rev = item['currentRevision'];
    if (rev is Map) {
      final fromRevBook = check(rev['book']);
      if (fromRevBook != null) return fromRevBook;

      final content = rev['content'];
      final fromContent = check(content);
      if (fromContent != null) return fromContent;
    }

    final contentDirect = check(item['content']);
    if (contentDirect != null) return contentDirect;

    final photos = item['photos'];
    if (photos is List && photos.isNotEmpty) {
      final first = photos.first;
      if (first is Map &&
          first['url'] != null &&
          first['url'].toString().trim().isNotEmpty) {
        return first['url'].toString().trim();
      }
    }

    return null;
  }

  String? _extractMediaId(Map<String, dynamic> item) {
    final photos = item['photos'];
    if (photos is List && photos.isNotEmpty) {
      final first = photos.first;
      if (first is Map && first['id'] != null) {
        return first['id'].toString();
      }
      if (first is String && first.trim().isNotEmpty) {
        return first.trim();
      }
    }

    String? checkMediaIds(dynamic obj) {
      if (obj is Map) {
        final ids = obj['mediaIds'] ?? obj['media'];
        if (ids is List && ids.isNotEmpty) {
          final first = ids.first;
          if (first is Map && first['id'] != null) return first['id'].toString();
          if (first != null && first.toString().trim().isNotEmpty) {
            return first.toString().trim();
          }
        }
      }
      return null;
    }

    final fromItem = checkMediaIds(item);
    if (fromItem != null) return fromItem;

    final rev = item['currentRevision'];
    if (rev is Map) {
      final fromContent = checkMediaIds(rev['content']);
      if (fromContent != null) return fromContent;

      final fromRev = checkMediaIds(rev);
      if (fromRev != null) return fromRev;
    }

    final fromContentDirect = checkMediaIds(item['content']);
    if (fromContentDirect != null) return fromContentDirect;

    return null;
  }

  @override
  Widget build(BuildContext context) {
    if (_resolvedUrl != null && _resolvedUrl!.isNotEmpty) {
      return Image.network(
        _resolvedUrl!,
        fit: widget.fit,
        errorBuilder: (_, _, _) => const _BookCoverPlaceholder(),
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            color: const Color(0xFFF0EAE1),
            child: const Center(
              child: SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: StitchTokens.wine,
                ),
              ),
            ),
          );
        },
      );
    }
    return const _BookCoverPlaceholder();
  }
}


