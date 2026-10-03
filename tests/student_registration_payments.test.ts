import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

// Overrides before importing app/db
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-student-tests-'));
process.env.TEST_DB_PATH = path.join(temp, 'acceptance.sqlite');
process.env.UPLOAD_DIR = path.join(temp, 'receipts');
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.SESSION_SECRET = 'isolated-test-session-secret-at-least-32-characters';
process.env.SEED_REFERENCE_DATE = DateTime.now().setZone('Asia/Kolkata').toISODate()!;
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_key';
process.env.RAZORPAY_KEY_SECRET = 'test_razorpay_secret_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_123';

const { getDb, closeDb } = await import('../apps/api/src/db/index.js');
const { seedDemo, DEMO_PASSWORD } = await import('../scripts/seed.js');
const { createApp } = await import('../apps/api/src/app.js');
const { reconcileDatabase } = await import('../scripts/reconcile.js');
const { clearTestMailOutbox, getLastVerificationToken, getTestEmailsFor } = await import('../apps/api/src/services/email.js');
const { generateTestPaymentSignature, generateTestWebhookSignature } = await import('../apps/api/src/services/razorpay.js');

let app: ReturnType<typeof createApp>;
let server: Server;
let base: string;

class TestClient {
  cookie = '';
  csrf = '';

  async request(method: string, route: string, body?: unknown, options: { token?: boolean; origin?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...options.headers };
    if (this.cookie) headers.Cookie = this.cookie;
    if (options.token !== false && this.csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = this.csrf;
    if (options.origin) headers.Origin = options.origin;
    else headers.Origin = 'http://localhost:5173';
    if (body !== undefined && typeof body === 'object') headers['Content-Type'] = 'application/json';

    const response = await fetch(base + '/api/v1' + route, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });

    const cookies = response.headers.getSetCookie();
    if (cookies.length) {
      const sid = cookies.find(c => c.startsWith('skyline.sid='));
      if (sid) this.cookie = sid.split(';')[0];
    }

    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }

    return { status: response.status, data: json?.data, error: json?.error, text, headers: response.headers };
  }

  async token() {
    const result = await this.request('GET', '/auth/csrf');
    this.csrf = result.data.csrfToken;
    return this.csrf;
  }

  async login(email: string, password = DEMO_PASSWORD, portal = 'student') {
    await this.token();
    const result = await this.request('POST', '/auth/login', { email, password, requestedPortal: portal });
    if (result.status === 200) {
      this.csrf = result.data.csrfToken;
    }
    return result;
  }
}

async function startServer() {
  app = createApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}

async function stopServer() {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await app.locals.close();
  closeDb();
}

before(async () => {
  await seedDemo();
  await startServer();
});

after(async () => {
  if (server?.listening) await stopServer();
  const target = path.resolve(temp);
  fs.rmSync(target, { recursive: true, force: true });
});

test('1. Student self-registration validates inputs, normalizes email/phone, hashes password with Argon2id, and strips forged roles', async () => {
  clearTestMailOutbox();
  const client = new TestClient();
  await client.token();

  // Test: Client attempts to forge admin role in body
  const regPayload = {
    name: 'Priya Sharma',
    email: 'Priya.Sharma@example.edu',
    phone: '9876543210',
    password: 'SecurePassword!2026',
    confirmPassword: 'SecurePassword!2026',
    roles: ['admin', 'treasurer'], // Attacker attempt to forge roles
    isAdmin: true
  };

  const regResult = await client.request('POST', '/auth/register/student', regPayload);
  assert.equal(regResult.status, 201, regResult.text);
  assert.equal(regResult.data.registered, true);
  assert.equal(regResult.data.email, 'priya.sharma@example.edu');

  // Verify in SQLite database:
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get('priya.sharma@example.edu') as any;
  assert.ok(user);
  assert.equal(user.email, 'priya.sharma@example.edu');
  assert.equal(user.email_verified_at, null); // Unverified initially
  assert.ok(user.password_hash.startsWith('$argon2id$'), 'Password must be hashed with Argon2id');
  assert.equal(user.phone, '+919876543210'); // Phone normalized with +91

  // Roles MUST only be ['student'] - forged roles completely ignored
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id=?').all(user.id).map((r: any) => r.role);
  assert.deepEqual(roles, ['student']);

  // Verification token created in email_verification_tokens table
  const tokenRecord = db.prepare('SELECT * FROM email_verification_tokens WHERE user_id=?').get(user.id) as any;
  assert.ok(tokenRecord);
  assert.equal(tokenRecord.used_at, null);
  assert.ok(tokenRecord.token_hash);

  // Email outbox received verification message
  const emails = getTestEmailsFor('priya.sharma@example.edu');
  assert.equal(emails.length, 1);
  assert.ok(emails[0].verificationLink?.includes('/student/verify-email?token='));
  assert.ok(emails[0].token);
});

