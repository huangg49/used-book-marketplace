BEGIN;
CREATE TABLE order_preparations (
 order_id uuid PRIMARY KEY REFERENCES direct_orders(id) ON DELETE RESTRICT,
 accepted_at timestamptz(6) NOT NULL, pickup_deadline timestamptz(6) NOT NULL CHECK(pickup_deadline=accepted_at+interval '48 hours'),
 policy_code varchar(40) NOT NULL DEFAULT 'ORDER-PICKUP-v1' CHECK(policy_code='ORDER-PICKUP-v1'),
 receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX order_preparations_pickup_deadline_order_id_idx ON order_preparations(pickup_deadline,order_id);
CREATE TABLE pickup_reviews (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES order_preparations(order_id) ON DELETE RESTRICT,
 opened_at timestamptz(6) NOT NULL, reason varchar(40) NOT NULL DEFAULT 'PickupDeadlineExceeded' CHECK(reason='PickupDeadlineExceeded'),
 receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER preparation_immutable BEFORE UPDATE OR DELETE ON order_preparations FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER pickup_review_immutable BEFORE UPDATE OR DELETE ON pickup_reviews FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
ALTER TABLE direct_orders DROP CONSTRAINT order_shape;
ALTER TABLE direct_orders ADD CONSTRAINT order_shape CHECK(buyer_id<>seller_id AND payment_deadline=created_at+interval '15 minutes' AND (
 (paid_at IS NULL AND seller_confirmation_deadline IS NULL AND cancellation_requested_at IS NULL AND cancellation_reason IS NULL AND (
  (state='AwaitingPayment' AND version=1 AND closed_at IS NULL) OR
  (state='Cancelled' AND version=2 AND closed_at>=created_at AND closed_at<payment_deadline) OR
  (state='PaymentExpired' AND version=2 AND closed_at>=payment_deadline))) OR
 (paid_at IS NOT NULL AND paid_at>=created_at AND paid_at<payment_deadline AND seller_confirmation_deadline IS NOT NULL AND seller_confirmation_deadline=paid_at+interval '48 hours' AND (
  ((state='PendingSellerConfirmation' AND version=2 OR state='Preparing' AND version=3 OR state='ResolutionPending' AND version=4) AND closed_at IS NULL AND cancellation_requested_at IS NULL AND cancellation_reason IS NULL) OR
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
           (OLD.state='PendingSellerConfirmation' AND NEW.state IN ('SettlementPending','Preparing')) OR (OLD.state='Preparing' AND NEW.state='ResolutionPending') OR (OLD.state='SettlementPending' AND NEW.state='Cancelled'))
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


ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_principal;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR
 (context_id IS NOT NULL AND ((system_actor='OrderExpiry' AND operation='expireOrder') OR
 (system_actor='OrderConfirmationExpiry' AND operation='expireSellerConfirmation') OR (system_actor='OrderRefund' AND operation='refundOrder') OR (system_actor='OrderPickupExpiry' AND operation='expireOrderPickup')))));
ALTER TABLE audit_events DROP CONSTRAINT audit_principal;
ALTER TABLE audit_events ADD CONSTRAINT audit_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR
 (context_id IS NOT NULL AND ((system_actor='OrderExpiry' AND action='expireOrder') OR
 (system_actor='OrderConfirmationExpiry' AND action='expireSellerConfirmation') OR (system_actor='OrderRefund' AND action='refundOrder') OR (system_actor='OrderPickupExpiry' AND action='expireOrderPickup')))));


CREATE FUNCTION latlai_check_order_preparation(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; p order_preparations; review pickup_reviews; c workflow_contexts; BEGIN
 SELECT * INTO STRICT o FROM direct_orders WHERE id=oid;
 SELECT * INTO p FROM order_preparations WHERE order_id=oid;
 SELECT * INTO review FROM pickup_reviews WHERE order_id=oid;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=oid;
 IF o.state NOT IN ('Preparing','ResolutionPending') THEN
  IF p.order_id IS NOT NULL OR review.id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected preparation history' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF p.order_id IS NULL OR p.accepted_at<o.paid_at OR p.accepted_at>=o.seller_confirmation_deadline OR
   NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
     WHERE r.id=p.receipt_id AND r.context_id=c.id AND r.operation='acceptOrder' AND r.actor_id=o.seller_id AND r.system_actor IS NULL
     AND r.result_version=3 AND r.committed_at=p.accepted_at AND r.result->>'state'='Preparing'
     AND a.context_id=c.id AND a.actor_id=o.seller_id AND a.action='acceptOrder' AND ob.type='OrderAccepted')
 THEN RAISE EXCEPTION 'Order acceptance receipt/deadline mismatch' USING ERRCODE='23514'; END IF;
 IF (o.state='ResolutionPending') IS DISTINCT FROM (review.id IS NOT NULL) OR
   (review.id IS NOT NULL AND (review.opened_at<p.pickup_deadline OR
    NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
     WHERE r.id=review.receipt_id AND r.context_id=c.id AND r.operation='expireOrderPickup' AND r.system_actor='OrderPickupExpiry' AND r.actor_id IS NULL
     AND r.result_version=4 AND r.committed_at=review.opened_at AND r.result->>'state'='ResolutionPending'
     AND a.context_id=c.id AND a.system_actor='OrderPickupExpiry' AND a.action='expireOrderPickup' AND ob.type='OrderPickupReviewOpened')))
 THEN RAISE EXCEPTION 'Pickup verification task mismatch' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION latlai_check_order(order_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; c workflow_contexts; i workflow_items; a agreement_snapshots; q sale_quotes; e exclusive_commitments;
BEGIN
 SELECT * INTO o FROM direct_orders WHERE id=order_uuid;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO c FROM workflow_contexts WHERE order_id=o.id;
 SELECT * INTO q FROM sale_quotes WHERE id=o.quote_id;
 IF c.id IS NULL OR c.version<>(CASE WHEN o.closed_at IS NULL THEN 1 ELSE 2 END) OR c.ownership_phase<>(CASE WHEN o.closed_at IS NULL THEN 'Holding' ELSE 'Closed' END)
  OR (SELECT count(*) FROM workflow_items WHERE context_id=c.id)<>1
  OR q.buyer_id<>o.buyer_id OR q.seller_id<>o.seller_id OR o.created_at<q.created_at OR o.created_at>=q.expires_at
 THEN RAISE EXCEPTION 'Order/context/quote mismatch' USING ERRCODE='23514'; END IF;
 SELECT * INTO i FROM workflow_items WHERE context_id=c.id;
 SELECT * INTO a FROM agreement_snapshots WHERE context_id=c.id;
 IF a.context_id IS NULL OR i.listing_id<>q.listing_id OR i.listing_revision_id<>q.listing_revision_id OR i.catalog_revision_id<>q.catalog_revision_id
  OR (i.snapshot->>'listingId')::uuid IS DISTINCT FROM i.listing_id
  OR (i.snapshot->>'listingRevisionId')::uuid IS DISTINCT FROM i.listing_revision_id
  OR (i.snapshot->>'catalogRevisionId')::uuid IS DISTINCT FROM i.catalog_revision_id
  OR (a.snapshot->>'buyerId')::uuid IS DISTINCT FROM o.buyer_id OR (a.snapshot->>'sellerId')::uuid IS DISTINCT FROM o.seller_id
  OR (a.snapshot->>'createdAt')::timestamptz IS DISTINCT FROM o.created_at
  OR (a.snapshot->>'paymentDeadline')::timestamptz IS DISTINCT FROM o.payment_deadline
  OR a.snapshot->>'policyVersion' IS DISTINCT FROM q.policy_code
  OR (a.snapshot->'amounts'->>'buyerTotal')::integer IS DISTINCT FROM q.buyer_total
 THEN RAISE EXCEPTION 'Order snapshot mismatch' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM exclusive_commitments WHERE current_context_id=c.id)<>1 THEN RAISE EXCEPTION 'Order must own one commitment' USING ERRCODE='23514'; END IF;
 SELECT * INTO e FROM exclusive_commitments WHERE current_context_id=c.id;
 IF e.listing_id<>i.listing_id OR e.version<>c.version OR e.acquired_at<>o.created_at
  OR (o.closed_at IS NULL AND (e.status<>'Active' OR NOT EXISTS(SELECT 1 FROM listings WHERE id=i.listing_id AND current_revision_id=i.listing_revision_id))) OR (o.closed_at IS NOT NULL AND (e.status<>'Released' OR e.reason<>o.state OR e.ended_at IS DISTINCT FROM o.closed_at))
  OR (SELECT count(*) FROM commitment_events WHERE commitment_id=e.id)<>e.version
 THEN RAISE EXCEPTION 'Order commitment mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM commitment_events ev LEFT JOIN mutation_receipts r ON r.id=ev.receipt_id
    LEFT JOIN audit_events au ON au.receipt_id=r.id LEFT JOIN outbox_events ob ON ob.audit_id=au.id
    WHERE ev.commitment_id=e.id AND (r.id IS NULL OR r.context_id IS DISTINCT FROM c.id OR r.result_version<>(CASE WHEN ev.sequence=1 THEN 1 WHEN o.paid_at IS NULL THEN 2 ELSE 4 END)
       OR au.context_id IS DISTINCT FROM c.id OR ob.id IS NULL
       OR ev.occurred_at IS DISTINCT FROM CASE WHEN ev.sequence=1 THEN e.acquired_at ELSE e.ended_at END))
 THEN RAISE EXCEPTION 'Missing commitment receipt/audit/outbox' USING ERRCODE='23514'; END IF;
 PERFORM latlai_check_order_funding(o.id);
 PERFORM latlai_check_order_preparation(o.id);
END $$;



CREATE FUNCTION latlai_preparation_constraint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM latlai_check_order(NEW.order_id); RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER preparation_consistency AFTER INSERT ON order_preparations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_preparation_constraint();
CREATE CONSTRAINT TRIGGER pickup_review_consistency AFTER INSERT ON pickup_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_preparation_constraint();
SELECT latlai_check_order(id) FROM direct_orders;
COMMIT;
