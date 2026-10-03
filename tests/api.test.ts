import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { DateTime } from 'luxon';

// These overrides happen before imports of any application/database module.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-api-tests-'));
process.env.TEST_DB_PATH = path.join(temp, 'acceptance.sqlite');
process.env.UPLOAD_DIR = path.join(temp, 'receipts');
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.SESSION_SECRET = 'isolated-test-session-secret-at-least-32-characters';
process.env.SEED_REFERENCE_DATE = DateTime.now().setZone('Asia/Kolkata').toISODate()!;
process.env.APP_ORIGIN = 'http://localhost:5173';

const { getDb, closeDb, openDatabase } = await import('../apps/api/src/db/index.js');
const { seedDemo, DEMO_PASSWORD, SEED_IDS } = await import('../scripts/seed.js');
const { createApp } = await import('../apps/api/src/app.js');
const { reconcileDatabase } = await import('../scripts/reconcile.js');
const { createBackup } = await import('../scripts/backup.js');
const { localDate } = await import('../apps/api/src/services/operations.js');
let app: ReturnType<typeof createApp>;
let server: Server;
let base: string;

class Client {
  cookie = '';
  csrf = '';
  async request(method: string, route: string, body?: unknown, options: { token?: boolean; origin?: string; key?: string } = {}) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (options.token !== false && this.csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = this.csrf;
    if (options.origin) headers.Origin = options.origin;
    if (options.key) headers['Idempotency-Key'] = options.key;
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + '/api/v1' + route, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) this.cookie = cookies.find(c => c.startsWith('skyline.sid='))?.split(';')[0] || this.cookie;
    const text = await response.text();
    const json = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : undefined;
    return { status: response.status, data: json?.data, error: json?.error, text, headers: response.headers };
  }
  async token() { const result = await this.request('GET', '/auth/csrf'); this.csrf = result.data.csrfToken; }
  async login(email = 'admin@skyline.example.com', portal = 'admin', password = DEMO_PASSWORD) {
    await this.token();
    const result = await this.request('POST', '/auth/login', { email, password, requestedPortal: portal });
    if (result.status === 200) this.csrf = result.data.csrfToken;
    return result;
  }
}
const admin = new Client();
const krish = new Client();
const other = new Client();
const anonymous = new Client();
const expectStatus = (result: any, expected: number) => assert.equal(result.status, expected, result.error?.message || result.text);
const scalar = (sql: string, ...args: any[]): number => (getDb().prepare(sql).get(...args) as any).n;
const cash = async () => (await admin.request('GET', '/finance/summary')).data.cash_balance_paise;
const receiptBytes = () => fs.readFileSync(path.join(process.env.UPLOAD_DIR!, 'seed-claim-draft-fictional.pdf'));
function uploadForm(name = 'FICTIONAL-receipt.pdf', bytes = receiptBytes(), mime = 'application/pdf', count = 1) {
  const form = new FormData(); for (let i = 0; i < count; i++) form.append('files', new Blob([new Uint8Array(bytes)], { type: mime }), name); return form;
}
async function newClaim(description = 'Fictional supplies purchase', amount = 12400) {
  const result = await krish.request('POST', '/claims', { description, category: 'supplies', amount_paise: amount }); expectStatus(result, 201); return result.data.id as string;
}
async function start() {
  app = createApp(); server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}
async function stop() {
  server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await app.locals.close(); closeDb();
}

before(async () => { await seedDemo(); await start(); expectStatus(await admin.login(), 200); expectStatus(await krish.login('krish@skyline.example.com', 'volunteer'), 200); expectStatus(await other.login('volunteer2@example.com', 'volunteer'), 200); });
after(async () => {
  if (server?.listening) await stop();
  const target = path.resolve(temp); assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  fs.rmSync(target, { recursive: true, force: true });
});

test('default seed is repeat safe and reconciles every financial source, stock movement and seat', async () => {
  const result = reconcileDatabase(getDb(), true); assert.equal(result.totals.balance, 8_610_000);
  const before = scalar('SELECT COUNT(*) n FROM payments'); assert.equal((await seedDemo()).seeded, false); assert.equal(scalar('SELECT COUNT(*) n FROM payments'), before);
  const dashboard = await admin.request('GET', '/admin/dashboard'); expectStatus(dashboard, 200); assert.equal(dashboard.data.cash_received_paise, 14_850_000); assert.equal(dashboard.data.cash_paid_paise, 6_240_000); assert.equal(dashboard.data.approved_unpaid_paise, 840_000);
  const volunteer = await krish.request('GET', '/volunteer/dashboard'); assert.equal(volunteer.data.awaiting_reimbursement_paise, 183_700); assert.equal(volunteer.data.open_tasks, 3); assert.equal(volunteer.data.due_today, 2); assert.equal(volunteer.data.cash_balance_paise, undefined);
});