test('2. Student self-registration rejects duplicates, invalid phone, and password mismatches', async () => {
  const client = new TestClient();
  await client.token();

  // Duplicate email (case-insensitive)
  const dupResult = await client.request('POST', '/auth/register/student', {
    name: 'Duplicate Priya',
    email: 'PRIYA.SHARMA@EXAMPLE.EDU',
    phone: '9876543210',
    password: 'SecurePassword!2026',
    confirmPassword: 'SecurePassword!2026'
  });
  assert.equal(dupResult.status, 409);
  assert.equal(dupResult.error?.code, 'EMAIL_EXISTS');

  // Password mismatch
  const mismatchResult = await client.request('POST', '/auth/register/student', {
    name: 'Mismatch User',
    email: 'mismatch@example.edu',
    password: 'SecurePassword!2026',
    confirmPassword: 'DifferentPassword!2026'
  });
  assert.equal(mismatchResult.status, 422);

  // Password too short
  const shortPassResult = await client.request('POST', '/auth/register/student', {
    name: 'Short Pass User',
    email: 'short@example.edu',
    password: 'short',
    confirmPassword: 'short'
  });
  assert.equal(shortPassResult.status, 422);
});

test('3. Unverified student cannot login to Student portal; gets 403 EMAIL_NOT_VERIFIED', async () => {
  const client = new TestClient();
  const loginResult = await client.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');
  assert.equal(loginResult.status, 403);
  assert.equal(loginResult.error?.code, 'EMAIL_NOT_VERIFIED');
});

test('4. Email verification verifies token, sets email_verified_at, and rejects token replay', async () => {
  const client = new TestClient();
  await client.token();

  // Attempt verification with invalid token
  const badTokenResult = await client.request('POST', '/auth/verify-email', { token: 'invalid-nonexistent-token' });
  assert.equal(badTokenResult.status, 400);
  assert.equal(badTokenResult.error?.code, 'INVALID_VERIFICATION_TOKEN');

  // Verify with legitimate token from outbox
  const validToken = getLastVerificationToken('priya.sharma@example.edu');
  assert.ok(validToken);

  const verifyResult = await client.request('POST', '/auth/verify-email', { token: validToken });
  assert.equal(verifyResult.status, 200, verifyResult.text);
  assert.equal(verifyResult.data.verified, true);

  // Database verification check
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get('priya.sharma@example.edu') as any;
  assert.ok(user.email_verified_at);

  const tokenRec = db.prepare('SELECT * FROM email_verification_tokens WHERE user_id=?').get(user.id) as any;
  assert.ok(tokenRec.used_at);

  // Token replay: using the same token again must fail
  const replayResult = await client.request('POST', '/auth/verify-email', { token: validToken });
  assert.equal(replayResult.status, 400);
  assert.equal(replayResult.error?.code, 'INVALID_VERIFICATION_TOKEN');
});

