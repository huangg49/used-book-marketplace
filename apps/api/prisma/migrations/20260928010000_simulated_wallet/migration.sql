BEGIN;
CREATE TABLE wallet_accounts (
 id uuid PRIMARY KEY, owner_id uuid UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 purpose varchar(40) NOT NULL, currency varchar(3) NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
 CHECK ((purpose='UserAvailable' AND owner_id IS NOT NULL) OR
 (owner_id IS NULL AND ((purpose='SimulatorCapital' AND id='00000000-0000-4000-8000-000000000001') OR
 (purpose='SimulatorClearing' AND id='00000000-0000-4000-8000-000000000002'))))
);
CREATE TABLE topup_intents (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 amount integer NOT NULL CHECK(amount BETWEEN 1000 AND 10000000),
 currency varchar(3) NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
 state varchar(40) NOT NULL DEFAULT 'Pending' CHECK(state IN ('Pending','Processing','Succeeded','Failed','ReviewRequired')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz(6) NOT NULL,
 updated_at timestamptz(6) NOT NULL CHECK(updated_at>=created_at)
);
CREATE INDEX topup_intents_owner_id_created_at_id_idx ON topup_intents(owner_id,created_at,id);
ALTER TABLE mutation_receipts ADD COLUMN topup_id uuid REFERENCES topup_intents(id) ON DELETE RESTRICT;
ALTER TABLE audit_events ADD COLUMN topup_id uuid REFERENCES topup_intents(id) ON DELETE RESTRICT;
ALTER TABLE mutation_receipts DROP CONSTRAINT receipt_one_target;
ALTER TABLE mutation_receipts ADD CONSTRAINT receipt_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id,quote_id,context_id,topup_id)=1);
ALTER TABLE audit_events DROP CONSTRAINT audit_one_target;
ALTER TABLE audit_events ADD CONSTRAINT audit_one_target CHECK(num_nonnulls(listing_id,book_id,media_id,address_book_id,quote_id,context_id,topup_id)=1);
CREATE TABLE simulated_payment_events (
 id uuid PRIMARY KEY, intent_id uuid NOT NULL REFERENCES topup_intents(id) ON DELETE RESTRICT,
 provider varchar(40) NOT NULL CHECK(provider='LatLaiSimulator-v1'),
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 recipient_id uuid NOT NULL, amount integer NOT NULL CHECK(amount BETWEEN 1 AND 10000000),
 currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 outcome varchar(40) NOT NULL CHECK(outcome IN ('Processing','Succeeded','Failed')),
 disposition varchar(40) NOT NULL CHECK(disposition IN ('Applied','Ignored','ReviewRequired')),
 occurred_at timestamptz(6) NOT NULL, received_at timestamptz(6) NOT NULL,
 receipt_id uuid NOT NULL REFERENCES mutation_receipts(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX simulated_payment_events_intent_id_received_at_id_idx ON simulated_payment_events(intent_id,received_at,id);
CREATE TABLE ledger_journals (
 id uuid PRIMARY KEY, type varchar(40) NOT NULL CHECK(type IN ('OpeningCapital','Topup')),
 topup_id uuid UNIQUE REFERENCES topup_intents(id) ON DELETE RESTRICT,
 event_id uuid UNIQUE REFERENCES simulated_payment_events(id) ON DELETE RESTRICT,
 posted_at timestamptz(6) NOT NULL,
 CHECK((type='OpeningCapital' AND topup_id IS NULL AND event_id IS NULL AND id='00000000-0000-4000-8000-000000000003')
 OR (type='Topup' AND topup_id IS NOT NULL AND event_id IS NOT NULL))
);
CREATE INDEX ledger_journals_posted_at_id_idx ON ledger_journals(posted_at,id);
CREATE TABLE ledger_entries (
 journal_id uuid NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
 debit bigint NOT NULL CHECK(debit BETWEEN 0 AND 100000000),
 credit bigint NOT NULL CHECK(credit BETWEEN 0 AND 100000000),
 PRIMARY KEY(journal_id,account_id), CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0))
);
CREATE INDEX ledger_entries_account_id_journal_id_idx ON ledger_entries(account_id,journal_id);

