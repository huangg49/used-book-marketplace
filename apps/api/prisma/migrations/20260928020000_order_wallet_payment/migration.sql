BEGIN;
ALTER TABLE direct_orders ADD COLUMN paid_at timestamptz(6), ADD COLUMN seller_confirmation_deadline timestamptz(6),
 ADD COLUMN cancellation_requested_at timestamptz(6), ADD COLUMN cancellation_reason varchar(40);
ALTER TABLE wallet_accounts ADD COLUMN order_id uuid UNIQUE REFERENCES direct_orders(id) ON DELETE RESTRICT;
ALTER TABLE ledger_journals ADD COLUMN order_id uuid REFERENCES direct_orders(id) ON DELETE RESTRICT,
 ADD COLUMN receipt_id uuid UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX ledger_journals_order_id_type_key ON ledger_journals(order_id,type);
CREATE INDEX direct_orders_state_seller_confirmation_deadline_id_idx ON direct_orders(state,seller_confirmation_deadline,id);

-- Posting sequence, not random UUID/time ties, orders an account's running balance.
-- Only the new field is backfilled; all historical economic fields are unchanged.
CREATE SEQUENCE ledger_journals_sequence_seq;
ALTER TABLE ledger_journals ADD COLUMN sequence bigint;
ALTER TABLE ledger_journals DISABLE TRIGGER ledger_journal_immutable;
WITH ranked AS (SELECT id,row_number() OVER(ORDER BY posted_at,id) n FROM ledger_journals)
 UPDATE ledger_journals j SET sequence=r.n FROM ranked r WHERE r.id=j.id;
ALTER TABLE ledger_journals ENABLE TRIGGER ledger_journal_immutable;
SELECT setval('ledger_journals_sequence_seq',COALESCE((SELECT max(sequence) FROM ledger_journals),0)+1,false);
ALTER TABLE ledger_journals ALTER COLUMN sequence SET NOT NULL, ALTER COLUMN sequence SET DEFAULT nextval('ledger_journals_sequence_seq');
ALTER SEQUENCE ledger_journals_sequence_seq OWNED BY ledger_journals.sequence;
ALTER TABLE ledger_journals ADD CONSTRAINT ledger_journals_sequence_key UNIQUE(sequence);

-- Exhaustive replacement of the shape checks, limited to these three expanded rows.
DO $$ DECLARE r record; BEGIN FOR r IN SELECT conrelid::regclass t,conname FROM pg_constraint
 WHERE contype='c' AND conrelid IN ('direct_orders'::regclass,'wallet_accounts'::regclass,'ledger_journals'::regclass)
 LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.t,r.conname); END LOOP; END $$;
ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_account_shape CHECK(currency='VND' AND (
 (purpose='UserAvailable' AND owner_id IS NOT NULL AND order_id IS NULL) OR
 (purpose='OrderHold' AND owner_id IS NULL AND order_id IS NOT NULL) OR
 (owner_id IS NULL AND order_id IS NULL AND ((purpose='SimulatorCapital' AND id='00000000-0000-4000-8000-000000000001') OR
 (purpose='SimulatorClearing' AND id='00000000-0000-4000-8000-000000000002')))));
ALTER TABLE ledger_journals ADD CONSTRAINT journal_shape CHECK(
 (type='OpeningCapital' AND topup_id IS NULL AND event_id IS NULL AND order_id IS NULL AND receipt_id IS NULL AND id='00000000-0000-4000-8000-000000000003') OR
 (type='Topup' AND topup_id IS NOT NULL AND event_id IS NOT NULL AND order_id IS NULL AND receipt_id IS NULL) OR
 (type IN ('OrderPayment','OrderRefund') AND topup_id IS NULL AND event_id IS NULL AND order_id IS NOT NULL AND receipt_id IS NOT NULL));
ALTER TABLE direct_orders ADD CONSTRAINT order_shape CHECK(buyer_id<>seller_id AND payment_deadline=created_at+interval '15 minutes' AND (
 (paid_at IS NULL AND seller_confirmation_deadline IS NULL AND cancellation_requested_at IS NULL AND cancellation_reason IS NULL AND (
  (state='AwaitingPayment' AND version=1 AND closed_at IS NULL) OR
  (state='Cancelled' AND version=2 AND closed_at>=created_at AND closed_at<payment_deadline) OR
  (state='PaymentExpired' AND version=2 AND closed_at>=payment_deadline))) OR
 (paid_at IS NOT NULL AND paid_at>=created_at AND paid_at<payment_deadline AND seller_confirmation_deadline IS NOT NULL AND seller_confirmation_deadline=paid_at+interval '48 hours' AND (
  (state='PendingSellerConfirmation' AND version=2 AND closed_at IS NULL AND cancellation_requested_at IS NULL AND cancellation_reason IS NULL) OR
  (state IN ('SettlementPending','Cancelled') AND cancellation_requested_at IS NOT NULL AND cancellation_requested_at>=paid_at AND cancellation_reason IS NOT NULL
   AND ((cancellation_reason IN ('BuyerCancelled','SellerRejected') AND cancellation_requested_at<seller_confirmation_deadline) OR
        (cancellation_reason='SellerConfirmationExpired' AND cancellation_requested_at>=seller_confirmation_deadline))
   AND ((state='SettlementPending' AND version=3 AND closed_at IS NULL) OR (state='Cancelled' AND version=4 AND closed_at IS NOT NULL AND closed_at>=cancellation_requested_at)))))));
