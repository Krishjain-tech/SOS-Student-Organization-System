import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const password = 'SkylineDemo!2026';

async function login(page: Page, portal: 'admin' | 'volunteer' | 'student', email = portal === 'admin' ? 'admin@skyline.example.com' : portal === 'volunteer' ? 'krish@skyline.example.com' : 'student@skyline.example.com') {
  await page.context().clearCookies();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function post(context: BrowserContext, route: string, body: unknown) {
  const response = await context.request.get('/api/v1/auth/csrf');
  const csrf = (await response.json()).data.csrfToken;
  return context.request.post('/api/v1' + route, { data: body, headers: { 'X-CSRF-Token': csrf, Origin: 'http://127.0.0.1:5191' } });
}

test('common login page has neutral Skyline branding and no role selector or role links', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Welcome back. Sign in to your account.')).toBeVisible();

  // Verify form elements exist
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();

  // Verify no role-specific visible choices before authentication
  await expect(page.getByText('Admin sign in', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Volunteer sign in', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Student sign in', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Admin workspace', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Volunteer workspace', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Student workspace', { exact: true })).toHaveCount(0);
});

test('unified login leads single-role accounts to database backed dashboard hierarchy', async ({ browser }) => {
  const ac = await browser.newContext();
  const vc = await browser.newContext();
  const admin = await ac.newPage();
  const volunteer = await vc.newPage();
  try {
    await login(admin, 'admin');
    await expect(admin).toHaveURL(/\/admin$/);
    await expect(admin.getByRole('heading', { name: 'Organization overview' })).toBeVisible();
    await expect(admin.getByText('Balance received', { exact: true })).toBeVisible();
    await expect(admin.locator('.metric').filter({ hasText: 'Balance received' }).locator('strong')).toBeVisible();
    await expect(admin.getByText('Needs attention', { exact: true })).toBeVisible();

    await login(volunteer, 'volunteer');
    await expect(volunteer).toHaveURL(/\/volunteer$/);
    await expect(volunteer.getByRole('heading', { name: 'Good morning, Krish' })).toBeVisible();
    await expect(volunteer.getByText('₹1,837', { exact: true })).toBeVisible();
    await expect(volunteer.getByText('Cash balance', { exact: true })).toHaveCount(0);
    for (const column of ['Assigned', 'In progress', 'Completed']) {
      await expect(volunteer.locator('.task-column h3').filter({ hasText: column })).toBeVisible();
    }
  } finally {
    await ac.close();
    await vc.close();
  }
});

test('old login routes redirect safely to /login, protected routes redirect, and external return URL cannot redirect', async ({ page }) => {
  // Old login routes redirect to /login with returnTo context
  await page.goto('/admin/login');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin/);

  await page.goto('/volunteer/login');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fvolunteer/);

  await page.goto('/student/login');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fstudent/);

  // Unauthenticated protected deep link
  await page.goto('/volunteer/tasks');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fvolunteer%2Ftasks/);

  // Wrong credentials show generic failure
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@skyline.example.com');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword!123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/Sign in was unsuccessful/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // External return URL is safely rejected and redirects to account's workspace
  await page.goto('/login?returnTo=https%3A%2F%2Fevil.example');
  await page.getByLabel('Email address').fill('admin@skyline.example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Access denied on unauthorized portal
  await page.goto('/volunteer');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your workspace' })).toHaveAttribute('href', '/admin');
});

test('dual-role account authenticates via unified login to /select-workspace, supports workspace switching, and shared logout invalidates both tabs', async ({ page, context }) => {
  // First login as admin to create dual-role test user
  await login(page, 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  const dualEmail = `browser-dual-${Date.now()}@example.com`;
  const created = await post(context, '/users', {
    name: 'Browser Dual Role',
    email: dualEmail,
    password,
    roles: ['admin', 'volunteer']
  });
  expect(created.status()).toBe(201);

  // Sign out from admin
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Sign in with dual-role credentials
  await page.getByLabel('Email address').fill(dualEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Multi-role account lands on /select-workspace
  await expect(page).toHaveURL(/\/select-workspace$/);
  await expect(page.getByRole('heading', { name: 'Choose your workspace' })).toBeVisible();
  await expect(page.getByText('Welcome, Browser Dual Role')).toBeVisible();

  // Only authorized workspaces are shown
  await expect(page.getByText('Admin Workspace')).toBeVisible();
  await expect(page.getByText('Volunteer Workspace')).toBeVisible();
  await expect(page.getByText('Student Workspace')).toHaveCount(0); // Not assigned!

  // Choose Admin Workspace
  await page.getByRole('link', { name: /Admin Workspace/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Organization overview' })).toBeVisible();

  // Open second tab in the same session
  const second = await context.newPage();
  await second.goto('/volunteer');
  await expect(second).toHaveURL(/\/volunteer$/);
  await expect(second.getByRole('heading', { name: 'Good morning, Browser' })).toBeVisible();

  // Switch workspace from tab 1
  await page.getByRole('link', { name: 'Switch workspace' }).click();
  await expect(page).toHaveURL(/\/select-workspace$/);
  await page.getByRole('link', { name: /Volunteer Workspace/ }).click();
  await expect(page).toHaveURL(/\/volunteer$/);

  // Shared logout invalidates both tabs
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await second.reload();
  await expect(second).toHaveURL(/\/login/);
});

test('account replacement clears prior server state and all navigation destinations render', async ({ page }) => {
  await login(page, 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const links = ['Members', 'Events', 'Volunteers', 'Tasks', 'Shop & inventory', 'Finance', 'Reimbursements', 'Announcements', 'Settings'];
  for (const name of links) {
    await page.getByRole('navigation', { name: 'admin navigation' }).getByRole('link', { name, exact: true }).click();
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByText('Unable to complete this request.', { exact: true })).toHaveCount(0);
  }

  // Switch to volunteer via login
  await login(page, 'volunteer');
  await expect(page).toHaveURL(/\/volunteer$/);
  await expect(page.getByRole('heading', { name: 'Good morning, Krish' })).toBeVisible();
  await expect(page.getByText('₹1,837', { exact: true })).toBeVisible();
  await expect(page.getByText('Cash balance', { exact: true })).toHaveCount(0);
  for (const name of ['My events', 'My tasks', 'Availability', 'My expenses', 'Announcements']) {
    await page.getByRole('navigation', { name: 'volunteer navigation' }).getByRole('link', { name, exact: true }).click();
    await expect(page.locator('main h1')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('mobile dashboards and unified login fit viewport without horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    // Check login page mobile responsiveness
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Login volunteer and check responsive dashboard
    await login(page, 'volunteer');
    await expect(page).toHaveURL(/\/volunteer$/);
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation', { name: 'volunteer navigation' }).getByRole('link', { name: 'My expenses' }).click();
    await expect(page).toHaveURL(/\/volunteer\/expenses$/);
    await page.getByRole('button', { name: 'Submit expense', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Login admin and check admin responsive dashboard
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/admin$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Create event', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Event title')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

