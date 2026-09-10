import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts", "scripts/export-save-v42.test.ts"], testTimeout: 60000, maxWorkers: 2 } });
