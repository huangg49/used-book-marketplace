import { createContext, useContext } from "react";
export { useViewTransitionState as useConversationTransition } from "react-router-dom";

export type InboxFilter = "all" | "buyer" | "seller";
export type InboxPosition = {
  filter: InboxFilter;
  visible: number;
  scrollY: number;
  selectedId?: string;
};
export type InboxNavigation = {
  read: () => Readonly<InboxPosition>;
  save: (patch: Partial<InboxPosition>) => void;
};
export const ConversationNavigationContext =
  createContext<InboxNavigation | null>(null);
export function useInboxPosition() {
  const value = useContext(ConversationNavigationContext);
  if (!value) throw new Error("ConversationNavigation is required");
  return value;
}
