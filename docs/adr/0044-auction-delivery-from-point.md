# ADR 0044: Auction wins can be delivered from the point

20/10/2026. Owner decision: the winner of an auction may have the book delivered
instead of collecting it at the point. The owner lifted the READINESS gate for
this package only (“Delivered/inspection/settlement” for ViaPoint auction
Orders). The carrier is the project simulator; no real carrier or money is used.
This implements the `CarrierOutbound` choice already named in DEC-04/FR-H11/FR-T03
of [LOCAL-AUCTION-01](../features/LOCAL_HANDOVER_AUCTION.md) for auction Orders.

## Decision

- **Choice at payment.** A won auction still forms one ViaPoint Order with
  `SelfCollect` as the default method. When paying, the winner chooses
  `SelfCollect` or `CarrierOutbound`. Delivery needs one of the winner's saved
  addresses in the supported service area (`HCM-DEMO-v1`, ADR 0039). The choice
  is final once paid; v1 has no switching afterwards.
- **Fee.** The outbound fee is the `shippingFee` of the selected DirectSale
  policy (one demo area, fixed fee, same as ordinary deliveries). The buyer sees
  it first (`GET /me/point-orders/{id}/delivery-quote`). The payment command
  carries `expectedOutboundFee` and the address version, so a changed fee or
  address is refused (409) instead of being charged silently.
  `buyerTotal = bookPrice + outboundFee` moves into the Order hold in one
  payment. The formation agreement snapshot stays frozen. A separate delivery
  snapshot (`point_order_deliveries`) records the address, policy code, fee and
  time of the choice.
- **Report, then dispatch.** The 72-hour report acceptance (POL-32) is
  unchanged. Accepting opens the same window (`ReadyForCollection`, 72 hours
  ending within point hours, POL-33). For delivery this window is for the
  point to hand the book to the carrier. No collection code is issued.
- **Hand-off to the carrier.** An assigned Staff member, independent of buyer
  and seller and during point hours, records the hand-off to the simulated
  carrier (`POST /operations/point-orders/{id}/dispatch`). The Order becomes
  `InTransit` with a tracking code and a delivery deadline of 240 hours (the
  same as carrier pickups). Custody leaves the point once: the handover row has
  method `CarrierOutbound`, so the code-checked `SelfCollect` handover cannot
  follow.
- **Carrier events.** An independent TEST_OPERATOR posts the signed simulated
  delivery event (`Delivered` or `Failed`; Idempotency-Key = eventId).
  `Delivered` starts the 72-hour inspection window from the delivery time
  (FR-T03); claims, settlement and returns then follow the existing ViaPoint
  rules. `Failed`, or no event by the delivery deadline, opens
  `ResolutionPending` with reason `DeliveryFailed`.
- **Failures.**
  - The book not handed to the carrier in time opens the existing
    `CollectionOverdue`. For delivery the buyer is never at fault: a refund
    states `NoFault`, or the Admin opens a new dispatch window.
  - For `DeliveryFailed` the independent Admin can only require the book back.
    The carrier returns it to the point and Staff receive it with the existing
    return check, which refunds the whole `buyerTotal` (including the fee) and
    sends the book to reclaim.
  - A missed carrier return reopens `DeliveryFailed`. There is no redelivery
    in v1.
- **Money.** Settlement is unchanged. The seller receives `P − C`; the platform
  account receives `C + outboundFee` (it pays the simulated carrier). A refund
  always returns the full hold.

## Persistence and contract

Migration 0034 (`0034-auction-delivery`):

- `point_orders`: adds `CarrierOutbound`, a positive outbound fee (only with
  delivery, set at payment), state `InTransit`, reason `DeliveryFailed`, and
  `dispatchedAt`, `deliveryDeadline` and `trackingCode`.
- `point_handovers`: adds method `CarrierOutbound` with no code.
- `point_order_resolutions`: allows `DeliveryFailed` → `RequireReturn`.
- New collections: `point_order_deliveries` (address/fee snapshot) and
  `point_carrier_events` (append-only signed events).

The contract adds the delivery quote, the payment choice, the dispatch command,
the simulated point delivery event, the new state/reason and the delivery
fields on `PointOrder` and the Staff queue.

## Limits

No real carrier, delivery tracking map, redelivery, partial refund of the fee,
or change of method after payment. The point Staff see the recipient name,
phone and address only for Orders they must dispatch; the seller never sees
them.
