BEGIN;
ALTER TABLE order_packaging_evidence ADD CONSTRAINT packaging_order_id_identity UNIQUE(order_id,id);
CREATE TABLE direct_shipments (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL UNIQUE REFERENCES order_preparations(order_id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1 CHECK(version=1),
 state varchar(24) NOT NULL DEFAULT 'LabelCreated' CHECK(state='LabelCreated'),
 carrier varchar(40) NOT NULL CHECK(carrier='LatLaiSimulator'),
 tracking_code varchar(35) NOT NULL CHECK(tracking_code ~ '^LL-[A-Z0-9]{8,32}$'),
 direction varchar(16) NOT NULL DEFAULT 'Outbound' CHECK(direction='Outbound'),
 origin jsonb NOT NULL, destination jsonb NOT NULL,
 shipping_fee integer NOT NULL CHECK(shipping_fee>=0),
 fee_policy varchar(40) NOT NULL DEFAULT 'SellerAdvanceBuyerReimbursement' CHECK(fee_policy='SellerAdvanceBuyerReimbursement'),
 registered_at timestamptz(6) NOT NULL,
 receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT direct_shipments_carrier_tracking_code_key UNIQUE(carrier,tracking_code),
 CONSTRAINT shipment_order_id_identity UNIQUE(order_id,id)
);
CREATE TABLE shipment_packaging_evidence (
 shipment_id uuid NOT NULL, order_id uuid NOT NULL, evidence_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 7),
 PRIMARY KEY(shipment_id,evidence_id), UNIQUE(shipment_id,position),
 FOREIGN KEY(order_id,shipment_id) REFERENCES direct_shipments(order_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(order_id,evidence_id) REFERENCES order_packaging_evidence(order_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER shipment_immutable BEFORE UPDATE OR DELETE ON direct_shipments FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER shipment_evidence_immutable BEFORE UPDATE OR DELETE ON shipment_packaging_evidence FOR EACH ROW EXECUTE FUNCTION latlai_append_only();

CREATE FUNCTION latlai_check_shipment(sid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s direct_shipments; p order_preparations; o direct_orders; c workflow_contexts; a agreement_snapshots; n integer; BEGIN
 SELECT * INTO STRICT s FROM direct_shipments WHERE id=sid;
 SELECT * INTO STRICT p FROM order_preparations WHERE order_id=s.order_id;
 SELECT * INTO STRICT o FROM direct_orders WHERE id=s.order_id;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=s.order_id;
 SELECT * INTO STRICT a FROM agreement_snapshots WHERE context_id=c.id;
 IF s.registered_at<p.accepted_at OR s.registered_at>=p.pickup_deadline
   OR s.origin IS DISTINCT FROM a.snapshot->'origin' OR s.destination IS DISTINCT FROM a.snapshot->'destination'
   OR s.shipping_fee IS DISTINCT FROM (a.snapshot->'amounts'->>'shippingFee')::integer
 THEN RAISE EXCEPTION 'Shipment frozen agreement/deadline mismatch' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM shipment_packaging_evidence WHERE shipment_id=sid;
 IF n NOT BETWEEN 1 AND 8 OR
   (SELECT max(position) FROM shipment_packaging_evidence WHERE shipment_id=sid)<>n-1 OR
   EXISTS(SELECT 1 FROM shipment_packaging_evidence l JOIN order_packaging_evidence e ON e.id=l.evidence_id
     WHERE l.shipment_id=sid AND (e.order_id<>s.order_id OR e.status<>'Ready' OR e.uploaded_at>s.registered_at))
 THEN RAISE EXCEPTION 'Shipment requires pinned Ready packaging images' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events au ON au.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=au.id
   WHERE r.id=s.receipt_id AND r.context_id=c.id AND r.actor_id=o.seller_id AND r.system_actor IS NULL
     AND r.operation='registerDirectShipment' AND r.result_version=1 AND r.committed_at=s.registered_at
     AND r.result->>'entityType'='Shipment' AND r.result->>'entityId'=sid::text AND r.result->>'orderId'=s.order_id::text
     AND r.result->>'contextId'=c.id::text AND r.result->>'version'='1' AND r.result->>'state'='LabelCreated'
     AND au.actor_id=o.seller_id AND au.context_id=c.id AND au.action=r.operation AND au.after->>'shipmentId'=sid::text
     AND ob.type='DirectShipmentRegistered' AND ob.payload->>'entityId'=sid::text AND ob.payload->>'contextId'=c.id::text)
 THEN RAISE EXCEPTION 'Shipment receipt/audit/outbox mismatch' USING ERRCODE='23514'; END IF;
 -- Existing Order and ledger checks enforce full funding/active commitment without a new journal.
 PERFORM latlai_check_order(o.id);
END $$;
CREATE FUNCTION latlai_shipment_constraint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='direct_shipments' THEN PERFORM latlai_check_shipment(NEW.id);
 ELSE PERFORM latlai_check_shipment(NEW.shipment_id); END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER shipment_consistency AFTER INSERT ON direct_shipments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_shipment_constraint();
CREATE CONSTRAINT TRIGGER shipment_evidence_consistency AFTER INSERT ON shipment_packaging_evidence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_shipment_constraint();
-- Evidence membership is sealed by the registration receipt. Prevent subsequent attachments
-- even when the count stays below eight; initial inserts run before receipt creation.
CREATE FUNCTION latlai_guard_shipment_evidence_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM direct_shipments s JOIN mutation_receipts r ON r.id=s.receipt_id WHERE s.id=NEW.shipment_id)
 THEN RAISE EXCEPTION 'Registered evidence membership is sealed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shipment_evidence_insert_guard BEFORE INSERT ON shipment_packaging_evidence FOR EACH ROW EXECUTE FUNCTION latlai_guard_shipment_evidence_insert();
CREATE FUNCTION latlai_guard_shipment_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM direct_orders WHERE id=NEW.order_id AND state='Preparing' AND version=3)
 THEN RAISE EXCEPTION 'Only a Preparing Order can register shipment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shipment_insert_guard BEFORE INSERT ON direct_shipments FOR EACH ROW EXECUTE FUNCTION latlai_guard_shipment_insert();
COMMIT;
