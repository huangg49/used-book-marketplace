BEGIN;
CREATE TABLE carrier_pickup_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL, shipment_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 128),
 occurred_at timestamptz(6) NOT NULL, received_at timestamptz(6) NOT NULL CHECK(occurred_at<=received_at),
 outcome varchar(24) NOT NULL CHECK(outcome IN ('Applied','Duplicate','ReviewRequired')),
 delivery_deadline timestamptz(6), policy_code varchar(40) NOT NULL DEFAULT 'CARRIER-PICKUP-v1' CHECK(policy_code='CARRIER-PICKUP-v1'),
 CHECK((outcome='Applied' AND delivery_deadline IS NOT NULL AND delivery_deadline=occurred_at+interval '240 hours') OR (outcome<>'Applied' AND delivery_deadline IS NULL)),
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 signature char(64) NOT NULL CHECK(signature ~ '^[a-f0-9]{64}$'),
 receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(order_id,shipment_id) REFERENCES direct_shipments(order_id,id) ON DELETE RESTRICT,
 UNIQUE(shipment_id,sequence), CONSTRAINT pickup_event_order_identity UNIQUE(order_id,id)
);
CREATE UNIQUE INDEX pickup_one_applied ON carrier_pickup_events(shipment_id) WHERE outcome='Applied';
CREATE TABLE carrier_pickup_reviews (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES order_preparations(order_id) ON DELETE RESTRICT,
 event_id uuid NOT NULL UNIQUE, opened_at timestamptz(6) NOT NULL,
 reason varchar(24) NOT NULL CHECK(reason IN ('LatePickup','ConflictingPickup')),
 FOREIGN KEY(order_id,event_id) REFERENCES carrier_pickup_events(order_id,id) ON DELETE RESTRICT,
 UNIQUE(order_id,event_id)
);
CREATE TRIGGER carrier_event_immutable BEFORE UPDATE OR DELETE ON carrier_pickup_events FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER carrier_review_immutable BEFORE UPDATE OR DELETE ON carrier_pickup_reviews FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
ALTER TABLE direct_orders DROP CONSTRAINT order_shape;
ALTER TABLE direct_orders ADD CONSTRAINT order_shape CHECK(buyer_id<>seller_id AND payment_deadline=created_at+interval '15 minutes' AND (
 (paid_at IS NULL AND seller_confirmation_deadline IS NULL AND cancellation_requested_at IS NULL AND cancellation_reason IS NULL AND (
  (state='AwaitingPayment' AND version=1 AND closed_at IS NULL) OR
  (state='Cancelled' AND version=2 AND closed_at>=created_at AND closed_at<payment_deadline) OR
  (state='PaymentExpired' AND version=2 AND closed_at>=payment_deadline))) OR
 (paid_at IS NOT NULL AND paid_at>=created_at AND paid_at<payment_deadline AND seller_confirmation_deadline IS NOT NULL AND seller_confirmation_deadline=paid_at+interval '48 hours' AND (
  ((state='PendingSellerConfirmation' AND version=2 OR state='Preparing' AND version=3 OR state='InTransit' AND version=4 OR state='ResolutionPending' AND version IN (4,5)) AND closed_at IS NULL AND cancellation_requested_at IS NULL AND cancellation_reason IS NULL) OR
  (state IN ('SettlementPending','Cancelled') AND cancellation_requested_at IS NOT NULL AND cancellation_requested_at>=paid_at AND cancellation_reason IS NOT NULL
   AND ((cancellation_reason IN ('BuyerCancelled','SellerRejected') AND cancellation_requested_at<seller_confirmation_deadline) OR
        (cancellation_reason='SellerConfirmationExpired' AND cancellation_requested_at>=seller_confirmation_deadline))
   AND ((state='SettlementPending' AND version=3 AND closed_at IS NULL) OR (state='Cancelled' AND version=4 AND closed_at IS NOT NULL AND closed_at>=cancellation_requested_at)))))));


