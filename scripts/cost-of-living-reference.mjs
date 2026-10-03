// Capture actual Game seed writes without connecting to a database.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const revision = "0538f4264354eeb837dc1b0b47639e74591fca17";
const source = process.argv[2];
const oracleSeed = process.argv[3];
if (!source) throw new Error("Usage: node scripts/cost-of-living-reference.mjs <clean Game checkout at 0538f426> [oracle seed]");
if (execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== revision) {
  throw new Error("The Game checkout must match the immutable source revision.");
}
if (execFileSync("git", ["-C", source, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()) {
  throw new Error("The Game checkout must have no tracked modifications.");
}
const routes = {
  US: ["src/lib/admin/seed/seedRegionMetrics.ts", "seedRegionMetrics"],
  UK: ["src/lib/countries/uk/seed.ts", "seedUKStateMetrics"],
  RU: ["src/lib/countries/ru/seedRU.ts", "seedRUStateMetrics"],
  DD: ["src/lib/admin/seed/seedDD.ts", "seedDDStateMetrics"],
  CN: ["src/lib/admin/seed/seedCN.ts", "seedCNStateMetrics"],
  DE: ["src/lib/admin/seed/seedDE.ts", "seedDEStateMetrics"],
  BR: ["src/lib/admin/seed/seedBR.ts", "seedBRStateMetrics"],
  IE: ["src/lib/admin/seed/seedIE.ts", "seedIEStateMetrics"],
  JP: ["src/lib/countries/jp/seed.ts", "seedJPStateMetrics"],
};
const packs = new URL("../packages/content/src/packs/index.ts", import.meta.url).href;
const rngModule = new URL("../packages/engine/src/rng.ts", import.meta.url).href;
const temporary = mkdtempSync(resolve(tmpdir(), "ahd-col-reference-"));
const result = resolve(temporary, "seeds.json");
const code = `
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PACKS } from ${JSON.stringify(packs)};
const routes = ${JSON.stringify(routes)};
const source = ${JSON.stringify(resolve(source))};
const seeds = {};
const oracleSeed = ${JSON.stringify(oracleSeed ?? null)};
const rng = oracleSeed ? (await import(${JSON.stringify(rngModule)})).rngFromSeed(oracleSeed + ':tfp-leaves') : null;
let sourceRandomDraws = 0;
let usRandomDraws;
// US 1991/2019 are randomized at source module load. Capture the center of
// that distribution; Native replays the existing TFP seed tape's COL draw.
Math.random = () => { sourceRandomDraws++; return rng ? rng.next() : 0.5; };
for (const pack of PACKS) {
  const countries = new Set([
    ...pack.countries.map(country => country.id),
    ...(pack.states ?? []).map(state => state.countryId),
    ...(pack.economyRegions ?? []).map(state => state.countryId),
  ]);
  for (const country of countries) {
    const route = routes[country];
    if (!route) continue;
    const values = {};
    const db = { collection(name) {
      assert.equal(name, 'macroMetrics');
      return { async bulkWrite(ops, options) {
        assert.deepEqual(options, { ordered: true });
        for (const op of ops) {
          assert.deepEqual(Object.keys(op), ['updateOne']);
          assert.equal(op.updateOne.upsert, true);
          const col = op.updateOne.update.$set.economic?.costOfLiving;
          if (!col) continue;
          assert.equal(typeof col.value, 'number');
          assert(Number.isFinite(col.value));
          assert.equal(col.simBaseline, undefined);
          values[String(op.updateOne.filter._id)] = col.value;
        }
        return { acknowledged: true };
      } };
    } };
    const beforeImport = sourceRandomDraws;
    const module = await import(pathToFileURL(source + '/' + route[0]).href);
    if (country === 'US' && usRandomDraws === undefined) {
      assert.equal(beforeImport, 0);
      usRandomDraws = sourceRandomDraws;
      assert.equal(usRandomDraws, 51 * 66);
    }
    await module[route[1]](db, false, () => {}, pack.era.id + '-default');
    seeds[country + ':' + pack.era.id] = values;
  }
}
writeFileSync(${JSON.stringify(result)}, JSON.stringify({ seeds, sourceRandomDraws: usRandomDraws }));
`;
let captured;
try {
  const probe = resolve(temporary, "probe.mts");
  writeFileSync(probe, code);
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  execFileSync(process.execPath, [tsx, "--tsconfig", resolve(source, "tsconfig.json"), probe], { stdio: "inherit" });
  captured = JSON.parse(readFileSync(result, "utf8"));
} finally {
  rmSync(temporary, { recursive: true });
}
if (oracleSeed) {
  const oracle = {
    sourceHead: revision,
    sourceRoute: "seedRegionMetrics",
    sourceRandomDraws: captured.sourceRandomDraws,
    tapeSeed: oracleSeed + ":tfp-leaves",
    cases: ["1991", "2019"].map(era => ({ era, seed: oracleSeed, values: captured.seeds["US:" + era] })),
  };
  writeFileSync(new URL("../packages/engine/src/metrics/regionalCostOfLivingOracle.json", import.meta.url), JSON.stringify(oracle, null, 2) + "\n");
} else {
  const target = new URL("../packages/engine/src/metrics/regionalCostOfLivingSeeds.ts", import.meta.url);
  writeFileSync(fileURLToPath(target), `// Generated by scripts/cost-of-living-reference.mjs.\n// Game ${revision}: actual macroMetrics cost-of-living seed writes.\n// US 1991/2019 values are centers with Math.random=0.5, not frozen samples.\n// Their runtime seed replays draw 4 of the existing 66-draw/state TFP tape.\n// Source seed rows have no simBaseline; the first ordinary turn produces it.\nexport const REGIONAL_COST_OF_LIVING_SEEDS: Readonly<Record<string, Readonly<Record<string, number>>>> = ${JSON.stringify(captured.seeds, null, 2)};\n`);
}
