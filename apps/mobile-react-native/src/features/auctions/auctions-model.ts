import { useQuery } from "@tanstack/react-query";
import type { SessionClient } from "../../core/api/session-client";
import { publicAuctionList, type PublicAuctionList } from "./contracts";

export const AUCTIONS_QUERY_KEY = ["public-auctions"] as const;

export function usePublicAuctions(client: SessionClient) {
  return useQuery<PublicAuctionList, Error>({
    queryKey: AUCTIONS_QUERY_KEY,
    queryFn: () => client.request("/auctions", publicAuctionList),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
