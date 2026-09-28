-- No legacy listing is assigned an origin. Existing contact rows start at version 1.
CREATE TABLE address_identities (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 UNIQUE(id, owner_id)
);
INSERT INTO address_identities SELECT id,owner_id FROM member_addresses;
CREATE TRIGGER immutable_address_identity BEFORE UPDATE OR DELETE ON address_identities
 FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
ALTER TABLE member_addresses ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>=1);
ALTER TABLE member_addresses ADD CONSTRAINT member_addresses_id_owner_id_key UNIQUE(id,owner_id);
ALTER TABLE member_addresses ADD CONSTRAINT address_identity_owner_fk FOREIGN KEY(id,owner_id)
 REFERENCES address_identities(id,owner_id) ON DELETE RESTRICT;
CREATE FUNCTION latlai_address_content_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 THEN RAISE EXCEPTION 'Initial address version must be one' USING ERRCODE='23514'; END IF;
  -- Never reuse a deleted identity. No contact information is retained here.
  INSERT INTO address_identities(id,owner_id) VALUES(NEW.id,NEW.owner_id);
 ELSE
  IF NEW.version<>OLD.version THEN RAISE EXCEPTION 'Address version is server managed' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.recipient_name,NEW.phone,NEW.service_area_code,NEW.locality_code,NEW.detail)
     IS DISTINCT FROM ROW(OLD.recipient_name,OLD.phone,OLD.service_area_code,OLD.locality_code,OLD.detail)
  THEN NEW.version:=OLD.version+1; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Existing guard_address takes the owner lock before this trigger runs.
CREATE TRIGGER guard_address_version BEFORE INSERT OR UPDATE ON member_addresses
 FOR EACH ROW EXECUTE FUNCTION latlai_address_content_version();
ALTER TABLE listing_revisions
 ADD COLUMN origin_address_id uuid REFERENCES address_identities(id) ON DELETE RESTRICT,
 ADD COLUMN origin_address_version integer,
 ADD COLUMN origin_service_area_code varchar(40) REFERENCES service_areas(code) ON DELETE RESTRICT,
 ADD CONSTRAINT revision_fulfillment_complete CHECK (
  num_nonnulls(origin_address_id,origin_address_version,origin_service_area_code)=0 OR
  (num_nonnulls(origin_address_id,origin_address_version,origin_service_area_code)=3
   AND origin_address_version>=1 AND origin_service_area_code='HCM-DEMO-v1')
 );
CREATE FUNCTION latlai_revision_origin_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid; origin member_addresses;
BEGIN
 IF NEW.origin_address_id IS NULL THEN RETURN NEW; END IF;
 SELECT owner_id INTO owner FROM listings WHERE id=NEW.listing_id;
 SELECT * INTO origin FROM member_addresses WHERE id=NEW.origin_address_id FOR SHARE;
 IF origin.id IS NULL OR origin.owner_id IS DISTINCT FROM owner
  OR origin.version IS DISTINCT FROM NEW.origin_address_version
  OR origin.service_area_code IS DISTINCT FROM NEW.origin_service_area_code
 THEN RAISE EXCEPTION 'Origin is not a current owned address' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
-- Submitted revision immutability remains enforced by the existing trigger.
CREATE TRIGGER guard_revision_origin BEFORE INSERT OR UPDATE ON listing_revisions
 FOR EACH ROW EXECUTE FUNCTION latlai_revision_origin_check();
