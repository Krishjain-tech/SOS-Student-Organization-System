import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const password = 'SkylineDemo!2026';
async function login(page: Page, portal: 'admin' | 'volunteer', email = portal === 'admin' ? 'admin@skyline.example.com' : 'krish@skyline.example.com') {
  await page.goto(`/${portal}/login`); await expect(page.getByRole('heading', { name: `${portal === 'admin' ? 'Admin' : 'Volunteer'} sign in` })).toBeVisible();
  await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function post(context: BrowserContext, route: string, body: unknown) {
  const response = await context.request.get('/api/v1/auth/csrf'); const csrf = (await response.json()).data.csrfToken;
  return context.request.post('/api/v1' + route, { data: body, headers: { 'X-CSRF-Token': csrf, Origin: 'http://127.0.0.1:5191' } });
}

test('two login pages lead isolated accounts to database backed dashboard hierarchy', async ({ browser }) => {
  const ac = await browser.newContext(); const vc = await browser.newContext(); const admin = await ac.newPage(); const volunteer = await vc.newPage();
  try {
    await login(admin, 'admin'); await expect(admin).toHaveURL(/\/admin$/); await expect(admin.getByRole('heading', { name: 'Organization overview' })).toBeVisible();
    await expect(admin.getByText('Balance received', { exact: true })).toBeVisible(); await expect(admin.getByText('₹1,48,500', { exact: true })).toBeVisible(); await expect(admin.getByText('Needs attention', { exact: true })).toBeVisible();
    await login(volunteer, 'volunteer'); await expect(volunteer).toHaveURL(/\/volunteer$/); await expect(volunteer.getByRole('heading', { name: 'Good morning, Krish' })).toBeVisible(); await expect(volunteer.getByText('₹1,837', { exact: true })).toBeVisible(); await expect(volunteer.getByText('Cash balance', { exact: true })).toHaveCount(0);
    for (const column of ['Assigned', 'In progress', 'Completed']) await expect(volunteer.locator('.task-column h3').filter({ hasText: column })).toBeVisible();
    await admin.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true }); await volunteer.screenshot({ path: 'test-results/volunteer-desktop.png', fullPage: true });
  } finally { await ac.close(); await vc.close(); }
});

test('wrong workspace is generic, protected routes redirect, and external return URL cannot redirect', async ({ page }) => {
  await page.goto('/volunteer/tasks'); await expect(page).toHaveURL(/\/volunteer\/login\?returnTo=/);
  await login(page, 'admin', 'krish@skyline.example.com'); await expect(page.getByText(/Sign in was unsuccessful/)).toBeVisible(); await expect(page).toHaveURL(/\/admin\/login$/); await expect(page.getByLabel('Email address')).toHaveValue('krish@skyline.example.com');
  await login(page, 'volunteer', 'admin@skyline.example.com'); await expect(page.getByText(/Sign in was unsuccessful/)).toBeVisible();
  await page.goto('/admin/login?returnTo=https%3A%2F%2Fevil.example'); await page.getByLabel('Email address').fill('admin@skyline.example.com'); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/volunteer'); await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible(); await expect(page.getByRole('link', { name: 'Go to your workspace' })).toHaveAttribute('href', '/admin');
});

test('dual-role account switches workspaces and shared logout invalidates both tabs', async ({ page, context }) => {
  await login(page, 'admin'); await expect(page).toHaveURL(/\/admin$/);
  const created = await post(context, '/users', { name: 'Browser Dual Role', email: 'browser-dual@example.com', password, roles: ['admin', 'volunteer'] }); expect(created.status()).toBe(201);
  await login(page, 'volunteer', 'browser-dual@example.com'); await expect(page).toHaveURL(/\/volunteer$/); await page.getByRole('link', { name: 'Switch workspace' }).click(); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole('heading', { name: 'Organization overview' })).toBeVisible();
  const second = await context.newPage(); await second.goto('/volunteer'); await expect(second.getByRole('heading', { name: 'Good morning, Browser' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page).toHaveURL(/\/admin\/login$/); await second.reload(); await expect(second).toHaveURL(/\/volunteer\/login/);
});

test('account replacement clears prior server state and all navigation destinations render', async ({ page }) => {
  await login(page, 'admin'); await expect(page).toHaveURL(/\/admin$/);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const links = ['Members', 'Events', 'Volunteers', 'Tasks', 'Shop & inventory', 'Finance', 'Reimbursements', 'Announcements', 'Settings'];
  for (const name of links) { await page.getByRole('navigation', { name: 'admin navigation' }).getByRole('link', { name, exact: true }).click(); await expect(page.locator('main h1')).toBeVisible(); await expect(page.getByText('Unable to complete this request.', { exact: true })).toHaveCount(0); }
  await login(page, 'volunteer'); await expect(page).toHaveURL(/\/volunteer$/); await expect(page.getByRole('heading', { name: 'Good morning, Krish' })).toBeVisible(); await expect(page.getByText('₹1,837', { exact: true })).toBeVisible(); await expect(page.getByText('Cash balance', { exact: true })).toHaveCount(0);
  for (const name of ['My events', 'My tasks', 'Availability', 'My expenses', 'Announcements']) { await page.getByRole('navigation', { name: 'volunteer navigation' }).getByRole('link', { name, exact: true }).click(); await expect(page.locator('main h1')).toBeVisible(); }
  expect(errors).toEqual([]);
});

test('mobile dashboards fit viewport and drawer/forms support keyboard dismissal', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  try {
    await login(page, 'volunteer'); await expect(page).toHaveURL(/\/volunteer$/); await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Open navigation' }).click(); await page.getByRole('navigation', { name: 'volunteer navigation' }).getByRole('link', { name: 'My expenses' }).click(); await expect(page).toHaveURL(/\/volunteer\/expenses$/);
    await page.getByRole('button', { name: 'Submit expense', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/volunteer-mobile.png', fullPage: true });
    await login(page, 'admin'); await expect(page).toHaveURL(/\/admin$/); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await page.getByRole('button', { name: 'Create event', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByLabel('Event title')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  } finally { await context.close(); }
});
