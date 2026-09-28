BEGIN;
CREATE TABLE order_delivery_reviews (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES direct_orders(id) ON DELETE RESTRICT,
 pickup_event_id uuid NOT NULL UNIQUE, opened_at timestamptz(6) NOT NULL,
 opened_by varchar(24) NOT NULL CHECK(opened_by IN ('DeadlineWorker','BuyerReport')),
 policy_code varchar(40) NOT NULL DEFAULT 'ORDER-DELIVERY-REVIEW-v1' CHECK(policy_code='ORDER-DELIVERY-REVIEW-v1'),
 receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(order_id,pickup_event_id) REFERENCES carrier_pickup_events(order_id,id) ON DELETE RESTRICT,
 UNIQUE(order_id,pickup_event_id)
);
CREATE INDEX order_delivery_reviews_opened_at_id_idx ON order_delivery_reviews(opened_at,id);
CREATE INDEX carrier_pickup_delivery_candidates ON carrier_pickup_events(delivery_deadline,id) WHERE outcome='Applied';
CREATE TABLE order_non_receipt_reports (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES order_delivery_reviews(order_id) ON DELETE RESTRICT,
 submitted_at timestamptz(6) NOT NULL,
 description varchar(2000) NOT NULL CHECK(char_length(btrim(description)) BETWEEN 20 AND 2000 AND description=btrim(description)),
 receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER delivery_review_immutable BEFORE UPDATE OR DELETE ON order_delivery_reviews FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER non_receipt_report_immutable BEFORE UPDATE OR DELETE ON order_non_receipt_reports FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_principal;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR
 (context_id IS NOT NULL AND ((system_actor='OrderExpiry' AND operation='expireOrder') OR
 (system_actor='OrderConfirmationExpiry' AND operation='expireSellerConfirmation') OR (system_actor='OrderRefund' AND operation='refundOrder') OR (system_actor='OrderPickupExpiry' AND operation='expireOrderPickup') OR (system_actor='OrderDeliveryExpiry' AND operation='expireOrderDelivery')))));
ALTER TABLE audit_events DROP CONSTRAINT audit_principal;
ALTER TABLE audit_events ADD CONSTRAINT audit_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR
 (context_id IS NOT NULL AND ((system_actor='OrderExpiry' AND action='expireOrder') OR
 (system_actor='OrderConfirmationExpiry' AND action='expireSellerConfirmation') OR (system_actor='OrderRefund' AND action='refundOrder') OR (system_actor='OrderPickupExpiry' AND action='expireOrderPickup') OR (system_actor='OrderDeliveryExpiry' AND action='expireOrderDelivery')))));



