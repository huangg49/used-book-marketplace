BEGIN;
-- Domain commands lock users before reading current roles. Ensure role writers
-- (including administration added later) participate in that same row lock.
CREATE FUNCTION latlai_lock_role_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM id FROM users WHERE id IN (OLD.user_id, NEW.user_id) ORDER BY id FOR UPDATE;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM id FROM users WHERE id = NEW.user_id FOR UPDATE;
  ELSE
    PERFORM id FROM users WHERE id = OLD.user_id FOR UPDATE;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lock_user_before_role_write BEFORE INSERT OR UPDATE OR DELETE
ON user_roles FOR EACH ROW EXECUTE FUNCTION latlai_lock_role_owner();
COMMIT;