test('portal roles, forged fields, CSRF, origins, unauthenticated and admin API boundaries', async () => {
  expectStatus(await anonymous.request('GET', '/admin/dashboard'), 401);
  const denied = new Client(); expectStatus(await denied.login('krish@skyline.example.com', 'admin'), 401); expectStatus(await denied.login('admin@skyline.example.com', 'volunteer'), 401);
  expectStatus(await denied.request('POST', '/auth/login', { email: 'krish@skyline.example.com', password: DEMO_PASSWORD, requestedPortal: 'superadmin' }), 422);
  expectStatus(await denied.request('POST', '/auth/login', { email: 'krish@skyline.example.com', password: DEMO_PASSWORD, requestedPortal: 'volunteer', roles: ['admin'] }), 422);
  expectStatus(await krish.request('GET', '/admin/dashboard'), 403); expectStatus(await admin.request('GET', '/volunteer/dashboard'), 403);
  for (const route of ['/members', '/users', '/products', '/finance/summary', '/finance/export.csv', '/mock-outbox']) expectStatus(await krish.request('GET', route), 403);
  expectStatus(await krish.request('PATCH', `/users/${SEED_IDS.krish}`, { roles: ['admin'] }), 403);
  expectStatus(await krish.request('POST', `/claims/${SEED_IDS.printing}/pay`, { method: 'cash' }), 403);
  expectStatus(await admin.request('PATCH', '/settings', { dues_paise: 100 }, { token: false }), 403);
  expectStatus(await admin.request('PATCH', '/settings', { dues_paise: 100 }, { origin: 'https://attacker.example' }), 403);
  expectStatus(await admin.request('PATCH', '/settings', { dues_paise: 100000 }, { origin: 'http://localhost:5173' }), 200);
  expectStatus(await admin.request('PATCH', '/settings', { dues_paise: 100000 }, { origin: 'http://127.0.0.1:5173' }), 200);
  const missing = await admin.request('GET', '/does-not-exist'); expectStatus(missing, 404); assert.equal(missing.error.code, 'NOT_FOUND');
});

test('current database roles, dual workspace identity, deactivation and final administrator protection', async () => {
  expectStatus(await admin.request('PATCH', `/users/${SEED_IDS.admin}`, { active: false }), 409);
  expectStatus(await admin.request('PATCH', `/users/${SEED_IDS.admin}`, { roles: ['volunteer'] }), 409);
  const result = await admin.request('POST', '/users', { name: 'Fictional Dual Role', email: 'dual@example.com', password: DEMO_PASSWORD, roles: ['admin', 'volunteer'] }); expectStatus(result, 201);
  const dual = new Client(); expectStatus(await dual.login('dual@example.com', 'volunteer'), 200); expectStatus(await dual.request('GET', '/admin/dashboard'), 200); expectStatus(await dual.request('GET', '/volunteer/dashboard'), 200);
  expectStatus(await admin.request('PATCH', `/users/${result.data.id}`, { roles: ['volunteer'] }), 200); expectStatus(await dual.request('GET', '/admin/dashboard'), 403);
  expectStatus(await admin.request('PATCH', `/users/${result.data.id}`, { active: false }), 200); expectStatus(await dual.request('GET', '/auth/me'), 401);
  assert.ok(scalar("SELECT COUNT(*) n FROM audit_logs WHERE entity_id=? AND action='ACCOUNT_ROLES_UPDATED'", result.data.id) >= 2);
});