CREATE FUNCTION latlai_check_delivery_review(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; d order_delivery_reviews; p carrier_pickup_events; b order_non_receipt_reports; c workflow_contexts;
BEGIN
 SELECT * INTO d FROM order_delivery_reviews WHERE order_id=oid;
 IF d.id IS NULL THEN RETURN; END IF;
 SELECT * INTO STRICT o FROM direct_orders WHERE id=oid;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=oid;
 SELECT * INTO STRICT p FROM carrier_pickup_events WHERE id=d.pickup_event_id;
 SELECT * INTO b FROM order_non_receipt_reports WHERE order_id=oid;
 IF o.state<>'ResolutionPending' OR o.version<>5 OR p.order_id<>oid OR p.outcome<>'Applied' OR p.delivery_deadline IS NULL
   OR d.opened_at<p.delivery_deadline OR d.opened_at<p.received_at
   OR d.opened_by='BuyerReport' AND (b.id IS NULL OR b.receipt_id<>d.receipt_id OR b.submitted_at<>d.opened_at)
 THEN RAISE EXCEPTION 'Invalid delivery review anchor/state/deadline' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
   WHERE r.id=d.receipt_id AND r.context_id=c.id AND r.result_version=5 AND r.committed_at=d.opened_at
   AND r.result->>'id'=r.id::text AND r.result->>'entityType'='Order' AND r.result->>'entityId'=oid::text AND r.result->>'contextId'=c.id::text
   AND r.result->>'state'='ResolutionPending' AND (r.result->>'version')::integer=5 AND (r.result->>'serverTime')::timestamptz=d.opened_at
   AND (r.result->>'paymentDeadline')::timestamptz=o.payment_deadline AND r.result->'affectedListings'='[]'::jsonb
   AND a.context_id=c.id AND a.actor_id IS NOT DISTINCT FROM r.actor_id AND a.system_actor IS NOT DISTINCT FROM r.system_actor AND a.action=r.operation
   AND a.after->>'state'='ResolutionPending' AND (a.after->>'version')::integer=5 AND a.reason='DeliveryDeadlineExceeded'
   AND ob.payload->>'entityId'=oid::text AND ob.payload->>'contextId'=c.id::text AND ob.payload->>'state'='ResolutionPending' AND (ob.payload->>'version')::integer=5
   AND ((d.opened_by='DeadlineWorker' AND r.operation='expireOrderDelivery' AND r.system_actor='OrderDeliveryExpiry' AND r.actor_id IS NULL AND r.key=oid AND ob.type='OrderDeliveryReviewOpened')
     OR (d.opened_by='BuyerReport' AND r.operation='reportOrderNonReceipt' AND r.actor_id=o.buyer_id AND r.system_actor IS NULL AND ob.type='OrderNonReceiptReported')))
 THEN RAISE EXCEPTION 'Delivery review receipt/audit/outbox mismatch' USING ERRCODE='23514'; END IF;
 IF b.id IS NOT NULL AND (b.submitted_at<d.opened_at OR b.submitted_at<p.delivery_deadline OR NOT EXISTS(
   SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
   WHERE r.id=b.receipt_id AND r.context_id=c.id AND r.result_version=5 AND r.committed_at=b.submitted_at
   AND r.operation='reportOrderNonReceipt' AND r.actor_id=o.buyer_id AND r.system_actor IS NULL
   AND r.result->>'id'=r.id::text AND r.result->>'entityType'='Order' AND r.result->>'entityId'=oid::text AND r.result->>'contextId'=c.id::text
   AND r.result->>'state'='ResolutionPending' AND (r.result->>'version')::integer=5 AND (r.result->>'serverTime')::timestamptz=b.submitted_at
   AND (r.result->>'paymentDeadline')::timestamptz=o.payment_deadline AND r.result->'affectedListings'='[]'::jsonb
   AND a.context_id=c.id AND a.actor_id=o.buyer_id AND a.system_actor IS NULL AND a.action=r.operation
   AND a.after->>'state'='ResolutionPending' AND (a.after->>'version')::integer=5 AND a.reason='DeliveryDeadlineExceeded'
   AND ob.type='OrderNonReceiptReported' AND ob.payload->>'entityId'=oid::text AND ob.payload->>'contextId'=c.id::text AND ob.payload->>'state'='ResolutionPending' AND (ob.payload->>'version')::integer=5))
 THEN RAISE EXCEPTION 'Non-receipt report identity/deadline/audit mismatch' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION latlai_check_order_pickup(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; p order_preparations; s direct_shipments; e carrier_pickup_events;
 cr carrier_pickup_reviews; first_event carrier_pickup_events; first_review carrier_pickup_events;
 c workflow_contexts; n integer:=0; prior_time timestamptz; expected_outcome text;
 expected_state text; expected_version integer; has_applied boolean:=false;
BEGIN
 SELECT * INTO STRICT o FROM direct_orders WHERE id=oid;
 SELECT * INTO p FROM order_preparations WHERE order_id=oid;
 SELECT * INTO s FROM direct_shipments WHERE order_id=oid;
 SELECT * INTO cr FROM carrier_pickup_reviews WHERE order_id=oid;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=oid;
 FOR e IN SELECT * FROM carrier_pickup_events WHERE order_id=oid ORDER BY sequence LOOP
  n:=n+1;
  IF n=1 THEN
   first_event:=e;
   has_applied:=e.received_at<p.pickup_deadline;
   expected_outcome:=CASE WHEN has_applied THEN 'Applied' ELSE 'ReviewRequired' END;
   expected_state:=CASE WHEN has_applied THEN 'InTransit' ELSE 'ResolutionPending' END;
   expected_version:=4;
  ELSE
   expected_outcome:=CASE WHEN e.occurred_at=first_event.occurred_at THEN 'Duplicate' ELSE 'ReviewRequired' END;
   IF expected_outcome='ReviewRequired' THEN
    expected_state:='ResolutionPending';
    expected_version:=CASE WHEN has_applied THEN 5 ELSE 4 END;
   END IF;
  END IF;
  IF expected_outcome='ReviewRequired' AND first_review.id IS NULL THEN first_review:=e; END IF;
  IF e.sequence<>n OR n>128 OR e.shipment_id IS DISTINCT FROM s.id OR e.occurred_at<s.registered_at OR e.received_at<prior_time OR e.outcome<>expected_outcome
  THEN RAISE EXCEPTION 'Invalid pickup chronology/outcome' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
    WHERE r.id=e.receipt_id AND r.operation='emitSimulatedPickupEvent' AND r.system_actor IS NULL AND r.actor_id NOT IN(o.buyer_id,o.seller_id)
      AND r.key=e.id AND r.context_id=c.id AND r.result_version=e.sequence AND r.committed_at=e.received_at
      AND r.result->>'entityType'='CarrierEvent' AND r.result->>'entityId'=e.id::text AND r.result->>'shipmentId'=s.id::text
      AND r.result->>'orderId'=oid::text AND r.result->>'contextId'=c.id::text AND r.result->>'state'='Recorded'
      AND (r.result->>'version')::integer=e.sequence AND r.result->>'outcome'=e.outcome
      AND ((r.result->>'orderVersion')::integer=expected_version AND r.result->>'orderState'=expected_state
        OR expected_state='InTransit' AND (r.result->>'orderVersion')::integer=5 AND r.result->>'orderState'='ResolutionPending'
           AND EXISTS(SELECT 1 FROM order_delivery_reviews dr WHERE dr.order_id=oid AND dr.opened_at<=e.received_at))
      AND (r.result->>'serverTime')::timestamptz=e.received_at
      AND a.actor_id=r.actor_id AND a.system_actor IS NULL AND a.context_id=c.id AND a.action=r.operation
      AND a.after->>'eventId'=e.id::text AND a.after->>'shipmentId'=s.id::text AND a.after->>'orderId'=oid::text
      AND (a.after->>'version')::integer=e.sequence AND a.after->>'state'='Recorded' AND a.after->>'outcome'=e.outcome
      AND a.after->>'orderVersion'=r.result->>'orderVersion' AND a.after->>'orderState'=r.result->>'orderState'
      AND ob.type='CarrierPickupRecorded' AND ob.payload->>'entityId'=e.id::text AND ob.payload->>'contextId'=c.id::text
      AND ob.payload->>'orderId'=oid::text AND ob.payload->>'state'='Recorded' AND (ob.payload->>'version')::integer=e.sequence)
  THEN RAISE EXCEPTION 'Pickup receipt/audit/outbox mismatch' USING ERRCODE='23514'; END IF;
  prior_time:=e.received_at;
 END LOOP;
 IF EXISTS(SELECT 1 FROM order_delivery_reviews WHERE order_id=oid) THEN expected_state:='ResolutionPending'; expected_version:=5; END IF;
 IF n>0 AND (o.state<>expected_state OR o.version<>expected_version) OR n=0 AND o.state='InTransit'
    OR has_applied AND EXISTS(SELECT 1 FROM pickup_reviews WHERE order_id=oid)
    OR (cr.id IS NULL) IS DISTINCT FROM (first_review.id IS NULL)
    OR cr.id IS NOT NULL AND (cr.event_id<>first_review.id OR cr.opened_at<>first_review.received_at OR cr.reason<>CASE WHEN has_applied THEN 'ConflictingPickup' ELSE 'LatePickup' END)
    OR o.state='ResolutionPending' AND o.version<>(CASE WHEN has_applied THEN 5 ELSE 4 END)
 THEN RAISE EXCEPTION 'Pickup state/review mismatch' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION latlai_check_order_preparation(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; p order_preparations; review pickup_reviews; c workflow_contexts; BEGIN
 SELECT * INTO STRICT o FROM direct_orders WHERE id=oid;
 SELECT * INTO p FROM order_preparations WHERE order_id=oid;
 SELECT * INTO review FROM pickup_reviews WHERE order_id=oid;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=oid;
 IF o.state NOT IN ('Preparing','InTransit','ResolutionPending') THEN
  IF p.order_id IS NOT NULL OR review.id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected preparation history' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF p.order_id IS NULL OR p.accepted_at<o.paid_at OR p.accepted_at>=o.seller_confirmation_deadline OR
   NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
     WHERE r.id=p.receipt_id AND r.context_id=c.id AND r.operation='acceptOrder' AND r.actor_id=o.seller_id AND r.system_actor IS NULL
     AND r.result_version=3 AND r.committed_at=p.accepted_at AND r.result->>'state'='Preparing'
     AND a.context_id=c.id AND a.actor_id=o.seller_id AND a.action='acceptOrder' AND ob.type='OrderAccepted')
 THEN RAISE EXCEPTION 'Order acceptance receipt/deadline mismatch' USING ERRCODE='23514'; END IF;
 IF (o.state='ResolutionPending') IS DISTINCT FROM (review.id IS NOT NULL OR EXISTS(SELECT 1 FROM carrier_pickup_reviews WHERE order_id=oid) OR EXISTS(SELECT 1 FROM order_delivery_reviews WHERE order_id=oid)) OR
   (review.id IS NOT NULL AND (review.opened_at<p.pickup_deadline OR
    NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
     WHERE r.id=review.receipt_id AND r.context_id=c.id AND r.operation='expireOrderPickup' AND r.system_actor='OrderPickupExpiry' AND r.actor_id IS NULL
     AND r.result_version=4 AND r.committed_at=review.opened_at AND r.result->>'state'='ResolutionPending'
     AND a.context_id=c.id AND a.system_actor='OrderPickupExpiry' AND a.action='expireOrderPickup' AND ob.type='OrderPickupReviewOpened')))
 THEN RAISE EXCEPTION 'Pickup verification task mismatch' USING ERRCODE='23514'; END IF;
 PERFORM latlai_check_order_pickup(oid);
 PERFORM latlai_check_delivery_review(oid);
END $$;


CREATE CONSTRAINT TRIGGER delivery_review_consistency AFTER INSERT ON order_delivery_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_carrier_pickup_constraint();
CREATE CONSTRAINT TRIGGER non_receipt_report_consistency AFTER INSERT ON order_non_receipt_reports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_carrier_pickup_constraint();
SELECT latlai_check_order(id) FROM direct_orders;
COMMIT;
