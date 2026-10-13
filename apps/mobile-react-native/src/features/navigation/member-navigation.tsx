import { router } from "expo-router";
import { NavigationBar } from "../../core/ui";

export type MemberDestinationHref =
  | "/"
  | "/search"
  | "/drafts"
  | "/auctions"
  | "/account";

const destinations = [
  { href: "/", title: "Trang chủ", icon: "home" as const },
  { href: "/search", title: "Tìm sách", icon: "search" as const },
  {
    href: "/drafts",
    title: "Đăng sách",
    icon: "plus" as const,
    primaryAction: true,
  },
  {
    href: "/auctions",
    title: "Đấu giá",
    icon: "gavel" as const,
    badge: true,
  },
  { href: "/account", title: "Tài khoản", icon: "person" as const },
] as const;

// Only mount on destination screens, never inside a dirty editor.
export function MemberNavigation({
  current,
  onSearchPress,
  onAuctionPress,
}: {
  current: MemberDestinationHref;
  onSearchPress?: () => void;
  onAuctionPress?: () => void;
}) {
  const handleSelect = (href: MemberDestinationHref) => {
    if (href === "/search" && onSearchPress) {
      onSearchPress();
      return;
    }
    if (href === "/auctions" && onAuctionPress) {
      onAuctionPress();
      return;
    }
    if (href === "/drafts") {
      router.navigate("/drafts");
      return;
    }
    if (href === "/auctions") {
      router.navigate("/");
      return;
    }
    router.navigate(href);
  };

  return (
    <NavigationBar
      current={current}
      destinations={destinations.map((item) => ({
        key: item.href,
        title: item.title,
        accessibilityLabel: item.title,
        icon: item.icon,
        primaryAction: "primaryAction" in item ? item.primaryAction : false,
        badge: "badge" in item ? item.badge : false,
      }))}
      onSelect={(href) => handleSelect(href as MemberDestinationHref)}
    />
  );
}