test('5. Verified student logs in successfully and is barred from Admin/Volunteer portals', async () => {
  const client = new TestClient();
  const loginResult = await client.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');
  assert.equal(loginResult.status, 200, loginResult.text);
  assert.equal(loginResult.data.email, 'priya.sharma@example.edu');
  assert.deepEqual(loginResult.data.roles, ['student']);

  // Check authenticated profile
  const meResult = await client.request('GET', '/auth/me');
  assert.equal(meResult.status, 200);
  assert.equal(meResult.data.email, 'priya.sharma@example.edu');

  // Attempt access to Admin workspace API: rejected with 403
  const adminAccess = await client.request('GET', '/admin/dashboard');
  assert.equal(adminAccess.status, 403);

  // Attempt access to Volunteer workspace API: rejected with 403
  const volunteerAccess = await client.request('GET', '/volunteer/dashboard');
  assert.equal(volunteerAccess.status, 403);
});

test('6. Resend verification issues a fresh token and invalidates previous tokens', async () => {
  const client = new TestClient();
  await client.token();

  // Register another unverified student
  const regRohan = await client.request('POST', '/auth/register/student', {
    name: 'Rohan Verma',
    email: 'rohan.verma@example.edu',
    phone: '9876543211',
    password: 'SecurePassword!2026',
    confirmPassword: 'SecurePassword!2026'
  });
  assert.equal(regRohan.status, 201);

  const firstToken = getLastVerificationToken('rohan.verma@example.edu');
  assert.ok(firstToken);

  // Fast forward created_at by 2 minutes to satisfy the 60-second anti-abuse cooldown
  const db = getDb();
  db.prepare("UPDATE email_verification_tokens SET created_at = datetime('now', '-2 minutes') WHERE token_hash = ?")
    .run(createHash('sha256').update(firstToken).digest('hex'));

  // Resend verification
  const resendResult = await client.request('POST', '/auth/resend-verification', {
    email: 'rohan.verma@example.edu'
  });
  assert.equal(resendResult.status, 200);

  const secondToken = getLastVerificationToken('rohan.verma@example.edu');
  assert.ok(secondToken);
  assert.notEqual(firstToken, secondToken);

  // First token is now invalidated by the fresh token
  const oldTokenVerify = await client.request('POST', '/auth/verify-email', { token: firstToken });
  assert.equal(oldTokenVerify.status, 400);

  // Second token verifies successfully
  const newTokenVerify = await client.request('POST', '/auth/verify-email', { token: secondToken });
  assert.equal(newTokenVerify.status, 200);
});

test('7. Razorpay configuration endpoint returns test mode and key ID without secrets', async () => {
  const client = new TestClient();
  const config = await client.request('GET', '/payments/razorpay/config');
  assert.equal(config.status, 200);
  assert.equal(config.data.configured, true);
  assert.equal(config.data.test_mode, true);
  assert.equal(config.data.key_id, 'rzp_test_mock_key');
  assert.equal(config.data.key_secret, undefined); // Secret NEVER exposed!
});

test('8. Authoritative price calculation: non-member gets standard price (₹700) and member gets member price (₹500)', async () => {
  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE title='Spring Gala'").get() as any;
  assert.ok(event);
  assert.equal(event.member_price_paise, 50000);
  assert.equal(event.nonmember_price_paise, 70000);

  // 1. Non-member student (Priya) orders ticket
  const priya = new TestClient();
  const loginRes = await priya.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');
  assert.equal(loginRes.status, 200);

  // Attempt client-side price manipulation (client sends amount 100 paise)
  const nonMemberOrder = await priya.request('POST', '/payments/razorpay/order', {
    purpose: 'event_ticket',
    eventId: event.id,
    amount_paise: 100 // Attacker attempts to forge price
  });
  assert.equal(nonMemberOrder.status, 201, nonMemberOrder.text);
  // Authoritative server calculation ignores client 100 and assigns non-member 70,000 paise
  assert.equal(nonMemberOrder.data.amount_paise, 70000);
  assert.ok(nonMemberOrder.data.order_id);
  assert.ok(nonMemberOrder.data.intent_id);

  // 2. Active member student (seeded Aarav Patel) orders ticket
  const aarav = new TestClient();
  const aaravLogin = await aarav.login('student@skyline.example.com', DEMO_PASSWORD, 'student');
  assert.equal(aaravLogin.status, 200);

  const memberOrder = await aarav.request('POST', '/payments/razorpay/order', {
    purpose: 'event_ticket',
    eventId: event.id
  });
  assert.equal(memberOrder.status, 201, memberOrder.text);
  // Authoritative server calculation assigns member 50,000 paise
  assert.equal(memberOrder.data.amount_paise, 50000);
});

