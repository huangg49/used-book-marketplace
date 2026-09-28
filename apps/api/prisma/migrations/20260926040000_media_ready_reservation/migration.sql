CREATE OR REPLACE FUNCTION latlai_guard_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.listing_id,NEW.staging_key,NEW.sha256,NEW.byte_size,NEW.mime_type) IS DISTINCT FROM (OLD.id,OLD.listing_id,OLD.staging_key,OLD.sha256,OLD.byte_size,OLD.mime_type) THEN
   RAISE EXCEPTION 'Media identity/input is immutable' USING ERRCODE = '23514';
 END IF;
 IF OLD.status = 'Ready' AND (to_jsonb(NEW) - ARRAY['updated_at','purged_at','version','reserved_bytes']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','purged_at','version','reserved_bytes']) THEN
   RAISE EXCEPTION 'Ready derivative is immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW.reserved_bytes IS DISTINCT FROM OLD.reserved_bytes AND NOT (
   (NEW.purged_at IS NOT NULL AND NEW.reserved_bytes=0) OR
   (OLD.status='Processing' AND NEW.status='Ready' AND NEW.reserved_bytes BETWEEN NEW.byte_size AND OLD.reserved_bytes)
 ) THEN
   RAISE EXCEPTION 'Only purged media may release its reservation' USING ERRCODE = '23514';
 END IF;
 IF OLD.purged_at IS NOT NULL AND NEW.purged_at IS DISTINCT FROM OLD.purged_at THEN
   RAISE EXCEPTION 'Purge tombstone is permanent' USING ERRCODE = '23514';
 END IF;
 IF NEW.purged_at IS NOT NULL AND EXISTS (SELECT 1 FROM revision_media WHERE media_id = NEW.id) THEN
   RAISE EXCEPTION 'Referenced media cannot be purged' USING ERRCODE = '23514';
 END IF;
 IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Media version must increase once' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
