import type { TokenStorage } from "../api/session-client";

// Web preview only: no tokens in localStorage. Reloading requires sign-in.
let token: string | null = null;
export const tokenStorage: TokenStorage = {
  read: async () => token,
  write: async (value) => {
    token = value;
  },
  clear: async () => {
    token = null;
  },
};
