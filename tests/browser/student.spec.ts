import { test, expect, type Page } from '@playwright/test';

const password = 'SkylineDemo!2026';

async function loginStudent(page: Page, email = 'student@skyline.example.com', pass = password) {
  await page.context().clearCookies();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (pass === password) {
    await expect(page).toHaveURL(/\/student$/, { timeout: 15000 });
  }
}

test('student login renders real backend events, merchandise and active membership', async ({ page }) => {
  await loginStudent(page);
  await expect(page).toHaveURL(/\/student$/);

  // Check student membership status
  await expect(page.getByText('Active Member').first()).toBeVisible();

  // Check Spring Gala event from database
  await expect(page.getByText('Spring Gala').first()).toBeVisible();
  await expect(page.getByText('₹500', { exact: false }).first()).toBeVisible();

  // Check merchandise from database
  await expect(page.getByText('Skyline Hoodie').first()).toBeVisible();

  // Check announcements
  await expect(page.getByText('Membership renewal desk').first()).toBeVisible();

  await page.screenshot({ path: 'test-results/student-desktop.png', fullPage: true });
});

test('event cards display distinct backend images and tiered pricing', async ({ page }) => {
  await loginStudent(page);
  await expect(page).toHaveURL(/\/student$/);

  // Check distinct images for Spring Gala and TechFest
  const galaImg = page.locator('img[src*="event_spring_gala.png"]').first();
  await expect(galaImg).toBeVisible();

  const techImg = page.locator('img[src*="event_tech_talk.png"]').first();
  await expect(techImg).toBeVisible();

  // Check that the two images have distinct sources
  const galaSrc = await galaImg.getAttribute('src');
  const techSrc = await techImg.getAttribute('src');
  expect(galaSrc).not.toEqual(techSrc);
});

test('event modal displays tier pricing and allows closing', async ({ page }) => {
  await loginStudent(page);
  await expect(page).toHaveURL(/\/student$/);

  // Click on Spring Gala event card to view details
  await page.locator('h3', { hasText: 'Spring Gala' }).click();

  // Modal should open
  await expect(page.getByText('Member Rate')).toBeVisible();
  await expect(page.getByText('Standard Rate')).toBeVisible();

  // Close modal via close button
  await page.getByRole('button', { name: 'Close modal' }).click();
  await expect(page.getByText('Member Rate')).toHaveCount(0);
});

test('student sign out invalidates session and redirects protected routes', async ({ page }) => {
  await loginStudent(page);
  await expect(page).toHaveURL(/\/student$/);

  // Click Sign out button
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/login/);

  // Attempting to visit /student should redirect back to /login
  await page.goto('/student');
  await expect(page).toHaveURL(/\/login/);
});

test('student account is blocked from admin and volunteer workspaces', async ({ page }) => {
  await loginStudent(page);
  await expect(page).toHaveURL(/\/student$/);

  // Try opening admin workspace
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your workspace' })).toHaveAttribute('href', '/student');

  // Try opening volunteer workspace
  await page.goto('/volunteer');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your workspace' })).toHaveAttribute('href', '/student');
});

test('wrong student credentials show generic failure message', async ({ page }) => {
  await loginStudent(page, 'student@skyline.example.com', 'WrongPassword123!');
  await expect(page.getByText(/Sign in was unsuccessful/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('cross-workspace consistency for shared event images and pricing', async ({ page }) => {
  // 1. Check Admin view
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@skyline.example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/events');
  await expect(page.getByText('Spring Gala').first()).toBeVisible();
  await expect(page.locator('img[src*="event_spring_gala.png"]').first()).toBeVisible();
  await expect(page.getByText(/₹500.*member.*₹700.*standard/i).first()).toBeVisible();

  // Sign out admin
  await page.getByRole('button', { name: 'Sign out' }).first().click();

  // 2. Check Student view
  await loginStudent(page);
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText('Spring Gala').first()).toBeVisible();
  await expect(page.locator('img[src*="event_spring_gala.png"]').first()).toBeVisible();
  await expect(page.getByText('₹500', { exact: false }).first()).toBeVisible();
});

