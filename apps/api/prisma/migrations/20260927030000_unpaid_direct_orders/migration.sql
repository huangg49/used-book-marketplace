-- Fail closed on legacy placeholders: never infer ownership or silently release them.
DO $$ DECLARE ids text; BEGIN
 SELECT string_agg(id::text, ', ') INTO ids FROM (SELECT id FROM listings WHERE trade='Reserved' ORDER BY id LIMIT 20) t;
 IF ids IS NOT NULL THEN RAISE EXCEPTION 'Legacy Reserved listings require reconciliation before migration: %',ids; END IF;
END $$;

CREATE TABLE direct_orders (
 id uuid PRIMARY KEY, buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT CHECK(seller_id<>buyer_id),
 quote_id uuid NOT NULL UNIQUE REFERENCES sale_quotes(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1,
 state varchar(40) NOT NULL CHECK(state IN ('AwaitingPayment','Cancelled','PaymentExpired')),
 created_at timestamptz(6) NOT NULL, payment_deadline timestamptz(6) NOT NULL CHECK(payment_deadline=created_at+interval '15 minutes'),
 closed_at timestamptz(6),
 CHECK((state='AwaitingPayment' AND version=1 AND closed_at IS NULL) OR
       (state IN ('Cancelled','PaymentExpired') AND version=2 AND closed_at IS NOT NULL AND closed_at>=created_at)),
 CHECK(state<>'PaymentExpired' OR closed_at>=payment_deadline),
 CHECK(state<>'Cancelled' OR closed_at<payment_deadline)
);
CREATE INDEX direct_orders_buyer_id_state_idx ON direct_orders(buyer_id,state);
CREATE INDEX direct_orders_state_payment_deadline_id_idx ON direct_orders(state,payment_deadline,id);
CREATE TABLE workflow_contexts (
 id uuid PRIMARY KEY, kind varchar(40) NOT NULL CHECK(kind='Order'),
 order_id uuid NOT NULL UNIQUE REFERENCES direct_orders(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1 CHECK(version IN (1,2)),
 ownership_phase varchar(40) NOT NULL CHECK(ownership_phase IN ('Holding','Closed'))
);
CREATE TABLE workflow_items (
 context_id uuid NOT NULL REFERENCES workflow_contexts(id) ON DELETE RESTRICT,
 listing_id uuid NOT NULL, listing_revision_id uuid NOT NULL,
 FOREIGN KEY(listing_id,listing_revision_id) REFERENCES listing_revisions(listing_id,id) ON DELETE RESTRICT,
 catalog_revision_id uuid NOT NULL REFERENCES catalog_revisions(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 PRIMARY KEY(context_id,listing_id)
);
CREATE TABLE agreement_snapshots (
 context_id uuid PRIMARY KEY REFERENCES workflow_contexts(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='1')
);
CREATE TABLE exclusive_commitments (
 id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
 current_context_id uuid NOT NULL,
 FOREIGN KEY(current_context_id,listing_id) REFERENCES workflow_items(context_id,listing_id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1,
 status varchar(40) NOT NULL CHECK(status IN ('Active','Released')),
 acquired_at timestamptz(6) NOT NULL, ended_at timestamptz(6), reason varchar(40),
 CHECK((status='Active' AND version=1 AND ended_at IS NULL AND reason IS NULL) OR
       (status='Released' AND version=2 AND ended_at IS NOT NULL AND reason IS NOT NULL AND ended_at>=acquired_at AND reason IN ('Cancelled','PaymentExpired')))
);
CREATE UNIQUE INDEX commitment_one_active_listing ON exclusive_commitments(listing_id) WHERE status='Active';
CREATE INDEX exclusive_commitments_current_context_id_listing_id_idx ON exclusive_commitments(current_context_id,listing_id);
ALTER TABLE mutation_receipts ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE mutation_receipts ADD COLUMN system_actor varchar(40), ADD COLUMN context_id uuid REFERENCES workflow_contexts(id) ON DELETE RESTRICT,
 ADD CONSTRAINT receipt_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR (system_actor='OrderExpiry' AND operation='expireOrder' AND context_id IS NOT NULL)));
ALTER TABLE audit_events ADD COLUMN system_actor varchar(40), ADD COLUMN context_id uuid REFERENCES workflow_contexts(id) ON DELETE RESTRICT,
 ADD CONSTRAINT audit_principal CHECK(num_nonnulls(actor_id,system_actor)=1 AND (system_actor IS NULL OR (system_actor='OrderExpiry' AND action='expireOrder' AND context_id IS NOT NULL)));
CREATE UNIQUE INDEX mutation_receipts_system_actor_operation_key_key ON mutation_receipts(system_actor,operation,key);
ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_one_target;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id,quote_id,context_id)=1);
ALTER TABLE audit_events DROP CONSTRAINT audit_one_target;
ALTER TABLE audit_events ADD CONSTRAINT audit_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id,quote_id,context_id)=1);
CREATE TABLE commitment_events (
 id uuid PRIMARY KEY, commitment_id uuid NOT NULL REFERENCES exclusive_commitments(id) ON DELETE RESTRICT,
 sequence integer NOT NULL CHECK(sequence IN (1,2)), kind varchar(40) NOT NULL CHECK(kind IN ('Acquired','Released')),
 before_version integer NOT NULL, after_version integer NOT NULL,
 receipt_id uuid NOT NULL REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED,
 occurred_at timestamptz(6) NOT NULL,
 UNIQUE(commitment_id,sequence),
 CHECK((kind='Acquired' AND sequence=1 AND before_version=0 AND after_version=1) OR
       (kind='Released' AND sequence=2 AND before_version=1 AND after_version=2))
);
CREATE TRIGGER immutable_workflow_item BEFORE UPDATE OR DELETE ON workflow_items FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER immutable_agreement BEFORE UPDATE OR DELETE ON agreement_snapshots FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER immutable_commitment_event BEFORE UPDATE OR DELETE ON commitment_events FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER no_order_delete BEFORE DELETE ON direct_orders FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER no_context_delete BEFORE DELETE ON workflow_contexts FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER no_commitment_delete BEFORE DELETE ON exclusive_commitments FOR EACH ROW EXECUTE FUNCTION latlai_append_only();

