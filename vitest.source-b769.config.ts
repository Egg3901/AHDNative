import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const root = path.dirname(fileURLToPath(import.meta.url));
const source = process.env.AHDGAME_SOURCE_ROOT;
if (!source) throw new Error("Set AHDGAME_SOURCE_ROOT to a clean immutable AHDGame source snapshot.");
export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: "@shared", replacement: path.join(source, "shared") },
      { find: "@", replacement: path.join(source, "src") },
    ],
  },
  test: {
    environment: "node",
    include: ["src/game/presidentialSourceDistributorReplay.test.ts"],
    testTimeout: 120_000,
    maxWorkers: 1,
  },
});
