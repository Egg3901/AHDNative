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
      "src/ui/lawRowsPlayerFlow285.test.tsx",
      "packages/engine/src/metrics/politicalBoardSeed.test.ts",
      "packages/engine/src/legislation/sourceMetricExecutableSlice.test.ts",
      "packages/engine/src/legislation/metricOnlyExecutableSlice.test.ts",
      "packages/engine/src/legislation/ieCorporateTaxSourceSlice.test.ts",
      "packages/engine/src/legislation/usTariffExecutableSlice.test.ts",
      "packages/engine/src/legislation/catalogUnavailableInventory.test.ts",
      "packages/engine/src/policyEffects/perCapitaPolicyBudget.test.ts",
    ],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
