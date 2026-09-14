import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8111',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `cd ../backend && ${process.env.KC_E2E_PYTHON || 'python'} -m uvicorn main:app --host 127.0.0.1 --port 8111`,
    url: 'http://127.0.0.1:8111/api/',
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      SECRET_KEY: 'playwright-only-secure-secret-key-that-is-long-and-random-123456789',
      DATABASE_URL: process.env.KC_E2E_DATABASE_URL || 'sqlite:////tmp/kitchen-cupboard-playwright.db',
      DATA_DIR: process.env.KC_E2E_DATA_DIR || 'data',
      REGISTER_RATE_LIMIT_MAX: '100',
      REGISTRATION_ENABLED: 'true',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
