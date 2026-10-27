import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

/**
 * E2E tests run the SPA against a mocked tRPC API (see e2e/trpc-mock.ts). The flow under
 * test, toggling sources and recomputing scores, happens entirely in the browser, so no
 * database, Redis or API keys are needed.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
