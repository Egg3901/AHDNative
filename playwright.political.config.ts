import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: 'political-board.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:1436' },
  outputDir: 'artifacts/political-board-smoke',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 1436 --strictPort',
    url: 'http://127.0.0.1:1436', reuseExistingServer: false, timeout: 30_000,
  },
});
