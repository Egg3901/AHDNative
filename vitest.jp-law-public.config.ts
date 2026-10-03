import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const owned = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@ahdclient/engine": owned("./packages/engine/src/index.ts"),
      "@ahdclient/content": owned("./packages/content/src/index.ts"),
      "@ahd/game-rules/actions": owned("./packages/game-rules/actions/rules.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/ui/test-setup.ts"],
    include: ["src/ui/JapanLawPublicJourney.test.tsx"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
