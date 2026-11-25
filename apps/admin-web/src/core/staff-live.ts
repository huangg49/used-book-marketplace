import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  createLiveWatcher,
  sessionSocketOptions,
  type StaffTopic,
} from "@used-books/session-client";
import { session } from "./session";

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";
const origin = apiBase.startsWith("/") ? "" : apiBase.replace(/\/api\/v1\/?$/, "");

// One `/staff` socket for the workspace; every screen shares it. The server
// checks the topic role against the current session before each push.
const live = createLiveWatcher({
  client: session,
  open: (namespace) =>
    io(`${origin}/${namespace}`, {
      ...sessionSocketOptions,
      auth: (callback) => callback({ token: session.getAccessToken() }),
    }),
});

/**
 * Re-reads a staff screen when a command changes its queue. Returns true while
 * the watch is acknowledged, so the screen can slow its poll to a backstop.
 * `refresh` always sees the latest render (e.g. whether a panel is open).
 */
export function useStaffLive(topic: StaffTopic, refresh: () => void, enabled = true) {
  const [watching, setWatching] = useState(false);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    const stop = live.watch("staff", topic, {
      refresh: () => refreshRef.current(),
      onWatching: setWatching,
    });
    return () => {
      stop();
      setWatching(false);
    };
  }, [enabled, topic]);
  return enabled && watching;
}

/** Poll cadence for a staff list: a fast fallback, or a slow backstop when live. */
export const staffPoll = (live: boolean, fallbackMs: number) =>
  live ? Math.max(30_000, fallbackMs) : fallbackMs;