-- CHECK accepts NULL: terminal closure must also be explicitly non-null.
ALTER TABLE direct_orders ADD CONSTRAINT order_terminal_time CHECK((state IN ('Cancelled','PaymentExpired'))=(closed_at IS NOT NULL));
ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_principal;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR
 (context_id IS NOT NULL AND ((system_actor='OrderExpiry' AND operation='expireOrder') OR
 (system_actor='OrderConfirmationExpiry' AND operation='expireSellerConfirmation') OR (system_actor='OrderRefund' AND operation='refundOrder')))));
ALTER TABLE audit_events DROP CONSTRAINT audit_principal;
ALTER TABLE audit_events ADD CONSTRAINT audit_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR
 (context_id IS NOT NULL AND ((system_actor='OrderExpiry' AND action='expireOrder') OR
 (system_actor='OrderConfirmationExpiry' AND action='expireSellerConfirmation') OR (system_actor='OrderRefund' AND action='refundOrder')))));

CREATE OR REPLACE FUNCTION latlai_guard_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='direct_orders' THEN
  IF (to_jsonb(NEW)-ARRAY['version','state','closed_at','paid_at','seller_confirmation_deadline','cancellation_requested_at','cancellation_reason']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['version','state','closed_at','paid_at','seller_confirmation_deadline','cancellation_requested_at','cancellation_reason'])
   OR NEW.version<>OLD.version+1
   OR NOT ((OLD.state='AwaitingPayment' AND NEW.state IN ('Cancelled','PaymentExpired','PendingSellerConfirmation')) OR
           (OLD.state='PendingSellerConfirmation' AND NEW.state='SettlementPending') OR (OLD.state='SettlementPending' AND NEW.state='Cancelled'))
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

CREATE FUNCTION latlai_check_order_funding(oid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; q sale_quotes; c workflow_contexts; p ledger_journals; f ledger_journals; hold wallet_accounts; reason_op text; reason_actor uuid; BEGIN
 SELECT * INTO STRICT o FROM direct_orders WHERE id=oid;
 SELECT * INTO STRICT q FROM sale_quotes WHERE id=o.quote_id;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=o.id;
 SELECT * INTO p FROM ledger_journals WHERE order_id=o.id AND type='OrderPayment';
 SELECT * INTO f FROM ledger_journals WHERE order_id=o.id AND type='OrderRefund';
 SELECT * INTO hold FROM wallet_accounts WHERE order_id=o.id;
 IF o.paid_at IS NULL THEN
  IF p.id IS NOT NULL OR f.id IS NOT NULL OR hold.id IS NOT NULL THEN RAISE EXCEPTION 'Unpaid order cannot own funds' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 IF p.id IS NULL OR hold.id IS NULL OR hold.purpose<>'OrderHold' OR p.posted_at<>o.paid_at
  OR ((o.state='Cancelled') IS DISTINCT FROM (f.id IS NOT NULL)) OR (f.id IS NOT NULL AND f.posted_at IS DISTINCT FROM o.closed_at)
  OR (SELECT COALESCE(sum(debit-credit),0) FROM ledger_entries WHERE account_id=hold.id)<>(CASE WHEN o.state='Cancelled' THEN 0 ELSE q.buyer_total END)
 THEN RAISE EXCEPTION 'Order funding/hold projection mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM ledger_journals j LEFT JOIN mutation_receipts r ON r.id=j.receipt_id
  LEFT JOIN audit_events a ON a.receipt_id=r.id LEFT JOIN outbox_events ob ON ob.audit_id=a.id WHERE j.order_id=o.id AND
  (r.id IS NULL OR r.context_id IS DISTINCT FROM c.id OR a.context_id IS DISTINCT FROM c.id OR ob.id IS NULL OR r.committed_at IS DISTINCT FROM j.posted_at OR
   (j.type='OrderPayment' AND (r.operation<>'payOrder' OR r.actor_id IS DISTINCT FROM o.buyer_id OR r.result_version<>2)) OR
   (j.type='OrderRefund' AND (r.operation<>'refundOrder' OR r.system_actor IS DISTINCT FROM 'OrderRefund' OR r.result_version<>4))))
 THEN RAISE EXCEPTION 'Order journal receipt mismatch' USING ERRCODE='23514'; END IF;
 IF o.cancellation_requested_at IS NOT NULL THEN
  reason_op:=CASE o.cancellation_reason WHEN 'BuyerCancelled' THEN 'cancelPaidOrder' WHEN 'SellerRejected' THEN 'rejectPaidOrder' ELSE 'expireSellerConfirmation' END;
  reason_actor:=CASE o.cancellation_reason WHEN 'BuyerCancelled' THEN o.buyer_id WHEN 'SellerRejected' THEN o.seller_id ELSE NULL END;
  IF NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
   WHERE r.context_id=c.id AND a.context_id=c.id AND r.operation=reason_op AND r.actor_id IS NOT DISTINCT FROM reason_actor AND r.result_version=3 AND r.committed_at=o.cancellation_requested_at
    AND (reason_actor IS NOT NULL OR r.system_actor='OrderConfirmationExpiry'))
  THEN RAISE EXCEPTION 'Missing authorized refund decision' USING ERRCODE='23514'; END IF;
 END IF;
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
END $$;


