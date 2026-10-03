-- Historical settlements and evidence remain traceable when future interfaces are added.
CREATE INDEX member_email ON member_records(email);
CREATE INDEX membership_status_expiry ON membership_terms(status,ends_on,starts_on);
CREATE INDEX availability_event_response ON volunteer_availability(event_id,response);
CREATE INDEX announcements_status_audience ON announcements(status,audience,published_at);
CREATE INDEX outbox_status_created ON mock_email_outbox(status,created_at);
CREATE INDEX payments_source_date ON payments(source_type,created_at);

CREATE TRIGGER payments_no_update BEFORE UPDATE ON payments BEGIN
 SELECT RAISE(ABORT,'Settlements are immutable');
END;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN
 SELECT RAISE(ABORT,'Settlements are immutable');
END;
CREATE TRIGGER payment_source_amount BEFORE INSERT ON payments BEGIN
 SELECT CASE WHEN NEW.source_type='dues' AND NEW.amount_paise<>(SELECT amount_paise FROM dues_payments WHERE id=NEW.source_id) THEN RAISE(ABORT,'Dues settlement amount mismatch') END;
 SELECT CASE WHEN NEW.source_type='ticket' AND NEW.amount_paise<>(SELECT price_paise FROM tickets WHERE id=NEW.source_id) THEN RAISE(ABORT,'Ticket settlement amount mismatch') END;
 SELECT CASE WHEN NEW.source_type='order' AND NEW.amount_paise<>(SELECT total_paise FROM orders WHERE id=NEW.source_id) THEN RAISE(ABORT,'Order settlement amount mismatch') END;
 SELECT CASE WHEN NEW.source_type='claim' AND NEW.amount_paise<>(SELECT amount_paise FROM expense_claims WHERE id=NEW.source_id) THEN RAISE(ABORT,'Claim settlement amount mismatch') END;
 SELECT CASE WHEN NEW.source_type IN('direct','adjustment') AND NEW.amount_paise<>(SELECT amount_paise FROM direct_financial_records WHERE id=NEW.source_id) THEN RAISE(ABORT,'Direct settlement amount mismatch') END;
END;
CREATE TRIGGER ledger_payment_integrity BEFORE INSERT ON ledger_entries BEGIN
 SELECT CASE WHEN NEW.amount_paise<>(SELECT amount_paise FROM payments WHERE id=NEW.payment_id) THEN RAISE(ABORT,'Ledger settlement amount mismatch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.source_type IN('dues','ticket','order')) AND NEW.direction<>'IN' THEN RAISE(ABORT,'Sale settlements must be income') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.source_type='claim') AND (NEW.direction<>'OUT' OR NEW.claim_id IS NOT (SELECT source_id FROM payments WHERE id=NEW.payment_id)) THEN RAISE(ABORT,'Claim ledger source mismatch') END;
 SELECT CASE WHEN NEW.claim_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.source_type='claim' AND p.source_id=NEW.claim_id) THEN RAISE(ABORT,'Ledger claim source mismatch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM payments p JOIN direct_financial_records d ON d.id=p.source_id WHERE p.id=NEW.payment_id AND p.source_type IN('direct','adjustment') AND d.direction<>NEW.direction) THEN RAISE(ABORT,'Direct ledger direction mismatch') END;
 SELECT CASE WHEN NEW.reversal_of IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ledger_entries original WHERE original.id=NEW.reversal_of AND original.event_id IS NEW.event_id AND original.category=NEW.category) THEN RAISE(ABORT,'Reversal classification must match original') END;
END;
CREATE TRIGGER claim_edit_integrity BEFORE UPDATE ON expense_claims BEGIN
 SELECT CASE WHEN NEW.user_id<>OLD.user_id THEN RAISE(ABORT,'Claim ownership is immutable') END;
 SELECT CASE WHEN OLD.status NOT IN('DRAFT','CHANGES_REQUESTED') AND (NEW.event_id IS NOT OLD.event_id OR NEW.task_id IS NOT OLD.task_id OR NEW.description<>OLD.description OR NEW.category<>OLD.category OR NEW.amount_paise<>OLD.amount_paise) THEN RAISE(ABORT,'Submitted claim evidence is immutable') END;
 SELECT CASE WHEN NEW.status<>OLD.status AND NOT (
   (OLD.status='DRAFT' AND NEW.status='SUBMITTED') OR
   (OLD.status='CHANGES_REQUESTED' AND NEW.status='SUBMITTED') OR
   (OLD.status='SUBMITTED' AND NEW.status IN('APPROVED_UNPAID','REJECTED','CHANGES_REQUESTED')) OR
   (OLD.status='APPROVED_UNPAID' AND NEW.status='PAID')
 ) THEN RAISE(ABORT,'Invalid claim transition') END;
 SELECT CASE WHEN NEW.payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.source_type='claim' AND p.source_id=NEW.id AND p.amount_paise=NEW.amount_paise) THEN RAISE(ABORT,'Claim payment link mismatch') END;
 SELECT CASE WHEN OLD.payment_id IS NOT NULL AND NEW.payment_id IS NOT OLD.payment_id THEN RAISE(ABORT,'Claim payment cannot be replaced') END;
END;
CREATE TRIGGER receipt_count_limit BEFORE INSERT ON receipt_files BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM receipt_files WHERE claim_id=NEW.claim_id)>=5 THEN RAISE(ABORT,'Receipt count exceeded') END;
END;
CREATE TRIGGER receipt_no_update BEFORE UPDATE ON receipt_files BEGIN
 SELECT RAISE(ABORT,'Receipt metadata is immutable');
END;
CREATE TRIGGER receipt_delete_editable BEFORE DELETE ON receipt_files BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM expense_claims c WHERE c.id=OLD.claim_id AND c.status IN('DRAFT','CHANGES_REQUESTED')) THEN RAISE(ABORT,'Submitted claim evidence is immutable') END;
END;
CREATE TRIGGER settled_ticket_integrity BEFORE UPDATE ON tickets WHEN OLD.payment_id IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.event_id<>OLD.event_id OR NEW.member_id IS NOT OLD.member_id OR NEW.owner_user_id IS NOT OLD.owner_user_id OR NEW.price_paise<>OLD.price_paise OR NEW.payment_id IS NOT OLD.payment_id THEN RAISE(ABORT,'Historical ticket settlement is immutable') END;
END;
CREATE TRIGGER settled_order_integrity BEFORE UPDATE ON orders WHEN OLD.payment_id IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.member_id IS NOT OLD.member_id OR NEW.total_paise<>OLD.total_paise OR NEW.payment_id IS NOT OLD.payment_id THEN RAISE(ABORT,'Historical order settlement is immutable') END;
END;
CREATE TRIGGER settled_order_item_no_update BEFORE UPDATE ON order_items WHEN EXISTS(SELECT 1 FROM orders o WHERE o.id=OLD.order_id AND o.payment_id IS NOT NULL) BEGIN
 SELECT RAISE(ABORT,'Historical order prices are immutable');
END;
CREATE TRIGGER settled_order_item_no_delete BEFORE DELETE ON order_items WHEN EXISTS(SELECT 1 FROM orders o WHERE o.id=OLD.order_id AND o.payment_id IS NOT NULL) BEGIN
 SELECT RAISE(ABORT,'Historical order prices are immutable');
END;
