import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import argon2 from 'argon2';
import { createApp } from '../apps/api/src/app.js';
import { getDb, closeDb } from '../apps/api/src/db/index.js';
import { seedDemo, DEMO_PASSWORD, SEED_IDS } from '../scripts/seed.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-unified-auth-'));
process.env.TEST_DB_PATH = path.join(temp, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(temp, 'receipts');
process.env.SESSION_SECRET = 'a-secure-secret-for-unified-auth-testing-32-chars';
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';

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
      if (response.headers.get('content-type')?.includes('application/json')) json = JSON.parse(text);
    } catch {}

    const result = { status: response.status, data: json?.data, error: json?.error, text, headers: response.headers };
    return result;
  }

  async token() {
    const result = await this.request('GET', '/auth/csrf');
    this.csrf = result.data.csrfToken;
    return this.csrf;
  }

  async login(email: string, password = DEMO_PASSWORD) {
    await this.token();
    const result = await this.request('POST', '/auth/login', { email, password });
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

test('1. Valid Admin credentials authenticate successfully with { email, password }', async () => {
  const client = new TestClient();
  const res = await client.login('admin@skyline.example.com', DEMO_PASSWORD);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.email, 'admin@skyline.example.com');
  assert.deepEqual(res.data.roles, ['admin']);
  assert.deepEqual(res.data.workspaces, ['admin']);
  assert.ok(res.data.csrfToken);
});

test('2. Valid Volunteer credentials authenticate successfully with { email, password }', async () => {
  const client = new TestClient();
  const res = await client.login('krish@skyline.example.com', DEMO_PASSWORD);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.email, 'krish@skyline.example.com');
  assert.deepEqual(res.data.roles, ['volunteer']);
  assert.deepEqual(res.data.workspaces, ['volunteer']);
});

test('3. Valid Student credentials authenticate successfully with { email, password }', async () => {
  const client = new TestClient();
  const res = await client.login('student@skyline.example.com', DEMO_PASSWORD);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.email, 'student@skyline.example.com');
  assert.deepEqual(res.data.roles, ['student']);
  assert.deepEqual(res.data.workspaces, ['student']);
});

test('4. Unverified Student cannot login (403 EMAIL_NOT_VERIFIED)', async () => {
  const db = getDb();
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  db.prepare('INSERT INTO users(id,email,name,password_hash,active,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,1,NULL,datetime(),datetime())')
    .run('unverified-test-user', 'unverified-student@example.com', 'Unverified Student', hash);
  db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').run('unverified-test-user', 'student');

  const client = new TestClient();
  const res = await client.login('unverified-student@example.com', DEMO_PASSWORD);
  assert.equal(res.status, 403);
  assert.equal(res.error?.code, 'EMAIL_NOT_VERIFIED');
});

test('5. Inactive account cannot login (401 generic error)', async () => {
  const db = getDb();
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  db.prepare('INSERT INTO users(id,email,name,password_hash,active,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,0,datetime(),datetime(),datetime())')
    .run('inactive-test-user', 'inactive@example.com', 'Inactive User', hash);
  db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').run('inactive-test-user', 'volunteer');

  const client = new TestClient();
  const res = await client.login('inactive@example.com', DEMO_PASSWORD);
  assert.equal(res.status, 401);
  assert.equal(res.error?.message, 'Sign in was unsuccessful. Check your details.');
});

test('6. Wrong password fails generically (401 generic error)', async () => {
  const client = new TestClient();
  const res = await client.login('admin@skyline.example.com', 'WrongPassword!999');
  assert.equal(res.status, 401);
  assert.equal(res.error?.message, 'Sign in was unsuccessful. Check your details.');
});

test('7. Unknown email fails generically (401 generic error)', async () => {
  const client = new TestClient();
  const res = await client.login('nobody-exists-here@example.com', DEMO_PASSWORD);
  assert.equal(res.status, 401);
  assert.equal(res.error?.message, 'Sign in was unsuccessful. Check your details.');
});

test('8. Login response includes correct authoritative role set from SQLite', async () => {
  const client = new TestClient();
  const res = await client.login('student@skyline.example.com', DEMO_PASSWORD);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.roles, ['student']);
  assert.deepEqual(res.data.workspaces, ['student']);
  assert.equal(res.data.name, 'Aarav Patel');
});

test('9. Frontend cannot forge admin role in login payload', async () => {
  const client = new TestClient();
  await client.token();
  const res = await client.request('POST', '/auth/login', {
    email: 'krish@skyline.example.com',
    password: DEMO_PASSWORD,
    roles: ['admin']
  });
  assert.equal(res.status, 422, 'Strict schema must reject forged roles field');
});

test('10. Frontend cannot forge volunteer role in login payload', async () => {
  const client = new TestClient();
  await client.token();
  const res = await client.request('POST', '/auth/login', {
    email: 'student@skyline.example.com',
    password: DEMO_PASSWORD,
    roles: ['volunteer']
  });
  assert.equal(res.status, 422, 'Strict schema must reject forged roles field');
});

