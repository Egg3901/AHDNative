import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './smoke',
  testMatch: 'regional-extraction.spec.ts',
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  use: {
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    baseURL: 'http://127.0.0.1:1427',
    viewport: { width: 390, height: 900 },
    trace: 'retain-on-failure',
  },
  outputDir: 'artifacts/smoke',
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 1427 --strictPort --outDir dist-smoke-extraction',
    url: 'http://127.0.0.1:1427',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
