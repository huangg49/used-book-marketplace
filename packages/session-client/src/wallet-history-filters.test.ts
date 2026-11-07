import { describe, expect, it } from "vitest";
import { emptyWalletHistoryFilters, walletHistoryFilters } from "./wallet-history-filters";

describe("wallet history filters", () => {
  it("includes the whole chosen calendar day in Vietnam and accepts displayed receipt codes", () => {
    expect(walletHistoryFilters({ from: "2028-02-29", to: "2028-02-29", reference: "#ĐƠN-4A2B1C" })).toEqual({
      filters: {
        from: "2028-02-29T00:00:00+07:00",
        to: "2028-02-29T23:59:59.999+07:00",
        reference: "4a2b1c",
      },
    });
  });

  it("rejects invalid days, reversed ranges and unsupported reference characters", () => {
    for (const fields of [
      { from: "2027-02-29" },
      { from: "2028-03-01", to: "2028-02-29" },
      { reference: ".*" },
    ]) {
      expect(walletHistoryFilters({ ...emptyWalletHistoryFilters, ...fields })).toHaveProperty("error");
    }
  });

  it("accepts empty filters and full reference IDs", () => {
    expect(walletHistoryFilters(emptyWalletHistoryFilters)).toEqual({ filters: {} });
    const reference = "00000000-0000-4000-8000-000000000001";
    expect(walletHistoryFilters({ ...emptyWalletHistoryFilters, reference })).toEqual({ filters: { reference } });
  });
});
