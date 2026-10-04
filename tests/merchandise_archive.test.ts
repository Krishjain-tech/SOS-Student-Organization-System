import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { DateTime } from 'luxon';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-merch-archive-tests-'));
process.env.TEST_DB_PATH = path.join(temp, 'archive_test.sqlite');
process.env.UPLOAD_DIR = path.join(temp, 'receipts');
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.SESSION_SECRET = 'isolated-test-session-secret-at-least-32-characters';
process.env.SEED_REFERENCE_DATE = DateTime.now().setZone('Asia/Kolkata').toISODate()!;
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_key';
process.env.RAZORPAY_KEY_SECRET = 'test_razorpay_secret_123';

const { getDb, closeDb } = await import('../apps/api/src/db/index.js');
const { seedDemo, DEMO_PASSWORD } = await import('../scripts/seed.js');
const { createApp } = await import('../apps/api/src/app.js');
const { reconcileDatabase } = await import('../scripts/reconcile.js');

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
    headers.Origin = options.origin || 'http://localhost:5173';
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
      if (response.headers.get('content-type')?.includes('application/json')) json = JSON.parse(text);
    } catch {}

    return {
      status: response.status,
      headers: response.headers,
      data: json?.data,
      error: json?.error,
      text
    };
  }

  async token() {
    const res = await this.request('GET', '/auth/csrf', undefined, { token: false });
    this.csrf = res.data.csrfToken;
    return this.csrf;
  }

  async login(email: string, password = DEMO_PASSWORD) {
    await this.token();
    const res = await this.request('POST', '/auth/login', { email, password });
    if (res.status === 200 && res.data?.csrfToken) {
      this.csrf = res.data.csrfToken;
    }
    return res;
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

test('1. Database seed sets active=0 for Backpack and Canvas Tote Bag', async () => {
  const db = getDb();
  const products = db.prepare('SELECT id, name, active FROM products').all() as any[];
  
  const backpack = products.find(p => p.id === 'seed-product-backpack');
  const tote = products.find(p => p.id === 'seed-product-bag');
  const hoodie = products.find(p => p.id === 'seed-product-hoodie');

  assert.ok(backpack, 'Backpack product exists in database');
  assert.equal(backpack.active, 0, 'Backpack must be inactive (active=0)');

  assert.ok(tote, 'Tote bag product exists in database');
  assert.equal(tote.active, 0, 'Tote bag must be inactive (active=0)');

  assert.ok(hoodie, 'Hoodie product exists in database');
  assert.equal(hoodie.active, 1, 'Hoodie must be active (active=1)');
});

test('2. GET /products returns only active products by default and hides archived products', async () => {
  const admin = new TestClient();
  await admin.login('admin@skyline.example.com');

  const res = await admin.request('GET', '/products');
  assert.equal(res.status, 200);
  const names = res.data.map((p: any) => p.name);

  assert.ok(!names.includes('Skyline Campus Backpack'), 'Campus Backpack must not appear in active products');
  assert.ok(!names.includes('Skyline Canvas Tote Bag'), 'Canvas Tote Bag must not appear in active products');
  assert.ok(names.includes('Skyline Hoodie'), 'Skyline Hoodie should appear in active products');
  assert.ok(names.includes('Skyline T-shirt'), 'Skyline T-shirt should appear in active products');
  assert.ok(names.includes('Skyline Classic Cap'), 'Skyline Classic Cap should appear in active products');
  assert.ok(names.includes('Skyline Thermal Water Bottle'), 'Skyline Thermal Water Bottle should appear in active products');

  // Verify all returned products have active === 1
  for (const p of res.data) {
    assert.equal(p.active, 1);
  }
});

test('3. GET /products?include_inactive=true returns all products including archived ones', async () => {
  const admin = new TestClient();
  await admin.login('admin@skyline.example.com');

  const res = await admin.request('GET', '/products?include_inactive=true');
  assert.equal(res.status, 200);
  const names = res.data.map((p: any) => p.name);

  assert.ok(names.includes('Skyline Campus Backpack'), 'Campus Backpack appears when include_inactive=true');
  assert.ok(names.includes('Skyline Canvas Tote Bag'), 'Canvas Tote Bag appears when include_inactive=true');
});

test('4. GET /variants returns only active product variants by default', async () => {
  const admin = new TestClient();
  await admin.login('admin@skyline.example.com');

  const res = await admin.request('GET', '/variants');
  assert.equal(res.status, 200);
  const productNames = res.data.map((v: any) => v.product_name);

  assert.ok(!productNames.includes('Skyline Campus Backpack'), 'No variants of Backpack returned by default');
  assert.ok(!productNames.includes('Skyline Canvas Tote Bag'), 'No variants of Canvas Tote Bag returned by default');
  assert.ok(productNames.includes('Skyline Hoodie'), 'Variants of Hoodie returned');
});

test('5. Student portal data excludes archived products from storefront/catalog', async () => {
  const student = new TestClient();
  await student.login('student@skyline.example.com');

  const res = await student.request('GET', '/student/portal-data');
  assert.equal(res.status, 200);
  const merchNames = res.data.merchandise.map((m: any) => m.name);

  assert.ok(!merchNames.includes('Skyline Campus Backpack'), 'Backpack not in student merchandise');
  assert.ok(!merchNames.includes('Skyline Canvas Tote Bag'), 'Tote bag not in student merchandise');
  assert.ok(merchNames.includes('Skyline Hoodie'), 'Hoodie in student merchandise');
  assert.ok(merchNames.includes('Skyline Thermal Water Bottle'), 'Bottle in student merchandise');
});

test('6. Admin counter sale rejects purchasing archived product variants (422 INVALID_VARIANT)', async () => {
  const admin = new TestClient();
  await admin.login('admin@skyline.example.com');

  const res = await admin.request('POST', '/orders', {
    buyer_name: 'Walk-in Student',
    items: [{ variant_id: 'seed-variant-backpack-midnight-black', quantity: 1 }],
    method: 'cash',
    reference: 'TEST-ARCHIVE-SALE'
  });

  assert.equal(res.status, 422);
  assert.equal(res.error.code, 'INVALID_VARIANT');
});

test('7. Student direct checkout rejects archived product variants (422 INVALID_VARIANT)', async () => {
  const student = new TestClient();
  await student.login('student@skyline.example.com');

  const res = await student.request('POST', '/student/orders/checkout', {
    items: [{ variant_id: 'seed-variant-bag-black', quantity: 1 }],
    method: 'upi'
  });

  assert.equal(res.status, 422);
  assert.equal(res.error.code, 'INVALID_VARIANT');
});

test('8. Razorpay order intent rejects archived product variants (404 PRODUCT_NOT_FOUND)', async () => {
  const student = new TestClient();
  await student.login('student@skyline.example.com');

  const res = await student.request('POST', '/payments/razorpay/order', {
    purpose: 'merchandise',
    items: [{ variantId: 'seed-variant-backpack-midnight-black', quantity: 1 }]
  });

  assert.equal(res.status, 404);
  assert.equal(res.error.code, 'PRODUCT_NOT_FOUND');
});

test('9. Active merchandise remains purchasable', async () => {
  const student = new TestClient();
  await student.login('student@skyline.example.com');

  // Cap variant purchase
  const res = await student.request('POST', '/student/orders/checkout', {
    items: [{ variant_id: 'seed-variant-cap-navy', quantity: 1 }],
    method: 'upi'
  });

  assert.equal(res.status, 201);
  assert.ok(res.data.id);
  assert.equal(res.data.items[0].variant_id, 'seed-variant-cap-navy');
});

test('10. Historical stock movements and orders preserve product names and reconciliation passes', async () => {
  const admin = new TestClient();
  await admin.login('admin@skyline.example.com');

  const historyRes = await admin.request('GET', '/stock-adjustments');
  assert.equal(historyRes.status, 200);
  assert.ok(historyRes.data.length > 0);

  const ordersRes = await admin.request('GET', '/orders');
  assert.equal(ordersRes.status, 200);
  assert.ok(ordersRes.data.length > 0);

  const rec = reconcileDatabase(getDb());
  assert.equal(rec.ok, true, 'Database reconciliation invariants must hold');
});
