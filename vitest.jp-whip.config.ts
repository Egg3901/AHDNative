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
      "packages/engine/src/budget/jpRegionalBudget.test.ts",
      "packages/engine/src/intraparty/leadershipAcceptance.test.ts",
      "src/game/jpRegionalAllocation.test.ts",
      "src/game/partyManagement.test.ts",
      "src/ui/CabinetOfficePanel.test.tsx",
      "src/ui/LegislaturePanel.test.tsx",
    ],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
