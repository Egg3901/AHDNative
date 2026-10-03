import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const owned = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: { alias: {
    "@ahdclient/engine": owned("./packages/engine/src/index.ts"),
    "@ahdclient/content": owned("./packages/content/src/index.ts"),
    "@ahd/game-rules/actions": owned("./packages/game-rules/actions/rules.ts"),
  } },
  test: {
    environment: "jsdom",
    setupFiles: ["src/ui/test-setup.ts"],
    include: [
      "packages/content/src/usHistoricalStates.test.ts",
      "packages/engine/src/elections/presidentialElectoralCollege.test.ts",
      "packages/engine/src/elections/presidentialResolvedSave.test.ts",
      "src/game/presidentialNationalFallback.test.ts",
    ],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
