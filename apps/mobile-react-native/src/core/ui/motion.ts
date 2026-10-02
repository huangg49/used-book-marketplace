import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import { createMotionPreference } from "./motion-preference";

export const motion = { duration: 160, distance: 12 } as const;
const preference = createMotionPreference({
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
    () => true,
  );
}
