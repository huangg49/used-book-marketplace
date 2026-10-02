import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { NavigationBar } from "../../core/ui";

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
  return (
    <NavigationBar
      current={current}
      destinations={destinations
        .filter(
          (item) =>
            item.href !== "/drafts" ||
            state.status !== "authenticated" ||
            (state.user.roles.includes("MEMBER") &&
              state.user.status !== "LOCKED"),
        )
        .map((item) => ({
          key: item.href,
          title: item.title,
          icon: item.icon,
        }))}
      onSelect={(href) => router.navigate(href)}
    />
  );
}