test('11. Frontend cannot forge student role in login payload', async () => {
  const client = new TestClient();
  await client.token();
  const res = await client.request('POST', '/auth/login', {
    email: 'krish@skyline.example.com',
    password: DEMO_PASSWORD,
    roles: ['student']
  });
  assert.equal(res.status, 422, 'Strict schema must reject forged roles field');
});

test('12. Dual-role account returns both roles in login and /auth/me', async () => {
  const db = getDb();
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const uid = 'dual-role-test-user';
  db.prepare('INSERT INTO users(id,email,name,password_hash,active,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,1,datetime(),datetime(),datetime())')
    .run(uid, 'dual@example.com', 'Dual User', hash);
  db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').run(uid, 'student');
  db.prepare('INSERT INTO user_roles(user_id,role) VALUES(?,?)').run(uid, 'volunteer');

  const client = new TestClient();
  const res = await client.login('dual@example.com', DEMO_PASSWORD);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.roles.sort(), ['student', 'volunteer'].sort());
  assert.deepEqual(res.data.workspaces.sort(), ['student', 'volunteer'].sort());

  const me = await client.request('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.data.roles.sort(), ['student', 'volunteer'].sort());
  assert.deepEqual(me.data.workspaces.sort(), ['student', 'volunteer'].sort());
});

test('13. User with zero usable roles is denied safely', async () => {
  const db = getDb();
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const uid = 'zero-roles-test-user';
  db.prepare('INSERT INTO users(id,email,name,password_hash,active,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,1,datetime(),datetime(),datetime())')
    .run(uid, 'noroles@example.com', 'No Roles User', hash);

  const client = new TestClient();
  const res = await client.login('noroles@example.com', DEMO_PASSWORD);
  assert.equal(res.status, 401);
  assert.equal(res.error?.message, 'Sign in was unsuccessful. Check your details.');
});

test('14. Session regenerates on login', async () => {
  const client = new TestClient();
  await client.token();
  const initialCookie = client.cookie;
  const res = await client.request('POST', '/auth/login', {
    email: 'admin@skyline.example.com',
    password: DEMO_PASSWORD
  });
  assert.equal(res.status, 200);
  assert.ok(client.cookie);
  assert.notEqual(client.cookie, initialCookie, 'Session ID must be regenerated on login');
});

test('15. Login throttling tracks repeated failed attempts and blocks after 5 attempts', async () => {
  const client = new TestClient();
  await client.token();
  const testEmail = 'throttling-target@example.com';

  for (let i = 1; i <= 4; i++) {
    const r = await client.request('POST', '/auth/login', { email: testEmail, password: 'WrongPassword' });
    assert.equal(r.status, 401);
  }
  const fifth = await client.request('POST', '/auth/login', { email: testEmail, password: 'WrongPassword' });
  assert.equal(fifth.status, 401);

  // 6th attempt should be throttled
  const sixth = await client.request('POST', '/auth/login', { email: testEmail, password: 'WrongPassword' });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.error?.code, 'LOGIN_THROTTLED');
});

test('16. Password change invalidates session', async () => {
  const client = new TestClient();
  await client.login('admin@skyline.example.com', DEMO_PASSWORD);
  const meBefore = await client.request('GET', '/auth/me');
  assert.equal(meBefore.status, 200);

  // Invalidate by incrementing session_version in DB
  const db = getDb();
  db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id=?').run(SEED_IDS.admin);

  // Next request with same cookie must be unauthenticated
  const meAfter = await client.request('GET', '/auth/me');
  assert.equal(meAfter.status, 401);
});

test('17. Logout destroys session', async () => {
  const client = new TestClient();
  await client.login('krish@skyline.example.com', DEMO_PASSWORD);
  const meBefore = await client.request('GET', '/auth/me');
  assert.equal(meBefore.status, 200);

  const logoutRes = await client.request('POST', '/auth/logout', {});
  assert.equal(logoutRes.status, 200);

  const meAfter = await client.request('GET', '/auth/me');
  assert.equal(meAfter.status, 401);
});

test('18. Server-side authorization boundaries for roles', async () => {
  // Student cannot access admin or volunteer dashboard
  const student = new TestClient();
  await student.login('student@skyline.example.com', DEMO_PASSWORD);
  const studentAdmin = await student.request('GET', '/admin/dashboard');
  assert.equal(studentAdmin.status, 403);
  const studentVol = await student.request('GET', '/volunteer/dashboard');
  assert.equal(studentVol.status, 403);

  // Volunteer cannot access admin dashboard
  const volunteer = new TestClient();
  await volunteer.login('krish@skyline.example.com', DEMO_PASSWORD);
  const volAdmin = await volunteer.request('GET', '/admin/dashboard');
  assert.equal(volAdmin.status, 403);
  const volSelf = await volunteer.request('GET', '/volunteer/dashboard');
  assert.equal(volSelf.status, 200);

  // Admin can access admin dashboard, cannot access volunteer dashboard
  const admin = new TestClient();
  await admin.login('admin@skyline.example.com', DEMO_PASSWORD);
  const adminSelf = await admin.request('GET', '/admin/dashboard');
  assert.equal(adminSelf.status, 200);
  const adminVol = await admin.request('GET', '/volunteer/dashboard');
  assert.equal(adminVol.status, 403);
});

