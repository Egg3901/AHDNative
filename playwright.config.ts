import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './smoke', workers: 1, timeout: 90_000,
  expect: { timeout: 20_000 },
  use: { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }, baseURL: 'http://127.0.0.1:1427', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  outputDir: 'artifacts/smoke',
  webServer: { command: process.env.SMOKE_PRODUCTION ? 'npx vite preview --host 127.0.0.1 --port 1427 --strictPort' : 'npx vite --host 127.0.0.1 --port 1427 --strictPort', url: 'http://127.0.0.1:1427', reuseExistingServer: false, timeout: 30_000 },
});
