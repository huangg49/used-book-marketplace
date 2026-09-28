import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Icon,
  colors,
  layout,
  metrics,
  radius,
  space,
} from "../../core/ui";

const destinations = [
  { href: "/", title: "Khám phá", icon: "book" },
  { href: "/drafts", title: "Sách của tôi", icon: "bookmark" },
  { href: "/account", title: "Tài khoản", icon: "person" },
] as const;

// Only mount on destination screens, never inside a dirty editor.
export function MemberNavigation({
  current,
}: {
  current: (typeof destinations)[number]["href"];
}) {
  const { state } = useSession();
  const [focused, setFocused] = useState<string>();
  return (
    <View
      style={{
        flexDirection: "row",
        maxWidth: metrics.content,
        width: "100%",
        alignSelf: "center",
        gap: space.xs,
      }}
    >
      {destinations
        .filter(
          (item) =>
            item.href !== "/drafts" ||
            state.status !== "authenticated" ||
            (state.user.roles.includes("MEMBER") &&
              state.user.status !== "LOCKED"),
        )
        .map((item) => (
          <Pressable
            key={item.href}
            accessibilityRole="tab"
            accessibilityLabel={item.title}
            accessibilityState={{ selected: current === item.href }}
            onFocus={() => setFocused(item.href)}
            onBlur={() => setFocused(undefined)}
            onPress={() => {
              if (current !== item.href) router.navigate(item.href);
            }}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: metrics.touch,
                alignItems: "center",
                gap: space.xs,
                paddingVertical: space.xs,
                opacity: pressed ? 0.7 : 1,
              },
              focused === item.href && layout.focus,
            ]}
          >
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: space.xs,
                borderRadius: radius.pill,
                backgroundColor:
                  current === item.href ? colors.leaf : colors.paper,
              }}
            >
              <Icon name={item.icon} size={22} />
            </View>
            <AppText
              kind="label"
              color={current === item.href ? colors.forest : colors.muted}
              style={{ textAlign: "center" }}
            >
              {item.title}
            </AppText>
          </Pressable>
        ))}
    </View>
  );
}
