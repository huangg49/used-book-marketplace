import type { QueryClient } from "@tanstack/react-query";
import { session } from "./session";

/** Re-read wallet views after a confirmed command, without manufacturing balances. */
export function invalidateMemberWalletViews(client: QueryClient, ownerId: string | undefined) {
  const current = session.getSnapshot();
  if (!ownerId || current.status !== "authenticated" || current.user.id !== ownerId) return;
  for (const family of ["wallet-summary", "member-wallet-mini", "wallet-history", "wallet-history-overview"]) {
    void client.invalidateQueries({ queryKey: [family, ownerId] });
  }
  // Older exchange/auction dialogs still use a flat summary key.
  for (const family of ["wallet-summary", "wallet"]) {
    void client.invalidateQueries({ queryKey: [family], exact: true });
  }
}
