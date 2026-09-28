BEGIN;
-- Checksum alone also admits non-book EANs. Preserve the historical checksum
-- function and add explicit ISBN prefix checks. Existing invalid rows cause this
-- migration to fail for review; no existing metadata is silently rewritten.
ALTER TABLE catalog_revisions ADD CONSTRAINT catalog_isbn_prefix
  CHECK (isbn IS NULL OR length(isbn) = 10 OR isbn ~ '^97[89][0-9]{10}$');
ALTER TABLE catalog_books ADD CONSTRAINT confirmed_isbn_prefix
  CHECK (confirmed_isbn IS NULL OR confirmed_isbn ~ '^97[89][0-9]{10}$');
COMMIT;
