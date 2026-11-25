import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";

function subscribe(listener: () => void) {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

const isActive = () => AppState.currentState === "active";
const serverSnapshot = () => false;

export function useForeground() {
  const focused = useIsFocused();
  const active = useSyncExternalStore(subscribe, isActive, serverSnapshot);
  return focused && active;
}
