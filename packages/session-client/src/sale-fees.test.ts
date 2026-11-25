import { expect, it } from "vitest";
import { auctionCheckoutBalance } from "./sale-fees";

it.each([
  [130_000, 100_000, "Cần thêm từ số dư khả dụng", 30_000],
  [100_000, 100_000, "Cần thêm từ số dư khả dụng", 0],
  [100_000, 0, "Cần thêm từ số dư khả dụng", 100_000],
  [100_000, 110_000, "Hoàn dư về số dư khả dụng", 10_000],
])("uses the hold to explain a %i order with %i already held", (total, held, label, amount) => {
  expect(auctionCheckoutBalance(total, held)).toEqual({ label, amount });
});

it("leaves the wallet change unknown when the participation response has no hold", () => {
  expect(auctionCheckoutBalance(100_000)).toBeNull();
});
