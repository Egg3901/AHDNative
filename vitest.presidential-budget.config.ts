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
    include: [
      "packages/engine/src/legislation/vetoOverride.test.ts",
      "packages/engine/src/save.v42Projection.test.ts",
      "packages/engine/src/policyEffects/perCapitaPolicyBudget.test.ts",
      "packages/engine/src/legislation/sourceMetricExecutableSlice.test.ts",
      "packages/engine/src/legislation/sourceUSFiscalCatalog.test.ts",
      "packages/engine/src/policyEffects/sourceBaseline.test.ts",
      "src/game/presidentialVeto.test.ts",
    ],
    testTimeout: 180_000,
    maxWorkers: 1,
  },
});