CREATE OR REPLACE FUNCTION latlai_guard_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='direct_orders' THEN
  IF (to_jsonb(NEW)-ARRAY['version','state','closed_at','paid_at','seller_confirmation_deadline','cancellation_requested_at','cancellation_reason']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['version','state','closed_at','paid_at','seller_confirmation_deadline','cancellation_requested_at','cancellation_reason'])
   OR NEW.version<>OLD.version+1
   OR NOT ((OLD.state='AwaitingPayment' AND NEW.state IN ('Cancelled','PaymentExpired','PendingSellerConfirmation')) OR
           (OLD.state='PendingSellerConfirmation' AND NEW.state IN ('SettlementPending','Preparing')) OR (OLD.state='Preparing' AND NEW.state IN ('InTransit','ResolutionPending')) OR (OLD.state='InTransit' AND NEW.state='ResolutionPending') OR (OLD.state='SettlementPending' AND NEW.state='Cancelled'))
   OR (OLD.paid_at IS NOT NULL AND ROW(NEW.paid_at,NEW.seller_confirmation_deadline) IS DISTINCT FROM ROW(OLD.paid_at,OLD.seller_confirmation_deadline))
   OR (OLD.cancellation_requested_at IS NOT NULL AND ROW(NEW.cancellation_requested_at,NEW.cancellation_reason) IS DISTINCT FROM ROW(OLD.cancellation_requested_at,OLD.cancellation_reason))
  THEN RAISE EXCEPTION 'Invalid funded order transition' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='workflow_contexts' THEN
  IF (to_jsonb(NEW)-ARRAY['version','ownership_phase']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','ownership_phase'])
   OR OLD.ownership_phase<>'Holding' OR NEW.ownership_phase<>'Closed' OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'Invalid context transition' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['version','status','ended_at','reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','ended_at','reason'])
   OR OLD.status<>'Active' OR NEW.status<>'Released' OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'Invalid commitment transition' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;



CREATE FUNCTION latlai_check_order_pickup(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
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
      AND (r.result->>'orderVersion')::integer=expected_version AND r.result->>'orderState'=expected_state
      AND (r.result->>'serverTime')::timestamptz=e.received_at
      AND a.actor_id=r.actor_id AND a.system_actor IS NULL AND a.context_id=c.id AND a.action=r.operation
      AND a.after->>'eventId'=e.id::text AND a.after->>'shipmentId'=s.id::text AND a.after->>'orderId'=oid::text
      AND (a.after->>'version')::integer=e.sequence AND a.after->>'state'='Recorded' AND a.after->>'outcome'=e.outcome
      AND (a.after->>'orderVersion')::integer=expected_version AND a.after->>'orderState'=expected_state
      AND ob.type='CarrierPickupRecorded' AND ob.payload->>'entityId'=e.id::text AND ob.payload->>'contextId'=c.id::text
      AND ob.payload->>'orderId'=oid::text AND ob.payload->>'state'='Recorded' AND (ob.payload->>'version')::integer=e.sequence)
  THEN RAISE EXCEPTION 'Pickup receipt/audit/outbox mismatch' USING ERRCODE='23514'; END IF;
  prior_time:=e.received_at;
 END LOOP;
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
 IF (o.state='ResolutionPending') IS DISTINCT FROM (review.id IS NOT NULL OR EXISTS(SELECT 1 FROM carrier_pickup_reviews WHERE order_id=oid)) OR
   (review.id IS NOT NULL AND (review.opened_at<p.pickup_deadline OR
    NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
     WHERE r.id=review.receipt_id AND r.context_id=c.id AND r.operation='expireOrderPickup' AND r.system_actor='OrderPickupExpiry' AND r.actor_id IS NULL
     AND r.result_version=4 AND r.committed_at=review.opened_at AND r.result->>'state'='ResolutionPending'
     AND a.context_id=c.id AND a.system_actor='OrderPickupExpiry' AND a.action='expireOrderPickup' AND ob.type='OrderPickupReviewOpened')))
 THEN RAISE EXCEPTION 'Pickup verification task mismatch' USING ERRCODE='23514'; END IF;
 PERFORM latlai_check_order_pickup(oid);
END $$;

CREATE FUNCTION latlai_carrier_pickup_constraint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM latlai_check_order(NEW.order_id); RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER carrier_pickup_consistency AFTER INSERT ON carrier_pickup_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_carrier_pickup_constraint();
CREATE CONSTRAINT TRIGGER carrier_review_consistency AFTER INSERT ON carrier_pickup_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_carrier_pickup_constraint();
SELECT latlai_check_order(id) FROM direct_orders;
COMMIT;
