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
    include: [
      "packages/content/src/jpConsumptionTaxSourceParity.test.ts",
      "packages/engine/src/elections/jpBackground.test.ts",
      "packages/engine/src/budget/jpRegionalBudget.test.ts",
      "src/game/jpBackgroundSession.test.ts",
      "packages/engine/src/elections/w61RosterJP.sim.test.ts",
    ],
    maxWorkers: 1,
    fileParallelism: false,
    // The t400 source resolver is intentionally a real 400-turn session.
    // Bound it generously enough for CI while keeping the job finite.
    testTimeout: 20 * 60 * 1000,
  },
});