-- Keep reviewed opening/topup rules intact, explicitly dispatch only new types.
CREATE FUNCTION latlai_check_funding_journal_v1(jid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j ledger_journals; t topup_intents; e simulated_payment_events; BEGIN
 SELECT * INTO STRICT j FROM ledger_journals WHERE id=jid;
 IF (SELECT count(*) FROM ledger_entries WHERE journal_id=jid)<>2 OR
    (SELECT COALESCE(sum(debit-credit),0) FROM ledger_entries WHERE journal_id=jid)<>0 THEN
  RAISE EXCEPTION 'Journal must have two balanced entries' USING ERRCODE='23514'; END IF;
 IF j.type='OpeningCapital' THEN
  IF NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=jid AND account_id='00000000-0000-4000-8000-000000000001' AND credit=100000000)
  OR NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=jid AND account_id='00000000-0000-4000-8000-000000000002' AND debit=100000000) THEN
   RAISE EXCEPTION 'Invalid finite simulator capital' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT t FROM topup_intents WHERE id=j.topup_id;
  SELECT * INTO STRICT e FROM simulated_payment_events WHERE id=j.event_id;
  IF t.state NOT IN ('Succeeded','ReviewRequired') OR e.intent_id<>t.id OR e.recipient_id<>t.owner_id
    OR e.amount<>t.amount OR e.currency<>t.currency OR e.outcome<>'Succeeded' OR e.disposition<>'Applied'
    OR e.received_at<>j.posted_at
    OR NOT EXISTS(SELECT 1 FROM ledger_entries le JOIN wallet_accounts a ON a.id=le.account_id
       WHERE le.journal_id=jid AND a.owner_id=t.owner_id AND a.purpose='UserAvailable' AND le.debit=t.amount)
    OR NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=jid AND account_id='00000000-0000-4000-8000-000000000002' AND credit=t.amount)
  THEN RAISE EXCEPTION 'Topup journal source mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM wallet_accounts a JOIN ledger_entries le ON le.account_id=a.id
   WHERE a.id IN (SELECT account_id FROM ledger_entries WHERE journal_id=jid) AND a.purpose<>'SimulatorCapital'
   GROUP BY a.id HAVING sum(le.debit-le.credit)<0) THEN
  RAISE EXCEPTION 'Wallet balance cannot be negative' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION latlai_check_journal(jid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j ledger_journals; o direct_orders; q sale_quotes; BEGIN
 SELECT * INTO STRICT j FROM ledger_journals WHERE id=jid;
 IF j.type IN ('OpeningCapital','Topup') THEN PERFORM latlai_check_funding_journal_v1(jid); RETURN; END IF;
 SELECT * INTO STRICT o FROM direct_orders WHERE id=j.order_id;
 SELECT * INTO STRICT q FROM sale_quotes WHERE id=o.quote_id;
 IF (SELECT count(*) FROM ledger_entries WHERE journal_id=jid)<>2 OR
    (SELECT COALESCE(sum(debit-credit),0) FROM ledger_entries WHERE journal_id=jid)<>0 OR
    NOT EXISTS(SELECT 1 FROM ledger_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=jid AND a.owner_id=o.buyer_id AND a.purpose='UserAvailable'
      AND (CASE WHEN j.type='OrderPayment' THEN e.credit ELSE e.debit END)=q.buyer_total) OR
    NOT EXISTS(SELECT 1 FROM ledger_entries e JOIN wallet_accounts a ON a.id=e.account_id WHERE e.journal_id=jid AND a.order_id=o.id AND a.purpose='OrderHold'
      AND (CASE WHEN j.type='OrderPayment' THEN e.debit ELSE e.credit END)=q.buyer_total)
 THEN RAISE EXCEPTION 'Order journal source mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM ledger_entries WHERE account_id IN (SELECT account_id FROM ledger_entries WHERE journal_id=jid)
   GROUP BY account_id HAVING sum(debit-credit)<0) THEN RAISE EXCEPTION 'Wallet balance cannot be negative' USING ERRCODE='23514'; END IF;
 PERFORM latlai_check_order_funding(o.id);
END $$;
CREATE FUNCTION latlai_hold_account_constraint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.order_id IS NOT NULL THEN PERFORM latlai_check_order_funding(NEW.order_id); END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER hold_account_consistency AFTER INSERT ON wallet_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_hold_account_constraint();
SELECT latlai_check_order(id) FROM direct_orders;
SELECT latlai_check_journal(id) FROM ledger_journals;
COMMIT;
