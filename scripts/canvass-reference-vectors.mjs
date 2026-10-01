// Execute pinned AHDGame action rules, without Native formulas or a database.
import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import ts from "typescript";

const repo = process.argv[2];
const revision = "08820d108bf986d519aed28c2963690dd772c652";
if (!repo) throw new Error("Usage: node scripts/canvass-reference-vectors.mjs <AHDGame git repository>");
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path).exports;
  if (!path.startsWith("src/lib/") || path.includes("..")) throw new Error(`Unsupported source dependency: ${path}`);
  let source;
  try { source = execFileSync("git", ["-C", repo, "show", `${revision}:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch { path = path.replace(/\.ts$/, "/index.ts"); source = execFileSync("git", ["-C", repo, "show", `${revision}:${path}`], { encoding: "utf8" }); }
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
const rules = load("src/lib/campaignTargeting/rules.ts");
const legacy = load("src/lib/turn/demographicTurnoutCalculations.ts");
const diminishing = load("src/lib/utils/diminishingReturns.ts");
const vectors = [];
for (const [candidate, audience, current, count, closing] of [
  [{ economicLean: 0, socialLean: 0 }, { economicLean: 0, socialLean: 0 }, 0, 2, false],
  [{ economicLean: 0, socialLean: 0 }, { economicLean: -4.5, socialLean: -0.5 }, 0, 3, false],
  [{ economicLean: 3, socialLean: -2 }, { economicLean: 0, socialLean: 1 }, -8, 4, true],
  [{ economicLean: 0, socialLean: 0 }, { economicLean: 0, socialLean: 0 }, 15, 50, true],
]) {
  const boost = rules.canvassingBoost(candidate, audience, closing);
  const legacyBoost = legacy.calculateCanvassingBoost(
    { economic: candidate.economicLean, social: candidate.socialLean },
    { economic: audience.economicLean, social: audience.socialLean }, closing);
  let legacyAfter = current;
  for (let i = 0; i < count; i++) legacyAfter = Math.max(-20, Math.min(20, legacyAfter + diminishing.applyDiminishingReturns(legacyAfter, legacyBoost)));
  vectors.push({ candidate, audience, current, count, closing, boost,
    after: rules.addTurnoutBoost(current, boost, count), legacyAfter,
    decayed: rules.decayTurnout({ voterGroups: { target: rules.addTurnoutBoost(current, boost, count) } }).voterGroups.target });
}
console.log(JSON.stringify({ revision, paths: [...modules.keys()].sort(), vectors }, null, 2));