test('session rotation, account replacement, shared logout, absolute and idle expiry', async () => {
  const client = new Client(); await client.token(); const initial = client.cookie;
  expectStatus(await client.login(), 200); assert.notEqual(client.cookie, initial); expectStatus(await client.login('krish@skyline.example.com', 'volunteer'), 200);
  assert.equal((await client.request('GET', '/auth/me')).data.id, SEED_IDS.krish); expectStatus(await client.request('GET', '/admin/dashboard'), 403);
  expectStatus(await client.request('POST', '/auth/logout', {}), 200); expectStatus(await client.request('GET', '/auth/me'), 401);
  const expired = new Client(); expectStatus(await expired.login('volunteer9@example.com', 'volunteer'), 200);
  const session = (getDb().prepare('SELECT sid,sess FROM sessions').all() as any[]).find(row => JSON.parse(row.sess).userId === 'seed-volunteer-9');
  const contents = JSON.parse(session.sess); contents.loggedInAt = Date.now() - 8 * 60 * 60 * 1000 - 1; getDb().prepare('UPDATE sessions SET sess=? WHERE sid=?').run(JSON.stringify(contents), session.sid);
  expectStatus(await expired.request('GET', '/auth/me'), 401);
  expectStatus(await expired.login('volunteer9@example.com', 'volunteer'), 200);
  getDb().prepare("UPDATE sessions SET expired=? WHERE json_extract(sess,'$.userId')=?").run(Date.now() - 1000, 'seed-volunteer-9'); expectStatus(await expired.request('GET', '/auth/me'), 401);
});

test('wrong password throttling uses generic errors and persisted attempt counters', async () => {
  const client = new Client(); for (let i = 0; i < 5; i++) { const result = await client.login('volunteer10@example.com', 'volunteer', 'WrongPassword!'); expectStatus(result, 401); assert.equal(result.error.code, 'LOGIN_FAILED'); }
  expectStatus(await client.login('volunteer10@example.com', 'volunteer'), 429);
});

test('password changes and administrator issued hashed one-use reset tokens invalidate sessions', async () => {
  const client = new Client(); expectStatus(await client.login('volunteer8@example.com', 'volunteer'), 200);
  expectStatus(await client.request('POST', '/auth/change-password', { currentPassword: DEMO_PASSWORD, newPassword: 'ChangedPassword!2026' }), 200); expectStatus(await client.request('GET', '/auth/me'), 401);
  expectStatus(await client.login('volunteer8@example.com', 'volunteer'), 401); expectStatus(await client.login('volunteer8@example.com', 'volunteer', 'ChangedPassword!2026'), 200);
  expectStatus(await krish.request('POST', '/users/seed-volunteer-8/reset', {}), 403);
  const issued = await admin.request('POST', '/users/seed-volunteer-8/reset', {}); expectStatus(issued, 200); const token = new URL(issued.data.setup_link).searchParams.get('token')!;
  assert.notEqual((getDb().prepare('SELECT token_hash FROM password_reset_tokens WHERE user_id=? AND used_at IS NULL').get('seed-volunteer-8') as any).token_hash, token);
  const reset = new Client(); await reset.token(); expectStatus(await reset.request('POST', '/auth/reset/consume', { token, newPassword: 'ResetPassword!2026' }), 200); expectStatus(await client.request('GET', '/auth/me'), 401);
  await reset.token(); expectStatus(await reset.request('POST', '/auth/reset/consume', { token, newPassword: 'AnotherPassword!2026' }), 422);
  expectStatus(await reset.login('volunteer8@example.com', 'volunteer', 'ResetPassword!2026'), 200);
});

test('claim/receipt/task ownership and forbidden immutable fields are enforced on the server', async () => {
  expectStatus(await other.request('GET', `/claims/${SEED_IDS.stationery}`), 404); expectStatus(await other.request('GET', '/receipts/seed-receipt-stationery'), 404); expectStatus(await anonymous.request('GET', '/receipts/seed-receipt-stationery'), 401);
  expectStatus(await other.request('PATCH', '/tasks/seed-task-supplies', { status: 'IN_PROGRESS' }), 404);
  expectStatus(await krish.request('PATCH', '/tasks/seed-task-supplies', { budget_paise: 1, status: 'IN_PROGRESS' }), 422);
  expectStatus(await krish.request('PATCH', '/tasks/seed-task-supplies', { status: 'CANCELLED' }), 422);
  for (const claim of [SEED_IDS.stationery, SEED_IDS.printing, SEED_IDS.supplies]) {
    expectStatus(await krish.request('PATCH', `/claims/${claim}`, { description: 'Changed description', category: 'supplies', amount_paise: 1 }), 409);
    expectStatus(await krish.request('POST', `/claims/${claim}/receipts`, uploadForm()), 409);
  }
  expectStatus(await krish.request('POST', '/claims', { description: 'Forged claimant', category: 'supplies', amount_paise: 100, user_id: 'seed-volunteer-2' }), 422);
  expectStatus(await krish.request('POST', '/claims', { description: 'Other assigned task', category: 'supplies', amount_paise: 100, task_id: 'seed-task-stage' }), 422);
  expectStatus(await krish.request('POST', '/claims', { description: 'Mismatched task event', category: 'supplies', amount_paise: 100, task_id: 'seed-task-printing', event_id: SEED_IDS.gala }), 422);
});