CREATE FUNCTION latlai_wallet_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Posted wallet records are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER wallet_account_immutable BEFORE UPDATE OR DELETE ON wallet_accounts FOR EACH ROW EXECUTE FUNCTION latlai_wallet_immutable();
CREATE TRIGGER ledger_journal_immutable BEFORE UPDATE OR DELETE ON ledger_journals FOR EACH ROW EXECUTE FUNCTION latlai_wallet_immutable();
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION latlai_wallet_immutable();
CREATE TRIGGER payment_event_immutable BEFORE UPDATE OR DELETE ON simulated_payment_events FOR EACH ROW EXECUTE FUNCTION latlai_wallet_immutable();
CREATE FUNCTION latlai_topup_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Topup history is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW.state<>'Pending' OR NEW.updated_at<>NEW.created_at THEN
   RAISE EXCEPTION 'Topup must start Pending' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.id,NEW.owner_id,NEW.amount,NEW.currency,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.amount,OLD.currency,OLD.created_at)
   OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at
   OR (OLD.state IN ('Succeeded','Failed','ReviewRequired') AND NEW.state NOT IN (OLD.state,'ReviewRequired'))
   OR (OLD.state='Processing' AND NEW.state='Pending') THEN
   RAISE EXCEPTION 'Invalid topup transition' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER topup_transition BEFORE INSERT OR UPDATE OR DELETE ON topup_intents FOR EACH ROW EXECUTE FUNCTION latlai_topup_transition();

-- Account row locks serialize all writers, including direct SQL contenders.
CREATE FUNCTION latlai_wallet_entry_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM wallet_accounts WHERE id=NEW.account_id FOR UPDATE; RETURN NEW; END $$;
CREATE TRIGGER ledger_entry_lock BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION latlai_wallet_entry_lock();
CREATE FUNCTION latlai_check_journal(jid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j ledger_journals; t topup_intents; e simulated_payment_events; BEGIN
 SELECT * INTO STRICT j FROM ledger_journals WHERE id=jid;
 IF (SELECT count(*) FROM ledger_entries WHERE journal_id=jid)<>2 OR
    (SELECT COALESCE(sum(debit-credit),0) FROM ledger_entries WHERE journal_id=jid)<>0 THEN
  RAISE EXCEPTION 'Journal must have two balanced entries' USING ERRCODE='23514'; END IF;
 IF j.type='OpeningCapital' THEN
  IF NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=jid AND account_id='00000000-0000-4000-8000-000000000001' AND credit=100000000)
  OR NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=jid AND account_id='00000000-0000-4000-8000-000000000002' AND debit=100000000) THEN
   RAISE EXCEPTION 'Invalid finite simulator capital' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT t FROM topup_intents WHERE id=j.topup_id;
  SELECT * INTO STRICT e FROM simulated_payment_events WHERE id=j.event_id;
  IF t.state NOT IN ('Succeeded','ReviewRequired') OR e.intent_id<>t.id OR e.recipient_id<>t.owner_id
    OR e.amount<>t.amount OR e.currency<>t.currency OR e.outcome<>'Succeeded' OR e.disposition<>'Applied'
    OR e.received_at<>j.posted_at
    OR NOT EXISTS(SELECT 1 FROM ledger_entries le JOIN wallet_accounts a ON a.id=le.account_id
       WHERE le.journal_id=jid AND a.owner_id=t.owner_id AND a.purpose='UserAvailable' AND le.debit=t.amount)
    OR NOT EXISTS(SELECT 1 FROM ledger_entries WHERE journal_id=jid AND account_id='00000000-0000-4000-8000-000000000002' AND credit=t.amount)
  THEN RAISE EXCEPTION 'Topup journal source mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM wallet_accounts a JOIN ledger_entries le ON le.account_id=a.id
   WHERE a.id IN (SELECT account_id FROM ledger_entries WHERE journal_id=jid) AND a.purpose<>'SimulatorCapital'
   GROUP BY a.id HAVING sum(le.debit-le.credit)<0) THEN
  RAISE EXCEPTION 'Wallet balance cannot be negative' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION latlai_wallet_journal_constraint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='ledger_journals' THEN PERFORM latlai_check_journal(NEW.id);
 ELSE PERFORM latlai_check_journal(NEW.journal_id); END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER wallet_journal_consistency AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_wallet_journal_constraint();