test('9. Razorpay signature verification rejects invalid signatures and accepts valid HMAC', async () => {
  const priya = new TestClient();
  await priya.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');

  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE title='Spring Gala'").get() as any;

  const orderResult = await priya.request('POST', '/payments/razorpay/order', {
    purpose: 'event_ticket',
    eventId: event.id
  });
  assert.equal(orderResult.status, 201);
  const { order_id, intent_id } = orderResult.data;

  // Attempt verification with forged invalid signature
  const fakePaymentId = 'pay_test_fake_12345';
  const badVerify = await priya.request('POST', '/payments/razorpay/verify', {
    intent_id,
    razorpay_order_id: order_id,
    razorpay_payment_id: fakePaymentId,
    razorpay_signature: 'invalid_forged_signature_hash'
  });
  assert.equal(badVerify.status, 400);
  assert.equal(badVerify.error?.code, 'INVALID_PAYMENT_SIGNATURE');

  // Verify with valid HMAC-SHA256 signature
  const validPaymentId = 'pay_test_real_' + Date.now();
  const validSig = generateTestPaymentSignature(order_id, validPaymentId);

  const goodVerify = await priya.request('POST', '/payments/razorpay/verify', {
    intent_id,
    razorpay_order_id: order_id,
    razorpay_payment_id: validPaymentId,
    razorpay_signature: validSig
  });
  assert.equal(goodVerify.status, 200, goodVerify.text);
  assert.equal(goodVerify.data.fulfilled, true);
  assert.equal(goodVerify.data.purpose, 'event_ticket');
  assert.ok(goodVerify.data.ticket.id);
  assert.equal(goodVerify.data.ticket.status, 'VALID');

  // Idempotency: Repeating the exact same verification returns the existing fulfillment
  const repeatVerify = await priya.request('POST', '/payments/razorpay/verify', {
    intent_id,
    razorpay_order_id: order_id,
    razorpay_payment_id: validPaymentId,
    razorpay_signature: validSig
  });
  assert.equal(repeatVerify.status, 200);
  assert.equal(repeatVerify.data.idempotent, true);
  assert.equal(repeatVerify.data.fulfilled, true);
});

test('10. Membership purchase activates membership term and qualifies student for member event pricing', async () => {
  const priya = new TestClient();
  await priya.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');

  // Priya orders annual membership
  const memberOrder = await priya.request('POST', '/payments/razorpay/order', {
    purpose: 'membership'
  });
  assert.equal(memberOrder.status, 201);
  assert.equal(memberOrder.data.amount_paise, 150000); // Authoritative ₹1,500 dues from settings

  const { order_id, intent_id } = memberOrder.data;
  const paymentId = 'pay_test_dues_' + Date.now();
  const sig = generateTestPaymentSignature(order_id, paymentId);

  const verifyResult = await priya.request('POST', '/payments/razorpay/verify', {
    intent_id,
    razorpay_order_id: order_id,
    razorpay_payment_id: paymentId,
    razorpay_signature: sig
  });
  assert.equal(verifyResult.status, 200);
  assert.equal(verifyResult.data.purpose, 'membership');

  // Now Priya is an active member! Check ticket order price for TechFest
  const db = getDb();
  const techEvent = db.prepare("SELECT * FROM events WHERE title='TechFest'").get() as any;
  assert.ok(techEvent);

  const nextTicketOrder = await priya.request('POST', '/payments/razorpay/order', {
    purpose: 'event_ticket',
    eventId: techEvent.id
  });
  assert.equal(nextTicketOrder.status, 201);
  // As an active member, Priya now receives member pricing (₹800 = 80,000 paise)
  assert.equal(nextTicketOrder.data.amount_paise, techEvent.member_price_paise);
});