test('receipt signatures, MIME, traversal, aggregate count and private authorized reads', async () => {
  const claim = await newClaim('Receipt validation acceptance'); const diskBefore = fs.readdirSync(process.env.UPLOAD_DIR!).length;
  expectStatus(await other.request('POST', `/claims/${claim}/receipts`, uploadForm()), 404); assert.equal(fs.readdirSync(process.env.UPLOAD_DIR!).length, diskBefore);
  expectStatus(await krish.request('POST', `/claims/${claim}/receipts`, uploadForm('receipt.pdf', Buffer.from('<html>not a PDF</html>'))), 422);
  expectStatus(await krish.request('POST', `/claims/${claim}/receipts`, uploadForm('receipt.pdf', receiptBytes(), 'text/html')), 422);
  expectStatus(await krish.request('POST', `/claims/${claim}/receipts`, uploadForm('..escape.pdf')), 422);
  expectStatus(await krish.request('POST', `/claims/${claim}/receipts`, uploadForm('large.pdf', Buffer.alloc(5 * 1024 * 1024 + 1))), 422);
  expectStatus(await krish.request('POST', `/claims/${claim}/receipts`, uploadForm('receipt.pdf', receiptBytes(), 'application/pdf', 4)), 201);
  const parallel = await Promise.all([krish.request('POST', `/claims/${claim}/receipts`, uploadForm('fifth.pdf')), krish.request('POST', `/claims/${claim}/receipts`, uploadForm('sixth.pdf'))]);
  assert.deepEqual(parallel.map(r => r.status).sort(), [201, 422]); assert.equal(scalar('SELECT COUNT(*) n FROM receipt_files WHERE claim_id=?', claim), 5);
  const receipts = (await krish.request('GET', `/claims/${claim}`)).data.receipts; const file = await krish.request('GET', `/receipts/${receipts[0].id}`); expectStatus(file, 200); assert.equal(file.headers.get('content-type'), 'application/pdf'); assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  expectStatus(await krish.request('DELETE', `/receipts/${receipts[0].id}`), 200);
});

