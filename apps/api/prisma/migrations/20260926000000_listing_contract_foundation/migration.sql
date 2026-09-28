BEGIN;

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('Pending', 'Confirmed', 'Rejected');

-- CreateEnum
CREATE TYPE "CatalogDecisionKind" AS ENUM ('Confirm', 'Reject');

-- CreateEnum
CREATE TYPE "ListingMode" AS ENUM ('Sale', 'Exchange', 'Both');

-- CreateEnum
CREATE TYPE "BookCondition" AS ENUM ('LikeNew', 'Good', 'Fair', 'Worn');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('Draft', 'PendingReview', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "VisibilityStatus" AS ENUM ('Visible', 'Hidden', 'Removed');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('Available', 'Reserved', 'Sold', 'Exchanged', 'ClosedUnavailable');

-- CreateEnum
CREATE TYPE "ListingDecisionKind" AS ENUM ('Approve', 'Reject');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('Pending', 'Processing', 'Ready', 'Failed');

-- CreateTable
CREATE TABLE "catalog_books" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'Pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "current_revision_id" UUID,
    "confirmed_isbn" VARCHAR(13),
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalog_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_revisions" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "authors" TEXT[],
    "publisher" VARCHAR(200),
    "publication_year" INTEGER,
    "language" VARCHAR(35) NOT NULL,
    "edition" VARCHAR(200),
    "category" VARCHAR(80) NOT NULL,
    "isbn" VARCHAR(13),
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_decisions" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "CatalogDecisionKind" NOT NULL,
    "reason" VARCHAR(1000),
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "moderation" "ModerationStatus" NOT NULL DEFAULT 'Draft',
    "visibility" "VisibilityStatus" NOT NULL DEFAULT 'Visible',
    "trade" "TradeStatus" NOT NULL DEFAULT 'Available',
    "current_revision_id" UUID,
    "removal_reason" VARCHAR(1000),
    "deleted_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_revisions" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "book_id" UUID,
    "mode" "ListingMode",
    "condition" "BookCondition",
    "pages" VARCHAR(1000) NOT NULL DEFAULT '',
    "cover_note" VARCHAR(1000) NOT NULL DEFAULT '',
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "accessories" VARCHAR(1000) NOT NULL DEFAULT '',
    "readable" BOOLEAN,
    "has_missing_pages" BOOLEAN,
    "missing_essential_content" BOOLEAN,
    "description" VARCHAR(5000) NOT NULL DEFAULT '',
    "sale_price" INTEGER,
    "exchange_value" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "ownership_declared_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_media" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "MediaStatus" NOT NULL DEFAULT 'Pending',
    "staging_key" TEXT NOT NULL,
    "pinned_key" TEXT,
    "derivative_key" TEXT,
    "mime_type" VARCHAR(30) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "failure_code" VARCHAR(40),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "purged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_media" (
    "listing_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "revision_media_pkey" PRIMARY KEY ("revision_id","media_id")
);

-- CreateTable
CREATE TABLE "listing_decisions" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "ListingDecisionKind" NOT NULL,
    "checklist" JSONB,
    "reason" VARCHAR(1000),
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mutation_receipts" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "key" UUID NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "listing_id" UUID,
    "book_id" UUID,
    "media_id" UUID,
    "result_version" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "committed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutation_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "receipt_id" UUID,
    "listing_id" UUID,
    "book_id" UUID,
    "media_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(1000),
    "request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_processing_jobs" (
    "id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_books_confirmed_isbn_key" ON "catalog_books"("confirmed_isbn");

-- CreateIndex
CREATE INDEX "catalog_books_requester_id_updated_at_id_idx" ON "catalog_books"("requester_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "catalog_books_status_created_at_id_idx" ON "catalog_books"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_books_id_current_revision_id_key" ON "catalog_books"("id", "current_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_revisions_book_id_id_key" ON "catalog_revisions"("book_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_revisions_book_id_number_key" ON "catalog_revisions"("book_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_decisions_revision_id_key" ON "catalog_decisions"("revision_id");

-- CreateIndex
CREATE INDEX "listings_owner_id_updated_at_id_idx" ON "listings"("owner_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "listings_moderation_visibility_trade_published_at_id_idx" ON "listings"("moderation", "visibility", "trade", "published_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "listings_id_current_revision_id_key" ON "listings"("id", "current_revision_id");

-- CreateIndex
CREATE INDEX "listing_revisions_book_id_idx" ON "listing_revisions"("book_id");

-- CreateIndex
CREATE INDEX "listing_revisions_sale_price_listing_id_idx" ON "listing_revisions"("sale_price", "listing_id");

-- CreateIndex
CREATE INDEX "listing_revisions_exchange_value_listing_id_idx" ON "listing_revisions"("exchange_value", "listing_id");

-- CreateIndex
CREATE INDEX "listing_revisions_submitted_at_listing_id_idx" ON "listing_revisions"("submitted_at", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_revisions_listing_id_id_key" ON "listing_revisions"("listing_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_revisions_listing_id_number_key" ON "listing_revisions"("listing_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "listing_media_staging_key_key" ON "listing_media"("staging_key");

-- CreateIndex
CREATE UNIQUE INDEX "listing_media_pinned_key_key" ON "listing_media"("pinned_key");

-- CreateIndex
CREATE UNIQUE INDEX "listing_media_derivative_key_key" ON "listing_media"("derivative_key");

-- CreateIndex
CREATE INDEX "listing_media_listing_id_created_at_id_idx" ON "listing_media"("listing_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "listing_media_status_expires_at_idx" ON "listing_media"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_media_listing_id_id_key" ON "listing_media"("listing_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "revision_media_revision_id_position_key" ON "revision_media"("revision_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "listing_decisions_revision_id_key" ON "listing_decisions"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "mutation_receipts_actor_id_operation_key_key" ON "mutation_receipts"("actor_id", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_receipt_id_key" ON "audit_events"("receipt_id");

-- CreateIndex
CREATE INDEX "audit_events_listing_id_created_at_idx" ON "audit_events"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_book_id_created_at_idx" ON "audit_events"("book_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_audit_id_key" ON "outbox_events"("audit_id");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_available_at_idx" ON "outbox_events"("processed_at", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_processing_jobs_media_id_key" ON "media_processing_jobs"("media_id");

-- CreateIndex
CREATE INDEX "media_processing_jobs_finished_at_available_at_idx" ON "media_processing_jobs"("finished_at", "available_at");

-- AddForeignKey
ALTER TABLE "catalog_books" ADD CONSTRAINT "catalog_books_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_books" ADD CONSTRAINT "catalog_books_id_current_revision_id_fkey" FOREIGN KEY ("id", "current_revision_id") REFERENCES "catalog_revisions"("book_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "catalog_revisions" ADD CONSTRAINT "catalog_revisions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "catalog_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_decisions" ADD CONSTRAINT "catalog_decisions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "catalog_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_decisions" ADD CONSTRAINT "catalog_decisions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_id_current_revision_id_fkey" FOREIGN KEY ("id", "current_revision_id") REFERENCES "listing_revisions"("listing_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_revisions" ADD CONSTRAINT "listing_revisions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "catalog_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_listing_id_revision_id_fkey" FOREIGN KEY ("listing_id", "revision_id") REFERENCES "listing_revisions"("listing_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_listing_id_media_id_fkey" FOREIGN KEY ("listing_id", "media_id") REFERENCES "listing_media"("listing_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_decisions" ADD CONSTRAINT "listing_decisions_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "listing_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_decisions" ADD CONSTRAINT "listing_decisions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "catalog_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "listing_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "mutation_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "catalog_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "listing_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audit_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_processing_jobs" ADD CONSTRAINT "media_processing_jobs_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "listing_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-reviewed constraints not expressible in Prisma. Keep these in migration history.
ALTER TABLE catalog_books ADD CONSTRAINT catalog_version_positive CHECK (version > 0),
 ADD CONSTRAINT catalog_confirmed_isbn_state CHECK (confirmed_isbn IS NULL OR status = 'Confirmed');
ALTER TABLE catalog_revisions ADD CONSTRAINT catalog_revision_number CHECK (number > 0),
 ADD CONSTRAINT catalog_metadata_required CHECK (length(btrim(title)) > 0 AND length(btrim(language)) > 0 AND length(btrim(category)) > 0 AND cardinality(authors) BETWEEN 1 AND 10),
 ADD CONSTRAINT catalog_year CHECK (publication_year IS NULL OR publication_year BETWEEN 1 AND 9999);
ALTER TABLE listings ADD CONSTRAINT listing_version_positive CHECK (version > 0),
 ADD CONSTRAINT listing_removal_reason CHECK ((visibility = 'Removed' AND removal_reason IS NOT NULL AND length(btrim(removal_reason)) BETWEEN 10 AND 1000) OR (visibility <> 'Removed' AND removal_reason IS NULL));
ALTER TABLE listing_revisions ADD CONSTRAINT revision_number_positive CHECK (number > 0),
 ADD CONSTRAINT revision_prices CHECK ((sale_price IS NULL OR sale_price BETWEEN 10000 AND 1000000) AND (exchange_value IS NULL OR exchange_value BETWEEN 10000 AND 1000000)),
 ADD CONSTRAINT revision_mode_prices CHECK (COALESCE((
 (mode IS NULL AND sale_price IS NULL AND exchange_value IS NULL) OR
 (mode = 'Sale' AND exchange_value IS NULL) OR (mode = 'Exchange' AND sale_price IS NULL) OR mode = 'Both'), false)),
 ADD CONSTRAINT submitted_content_complete CHECK (submitted_at IS NULL OR (
 book_id IS NOT NULL AND mode IS NOT NULL AND condition IS NOT NULL AND ownership_declared_at IS NOT NULL
 AND readable IS TRUE AND missing_essential_content IS FALSE AND has_missing_pages IS NOT NULL
 AND length(btrim(pages)) > 0 AND length(btrim(cover_note)) > 0 AND length(btrim(notes)) > 0 AND length(btrim(accessories)) > 0
 AND length(btrim(description)) BETWEEN 30 AND 5000
 AND (mode = 'Exchange' OR sale_price IS NOT NULL) AND (mode = 'Sale' OR exchange_value IS NOT NULL)));
ALTER TABLE revision_media ADD CONSTRAINT media_position CHECK (position BETWEEN 0 AND 7);
ALTER TABLE listing_media ADD CONSTRAINT media_version_positive CHECK (version > 0),
 ADD CONSTRAINT media_upload_limits CHECK (byte_size BETWEEN 1 AND 10000000 AND mime_type IN ('image/jpeg','image/png','image/webp') AND sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT media_pixels CHECK ((width IS NULL AND height IS NULL) OR (width IS NOT NULL AND height IS NOT NULL AND width > 0 AND height > 0 AND width::bigint * height::bigint <= 40000000)),
 ADD CONSTRAINT media_ready CHECK (status <> 'Ready' OR (pinned_key IS NOT NULL AND derivative_key IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)),
 ADD CONSTRAINT media_processing CHECK (status <> 'Processing' OR pinned_key IS NOT NULL),
 ADD CONSTRAINT media_failure CHECK ((status = 'Failed' AND failure_code IS NOT NULL AND failure_code IN ('InvalidImage','UnsupportedFormat','TooLarge','TooManyPixels','MultipleFrames','ProcessingFailed','UploadExpired')) OR (status <> 'Failed' AND failure_code IS NULL));
ALTER TABLE listing_decisions ADD CONSTRAINT listing_decision_details CHECK (
 (decision = 'Reject' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 10 AND 1000 AND checklist IS NULL) OR
 (decision = 'Approve' AND reason IS NULL AND checklist IS NOT NULL AND checklist = '{"catalogMatches":true,"photosClear":true,"conditionDisclosed":true,"readable":true,"pricingValid":true,"contentAppropriate":true}'::jsonb));
ALTER TABLE catalog_decisions ADD CONSTRAINT catalog_decision_details CHECK (
 (decision = 'Reject' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 10 AND 1000) OR (decision = 'Confirm' AND reason IS NULL));
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_one_target CHECK (num_nonnulls(listing_id,book_id,media_id) = 1),
 ADD CONSTRAINT receipt_shape CHECK (result_version > 0 AND payload_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(result) = 'object');
ALTER TABLE audit_events ADD CONSTRAINT audit_one_target CHECK (num_nonnulls(listing_id,book_id,media_id) = 1),
 ADD CONSTRAINT audit_projections CHECK ((before IS NULL OR jsonb_typeof(before) = 'object') AND (after IS NULL OR jsonb_typeof(after) = 'object'));
ALTER TABLE outbox_events ADD CONSTRAINT outbox_attempts CHECK (attempts >= 0), ADD CONSTRAINT outbox_payload CHECK (jsonb_typeof(payload) = 'object');
ALTER TABLE media_processing_jobs ADD CONSTRAINT media_job_attempts CHECK (attempts >= 0);

-- Canonical ISBN-13, with ISBN-10 check digit validation before conversion.
CREATE FUNCTION latlai_isbn13(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE total integer := 0; i integer; prefix text;
BEGIN
 IF value ~ '^[0-9]{9}[0-9X]$' THEN
   FOR i IN 1..10 LOOP total := total + (11-i) * CASE WHEN substr(value,i,1) = 'X' THEN 10 ELSE substr(value,i,1)::integer END; END LOOP;
   IF total % 11 <> 0 THEN RETURN NULL; END IF;
   prefix := '978' || substr(value,1,9);
 ELSIF value ~ '^[0-9]{13}$' THEN prefix := substr(value,1,12);
 ELSE RETURN NULL;
 END IF;
 total := 0;
 FOR i IN 1..12 LOOP total := total + substr(prefix,i,1)::integer * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END; END LOOP;
 prefix := prefix || ((10-total%10)%10)::text;
 IF length(value) = 13 AND prefix <> value THEN RETURN NULL; END IF;
 RETURN prefix;
END $$;
ALTER TABLE catalog_revisions ADD CONSTRAINT catalog_isbn_valid CHECK (isbn IS NULL OR latlai_isbn13(isbn) IS NOT NULL);
ALTER TABLE catalog_books ADD CONSTRAINT confirmed_isbn_valid CHECK (confirmed_isbn IS NULL OR (latlai_isbn13(confirmed_isbn) IS NOT NULL AND confirmed_isbn = latlai_isbn13(confirmed_isbn)));

CREATE FUNCTION latlai_valid_authors(value text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT value IS NOT NULL AND array_ndims(value) = 1 AND cardinality(value) BETWEEN 1 AND 10
 AND NOT EXISTS (SELECT 1 FROM unnest(value) AS author WHERE author IS NULL OR length(btrim(author)) NOT BETWEEN 1 AND 200)
$$;
ALTER TABLE catalog_revisions ADD CONSTRAINT catalog_authors CHECK (latlai_valid_authors(authors));

CREATE FUNCTION latlai_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514'; END $$;
CREATE TRIGGER immutable_catalog_revision BEFORE UPDATE OR DELETE ON catalog_revisions FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER immutable_catalog_decision BEFORE UPDATE OR DELETE ON catalog_decisions FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER immutable_listing_decision BEFORE UPDATE OR DELETE ON listing_decisions FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER immutable_receipt BEFORE UPDATE OR DELETE ON mutation_receipts FOR EACH ROW EXECUTE FUNCTION latlai_append_only();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION latlai_append_only();

CREATE FUNCTION latlai_guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Submitted revision is immutable' USING ERRCODE = '23514'; END IF;
 IF TG_OP = 'UPDATE' AND (NEW.id,NEW.listing_id,NEW.number) IS DISTINCT FROM (OLD.id,OLD.listing_id,OLD.number) THEN
   RAISE EXCEPTION 'Revision identity is immutable' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_listing_revision BEFORE UPDATE OR DELETE ON listing_revisions FOR EACH ROW EXECUTE FUNCTION latlai_guard_revision();

CREATE FUNCTION latlai_guard_revision_media() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE frozen timestamptz;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
   SELECT submitted_at INTO frozen FROM listing_revisions WHERE id = OLD.revision_id FOR UPDATE;
   IF frozen IS NOT NULL THEN RAISE EXCEPTION 'Submitted photo order is immutable' USING ERRCODE = '23514'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
   SELECT submitted_at INTO frozen FROM listing_revisions WHERE id = NEW.revision_id FOR UPDATE;
   IF frozen IS NOT NULL THEN RAISE EXCEPTION 'Attach photos before freezing a revision' USING ERRCODE = '23514'; END IF;
   PERFORM 1 FROM listing_media WHERE id = NEW.media_id AND purged_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Media unavailable' USING ERRCODE = '23514'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_revision_media BEFORE INSERT OR UPDATE OR DELETE ON revision_media FOR EACH ROW EXECUTE FUNCTION latlai_guard_revision_media();

CREATE FUNCTION latlai_guard_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.listing_id,NEW.staging_key,NEW.sha256,NEW.byte_size,NEW.mime_type) IS DISTINCT FROM (OLD.id,OLD.listing_id,OLD.staging_key,OLD.sha256,OLD.byte_size,OLD.mime_type) THEN
   RAISE EXCEPTION 'Media identity/input is immutable' USING ERRCODE = '23514';
 END IF;
 IF OLD.status = 'Ready' AND (to_jsonb(NEW) - ARRAY['updated_at','purged_at','version']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','purged_at','version']) THEN
   RAISE EXCEPTION 'Ready derivative is immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW.purged_at IS NOT NULL AND EXISTS (SELECT 1 FROM revision_media WHERE media_id = NEW.id) THEN
   RAISE EXCEPTION 'Referenced media cannot be purged' USING ERRCODE = '23514';
 END IF;
 IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Media version must increase once' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_media BEFORE UPDATE ON listing_media FOR EACH ROW EXECUTE FUNCTION latlai_guard_media();

CREATE FUNCTION latlai_guard_aggregate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'listings' THEN
   IF NEW.owner_id <> OLD.owner_id OR NEW.id <> OLD.id THEN RAISE EXCEPTION 'Listing ownership is immutable' USING ERRCODE = '23514'; END IF;
 ELSE
   IF NEW.requester_id <> OLD.requester_id OR NEW.id <> OLD.id THEN RAISE EXCEPTION 'Catalog requester is immutable' USING ERRCODE = '23514'; END IF;
   IF OLD.status = 'Confirmed' THEN RAISE EXCEPTION 'Confirmed catalog is immutable in v0.1' USING ERRCODE = '23514'; END IF;
 END IF;
 IF OLD.current_revision_id IS NOT NULL AND NEW.version <> OLD.version + 1 THEN
   RAISE EXCEPTION 'Aggregate version must increase once' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_listing_aggregate BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION latlai_guard_aggregate();
CREATE TRIGGER guard_catalog_aggregate BEFORE UPDATE ON catalog_books FOR EACH ROW EXECUTE FUNCTION latlai_guard_aggregate();

CREATE FUNCTION latlai_guard_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid; current_id uuid; state text; removed boolean;
BEGIN
 IF TG_TABLE_NAME = 'listing_decisions' THEN
   SELECT l.owner_id,l.current_revision_id,l.moderation::text,(l.deleted_at IS NOT NULL OR l.visibility = 'Removed')
   INTO subject,current_id,state,removed FROM listings l JOIN listing_revisions r ON r.listing_id=l.id WHERE r.id=NEW.revision_id FOR UPDATE OF l;
   IF state IS DISTINCT FROM 'PendingReview' OR removed THEN RAISE EXCEPTION 'Listing is not awaiting review' USING ERRCODE = '23514'; END IF;
 ELSE
   SELECT b.requester_id,b.current_revision_id,b.status::text INTO subject,current_id,state
   FROM catalog_books b JOIN catalog_revisions r ON r.book_id=b.id WHERE r.id=NEW.revision_id FOR UPDATE OF b;
   IF state IS DISTINCT FROM 'Pending' THEN RAISE EXCEPTION 'Catalog is not awaiting review' USING ERRCODE = '23514'; END IF;
 END IF;
 IF current_id IS DISTINCT FROM NEW.revision_id OR subject = NEW.reviewer_id THEN
   RAISE EXCEPTION 'Stale revision or self-review' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_listing_decision BEFORE INSERT ON listing_decisions FOR EACH ROW EXECUTE FUNCTION latlai_guard_decision();
CREATE TRIGGER guard_catalog_decision BEFORE INSERT ON catalog_decisions FOR EACH ROW EXECUTE FUNCTION latlai_guard_decision();

-- The aggregate/revision cycle is assembled within a transaction. Final state, not
-- an intermediate INSERT with a null pointer, is checked at COMMIT.
CREATE FUNCTION latlai_check_listing(listing_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE l listings%ROWTYPE; r listing_revisions%ROWTYPE; d text; n integer;
BEGIN
 SELECT * INTO l FROM listings WHERE id=listing_uuid;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO r FROM listing_revisions WHERE id=l.current_revision_id AND listing_id=l.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Listing requires its own current revision' USING ERRCODE='23514'; END IF;
 SELECT decision::text INTO d FROM listing_decisions WHERE revision_id=r.id;
 IF (l.moderation='Draft' AND (r.submitted_at IS NOT NULL OR d IS NOT NULL)) OR
    (l.moderation='PendingReview' AND (r.submitted_at IS NULL OR d IS NOT NULL)) OR
    (l.moderation='Approved' AND (r.submitted_at IS NULL OR d IS DISTINCT FROM 'Approve')) OR
    (l.moderation='Rejected' AND (r.submitted_at IS NULL OR d IS DISTINCT FROM 'Reject')) THEN
   RAISE EXCEPTION 'Moderation does not match current revision/decision' USING ERRCODE='23514';
 END IF;
 IF r.submitted_at IS NOT NULL THEN
   SELECT count(*) INTO n FROM revision_media rm JOIN listing_media m ON m.id=rm.media_id WHERE rm.revision_id=r.id AND m.status='Ready' AND m.purged_at IS NULL;
   IF n NOT BETWEEN 1 AND 8 OR n <> (SELECT count(*) FROM revision_media WHERE revision_id=r.id) THEN
     RAISE EXCEPTION 'Submission requires 1-8 Ready photos' USING ERRCODE='23514';
   END IF;
 END IF;
 IF l.moderation='Approved' AND NOT EXISTS (SELECT 1 FROM catalog_books WHERE id=r.book_id AND status='Confirmed') THEN
   RAISE EXCEPTION 'Approval requires confirmed catalog' USING ERRCODE='23514';
 END IF;
END $$;
CREATE FUNCTION latlai_check_catalog(book_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b catalog_books%ROWTYPE; r catalog_revisions%ROWTYPE; d text;
BEGIN
 SELECT * INTO b FROM catalog_books WHERE id=book_uuid;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO r FROM catalog_revisions WHERE id=b.current_revision_id AND book_id=b.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Catalog requires its own current revision' USING ERRCODE='23514'; END IF;
 SELECT decision::text INTO d FROM catalog_decisions WHERE revision_id=r.id;
 IF (b.status='Pending' AND d IS NOT NULL) OR (b.status='Confirmed' AND d IS DISTINCT FROM 'Confirm') OR (b.status='Rejected' AND d IS DISTINCT FROM 'Reject') THEN
   RAISE EXCEPTION 'Catalog state does not match current decision' USING ERRCODE='23514';
 END IF;
 IF b.status='Confirmed' AND b.confirmed_isbn IS DISTINCT FROM latlai_isbn13(r.isbn) THEN
   RAISE EXCEPTION 'Confirmed ISBN does not match reviewed revision' USING ERRCODE='23514';
 END IF;
END $$;
CREATE FUNCTION latlai_check_aggregate_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'listings' THEN PERFORM latlai_check_listing(NEW.id);
 WHEN 'listing_revisions' THEN
   PERFORM latlai_check_listing(NEW.listing_id);
   IF EXISTS (SELECT 1 FROM listing_revisions WHERE id=NEW.id AND submitted_at IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM revision_media rm JOIN listing_media m ON m.id=rm.media_id
        WHERE rm.revision_id=NEW.id
        HAVING count(*) BETWEEN 1 AND 8 AND bool_and(m.status='Ready' AND m.purged_at IS NULL)
      ) THEN RAISE EXCEPTION 'Frozen revision requires Ready photos' USING ERRCODE='23514'; END IF;
 WHEN 'listing_decisions' THEN PERFORM latlai_check_listing((SELECT listing_id FROM listing_revisions WHERE id=NEW.revision_id));
 WHEN 'catalog_books' THEN PERFORM latlai_check_catalog(NEW.id);
 WHEN 'catalog_revisions' THEN PERFORM latlai_check_catalog(NEW.book_id);
 WHEN 'catalog_decisions' THEN PERFORM latlai_check_catalog((SELECT book_id FROM catalog_revisions WHERE id=NEW.revision_id));
 END CASE;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_listing_commit AFTER INSERT OR UPDATE ON listings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_aggregate_trigger();
CREATE CONSTRAINT TRIGGER check_revision_commit AFTER INSERT OR UPDATE ON listing_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_aggregate_trigger();
CREATE CONSTRAINT TRIGGER check_listing_decision_commit AFTER INSERT ON listing_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_aggregate_trigger();
CREATE CONSTRAINT TRIGGER check_catalog_commit AFTER INSERT OR UPDATE ON catalog_books DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_aggregate_trigger();
CREATE CONSTRAINT TRIGGER check_catalog_revision_commit AFTER INSERT ON catalog_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_aggregate_trigger();
CREATE CONSTRAINT TRIGGER check_catalog_decision_commit AFTER INSERT ON catalog_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_check_aggregate_trigger();

CREATE FUNCTION latlai_guard_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Outbox history must be retained' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.audit_id,NEW.type,NEW.payload,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.audit_id,OLD.type,OLD.payload,OLD.created_at) THEN
   RAISE EXCEPTION 'Outbox event identity/payload is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_outbox BEFORE UPDATE OR DELETE ON outbox_events FOR EACH ROW EXECUTE FUNCTION latlai_guard_outbox();

COMMIT;
