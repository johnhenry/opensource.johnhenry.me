import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the Workbench Desk planet (e2e/workbench.spec.ts).
 *
 * They run against a PRODUCTION build served by `vite preview`, built with the same /orrery/ base the docs site ships
 * (`npm run build:e2e`: ORRERY_BASE=/orrery/ into dist/e2e, so it never touches ../public/orrery).
 *   npm run test:e2e                       build + all engines installed here
 *   npx playwright test --project=webkit   one engine (CI runs one job per engine)
 * Point it at a deployed site instead with ORRERY_URL=https://opensource.johnhenry.me/orrery/ (no server is started).
 */
const PORT = Number(process.env.E2E_PORT ?? 4391);
const remote = process.env.ORRERY_URL;
const baseURL = remote ?? `http://localhost:${PORT}/orrery/`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', viewport: { width: 1400, height: 1000 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 1000 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 1000 } } },
  ],
  webServer: remote ? undefined : {
    command: `npx vite preview --outDir dist/e2e --port ${PORT} --strictPort`,
    env: { ORRERY_BASE: '/orrery/' },
    url: `http://localhost:${PORT}/orrery/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
