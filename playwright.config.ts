import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-browser-tests-'));
process.env.SKYLINE_BROWSER_TEMP = isolated;
const env = {
  NODE_ENV: 'test', DEMO_MODE: 'true', TEST_DB_PATH: path.join(isolated, 'browser.sqlite'),
  UPLOAD_DIR: path.join(isolated, 'receipts'), SESSION_SECRET: 'isolated-browser-test-secret-at-least-32-characters',
  APP_ORIGIN: 'http://127.0.0.1:5191', API_PROXY_TARGET: 'http://127.0.0.1:3107',
};
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000, expect: { timeout: 10000 },
  reporter: [['list']], outputDir: './test-results', globalTeardown: './tests/browser-teardown.ts',
  use: { baseURL: 'http://127.0.0.1:5191', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node --import tsx tests/browser-server.ts', url: 'http://127.0.0.1:3107/api/v1/health', env, reuseExistingServer: false, timeout: 60000, stdout: 'pipe', stderr: 'pipe' },
    { command: 'npx vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5191', url: 'http://127.0.0.1:5191/admin/login', env, reuseExistingServer: false, timeout: 60000, stdout: 'pipe', stderr: 'pipe' },
  ],
});