CREATE FUNCTION latlai_guard_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='direct_orders' THEN
  IF (to_jsonb(NEW)-ARRAY['version','state','closed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','closed_at'])
   OR OLD.state<>'AwaitingPayment' OR NEW.state NOT IN ('Cancelled','PaymentExpired') OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'Invalid unpaid order transition' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='workflow_contexts' THEN
  IF (to_jsonb(NEW)-ARRAY['version','ownership_phase']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','ownership_phase'])
   OR OLD.ownership_phase<>'Holding' OR NEW.ownership_phase<>'Closed' OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'Invalid context transition' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['version','status','ended_at','reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','status','ended_at','reason'])
   OR OLD.status<>'Active' OR NEW.status<>'Released' OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'Invalid commitment transition' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_order_transition BEFORE UPDATE ON direct_orders FOR EACH ROW EXECUTE FUNCTION latlai_guard_order_transition();
CREATE TRIGGER guard_context_transition BEFORE UPDATE ON workflow_contexts FOR EACH ROW EXECUTE FUNCTION latlai_guard_order_transition();
CREATE TRIGGER guard_commitment_transition BEFORE UPDATE ON exclusive_commitments FOR EACH ROW EXECUTE FUNCTION latlai_guard_order_transition();

-- Every affected aggregate is checked at COMMIT; user/listing locks remain mandatory for writers.
CREATE FUNCTION latlai_check_order(order_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o direct_orders; c workflow_contexts; i workflow_items; a agreement_snapshots; q sale_quotes; e exclusive_commitments;
BEGIN
 SELECT * INTO o FROM direct_orders WHERE id=order_uuid;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO c FROM workflow_contexts WHERE order_id=o.id;
 SELECT * INTO q FROM sale_quotes WHERE id=o.quote_id;
 IF c.id IS NULL OR c.version<>o.version OR c.ownership_phase<>(CASE WHEN o.state='AwaitingPayment' THEN 'Holding' ELSE 'Closed' END)
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
 IF e.listing_id<>i.listing_id OR e.version<>o.version OR e.acquired_at<>o.created_at
  OR (o.state='AwaitingPayment' AND (e.status<>'Active' OR NOT EXISTS(SELECT 1 FROM listings WHERE id=i.listing_id AND current_revision_id=i.listing_revision_id))) OR (o.state<>'AwaitingPayment' AND (e.status<>'Released' OR e.reason<>o.state OR e.ended_at IS DISTINCT FROM o.closed_at))
  OR (SELECT count(*) FROM commitment_events WHERE commitment_id=e.id)<>e.version
 THEN RAISE EXCEPTION 'Order commitment mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM commitment_events ev LEFT JOIN mutation_receipts r ON r.id=ev.receipt_id
    LEFT JOIN audit_events au ON au.receipt_id=r.id LEFT JOIN outbox_events ob ON ob.audit_id=au.id
    WHERE ev.commitment_id=e.id AND (r.id IS NULL OR r.context_id IS DISTINCT FROM c.id OR r.result_version<>ev.after_version
       OR au.context_id IS DISTINCT FROM c.id OR ob.id IS NULL
       OR ev.occurred_at IS DISTINCT FROM CASE WHEN ev.sequence=1 THEN e.acquired_at ELSE e.ended_at END))
 THEN RAISE EXCEPTION 'Missing commitment receipt/audit/outbox' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION latlai_check_commitment_projection(listing_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE l listings; BEGIN
 SELECT * INTO l FROM listings WHERE id=listing_uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF (l.trade='Reserved') IS DISTINCT FROM EXISTS(SELECT 1 FROM exclusive_commitments WHERE listing_id=l.id AND status='Active')
 THEN RAISE EXCEPTION 'Listing/commitment projection mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM exclusive_commitments e JOIN workflow_items i ON i.context_id=e.current_context_id AND i.listing_id=e.listing_id
           WHERE e.listing_id=l.id AND e.status='Active' AND i.listing_revision_id IS DISTINCT FROM l.current_revision_id)
 THEN RAISE EXCEPTION 'Reserved listing revision cannot change' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION latlai_check_order_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_uuid uuid; listing_uuid uuid; BEGIN
 IF TG_TABLE_NAME='listings' THEN
  PERFORM latlai_check_commitment_projection(NEW.id); RETURN NEW;
 ELSIF TG_TABLE_NAME='direct_orders' THEN order_uuid:=NEW.id;
 ELSIF TG_TABLE_NAME='workflow_contexts' THEN order_uuid:=NEW.order_id;
 ELSIF TG_TABLE_NAME='exclusive_commitments' THEN
  SELECT order_id INTO order_uuid FROM workflow_contexts WHERE id=NEW.current_context_id;
  PERFORM latlai_check_commitment_projection(NEW.listing_id);
 ELSIF TG_TABLE_NAME='commitment_events' THEN
  SELECT c.order_id INTO order_uuid FROM exclusive_commitments e JOIN workflow_contexts c ON c.id=e.current_context_id WHERE e.id=NEW.commitment_id;
 ELSE SELECT order_id INTO order_uuid FROM workflow_contexts WHERE id=NEW.context_id;
 END IF;
 PERFORM latlai_check_order(order_uuid); RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER check_order_commit AFTER INSERT OR UPDATE ON direct_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();
