CREATE TABLE service_areas (
 code varchar(40) PRIMARY KEY, name varchar(100) NOT NULL, demo_only boolean NOT NULL
);
CREATE TABLE service_localities (
 area_code varchar(40) NOT NULL REFERENCES service_areas(code) ON DELETE RESTRICT,
 code varchar(40) NOT NULL, label varchar(120) NOT NULL, PRIMARY KEY(area_code,code)
);
-- Explicit simulator areas, NOT official wards, addresses or actual partners.
INSERT INTO service_areas VALUES ('HCM-DEMO-v1','TP.HCM',true);
INSERT INTO service_localities VALUES
 ('HCM-DEMO-v1','DEMO-A','Khu vực demo A — TP.HCM'),
 ('HCM-DEMO-v1','DEMO-B','Khu vực demo B — TP.HCM');
CREATE TABLE address_books (
 owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 0 CHECK(version >= 0)
);
CREATE TABLE member_addresses (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES address_books(owner_id) ON DELETE RESTRICT,
 recipient_name varchar(100) NOT NULL CHECK(length(btrim(recipient_name)) BETWEEN 2 AND 100),
 phone varchar(10) NOT NULL CHECK(phone ~ '^0[0-9]{9}$'),
 service_area_code varchar(40) NOT NULL, locality_code varchar(40) NOT NULL,
 detail varchar(300) NOT NULL CHECK(length(btrim(detail)) BETWEEN 5 AND 300),
 is_default boolean NOT NULL DEFAULT false, created_at timestamptz(6) NOT NULL DEFAULT now(),
 FOREIGN KEY(service_area_code,locality_code) REFERENCES service_localities(area_code,code) ON DELETE RESTRICT
);
CREATE INDEX member_addresses_owner_id_created_at_id_idx ON member_addresses(owner_id,created_at,id);
CREATE UNIQUE INDEX address_one_default ON member_addresses(owner_id) WHERE is_default;
-- All writers take the owner lock first, including SQL backstops. HTTP commands also
-- hold this lock while checking quota/version/defaults and committing their receipt.
CREATE FUNCTION latlai_address_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid;
BEGIN
 owner := CASE WHEN TG_OP='DELETE' THEN OLD.owner_id ELSE NEW.owner_id END;
 IF TG_OP='UPDATE' AND (NEW.owner_id<>OLD.owner_id OR NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at) THEN
  RAISE EXCEPTION 'Address identity is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM users WHERE id=owner FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER guard_address BEFORE INSERT OR UPDATE OR DELETE ON member_addresses FOR EACH ROW EXECUTE FUNCTION latlai_address_write_guard();
CREATE FUNCTION latlai_address_book_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid; n integer; defaults integer;
BEGIN
 owner := CASE WHEN TG_OP='DELETE' THEN OLD.owner_id ELSE NEW.owner_id END;
 SELECT count(*),count(*) FILTER(WHERE is_default) INTO n,defaults FROM member_addresses WHERE owner_id=owner;
 IF n>10 OR (n>0 AND defaults<>1) THEN RAISE EXCEPTION 'Address quota or default invariant' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER address_book_check AFTER INSERT OR UPDATE OR DELETE ON member_addresses
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_address_book_check();
CREATE FUNCTION latlai_address_book_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.owner_id<>OLD.owner_id OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Address book version must advance once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_address_book BEFORE UPDATE ON address_books FOR EACH ROW EXECUTE FUNCTION latlai_address_book_version();
ALTER TABLE mutation_receipts ADD COLUMN address_book_id uuid REFERENCES address_books(owner_id) ON DELETE RESTRICT;
ALTER TABLE audit_events ADD COLUMN address_book_id uuid REFERENCES address_books(owner_id) ON DELETE RESTRICT;
ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_one_target;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id)=1);
ALTER TABLE audit_events DROP CONSTRAINT audit_one_target;
ALTER TABLE audit_events ADD CONSTRAINT audit_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id)=1);
