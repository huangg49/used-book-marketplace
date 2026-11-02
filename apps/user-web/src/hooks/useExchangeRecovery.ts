import { useSyncExternalStore } from "react";
import {
  exchangeCommandIdentity,
  exchangeRecoveryVersion,
  subscribeExchangeRecovery,
} from "@used-books/session-client";
import { session } from "../services/api";
const subscribe = (listener: () => void) =>
  subscribeExchangeRecovery(session, listener);
const snapshot = () => exchangeRecoveryVersion(session);
export function useExchangeRecovery() {
  useSyncExternalStore(subscribe, snapshot, () => 0);
  return exchangeCommandIdentity(session);
}
