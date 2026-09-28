import { useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { Screen, StatePanel } from "../core/ui";
import { BookScreen } from "../features/shelf/book-screen";
const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;
export default function BookRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Static HTML has no query string. Hydrate a consistent shell before reading the URL.
  const hydrating = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  if (hydrating)
    return (
      <Screen>
        <StatePanel loading title="Đang mở cuốn sách" />
      </Screen>
    );
  return <BookScreen key={id} id={typeof id === "string" ? id : ""} />;
}
