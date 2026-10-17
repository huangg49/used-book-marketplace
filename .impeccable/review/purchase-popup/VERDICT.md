## verdict

| Original material fix | Status | Evidence |
| --- | --- | --- |
| Reuse the confirmed saved Checkout address after a definite quote rejection | resolved | CheckoutPage now calls `setSelected(address.id)` after confirming the saved address by refetch and before the quote request. The targeted seller-order regression asserts that a lost address acknowledgement replays the same key/body, a subsequent quote422 leaves the saved QA buyer radio selected and removes the new-name form, and quote retry adds no address POST. The final API address count is asserted as two, including the previous default. This test run is reported PASS by the implementer; the reviewer inspected its assertions and source, without rerunning it. The refreshed quote capture shows the prepared destination and quote action. |
| Restore strong scoped input boundaries over the global input cascade | resolved | Reopened all ten required capture paths; each is valid. Address text/tel inputs, seller price and enlarged origin fields now visibly share the intended boundary strength with select/textarea controls. Pixel checks in the refreshed address-desktop (574,367), seller-create-desktop (700,350) and origin-popup-desktop (550,468) each read RGB142/117/100, matching `shop-control`. The scoped selector outranks the global rule. Mobile fields remain readable; origin retains130% text and bounded scrolling. |

No regressions introduced by this fix batch are visible in the supplied recaptures. This ship verdict covers the two scored fixes, not a new whole-surface audit.

## remaining

clear

disposition: ship