CREATE CONSTRAINT TRIGGER check_context_commit AFTER INSERT OR UPDATE ON workflow_contexts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();
CREATE CONSTRAINT TRIGGER check_item_commit AFTER INSERT ON workflow_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();
CREATE CONSTRAINT TRIGGER check_agreement_commit AFTER INSERT ON agreement_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();
CREATE CONSTRAINT TRIGGER check_commitment_commit AFTER INSERT OR UPDATE ON exclusive_commitments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();
CREATE CONSTRAINT TRIGGER check_commitment_event_commit AFTER INSERT ON commitment_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();
CREATE CONSTRAINT TRIGGER check_reserved_commit AFTER INSERT OR UPDATE ON listings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_order_trigger();

-- Validate the complete server-built snapshots once, against the sources being
-- locked at creation. Subsequent address edits must not invalidate history.
CREATE FUNCTION latlai_guard_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q sale_quotes; r listing_revisions; b catalog_revisions; origin member_addresses; destination member_addresses;
 expected jsonb; BEGIN
 SELECT sq.* INTO q FROM workflow_contexts c JOIN direct_orders o ON o.id=c.order_id JOIN sale_quotes sq ON sq.id=o.quote_id WHERE c.id=NEW.context_id;
 IF q.id IS NULL THEN RAISE EXCEPTION 'Snapshot needs a typed Order' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='workflow_items' THEN
  SELECT * INTO r FROM listing_revisions WHERE id=q.listing_revision_id;
  SELECT * INTO b FROM catalog_revisions WHERE id=q.catalog_revision_id;
  expected:=jsonb_build_object('listingId',q.listing_id,'listingRevisionId',r.id,'catalogRevisionId',b.id,
   'metadata',jsonb_build_object('title',b.title,'authors',b.authors,'publisher',b.publisher,'publicationYear',b.publication_year,'language',b.language,'edition',b.edition,'category',b.category,'isbn',b.isbn),
   'condition',r.condition,'pages',r.pages,'coverNote',r.cover_note,'notes',r.notes,'accessories',r.accessories,'readable',r.readable,
   'hasMissingPages',r.has_missing_pages,'missingEssentialContent',r.missing_essential_content,'description',r.description,
   'mediaIds',(SELECT jsonb_agg(media_id ORDER BY position) FROM revision_media WHERE revision_id=r.id));
  IF NEW.snapshot IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Item snapshot must match pinned sources' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO origin FROM member_addresses WHERE id=q.origin_address_id;
  SELECT * INTO destination FROM member_addresses WHERE id=q.destination_address_id;
  IF origin.version IS DISTINCT FROM q.origin_address_version OR destination.version IS DISTINCT FROM q.destination_address_version
  THEN RAISE EXCEPTION 'Order contact source changed' USING ERRCODE='23514'; END IF;
  expected:=jsonb_build_object('schemaVersion',1,'policyVersion',q.policy_code,'method','DirectDelivery','demoOnly',true,'currency','VND','buyerId',q.buyer_id,'sellerId',q.seller_id,
   'origin',jsonb_build_object('recipientName',origin.recipient_name,'phone',origin.phone,'serviceAreaCode',origin.service_area_code,'localityCode',origin.locality_code,'detail',origin.detail),
   'destination',jsonb_build_object('recipientName',destination.recipient_name,'phone',destination.phone,'serviceAreaCode',destination.service_area_code,'localityCode',destination.locality_code,'detail',destination.detail),
   'amounts',jsonb_build_object('bookPrice',q.book_price,'shippingFee',q.shipping_fee,'buyerTotal',q.buyer_total,'commissionBps',q.commission_bps,'commission',q.commission,'sellerProceedsOnCompletion',q.seller_proceeds));
  IF (NEW.snapshot-ARRAY['createdAt','paymentDeadline']) IS DISTINCT FROM expected
  THEN RAISE EXCEPTION 'Agreement snapshot must match pinned sources' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_item_snapshot BEFORE INSERT ON workflow_items FOR EACH ROW EXECUTE FUNCTION latlai_guard_order_snapshot();
CREATE TRIGGER guard_agreement_snapshot BEFORE INSERT ON agreement_snapshots FOR EACH ROW EXECUTE FUNCTION latlai_guard_order_snapshot();
