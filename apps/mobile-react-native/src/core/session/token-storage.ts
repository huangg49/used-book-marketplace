import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "../api/session-client";

const KEY = "lat-lai.refresh-token";
export const tokenStorage: TokenStorage = {
  read: () => SecureStore.getItemAsync(KEY),
  write: (token) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