test('availability, assignment, task and expense review/payment form one connected workflow', async () => {
  const event = await admin.request('POST', '/events', { title: 'Fictional Acceptance Event', start_at: new Date(Date.now() + 86400000).toISOString(), end_at: new Date(Date.now() + 90000000).toISOString(), location: 'Campus Hall', capacity: 4, status: 'PUBLISHED' }); expectStatus(event, 201);
  expectStatus(await admin.request('POST', `/events/${event.data.id}/availability-request`, {}), 200); expectStatus(await krish.request('POST', `/events/${event.data.id}/availability`, { response: 'AVAILABLE' }), 200);
  const assigned = await admin.request('POST', `/events/${event.data.id}/assignments`, { user_id: SEED_IDS.krish }); expectStatus(assigned, 200); assert.equal(assigned.data.warning, null);
  const task = await admin.request('POST', '/tasks', { title: 'Buy acceptance supplies', assignee_id: SEED_IDS.krish, event_id: event.data.id, budget_paise: 25000 }); expectStatus(task, 201);
  const claim = await krish.request('POST', '/claims', { description: 'Fictional workflow supplies', category: 'supplies', amount_paise: 12400, event_id: event.data.id, task_id: task.data.id }); expectStatus(claim, 201);
  expectStatus(await krish.request('POST', `/claims/${claim.data.id}/receipts`, uploadForm()), 201);
  const before = await cash(); expectStatus(await krish.request('POST', `/claims/${claim.data.id}/submit`, {}), 200); assert.equal(await cash(), before);
  expectStatus(await admin.request('POST', `/claims/${claim.data.id}/review`, { action: 'request_changes', note: 'Please include a clear itemized note.' }), 200);
  expectStatus(await krish.request('PATCH', `/claims/${claim.data.id}`, { description: 'Fictional itemized supplies', category: 'supplies', amount_paise: 12400, event_id: event.data.id, task_id: task.data.id }), 200);
  expectStatus(await krish.request('POST', `/claims/${claim.data.id}/submit`, {}), 200); expectStatus(await admin.request('POST', `/claims/${claim.data.id}/review`, { action: 'approve' }), 200); assert.equal(await cash(), before);
  const paid = await Promise.all([admin.request('POST', `/claims/${claim.data.id}/pay`, { method: 'cash', reference: 'FICTIONAL payment' }), admin.request('POST', `/claims/${claim.data.id}/pay`, { method: 'cash', reference: 'FICTIONAL payment' })]); assert.deepEqual(paid.map(p => p.status).sort(), [200, 409]); assert.equal(await cash(), before - 12400); assert.equal(scalar('SELECT COUNT(*) n FROM ledger_entries WHERE claim_id=?', claim.data.id), 1);
  expectStatus(await krish.request('PATCH', `/tasks/${task.data.id}`, { status: 'COMPLETED' }), 409); expectStatus(await krish.request('PATCH', `/tasks/${task.data.id}`, { status: 'IN_PROGRESS' }), 200); expectStatus(await krish.request('PATCH', `/tasks/${task.data.id}`, { status: 'COMPLETED' }), 200);
  assert.equal((await admin.request('GET', `/tasks?assignee_id=${SEED_IDS.krish}`)).data.find((t: any) => t.id === task.data.id).status, 'COMPLETED');
  assert.equal((await krish.request('GET', `/claims/${claim.data.id}`)).data.payment_history.length, 1);
});

test('payment idempotency is actor/action scoped and rejects payload changes', async () => {
  const body = { method: 'cash', reference: 'FICTIONAL idempotent' }; const key = 'acceptance-payout'; const before = await cash();
  const first = await admin.request('POST', `/claims/${SEED_IDS.printing}/pay`, body, { key }); expectStatus(first, 200); const retry = await admin.request('POST', `/claims/${SEED_IDS.printing}/pay`, body, { key }); expectStatus(retry, 200); assert.equal(first.data.payment_id, retry.data.payment_id); assert.equal(await cash(), before - 65000);
  expectStatus(await admin.request('POST', `/claims/${SEED_IDS.printing}/pay`, { method: 'upi', reference: 'Changed' }, { key }), 409);
  expectStatus(await admin.request('POST', `/claims/${SEED_IDS.printing}/pay`, body), 409);
  const second = await admin.request('POST', '/users', { name: 'Fictional Second Admin', email: 'second-admin@example.com', password: DEMO_PASSWORD, roles: ['admin'] }); expectStatus(second, 201);
  const client = new Client(); expectStatus(await client.login('second-admin@example.com', 'admin'), 200);
  const income = { amount_paise: 1000, description: 'Fictional actor scoped income', category: 'other', method: 'cash' };
  const actorOne = await admin.request('POST', '/finance/income', income, { key: 'same-key-different-actors' }); const actorTwo = await client.request('POST', '/finance/income', income, { key: 'same-key-different-actors' }); expectStatus(actorOne, 201); expectStatus(actorTwo, 201); assert.notEqual(actorOne.data.id, actorTwo.data.id);
});

