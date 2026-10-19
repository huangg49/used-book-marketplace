import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useSession } from "../../hooks/useSession";
import {
  ConversationNavigationContext,
  type InboxNavigation,
  type InboxPosition,
} from "./conversation-navigation";
import "./ConversationTransition.css";

// UI-only memory owned by this layout/session; no private data in browser storage.
export function ConversationNavigation({ children }: { children: ReactNode }) {
  const location = useLocation();
  const ownsScroll =
    location.pathname === "/chat" ||
    location.pathname.startsWith("/chat/") ||
    location.state?.chatFromInbox === true;
  useEffect(() => {
    if (!ownsScroll) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, [ownsScroll]);
  const auth = useSession();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  return <NavigationMemory key={owner ?? "guest"}>{children}</NavigationMemory>;
}

function NavigationMemory({ children }: { children: ReactNode }) {
  const [navigation] = useState<InboxNavigation>(() => {
    let position: InboxPosition = { filter: "all", visible: 12, scrollY: 0 };
    return {
      read: () => position,
      save: (patch) => {
        position = { ...position, ...patch };
      },
    };
  });
  return (
    <ConversationNavigationContext.Provider value={navigation}>
      {children}
    </ConversationNavigationContext.Provider>
  );
}
