import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DateTime } from 'luxon';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-pop-invariants-'));
process.env.TEST_DB_PATH = path.join(temp, 'pop_test.sqlite');
process.env.UPLOAD_DIR = path.join(temp, 'receipts');
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.SEED_REFERENCE_DATE = DateTime.now().setZone('Asia/Kolkata').toISODate()!;

const { getDb, closeDb } = await import('../apps/api/src/db/index.js');
const { seedDemo, SEED_IDS } = await import('../scripts/seed.js');
const { reconcileDatabase } = await import('../scripts/reconcile.js');

test('population invariants: 200 people, 50 volunteers, 150 members, 140 ticketed, 10 unticketed', async () => {
  await seedDemo();
  const db = getDb();
  const scalar = (sql: string, params: any[] = []) => (db.prepare(sql).get(...params) as any)?.val;

  // 1. Exactly 150 members
  const memberCount = scalar('SELECT COUNT(*) val FROM member_records');
  assert.equal(memberCount, 150, 'Exactly 150 member records');

  // 2. Exactly 50 volunteers
  const volunteerCount = scalar("SELECT COUNT(*) val FROM user_roles WHERE role='volunteer'");
  assert.equal(volunteerCount, 50, 'Exactly 50 volunteers');

  // 3. Exactly 140 distinct ticketed members
  const distinctTicketedMembers = scalar('SELECT COUNT(DISTINCT member_id) val FROM tickets WHERE member_id IS NOT NULL');
  assert.equal(distinctTicketedMembers, 140, 'Exactly 140 distinct members have tickets');

  // 4. Exactly 10 unticketed members
  const unticketedMembers = db.prepare('SELECT id FROM member_records WHERE id NOT IN (SELECT DISTINCT member_id FROM tickets WHERE member_id IS NOT NULL) ORDER BY id').all() as any[];
  assert.equal(unticketedMembers.length, 10, 'Exactly 10 unticketed members');
  const unticketedIds = unticketedMembers.map(m => m.id);
  for (let i = 141; i <= 150; i++) {
    assert.ok(unticketedIds.includes(`seed-member-${i}`), `Member ${i} is unticketed`);
  }

  // 5. No event exceeds capacity and seats_sold matches issued tickets
  const events = db.prepare('SELECT id, title, capacity, seats_sold, (SELECT COUNT(*) FROM tickets WHERE event_id=events.id) issued FROM events').all() as any[];
  assert.equal(events.length, 4, 'Four events exist');
  for (const e of events) {
    assert.equal(e.seats_sold, e.issued, `Event ${e.title} seats_sold matches issued count`);
    assert.ok(e.seats_sold <= e.capacity, `Event ${e.title} does not exceed capacity (${e.seats_sold} <= ${e.capacity})`);
  }

  // 6. Free event (Bake Sale Fundraiser) generates 0 paise ticket revenue and 0 ledger entries
  const bakeTickets = db.prepare("SELECT t.id, t.price_paise, p.amount_paise, l.id ledger_id FROM tickets t LEFT JOIN payments p ON p.id=t.payment_id LEFT JOIN ledger_entries l ON l.payment_id=p.id WHERE t.event_id=?").all(SEED_IDS.fundraiser) as any[];
  assert.equal(bakeTickets.length, 46, '46 tickets for bake sale fundraiser');
  for (const bt of bakeTickets) {
    assert.equal(bt.price_paise, 0, 'Bake sale ticket price is 0');
    assert.equal(bt.amount_paise, 0, 'Bake sale payment amount is 0');
    assert.equal(bt.ledger_id, null, 'Free event produces zero ledger entries');
  }

  // 7. Exactly 18 volunteer tasks with proper status
  const tasks = db.prepare('SELECT id, status FROM tasks').all() as any[];
  assert.equal(tasks.length, 18, 'Exactly 18 tasks across volunteers');

  // 8. Krish Mehta open tasks and due today
  const krishTasks = db.prepare("SELECT id, status, due_at FROM tasks WHERE assignee_id='seed-volunteer-1'").all() as any[];
  const krishOpen = krishTasks.filter(t => ['ASSIGNED', 'IN_PROGRESS'].includes(t.status));
  assert.equal(krishOpen.length, 3, 'Krish has 3 open tasks');

  // 9. Krish reimbursements
  const krishClaims = scalar("SELECT SUM(amount_paise) val FROM expense_claims WHERE user_id='seed-volunteer-1' AND status IN ('SUBMITTED','APPROVED_UNPAID')");
  assert.equal(krishClaims, 183_700, 'Krish awaiting reimbursement is ₹1,837 (183,700 paise)');

  // 10. Database reconciliation passes with assertSeed=true
  const reconcileResult = reconcileDatabase(db, true);
  assert.equal(reconcileResult.ok, true, 'Database reconciliation passes');
  assert.equal(reconcileResult.totals.balance, 24_610_000, 'Reconciled cash balance is ₹246,100.00');
  assert.equal(reconcileResult.totals.received, 30_850_000, 'Reconciled cash received is ₹308,500.00');
  assert.equal(reconcileResult.totals.paid, 6_240_000, 'Reconciled cash paid is ₹62,400.00');

  // 11. Repeat seed safety
  const repeatSeed = await seedDemo();
  assert.equal(repeatSeed.seeded, false, 'Repeat seed does not duplicate records');
});

