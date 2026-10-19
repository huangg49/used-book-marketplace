import { useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { Screen, StatePanel } from "../core/ui";
import { ConversationScreen } from "../features/conversations/conversation-screen";

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const hydrating = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );

  if (hydrating) {
    return (
      <Screen>
        <StatePanel loading title="Đang mở cuộc trò chuyện…" />
      </Screen>
    );
  }

  return (
    <ConversationScreen
      key={typeof id === "string" ? id : "empty"}
      id={typeof id === "string" ? id : ""}
    />
  );
}
