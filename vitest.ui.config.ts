import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["src/ui/test-setup.ts"],
    globals: false,
    maxWorkers: 2,
  },
});
