import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/journeys',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { actionTimeout: 15_000, baseURL: 'http://127.0.0.1:4179', channel: 'chrome', viewport: { width: 360, height: 732 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run export:web && node scripts/serve-journeys.cjs',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