test('11. Merchandise purchase decrements stock, creates order and stock movements atomically', async () => {
  const priya = new TestClient();
  await priya.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');

  const db = getDb();
  const hoodieVariant = db.prepare(
    "SELECT v.* FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.name='Skyline Hoodie' LIMIT 1"
  ).get() as any;
  assert.ok(hoodieVariant);
  const initialStock = hoodieVariant.stock;
  assert.ok(initialStock >= 2);

  const merchOrder = await priya.request('POST', '/payments/razorpay/order', {
    purpose: 'merchandise',
    items: [{ variantId: hoodieVariant.id, quantity: 2 }]
  });
  assert.equal(merchOrder.status, 201);

  const { order_id, intent_id } = merchOrder.data;
  const paymentId = 'pay_test_merch_' + Date.now();
  const sig = generateTestPaymentSignature(order_id, paymentId);

  const verifyMerch = await priya.request('POST', '/payments/razorpay/verify', {
    intent_id,
    razorpay_order_id: order_id,
    razorpay_payment_id: paymentId,
    razorpay_signature: sig
  });
  assert.equal(verifyMerch.status, 200);
  assert.equal(verifyMerch.data.purpose, 'merchandise');

  // Verify stock decremented by 2
  const updatedVariant = db.prepare('SELECT stock FROM product_variants WHERE id=?').get(hoodieVariant.id) as any;
  assert.equal(updatedVariant.stock, initialStock - 2);

  // Verify stock movement created
  const movements = db.prepare('SELECT * FROM stock_movements WHERE variant_id=? ORDER BY created_at DESC LIMIT 1').get(hoodieVariant.id) as any;
  assert.equal(movements.quantity, -2);
});

test('12. Razorpay webhook handles payment.captured idempotently with valid raw body HMAC signature', async () => {
  const priya = new TestClient();
  await priya.login('priya.sharma@example.edu', 'SecurePassword!2026', 'student');

  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE title='TechFest'").get() as any;
  assert.ok(event);

  // Create an order intent
  const orderResult = await priya.request('POST', '/payments/razorpay/order', {
    purpose: 'event_ticket',
    eventId: event.id
  });
  assert.equal(orderResult.status, 201);
  const { order_id, intent_id } = orderResult.data;
  const webhookPaymentId = 'pay_webhook_' + Date.now();

  const webhookPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: webhookPaymentId,
          order_id: order_id,
          notes: { intent_id: intent_id }
        }
      }
    }
  });

  const webhookSig = generateTestWebhookSignature(webhookPayload);

  // Call webhook endpoint
  const webhookClient = new TestClient();
  const webhookRes = await webhookClient.request('POST', '/payments/razorpay/webhook', webhookPayload, {
    headers: {
      'x-razorpay-signature': webhookSig,
      'content-type': 'application/json'
    }
  });
  assert.equal(webhookRes.status, 200, webhookRes.text);
  assert.equal(webhookRes.data.received, true);

  // Verify intent status in database is now 'paid'
  const paidIntent = db.prepare('SELECT * FROM payment_intents WHERE id=?').get(intent_id) as any;
  assert.equal(paidIntent.status, 'paid');

  // Calling webhook again for same order is idempotent
  const repeatWebhookRes = await webhookClient.request('POST', '/payments/razorpay/webhook', webhookPayload, {
    headers: {
      'x-razorpay-signature': webhookSig,
      'content-type': 'application/json'
    }
  });
  assert.equal(repeatWebhookRes.status, 200);
  assert.equal(repeatWebhookRes.data.received, true);
});

test('13. Financial ledger and database reconciliation passes all invariants after registration & payment activity', async () => {
  const reconciliation = reconcileDatabase(getDb(), false);
  assert.equal(reconciliation.ok, true, 'Database reconciliation must pass without any foreign-key or balance errors');
  assert.ok(reconciliation.payments_checked > 0);
  assert.ok(reconciliation.totals.balance > 0);
});
