import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pure countdown controller for anti-spam cooldowns.
 * Runs interval every 1000ms until remaining reaches 0.
 */
export function createCooldownController(
  seconds: number,
  onTick: (remaining: number) => void,
): () => void {
  let remaining = Math.max(0, Math.floor(seconds));
  onTick(remaining);
  if (remaining === 0) return () => {};

  const intervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(intervalId);
      onTick(0);
    } else {
      onTick(remaining);
    }
  }, 1000);

  return () => clearInterval(intervalId);
}

/**
 * Hook to prevent spamming actions (e.g. rapid visibility toggle).
 * Provides a cooldown countdown and disabled indicator.
 */
export function useActionCooldown(seconds = 4) {
  const [cooldown, setCooldown] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const startCooldown = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
    }
    stopRef.current = createCooldownController(seconds, (remaining) => {
      setCooldown(remaining);
      if (remaining <= 0) {
        stopRef.current = null;
      }
    });
  }, [seconds]);

  useEffect(() => {
    return () => {
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
    };
  }, []);

  return {
    cooldown,
    isCoolingDown: cooldown > 0,
    startCooldown,
  };
}
