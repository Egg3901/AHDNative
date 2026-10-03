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
    environment: "node",
    include: [
      "packages/content/src/nigeriaSourceNpp.test.ts",
      "packages/engine/src/corporation/nppSourceBootstrap.test.ts",
      "packages/engine/src/corporation/sourceRegionalUnownedSeed.test.ts",
    ],
    testTimeout: 120_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
