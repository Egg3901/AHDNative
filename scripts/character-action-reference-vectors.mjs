// Execute pinned AHDGame action rules, without Native formulas or a database.
import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import ts from "typescript";

const repo = process.argv[2];
const revision = "08820d108bf986d519aed28c2963690dd772c652";
if (!repo) throw new Error("Usage: node scripts/character-action-reference-vectors.mjs <AHDGame git repository>");
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  if (!path.startsWith("src/lib/") || path.includes("..")) throw new Error(`Unsupported source dependency: ${path}`);
  const source = execFileSync("git", ["-C", repo, "show", `${revision}:${path}`], { encoding: "utf8" });
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  modules.set(path, module);
  const require = name => {
    let target;
    if (name.startsWith("@/lib/")) target = `src/lib/${name.slice(6)}`;
    else if (name.startsWith(".")) target = posix.normalize(posix.join(posix.dirname(path), name));
    else throw new Error(`Host dependency refused: ${name}`);
    return load(`${target.replace(/\.(?:js|ts)$/, "")}.ts`);
  };
  new Function("require", "exports", "module", compiled.outputText)(require, module.exports, module);
  return module.exports;
}
const rules = load("src/lib/actions/rules.ts");
const gdp = load("src/lib/campaigns/rules/gdpBaseline.ts");
const drift = load("src/lib/stats/statDrift.ts");
const debate = load("src/lib/stats/debateDecay.ts");
const vectors = [];
for (const [countryId, era] of [["US", "1953"], ["UK", "1979"], ["RU", "1953"], ["DD", "1979"], ["IE", "1991"], ["CN", "2019"]]) {
  for (const scale of [0.5, 1, 3]) {
    const target = { gdpMillions: gdp.gdpBaselinePerCapita(countryId, `${era}-default`) * scale, population: 1_000_000, countryId, preset: `${era}-default` };
    vectors.push({ countryId, era, scale, target,
      campaign: rules.quoteCampaignAction({ politicalInfluence: 65, charisma: 10, intellect: 3 }, target),
      advertise: rules.quoteAdvertiseAction({ favorability: 75, charisma: 10 }, target),
      donor: rules.quoteBuildDonorBaseAction({ donorBaseLevel: 4, fundraising: 10 }, target),
    });
  }
}
console.log(JSON.stringify({ revision, paths: [...modules.keys()].sort(), baselineTable: gdp.getGdpBaselineTable(), vectors,
  convert: [100, 100_000, 1_000_000, 10_000_000].map(amount => ({ amount, quote: rules.quoteConvertCashAction({ amount }) })),
  drift: drift.applyTurnDrift({ charisma: 3, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 10 }, { charisma: 0.03, energy: 0.06 }),
  debate: [71, 72, 73, 144].map(hours => ({ hours, result: debate.applyDebateDecay(10, new Date("2026-01-01T00:00:00.000Z"), new Date(Date.parse("2026-01-01T00:00:00.000Z") + hours * 3_600_000)) })),
}, null, 2));
