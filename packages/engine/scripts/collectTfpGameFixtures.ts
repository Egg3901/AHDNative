/**
 * Collect source-executed TFP leaves from AHDGame pin
 * 08820d108bf986d519aed28c2963690dd772c652.
 *
 *   AHDGAME_REPO=/path/to/AHDGame npx tsx packages/engine/scripts/collectTfpGameFixtures.ts
 *   AHDGAME_REPO=/path/to/AHDGame npx tsx packages/engine/scripts/collectTfpGameFixtures.ts --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rngFromSeed } from "../src/rng.js";
import {
  TFP_GAME_PIN,
  loadGameTree,
  overlayedLeaves,
} from "../src/metrics/tfpGameOracle.js";
import type { TfpLeaves } from "../src/metrics/tfpAuthoredLeaves.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/metrics/tfpGameFixtures.json");

const CASES: Array<{
  key: string;
  metrics: string;
  exportName: string;
  presets?: string;
  presetExport?: string;
  apply1991?: boolean;
  randomSeed?: string;
}> = [
  { key: "UK:1953", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets1953.ts", presetExport: "ukMetricPresets1953" },
  { key: "UK:1979", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets1979.ts", presetExport: "ukMetricPresets1979" },
  { key: "UK:1991", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets.ts", presetExport: "ukMetricPresets1991", apply1991: true },
  { key: "UK:2019", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets.ts", presetExport: "ukMetricPresets2019" },
  { key: "DD:1953", metrics: "src/lib/countries/dd/data/ddStateMetrics1953.ts", exportName: "ddStateMetrics1953" },
  { key: "DD:1979", metrics: "src/lib/countries/dd/data/ddStateMetrics.ts", exportName: "ddStateMetrics" },
  { key: "RU:1953", metrics: "src/lib/countries/ru/data/ruStateMetrics.ts", exportName: "ruStateMetrics", presets: "src/lib/countries/ru/data/ruMetricPresets1953.ts", presetExport: "ruMetricPresets1953" },
  { key: "RU:1979", metrics: "src/lib/countries/ru/data/ruStateMetrics.ts", exportName: "ruStateMetrics" },
  { key: "CN:1991", metrics: "src/lib/countries/cn/data/cnStateMetrics.ts", exportName: "cnStateMetrics", presets: "src/lib/countries/cn/data/cnMetricPresets.ts", presetExport: "cnMetricPresets1991", apply1991: true },
  { key: "CN:2019", metrics: "src/lib/countries/cn/data/cnStateMetrics.ts", exportName: "cnStateMetrics", presets: "src/lib/countries/cn/data/cnMetricPresets.ts", presetExport: "cnMetricPresets2019" },
  { key: "IE:1991", metrics: "src/lib/countries/ie/data/ieStateMetrics.ts", exportName: "ieStateMetrics", presets: "src/lib/countries/ie/data/ieMetricPresets.ts", presetExport: "ieMetricPresets1991", apply1991: true },
  { key: "IE:2019", metrics: "src/lib/countries/ie/data/ieStateMetrics.ts", exportName: "ieStateMetrics", presets: "src/lib/countries/ie/data/ieMetricPresets.ts", presetExport: "ieMetricPresets2019" },
  { key: "BR:1991", metrics: "src/lib/countries/br/data/brStateMetrics.ts", exportName: "brStateMetrics", presets: "src/lib/countries/br/data/brMetricPresets.ts", presetExport: "brMetricPresets1991", apply1991: true },
  { key: "US:1953", metrics: "src/lib/countries/us/data/usStateMetrics1953.ts", exportName: "stateMetrics1953", presets: "src/lib/countries/us/data/usMetricPresets1953.ts", presetExport: "usMetricPresets1953" },
  { key: "US:1979", metrics: "src/lib/countries/us/data/usStateMetrics1979.ts", exportName: "stateMetrics1979", presets: "src/lib/countries/us/data/usMetricPresets.ts", presetExport: "usMetricPresets2019" },
  { key: "US:2019:tfp-source-us-2019", metrics: "src/lib/countries/us/data/usStateMetrics.ts", exportName: "stateMetrics", presets: "src/lib/countries/us/data/usMetricPresets.ts", presetExport: "usMetricPresets2019", randomSeed: "tfp-source-us-2019" },
  { key: "US:1991:tfp-source-us-1991", metrics: "src/lib/countries/us/data/usStateMetrics.ts", exportName: "stateMetrics", presets: "src/lib/countries/us/data/usMetricPresets.ts", presetExport: "usMetricPresets1991", apply1991: true, randomSeed: "tfp-source-us-1991" },
];

const repo = process.env.AHDGAME_REPO;
if (!repo) throw new Error("AHDGAME_REPO is required");

const combos: Record<string, Record<string, TfpLeaves>> = {};
for (const entry of CASES) {
  const random = entry.randomSeed
    ? (() => {
        const rng = rngFromSeed(`${entry.randomSeed}:tfp-leaves`);
        return () => rng.next();
      })()
    : Math.random;
  const load = loadGameTree(repo, random);
  const docs = load(entry.metrics)[entry.exportName] as Array<Record<string, unknown>>;
  const overlays = entry.presets && entry.presetExport
    ? load(entry.presets)[entry.presetExport] as Record<string, Record<string, number>>
    : undefined;
  combos[entry.key] = overlayedLeaves(docs, overlays, entry.apply1991);
}

const payload = { pin: TFP_GAME_PIN, combos };
const encoded = `${JSON.stringify(payload)}\n`;
if (process.argv.includes("--check")) {
  const existing = readFileSync(OUT, "utf8");
  if (existing !== encoded) {
    throw new Error(`tfpGameFixtures.json is stale versus git-show ${TFP_GAME_PIN}`);
  }
  process.stdout.write("tfpGameFixtures.json matches source pin\n");
} else {
  writeFileSync(OUT, encoded);
  process.stdout.write(`wrote ${OUT} (${Object.keys(combos).length} combos)\n`);
}
