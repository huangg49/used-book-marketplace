BEGIN;
-- Separate from listing media: listing draft cleanup must never purge evidence.
-- Original and normalized preview keys are deterministic from this private UUID.
CREATE TABLE order_packaging_evidence (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES order_preparations(order_id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1,
 status varchar(16) NOT NULL DEFAULT 'Pending',
 mime_type varchar(40) NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10000000),
 sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 reserved_bytes integer NOT NULL,
 created_at timestamptz(6) NOT NULL,
 uploaded_at timestamptz(6),
 derivative_sha256 char(64), derivative_bytes integer, width integer, height integer,
 create_receipt_id uuid NOT NULL UNIQUE REFERENCES mutation_receipts(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 upload_receipt_id uuid UNIQUE REFERENCES mutation_receipts(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT packaging_identity UNIQUE(order_id,sha256),
 CONSTRAINT packaging_shape CHECK (
   reserved_bytes=byte_size+2000000 AND
   ((status='Pending' AND version=1 AND num_nonnulls(uploaded_at,derivative_sha256,derivative_bytes,width,height,upload_receipt_id)=0) OR
    (status='Ready' AND version=2 AND num_nonnulls(uploaded_at,derivative_sha256,derivative_bytes,width,height,upload_receipt_id)=6
     AND uploaded_at>=created_at AND derivative_sha256 ~ '^[a-f0-9]{64}$' AND derivative_bytes BETWEEN 1 AND 2000000
     AND width BETWEEN 1 AND 1600 AND height BETWEEN 1 AND 1600)))
);
CREATE INDEX order_packaging_evidence_order_id_created_at_id_idx ON order_packaging_evidence(order_id,created_at,id);
CREATE FUNCTION latlai_guard_packaging() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Packaging evidence is retained' USING ERRCODE='23514'; END IF;
 IF OLD.status<>'Pending' OR NEW.status<>'Ready' OR
  (to_jsonb(NEW)-ARRAY['status','version','uploaded_at','derivative_sha256','derivative_bytes','width','height','upload_receipt_id'])
   IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['status','version','uploaded_at','derivative_sha256','derivative_bytes','width','height','upload_receipt_id'])
 THEN RAISE EXCEPTION 'Packaging evidence is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER packaging_immutable BEFORE UPDATE OR DELETE ON order_packaging_evidence FOR EACH ROW EXECUTE FUNCTION latlai_guard_packaging();
CREATE FUNCTION latlai_packaging_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e order_packaging_evidence; o direct_orders; p order_preparations; c workflow_contexts; BEGIN
 SELECT * INTO STRICT e FROM order_packaging_evidence WHERE id=NEW.id;
 SELECT * INTO STRICT o FROM direct_orders WHERE id=e.order_id;
 SELECT * INTO STRICT p FROM order_preparations WHERE order_id=e.order_id;
 SELECT * INTO STRICT c FROM workflow_contexts WHERE order_id=e.order_id;
 IF e.created_at<p.accepted_at OR o.state NOT IN ('Preparing','ResolutionPending') OR
   NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
    WHERE r.id=e.create_receipt_id AND r.context_id=c.id AND r.actor_id=o.seller_id AND r.system_actor IS NULL
    AND r.operation='createPackagingEvidence' AND r.result_version=1 AND r.committed_at=e.created_at
    AND r.result->>'entityType'='OrderPackagingEvidence' AND r.result->>'entityId'=e.id::text
    AND r.result->>'orderId'=e.order_id::text AND r.result->>'contextId'=c.id::text AND r.result->>'state'='Pending' AND r.result->>'version'='1'
    AND a.context_id=c.id AND a.actor_id=o.seller_id AND a.action=r.operation AND a.after->>'evidenceId'=e.id::text
    AND ob.type='PackagingEvidenceReserved' AND ob.payload->>'entityId'=e.id::text AND ob.payload->>'contextId'=c.id::text)
 THEN RAISE EXCEPTION 'Packaging intent/receipt mismatch' USING ERRCODE='23514'; END IF;
 IF e.status='Ready' AND NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events ob ON ob.audit_id=a.id
    WHERE r.id=e.upload_receipt_id AND r.context_id=c.id AND r.actor_id=o.seller_id AND r.system_actor IS NULL
    AND r.operation='uploadPackagingEvidence' AND r.result_version=2 AND r.committed_at=e.uploaded_at
    AND r.result->>'entityType'='OrderPackagingEvidence' AND r.result->>'entityId'=e.id::text
    AND r.result->>'orderId'=e.order_id::text AND r.result->>'contextId'=c.id::text AND r.result->>'state'='Ready' AND r.result->>'version'='2'
    AND a.context_id=c.id AND a.actor_id=o.seller_id AND a.action=r.operation AND a.after->>'evidenceId'=e.id::text
    AND ob.type='PackagingEvidenceSubmitted' AND ob.payload->>'entityId'=e.id::text AND ob.payload->>'contextId'=c.id::text)
 THEN RAISE EXCEPTION 'Packaging upload/receipt mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER packaging_consistency AFTER INSERT OR UPDATE ON order_packaging_evidence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_packaging_consistency();
COMMIT;