test('partial edits preserve omitted event, task and member fields and dual-role own scopes', async () => {
  const event = await admin.request('POST', '/events', { title: 'Partial Update Event', start_at: new Date(Date.now() + 86400000).toISOString(), end_at: new Date(Date.now() + 90000000).toISOString(), location: 'Campus Room', capacity: 20, member_price_paise: 10000, nonmember_price_paise: 20000, budget_paise: 30000, volunteer_requirement: 3, description: 'Preserved details' }); expectStatus(event, 201);
  const published = await admin.request('PATCH', `/events/${event.data.id}`, { status: 'PUBLISHED' }); expectStatus(published, 200);
  for (const field of ['title', 'description', 'capacity', 'member_price_paise', 'nonmember_price_paise', 'budget_paise', 'volunteer_requirement']) assert.equal(published.data[field], event.data[field], field);
  const task = await admin.request('POST', '/tasks', { title: 'Partial Update Task', assignee_id: SEED_IDS.krish, instructions: 'Preserved instructions', status: 'IN_PROGRESS', budget_paise: 20000 }); expectStatus(task, 201);
  const edited = await admin.request('PATCH', `/tasks/${task.data.id}`, { title: 'Edited Task Title' }); expectStatus(edited, 200); assert.equal(edited.data.status, 'IN_PROGRESS'); assert.equal(edited.data.instructions, 'Preserved instructions'); assert.equal(edited.data.budget_paise, 20000);
  const member = await admin.request('POST', '/members', { name: 'Archive Preserve', email: 'archive@example.com', phone: '0123456789', notes: 'Keep this history' }); expectStatus(member, 201); const archived = await admin.request('PATCH', `/members/${member.data.id}`, { archived: true }); expectStatus(archived, 200); assert.equal(archived.data.phone, '0123456789'); assert.equal(archived.data.notes, 'Keep this history');
  expectStatus(await admin.request('PATCH', '/users/seed-volunteer-7', { roles: ['admin', 'volunteer'] }), 200); const dual = new Client(); expectStatus(await dual.login('volunteer7@example.com', 'volunteer'), 200);
  assert.ok((await dual.request('GET', '/claims?mine=true')).data.every((c: any) => c.user_id === 'seed-volunteer-7'));
  assert.ok((await dual.request('GET', '/tasks?mine=true')).data.every((t: any) => t.assignee_id === 'seed-volunteer-7'));
  expectStatus(await dual.request('PATCH', '/tasks/seed-task-supplies?mine=true', { status: 'IN_PROGRESS' }), 404);
});

