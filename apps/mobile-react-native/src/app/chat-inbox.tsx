import React, { useSyncExternalStore } from "react";
import { Screen, StatePanel } from "../core/ui";
import { ChatInboxScreen } from "../features/conversations/chat-inbox-screen";

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

export default function ChatInboxRoute() {
  const hydrating = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );

  if (hydrating) {
    return (
      <Screen>
        <StatePanel loading title="Đang tải tin nhắn…" />
      </Screen>
    );
  }

  return <ChatInboxScreen />;
}
