import { getDb } from '../db/index.js';
import { apiError, audit, id, now } from '../utils.js';
import { DateTime } from 'luxon';

export type MoneyRecord = { amount_paise: number; category: string; description: string; event_id?: string | null; method: string; reference?: string; date?: string };
export function organizationTimezone(): string { return (getDb().prepare('SELECT timezone FROM organization_settings WHERE id=1').get() as any).timezone; }
export function localDate(timestamp = now()): string { return DateTime.fromISO(timestamp, { zone: 'utc' }).setZone(organizationTimezone()).toISODate()!; }
export function settlementKind(): 'manual' | 'mock' { return (getDb().prepare('SELECT demo_mode FROM organization_settings WHERE id=1').get() as any).demo_mode ? 'mock' : 'manual'; }

export function assertEditableClaim(claim: any) {
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(claim.status)) throw apiError(409, 'CLAIM_IMMUTABLE', 'Only drafts and claims requiring corrections may be edited.');
}

export function postPayment(
  actor: string,
  sourceType: string,
  sourceId: string,
  amount: number,
  method: string,
  reference: string,
  category: string,
  description: string,
  direction: 'IN' | 'OUT',
  eventId: string | null = null,
  occurredAt = now(),
  claimId: string | null = null,
  extra?: { provider?: string; provider_order_id?: string | null; provider_payment_id?: string | null; provider_status?: string | null }
) {
  const db = getDb();
  if (!Number.isSafeInteger(amount) || amount < 0) throw apiError(422, 'INVALID_MONEY', 'Amounts must be integer paise.');
  const paymentId = id();
  db.prepare('INSERT INTO payments(id,source_type,source_id,amount_paise,method,reference,settlement_kind,actor_id,created_at,provider,provider_order_id,provider_payment_id,provider_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
      paymentId,
      sourceType,
      sourceId,
      amount,
      method,
      reference,
      settlementKind(),
      actor,
      occurredAt,
      extra?.provider || 'manual',
      extra?.provider_order_id || null,
      extra?.provider_payment_id || null,
      extra?.provider_status || 'captured'
    );
  if (amount > 0) db.prepare('INSERT INTO ledger_entries(id,direction,amount_paise,category,description,event_id,payment_id,claim_id,actor_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id(), direction, amount, category, description, eventId, paymentId, claimId, actor, occurredAt, now());
  return paymentId;
}

export function payClaim(actor: string, claimId: string, method: string, reference: string) {
  const db = getDb();
  return db.transaction(() => {
    const claim = db.prepare('SELECT * FROM expense_claims WHERE id=?').get(claimId) as any;
    if (!claim) throw apiError(404, 'NOT_FOUND', 'Claim not found.');
    if (claim.status !== 'APPROVED_UNPAID') throw apiError(409, 'INVALID_TRANSITION', 'Only approved unpaid claims may be recorded as paid.');
    const paymentId = postPayment(actor, 'claim', claimId, claim.amount_paise, method, reference, claim.category, claim.description, 'OUT', claim.event_id, now(), claimId);
    const changed = db.prepare("UPDATE expense_claims SET status='PAID',payment_id=?,paid_at=?,updated_at=? WHERE id=? AND status='APPROVED_UNPAID'").run(paymentId, now(), now(), claimId);
    if (changed.changes !== 1) throw apiError(409, 'ALREADY_PAID', 'This claim was already paid.');
    audit(actor, 'claim.pay', 'expense_claim', claimId, { payment_id: paymentId, method, settlement_kind: settlementKind() });
    return db.prepare('SELECT * FROM expense_claims WHERE id=?').get(claimId);
  }).immediate();
}

export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function periodRange(period: string) {
  if (!['all', 'month', 'year'].includes(period)) throw apiError(422, 'INVALID_PERIOD', 'Choose all, month or year.', { period: ['Unsupported reporting period.'] });
  const current = DateTime.now().setZone(organizationTimezone());
  if (period === 'month') return { start: current.startOf('month').toUTC().toISO()!, end: current.startOf('month').plus({ months: 1 }).toUTC().toISO()! };
  if (period === 'year') return { start: current.startOf('year').toUTC().toISO()!, end: current.startOf('year').plus({ years: 1 }).toUTC().toISO()! };
  return { start: '0000-01-01T00:00:00.000Z', end: '9999-12-31T23:59:59.999Z' };
}

export function financeSummary(period = 'all', eventId: string | null = null) {
  const db = getDb();
  const { start, end } = periodRange(period);
  const totals = db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount_paise ELSE 0 END),0) received,COALESCE(SUM(CASE WHEN direction='OUT' THEN amount_paise ELSE 0 END),0) paid FROM ledger_entries WHERE occurred_at>=? AND occurred_at<? AND (? IS NULL OR event_id=?)").get(start, end, eventId, eventId) as any;
  const opening = db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount_paise ELSE -amount_paise END),0) balance FROM ledger_entries WHERE occurred_at<? AND (? IS NULL OR event_id=?)").get(start, eventId, eventId) as any;
  const obligation = db.prepare("SELECT COALESCE(SUM(CASE WHEN status='APPROVED_UNPAID' THEN amount_paise ELSE 0 END),0) approved,COALESCE(SUM(CASE WHEN status='SUBMITTED' THEN amount_paise ELSE 0 END),0) pending FROM expense_claims WHERE (? IS NULL OR event_id=?)").get(eventId, eventId) as any;
  const sources = db.prepare("SELECT l.category, SUM(CASE WHEN l.direction='IN' THEN l.amount_paise ELSE -l.amount_paise END) amount_paise FROM ledger_entries l LEFT JOIN ledger_entries original ON original.id=l.reversal_of WHERE l.occurred_at>=? AND l.occurred_at<? AND (? IS NULL OR l.event_id=?) AND ((l.direction='IN' AND l.reversal_of IS NULL) OR original.direction='IN') GROUP BY l.category").all(start, end, eventId, eventId);
  const outgoing = db.prepare("SELECT l.category, SUM(CASE WHEN l.direction='OUT' THEN l.amount_paise ELSE -l.amount_paise END) amount_paise FROM ledger_entries l LEFT JOIN ledger_entries original ON original.id=l.reversal_of WHERE l.occurred_at>=? AND l.occurred_at<? AND (? IS NULL OR l.event_id=?) AND ((l.direction='OUT' AND l.reversal_of IS NULL) OR original.direction='OUT') GROUP BY l.category").all(start, end, eventId, eventId);
  const initial = eventId ? 0 : (db.prepare('SELECT opening_cash_paise FROM organization_settings WHERE id=1').get() as any).opening_cash_paise;
  const unpaid = (db.prepare("SELECT COALESCE(SUM(t.dues_paise),0) amount FROM membership_terms t JOIN member_records m ON m.id=t.member_id WHERE t.status='UNPAID' AND m.archived=0").get() as any).amount;
  return { period, start, end, event_id: eventId, opening_cash_paise: initial + opening.balance, cash_received_paise: totals.received, cash_paid_paise: totals.paid, cash_balance_paise: initial + opening.balance + totals.received - totals.paid, approved_unpaid_paise: obligation.approved, pending_claims_paise: obligation.pending, unpaid_dues_paise: eventId ? 0 : unpaid, income_sources: sources, outgoing_categories: outgoing, balance_explanation: eventId ? 'Event cash is the cumulative settled inflows minus outflows linked to this event; it is not an allocated bank balance. Outstanding claims are current obligations outside the period filter.' : 'Closing cash is opening cash plus settled inflows minus settled outflows. Claim obligations and unpaid dues are current outstanding amounts, outside the cash period filter.' };
}

export function claimView(claim: any) {
  if (!claim) return claim;
  const db = getDb();
  return { ...claim, receipts: db.prepare('SELECT id,claim_id,original_name,mime_type,size_bytes,created_at FROM receipt_files WHERE claim_id=? ORDER BY created_at').all(claim.id), payment_history: claim.payment_id ? db.prepare('SELECT id,amount_paise,method,reference,settlement_kind,created_at FROM payments WHERE id=?').all(claim.payment_id) : [] };
}
