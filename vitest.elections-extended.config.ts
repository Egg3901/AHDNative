import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/game/governorPublicEndorsement.journey.test.ts",
      "packages/engine/src/elections/easternBlocNaturalJourney.sim.test.ts",
    ],
    testTimeout: 60_000,
    maxWorkers: 1,
  },
});