test('dues settlement activates eligible membership once and preserves renewal history', async () => {
  const before = await cash(); const body = { term_id: 'seed-term-31', method: 'upi', reference: 'FICTIONAL dues' };
  const results = await Promise.all([admin.request('POST', '/members/seed-member-31/dues', body), admin.request('POST', '/members/seed-member-31/dues', body)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(await cash(), before + 150000);
  const member = await admin.request('GET', '/members/seed-member-31'); assert.equal(member.data.eligible, true); assert.equal(member.data.payments.length, 1);
  const renewal = await admin.request('POST', '/members/seed-member-31/renew', { starts_on: '2028-04-01', ends_on: '2029-03-31' }, { key: 'acceptance-renewal' }); expectStatus(renewal, 201);
  expectStatus(await admin.request('POST', '/members/seed-member-31/renew', { starts_on: '2028-04-01', ends_on: '2029-03-31' }, { key: 'acceptance-renewal' }), 201); assert.equal(scalar('SELECT COUNT(*) n FROM membership_terms WHERE member_id=?', 'seed-member-31'), 2);
});

test('last-seat sales cannot oversell, use server prices and reject repeated/wrong/cancelled check-in', async () => {
  const event = await admin.request('POST', '/events', { title: 'One Seat Event', start_at: new Date(Date.now() + 86400000).toISOString(), end_at: new Date(Date.now() + 90000000).toISOString(), location: 'Small Hall', capacity: 1, member_price_paise: 40000, nonmember_price_paise: 70000, status: 'PUBLISHED' }); expectStatus(event, 201);
  const body = { member_id: 'seed-member-41', buyer_name: 'Fictional Expired Member', method: 'cash' };
  const sales = await Promise.all([admin.request('POST', `/events/${event.data.id}/tickets`, body), admin.request('POST', `/events/${event.data.id}/tickets`, body)]); assert.deepEqual(sales.map(s => s.status).sort(), [201, 409]); assert.equal(sales.find(s => s.status === 201)!.data.price_paise, 70000);
  assert.equal((await admin.request('GET', `/events/${event.data.id}`)).data.seats_sold, 1);
  expectStatus(await krish.request('POST', `/events/${SEED_IDS.techfest}/check-in`, { code: 'SKY-TECH-002' }), 200); expectStatus(await krish.request('POST', `/events/${SEED_IDS.techfest}/check-in`, { code: 'SKY-TECH-002' }), 409);
  expectStatus(await krish.request('POST', `/events/${SEED_IDS.techfest}/check-in`, { code: 'SKY-TECH-003' }), 409); expectStatus(await admin.request('POST', `/events/${SEED_IDS.gala}/check-in`, { code: 'SKY-TECH-004' }), 404); expectStatus(await other.request('POST', `/events/${SEED_IDS.techfest}/check-in`, { code: 'SKY-TECH-004' }), 403);
  const before = await cash(); expectStatus(await admin.request('PATCH', `/events/${event.data.id}`, { status: 'CANCELLED' }), 200); assert.equal(await cash(), before); assert.equal((getDb().prepare('SELECT refund_status FROM tickets WHERE event_id=?').get(event.data.id) as any).refund_status, 'UNRESOLVED');
});

test('size stock sales are atomic, historical prices survive and zero opening stock is supported', async () => {
  const body = { buyer_name: 'Fictional Last Item Buyer', items: [{ variant_id: SEED_IDS.lastItem, quantity: 1 }], method: 'cash' };
  const sales = await Promise.all([admin.request('POST', '/orders', body), admin.request('POST', '/orders', body)]); assert.deepEqual(sales.map(s => s.status).sort(), [201, 409]); assert.equal(scalar('SELECT stock n FROM product_variants WHERE id=?', SEED_IDS.lastItem), 0);
  expectStatus(await admin.request('POST', '/stock-adjustments', { variant_id: SEED_IDS.lastItem, quantity: -1, reason: 'Invalid negative stock' }), 409);
  const created = await admin.request('POST', '/products', { name: 'Zero Stock Product', price_paise: 10000, member_price_paise: 8000, variants: [{ size: 'S', stock: 0 }] }); expectStatus(created, 201);
  const orderId = sales.find(s => s.status === 201)!.data.id; const original = scalar('SELECT unit_price_paise n FROM order_items WHERE order_id=?', orderId);
  expectStatus(await admin.request('PATCH', '/products/seed-product-hoodie', { name: 'Skyline Hoodie', price_paise: 110000, member_price_paise: 99000 }), 200); assert.equal(scalar('SELECT unit_price_paise n FROM order_items WHERE order_id=?', orderId), original);
  const safe = { buyer_name: 'Fictional Retry Buyer', items: [{ variant_id: 'seed-variant-shirt-S', quantity: 1 }], method: 'cash' }; const first = await admin.request('POST', '/orders', safe, { key: 'acceptance-order' }); expectStatus(first, 201); const repeated = await admin.request('POST', '/orders', safe, { key: 'acceptance-order' }); assert.equal(first.data.id, repeated.data.id);
});

test('announcements target members/volunteers, mock transport retries and reminders deduplicate', async () => {
  const nonMember = await admin.request('POST', '/users', { name: 'Fictional Nonmember Volunteer', email: 'nonmember@example.com', password: DEMO_PASSWORD }); expectStatus(nonMember, 201); const client = new Client(); expectStatus(await client.login('nonmember@example.com', 'volunteer'), 200);
  const create = await admin.request('POST', '/announcements', { title: 'Members only administrative audience', body: 'Fictional all member records notice', audience: 'all' }); expectStatus(create, 201);
  expectStatus(await admin.request('POST', `/announcements/${create.data.id}/publish`, {}), 200); expectStatus(await admin.request('POST', `/announcements/${create.data.id}/publish`, {}), 409);
  assert.equal((await client.request('GET', '/announcements')).data.some((a: any) => a.id === create.data.id), false); assert.equal((await client.request('GET', '/notifications')).data.some((n: any) => n.announcement_id === create.data.id), false);
  assert.equal((await krish.request('GET', '/announcements')).data.some((a: any) => a.id === create.data.id), true);
  const notice = (await krish.request('GET', '/notifications')).data.find((n: any) => n.announcement_id === create.data.id); expectStatus(await krish.request('POST', `/notifications/${notice.id}/read`, {}), 200); expectStatus(await client.request('POST', `/notifications/${notice.id}/read`, {}), 404);
  const run = await admin.request('POST', '/mock-outbox/run', { simulate_failure: true }); expectStatus(run, 200); assert.equal(run.data.real_email_sent, false); assert.ok(run.data.failed > 0);
  expectStatus(await admin.request('POST', '/mock-outbox/seed-outbox-failed/retry', {}), 200); const retried = await admin.request('POST', '/mock-outbox/run', {}); assert.ok(retried.data.delivered > 0);
  const first = await admin.request('POST', '/jobs/reminders', {}); expectStatus(first, 200); const second = await admin.request('POST', '/jobs/reminders', {}); assert.equal(second.data.queued, 0); assert.ok(first.data.queued > 0);
});

test('timezone calendar boundaries drive due-today, expiry alerts and period opening cash', async () => {
  const fixed = DateTime.now().setZone('Pacific/Kiritimati');
  try {
    expectStatus(await admin.request('PATCH', '/settings', { timezone: 'Pacific/Kiritimati' }), 200);
    assert.equal(localDate('2029-12-31T10:10:00.000Z'), '2030-01-01');
    const baseline = (await krish.request('GET', '/volunteer/dashboard')).data.due_today;
    const due = await admin.request('POST', '/tasks', { title: 'Timezone Boundary Task', assignee_id: SEED_IDS.krish, due_at: fixed.toUTC().toISO()! }); expectStatus(due, 201);
    assert.equal((await krish.request('GET', '/volunteer/dashboard')).data.due_today, baseline + 1);
    const member = await admin.request('POST', '/members', { name: 'Boundary Member', email: 'boundary@example.com' }); expectStatus(member, 201);
    const term = await admin.request('POST', `/members/${member.data.id}/renew`, { starts_on: fixed.minus({ years: 1 }).toISODate(), ends_on: fixed.plus({ days: 30 }).toISODate() }); expectStatus(term, 201); expectStatus(await admin.request('POST', `/members/${member.data.id}/dues`, { term_id: term.data.id, method: 'cash' }), 200);
    const reminders = await admin.request('POST', '/jobs/reminders', {}); expectStatus(reminders, 200); assert.ok(reminders.data.queued >= 1, 'Includes the thirtieth local calendar day despite a different UTC date');
    const summary = await admin.request('GET', '/finance/summary?period=month'); assert.equal(summary.data.start, fixed.startOf('month').toUTC().toISO()); assert.equal(summary.data.cash_balance_paise, summary.data.opening_cash_paise + summary.data.cash_received_paise - summary.data.cash_paid_paise);
  } finally { expectStatus(await admin.request('PATCH', '/settings', { timezone: 'Asia/Kolkata' }), 200); }
});

test('CSV formula escaping and full linked reversal preserve append-only ledger', async () => {
  const created = await admin.request('POST', '/finance/income', { amount_paise: 10000, category: 'other', description: '=HYPERLINK("malicious")', method: 'cash', reference: '+formula' }); expectStatus(created, 201);
  const csv = await admin.request('GET', '/finance/export.csv'); expectStatus(csv, 200); assert.ok(csv.text.includes("'=HYPERLINK")); assert.ok(csv.text.includes("'+formula"));
  const ledger = getDb().prepare('SELECT * FROM ledger_entries WHERE payment_id=?').get(created.data.payment_id) as any; assert.throws(() => getDb().prepare('UPDATE ledger_entries SET amount_paise=1 WHERE id=?').run(ledger.id), /append-only/);
  const before = await cash(); const reversed = await admin.request('POST', `/finance/transactions/${ledger.id}/reverse`, { reason: 'Fictional correction' }); expectStatus(reversed, 200); assert.equal(await cash(), before - 10000); assert.equal(reversed.data.reversal_of, ledger.id); expectStatus(await admin.request('POST', `/finance/transactions/${ledger.id}/reverse`, { reason: 'Duplicate correction' }), 409);
});

test('SQLite online backup includes private evidence and validates after restore; data and sessions survive restart', async () => {
  reconcileDatabase(); const before = scalar('SELECT COUNT(*) n FROM orders'); const savedCookie = krish.cookie;
  const backup = await createBackup(path.join(temp, 'backups')); const restored = openDatabase(backup.database); try { reconcileDatabase(restored); assert.equal(scalar('SELECT COUNT(*) n FROM receipt_files'), backup.receipts); for (const receipt of restored.prepare('SELECT stored_name FROM receipt_files').all() as any[]) assert.ok(fs.existsSync(path.join(backup.directory, 'receipts', receipt.stored_name))); } finally { restored.close(); }
  await stop(); await start(); assert.equal(krish.cookie, savedCookie); expectStatus(await krish.request('GET', '/auth/me'), 200); expectStatus(await admin.request('GET', '/orders'), 200); assert.equal(scalar('SELECT COUNT(*) n FROM orders'), before); assert.ok((await krish.request('GET', '/claims')).data.length > 4); assert.ok((await krish.request('GET', '/tasks')).data.length > 5); reconcileDatabase();
});