CREATE CONSTRAINT TRIGGER wallet_entry_consistency AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_wallet_journal_constraint();

CREATE FUNCTION latlai_check_topup(tid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t topup_intents; BEGIN
 SELECT * INTO STRICT t FROM topup_intents WHERE id=tid;
 IF (t.state='Succeeded' AND NOT EXISTS(SELECT 1 FROM ledger_journals WHERE topup_id=t.id))
 OR (t.state IN ('Pending','Processing','Failed') AND EXISTS(SELECT 1 FROM ledger_journals WHERE topup_id=t.id))
 OR t.version<>(1+(SELECT count(*) FROM simulated_payment_events WHERE intent_id=t.id))
 OR NOT EXISTS(SELECT 1 FROM mutation_receipts r JOIN audit_events a ON a.receipt_id=r.id JOIN outbox_events o ON o.audit_id=a.id
   WHERE r.topup_id=t.id AND r.operation='createTopupIntent' AND r.actor_id=t.owner_id AND a.topup_id=t.id AND r.result_version=1)
 OR EXISTS(SELECT 1 FROM simulated_payment_events e LEFT JOIN mutation_receipts r ON r.id=e.receipt_id
    LEFT JOIN audit_events a ON a.receipt_id=r.id LEFT JOIN outbox_events o ON o.audit_id=a.id
    WHERE e.intent_id=t.id AND (r.topup_id IS DISTINCT FROM t.id OR r.operation<>'emitSimulatedTopupEvent' OR a.topup_id IS DISTINCT FROM t.id OR o.id IS NULL))
 OR EXISTS(SELECT 1 FROM simulated_payment_events e WHERE e.intent_id=t.id AND
    (e.recipient_id<>t.owner_id OR e.amount<>t.amount OR e.currency<>t.currency OR e.occurred_at<t.created_at OR e.occurred_at>e.received_at+interval '5 minutes') AND e.disposition<>'ReviewRequired')
 OR (EXISTS(SELECT 1 FROM simulated_payment_events WHERE intent_id=t.id AND disposition='ReviewRequired') AND t.state<>'ReviewRequired')
 THEN RAISE EXCEPTION 'Topup event/ledger/receipt mismatch' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION latlai_wallet_topup_constraint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='topup_intents' THEN PERFORM latlai_check_topup(NEW.id);
 ELSE PERFORM latlai_check_topup(NEW.intent_id); END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER wallet_topup_consistency AFTER INSERT OR UPDATE ON topup_intents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_wallet_topup_constraint();
CREATE CONSTRAINT TRIGGER wallet_payment_consistency AFTER INSERT ON simulated_payment_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION latlai_wallet_topup_constraint();

-- One finite, explicitly simulated opening journal, never an unjournalled seed balance.
INSERT INTO wallet_accounts(id,purpose) VALUES ('00000000-0000-4000-8000-000000000001','SimulatorCapital'),('00000000-0000-4000-8000-000000000002','SimulatorClearing');
INSERT INTO ledger_journals(id,type,posted_at) VALUES ('00000000-0000-4000-8000-000000000003','OpeningCapital',clock_timestamp());
INSERT INTO ledger_entries(journal_id,account_id,debit,credit) VALUES
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',0,100000000),
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',100000000,0);
COMMIT;
