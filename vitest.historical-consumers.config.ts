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
    environment: "node",
    include: [
      "packages/engine/src/save.v42Projection.test.ts",
      "packages/engine/src/actions/campaignTargetedAd.test.ts",
      "packages/engine/src/elections/sourceElectionClock.test.ts",
      "packages/engine/src/actions/standaloneCanvass.test.ts",
      "packages/engine/src/budget/germanSolidaritySurcharge.test.ts",
      "packages/engine/src/finance/playerSavingsInterest.test.ts",
      "packages/engine/src/npp/caucusRecruit.test.ts",
      "packages/engine/src/unions/unionLaws.test.ts",
      "packages/engine/src/corporation/legislativeNationalization.test.ts",
    ],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 180_000,
  },
});
