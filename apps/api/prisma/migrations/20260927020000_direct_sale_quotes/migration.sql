CREATE TABLE sale_quote_policies (
 code varchar(60) PRIMARY KEY, shipping_fee integer NOT NULL CHECK(shipping_fee BETWEEN 0 AND 1000000),
 commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 ttl_seconds integer NOT NULL CHECK(ttl_seconds BETWEEN 1 AND 300)
);
CREATE TRIGGER immutable_sale_quote_policy BEFORE UPDATE OR DELETE ON sale_quote_policies FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TABLE sale_quote_policy_selection (
 scope varchar(40) PRIMARY KEY CHECK(scope='DirectSale'),
 policy_code varchar(60) NOT NULL UNIQUE REFERENCES sale_quote_policies(code) ON DELETE RESTRICT
);
INSERT INTO sale_quote_policies VALUES('HCM-DIRECT-v1',30000,500,300);
INSERT INTO sale_quote_policy_selection VALUES('DirectSale','HCM-DIRECT-v1');
CREATE TABLE sale_quotes (
 id uuid PRIMARY KEY, version integer NOT NULL DEFAULT 1 CHECK(version=1),
 buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT CHECK(seller_id<>buyer_id),
 listing_id uuid NOT NULL, listing_version integer NOT NULL CHECK(listing_version>=1),
 listing_revision_id uuid NOT NULL,
 FOREIGN KEY(listing_id,listing_revision_id) REFERENCES listing_revisions(listing_id,id) ON DELETE RESTRICT,
 catalog_revision_id uuid NOT NULL REFERENCES catalog_revisions(id) ON DELETE RESTRICT,
 origin_address_id uuid NOT NULL, origin_address_version integer NOT NULL CHECK(origin_address_version>=1),
 destination_address_id uuid NOT NULL, destination_address_version integer NOT NULL CHECK(destination_address_version>=1),
 FOREIGN KEY(origin_address_id,seller_id) REFERENCES address_identities(id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(destination_address_id,buyer_id) REFERENCES address_identities(id,owner_id) ON DELETE RESTRICT,
 service_area_code varchar(40) NOT NULL REFERENCES service_areas(code) ON DELETE RESTRICT CHECK(service_area_code='HCM-DEMO-v1'),
 policy_code varchar(60) NOT NULL REFERENCES sale_quote_policies(code) ON DELETE RESTRICT,
 book_price integer NOT NULL CHECK(book_price BETWEEN 10000 AND 1000000),
 shipping_fee integer NOT NULL CHECK(shipping_fee BETWEEN 0 AND 1000000),
 commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 commission integer NOT NULL CHECK(commission=(book_price::bigint*commission_bps+5000)/10000),
 buyer_total integer NOT NULL CHECK(buyer_total=book_price+shipping_fee),
 seller_proceeds integer NOT NULL CHECK(seller_proceeds=buyer_total-commission AND seller_proceeds>=0),
 created_at timestamptz(6) NOT NULL, expires_at timestamptz(6) NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes')
);
CREATE INDEX sale_quotes_buyer_id_expires_at_idx ON sale_quotes(buyer_id,expires_at);
CREATE TRIGGER immutable_sale_quote BEFORE UPDATE OR DELETE ON sale_quotes FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE FUNCTION latlai_sale_quote_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p sale_quote_policies; l listings; r listing_revisions;
BEGIN
 SELECT * INTO p FROM sale_quote_policies WHERE code=NEW.policy_code;
 SELECT * INTO l FROM listings WHERE id=NEW.listing_id;
 SELECT * INTO r FROM listing_revisions WHERE id=NEW.listing_revision_id;
 IF l.owner_id IS DISTINCT FROM NEW.seller_id OR r.sale_price IS DISTINCT FROM NEW.book_price
  OR r.origin_address_id IS DISTINCT FROM NEW.origin_address_id
  OR r.origin_address_version IS DISTINCT FROM NEW.origin_address_version
  OR NOT EXISTS(SELECT 1 FROM catalog_revisions cr WHERE cr.id=NEW.catalog_revision_id AND cr.book_id=r.book_id)
  OR NEW.shipping_fee IS DISTINCT FROM p.shipping_fee OR NEW.commission_bps IS DISTINCT FROM p.commission_bps
  OR NEW.expires_at IS DISTINCT FROM NEW.created_at+make_interval(secs=>p.ttl_seconds)
 THEN RAISE EXCEPTION 'Quote snapshot does not match its sources' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_sale_quote BEFORE INSERT ON sale_quotes FOR EACH ROW EXECUTE FUNCTION latlai_sale_quote_check();
ALTER TABLE mutation_receipts ADD COLUMN quote_id uuid REFERENCES sale_quotes(id) ON DELETE RESTRICT;
ALTER TABLE audit_events ADD COLUMN quote_id uuid REFERENCES sale_quotes(id) ON DELETE RESTRICT;
ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_one_target;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id,quote_id)=1);
ALTER TABLE audit_events DROP CONSTRAINT audit_one_target;
ALTER TABLE audit_events ADD CONSTRAINT audit_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id,quote_id)=1);
