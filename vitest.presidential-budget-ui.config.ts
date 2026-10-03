import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ahdclient\/engine$/, replacement: resolve(root, "packages/engine/src/index.ts") },
      { find: /^@ahdclient\/content$/, replacement: resolve(root, "packages/content/src/index.ts") },
      { find: /^@ahd\/game-rules\/actions$/, replacement: resolve(root, "packages/game-rules/actions/rules.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    include: [
      "src/ui/LegislationDetailsPanel.test.tsx",
      "src/ui/LegislaturePanel.test.tsx",
    ],
    setupFiles: ["src/ui/test-setup.ts"],
    testTimeout: 120_000,
    maxWorkers: 1,
  },
});
