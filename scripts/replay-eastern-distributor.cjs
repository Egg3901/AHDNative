const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const ts = require("typescript");

const [suppliedRoot, tracePath] = process.argv.slice(2);
if (!suppliedRoot || !tracePath) {
  throw new Error("Usage: node scripts/replay-eastern-distributor.cjs <immutable-AHDGame-checkout> <natural-trace.json>");
}
const root = path.resolve(suppliedRoot);
const sourceCommit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (execFileSync("git", ["-C", root, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()) {
  throw new Error("The source checkout must have no tracked modifications.");
}
const sourceRoot = path.join(root, "src");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) request = path.join(sourceRoot, request.slice(2));
  if (request.startsWith("@shared/")) request = path.join(root, "shared", request.slice(8));
  return resolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function (module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};
function restore(value) {
  if (Array.isArray(value)) return value.map(restore);
  if (value && typeof value === "object") {
    if (value.__type === "Map") return new Map(value.entries.map(([key, entry]) => [key, restore(entry)]));
    if (value.__type === "Set") return new Set(value.values.map(restore));
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, restore(entry)]));
  }
  return value;
}
const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
const { distributeVotesBySwingFlow } = require(path.join(sourceRoot, "lib/electionEngine/voteDistributionSwingFlow.ts"));
const turns = trace.journey.tallyInputTrace.map((serialized) => {
  const snapshot = restore(serialized);
  const source = distributeVotesBySwingFlow(
    snapshot.candidates, snapshot.effectiveTurnPool, snapshot.totalPool, snapshot.electorate,
    snapshot.demographics, snapshot.categories, new Map(snapshot.partyOrgByParty), snapshot.options,
  );
  return {
    turn: snapshot.turnNumber,
    electionId: snapshot.election._id,
    votesMatch: isDeepStrictEqual(source.votesPerCandidate, snapshot.nativeVotesPerCandidate),
    sharesMatch: isDeepStrictEqual(source.sharesPct, snapshot.nativeSharesPct),
    sourceVotesPerCandidate: source.votesPerCandidate,
    nativeVotesPerCandidate: snapshot.nativeVotesPerCandidate,
    sourceSharesPct: source.sharesPct,
    nativeSharesPct: snapshot.nativeSharesPct,
  };
});
if (turns.length === 0) throw new Error("The natural trace has no distributor inputs.");
const result = {
  sourceCommit, seed: trace.source.seed, inputTurns: turns.length,
  exactMatches: turns.filter((row) => row.votesMatch && row.sharesMatch).length,
  differingTurns: turns.filter((row) => !row.votesMatch || !row.sharesMatch).map(({ turn, votesMatch, sharesMatch }) => ({ turn, votesMatch, sharesMatch })),
  turns,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.differingTurns.length) process.exitCode = 1;
