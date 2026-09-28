import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
export function useForeground() {
  const [focused, setFocused] = useState(false),
    [active, setActive] = useState(AppState.currentState === "active");
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const s = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => s.remove();
  }, []);
  return focused && active;
}
