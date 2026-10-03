import { test, expect } from '@playwright/test';

test.describe('Student Registration, Email Verification & Payment Flows', () => {
  const studentEmail = `browser.student.${Date.now()}@skyline.example.com`;
  const studentPassword = 'SecureStudent!2026';

  test('full student registration, verification and sign-in flow', async ({ page }) => {
    // 1. Visit Student Register Page
    await page.goto('/student/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    // Fill registration form
    await page.locator('#reg-name').fill('Ananya Sen');
    await page.locator('#reg-email').fill(studentEmail);
    await page.locator('#reg-phone').fill('+91 98765 12345');
    await page.locator('#reg-password').fill(studentPassword);
    await page.locator('#reg-confirm-password').fill(studentPassword);

    // Submit registration
    await page.getByRole('button', { name: 'Create Student Account' }).click();

    // 2. Redirection to check-email page
    await expect(page).toHaveURL(new RegExp(`/student/check-email\\?email=${encodeURIComponent(studentEmail)}`), { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(studentEmail)).toBeVisible();

    // 3. Try signing in BEFORE email verification -> blocked with clear message
    await page.goto('/student/login');
    await page.getByLabel('Email address').fill(studentEmail);
    await page.getByLabel('Password', { exact: true }).fill(studentPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(/Please verify your email address before signing in/i)).toBeVisible();

    // 4. Retrieve token from test outbox via test endpoint
    const tokenRes = await page.request.get(`/api/v1/auth/test/last-verification-token?email=${encodeURIComponent(studentEmail)}`);
    expect(tokenRes.ok()).toBe(true);
    const tokenJson = await tokenRes.json();
    const token = tokenJson?.data?.token;
    expect(token).toBeTruthy();

    // 5. Navigate to verification URL with token
    await page.goto(`/student/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verified successfully' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Your email address has been verified/i)).toBeVisible();

    // Click link to sign in
    await page.getByRole('link', { name: 'Sign in to Student Workspace' }).click();
    await expect(page).toHaveURL(/\/student\/login/);

    // 6. Sign in AFTER email verification
    await page.getByLabel('Email address').fill(studentEmail);
    await page.getByLabel('Password', { exact: true }).fill(studentPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Successfully arrives on Student Workspace
    await expect(page).toHaveURL(/\/student$/, { timeout: 15000 });
    await expect(page.getByText('Ananya Sen').first()).toBeVisible();
    await expect(page.getByText('Standard Student').first()).toBeVisible();

    // 7. Verify events and non-member pricing render for new student
    await expect(page.getByText('Spring Gala').first()).toBeVisible();
    await expect(page.getByText('₹500', { exact: false }).first()).toBeVisible();

    // Click event to view ticket tier rates in modal
    await page.locator('h3', { hasText: 'Spring Gala' }).click();
    await expect(page.getByText('Standard Rate')).toBeVisible();
    await expect(page.getByText('₹700', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Close modal' }).click();

    // 8. Verify Razorpay test configuration is active
    const configRes = await page.request.get('/api/v1/payments/razorpay/config');
    expect(configRes.ok()).toBe(true);
    const config = (await configRes.json()).data;
    expect(config.configured).toBe(true);
    expect(config.test_mode).toBe(true);
    expect(config.key_id).toMatch(/^rzp_test_/);
  });
});
