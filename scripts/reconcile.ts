import 'dotenv/config';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getDb, closeDb, type SqliteDatabase } from '../apps/api/src/db/index.js';

const expectedSeed = { membership: 4_500_000, tickets: 6_000_000, merchandise: 3_100_000, fundraiser: 1_250_000, received: 14_850_000, paid: 6_240_000, balance: 8_610_000, approved_unpaid: 840_000 };

/** Checks relationships and amounts, not just a balancing dashboard number. */
export function reconcileDatabase(db: SqliteDatabase = getDb(), assertSeed = false) {
  const all = (sql: string) => db.prepare(sql).all() as any[];
  const value = (sql: string) => (db.prepare(sql).get() as any).amount as number;
  assert.deepEqual(db.pragma('foreign_key_check'), [], 'Foreign-key integrity');
  assert.equal((db.pragma('integrity_check') as any[])[0].integrity_check, 'ok', 'SQLite integrity');
  const sources = all(`SELECT p.id,p.source_type,p.source_id,p.amount_paise,p.source_type='adjustment' adjustment,
    CASE p.source_type WHEN 'dues' THEN d.amount_paise WHEN 'ticket' THEN t.price_paise WHEN 'order' THEN o.total_paise WHEN 'claim' THEN c.amount_paise ELSE f.amount_paise END source_amount,
    l.amount_paise ledger_amount,l.direction,
    CASE WHEN p.source_type IN ('dues','ticket','order') THEN 'IN' WHEN p.source_type='claim' THEN 'OUT' ELSE f.direction END expected_direction,
    CASE p.source_type WHEN 'dues' THEN d.payment_id WHEN 'ticket' THEN t.payment_id WHEN 'order' THEN o.payment_id WHEN 'claim' THEN c.payment_id ELSE p.id END linked_payment
    FROM payments p LEFT JOIN dues_payments d ON p.source_type='dues' AND d.id=p.source_id
    LEFT JOIN tickets t ON p.source_type='ticket' AND t.id=p.source_id
    LEFT JOIN orders o ON p.source_type='order' AND o.id=p.source_id
    LEFT JOIN expense_claims c ON p.source_type='claim' AND c.id=p.source_id
    LEFT JOIN direct_financial_records f ON p.source_type IN ('direct','adjustment') AND f.id=p.source_id
    LEFT JOIN ledger_entries l ON l.payment_id=p.id`);
  for (const payment of sources) {
    assert.equal(payment.source_amount, payment.amount_paise, `Source amount: ${payment.id}`);
    assert.equal(payment.linked_payment, payment.id, `Source backlink: ${payment.id}`);
    if (payment.amount_paise === 0) assert.equal(payment.ledger_amount, null, `Zero payment has no cash movement: ${payment.id}`);
    else {
      assert.equal(payment.ledger_amount, payment.amount_paise, `Ledger amount: ${payment.id}`);
      assert.equal(payment.direction, payment.expected_direction, `Ledger direction: ${payment.id}`);
    }
  }
  for (const order of all('SELECT o.id,o.total_paise,COALESCE(SUM(i.quantity*i.unit_price_paise),0) lines FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id')) assert.equal(order.lines, order.total_paise, `Historical order lines: ${order.id}`);
  for (const variant of all('SELECT v.id,v.stock,COALESCE(SUM(s.quantity),0) movements FROM product_variants v LEFT JOIN stock_movements s ON s.variant_id=v.id GROUP BY v.id')) assert.equal(variant.stock, variant.movements, `Stock movements: ${variant.id}`);
  for (const event of all('SELECT e.id,e.seats_sold,e.capacity,COUNT(t.id) issued FROM events e LEFT JOIN tickets t ON t.event_id=e.id GROUP BY e.id')) { assert.equal(event.seats_sold, event.issued, `Issued seats: ${event.id}`); assert.ok(event.seats_sold <= event.capacity, `Capacity: ${event.id}`); }
  for (const claim of all("SELECT c.id,c.status,c.payment_id,COUNT(l.id) entries FROM expense_claims c LEFT JOIN ledger_entries l ON l.claim_id=c.id GROUP BY c.id")) {
    assert.equal(claim.entries, claim.status === 'PAID' ? 1 : 0, `Single claim cash payment: ${claim.id}`);
    assert.equal(Boolean(claim.payment_id), claim.status === 'PAID', `Claim settlement: ${claim.id}`);
  }
  const income = Object.fromEntries(all("SELECT category,SUM(amount_paise) amount FROM ledger_entries WHERE direction='IN' AND reversal_of IS NULL GROUP BY category").map(row => [row.category, row.amount]));
  const received = value("SELECT COALESCE(SUM(amount_paise),0) amount FROM ledger_entries WHERE direction='IN'");
  const paid = value("SELECT COALESCE(SUM(amount_paise),0) amount FROM ledger_entries WHERE direction='OUT'");
  const opening = (db.prepare('SELECT opening_cash_paise FROM organization_settings WHERE id=1').get() as any).opening_cash_paise;
  const approved_unpaid = value("SELECT COALESCE(SUM(amount_paise),0) amount FROM expense_claims WHERE status='APPROVED_UNPAID'");
  const totals = { ...income, received, paid, balance: opening + received - paid, approved_unpaid };
  if (assertSeed) {
    for (const [name, amount] of Object.entries(expectedSeed)) assert.equal(totals[name as keyof typeof totals], amount, `Default seed total: ${name}`);
    const krish = value("SELECT COALESCE(SUM(amount_paise),0) amount FROM expense_claims WHERE user_id='seed-volunteer-1' AND status IN ('SUBMITTED','APPROVED_UNPAID')");
    assert.equal(krish, 183_700, 'Krish submitted plus approved-unpaid');
    assert.equal(value('SELECT COUNT(*) amount FROM member_records'), 50, 'Fifty seeded members');
  }
  return { ok: true, currency: 'INR', unit: 'paise', payments_checked: sources.length, totals, default_seed_checked: assertSeed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(reconcileDatabase(getDb(), process.argv.includes('--seed')), null, 2)); }
  finally { closeDb(); }
}
