import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { createMotionPreference } from "./motion-preference";

export const motion = { duration: 160, distance: 12 } as const;
// Expo web follows the website's authored-motion policy. Native retains its
// own device subscription; web never subscribes to OS reduction changes.
const fullWebMotion = {
  getSnapshot: () => false,
  subscribe: (_listener: () => void) => () => {},
};
const preference = Platform.OS === "web" ? fullWebMotion : createMotionPreference({
  read: () => AccessibilityInfo.isReduceMotionEnabled(),
  listen: (changed) => {
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      changed,
    );
    return () => subscription?.remove();
  },
});
export function useReducedMotion() {
  return useSyncExternalStore(
    preference.subscribe,
    preference.getSnapshot,
    () => Platform.OS !== "web",
  );
}
