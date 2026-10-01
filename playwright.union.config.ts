import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:1435' },
  webServer: {
    ...(base.webServer as object),
    command: 'npx vite --config vite.union.config.ts --host 127.0.0.1 --port 1435 --strictPort',
    url: 'http://127.0.0.1:1435',
  },
});
