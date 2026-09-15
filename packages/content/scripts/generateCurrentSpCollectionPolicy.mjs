import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const revision = "d4baf899fd8bd529099f03d7410807143604e2e5";
const sourcePath = "src/lib/admin/seed/seedManifest.ts";
const root = resolve(process.argv[process.argv.indexOf("--source-root") + 1] ?? "");
const source = execFileSync("git", ["show", `${revision}:${sourcePath}`], { cwd: root, encoding: "utf8" });
const names = [...source.matchAll(/\bname\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
if (names.length !== 363 || new Set(names).size !== names.length) throw new Error(`Expected 363 unique collections, got ${names.length}`);
const targets = new Map(Object.entries({ gameConfig:"meta",countryGameStates:"countries",states:"regions",npps:"politicians",politicalParties:"parties",electedOfficials:"legislatures/executives",elections:"elections",electionCandidates:"elections",referendums:"referendums",corporations:"corporations",corporateSectors:"corporateSectors",federalBudget:"budgets",stateBudgets:"regionalBudgets",bills:"bills",stateBills:"stateBills",enactedLaws:"enactedLaws",turnLogs:"history",newsPosts:"news",cabinetMembers:"cabinetMembers",cabinetNominations:"cabinetNominations",supremeCourtSeats:"supremeCourtSeats",scotusNominations:"scotusNominations" }));
const excluded = new Set(["users","sessions","userApiKeys","botApiKeys","apiAccessLog","rateLimitBuckets","notifications"]);
const rows = names.sort().map((name) => targets.has(name) ? { name,status:"mapping-required",target:targets.get(name) } : excluded.has(name) ? { name,status:"exclude",target:null } : { name,status:"missing",target:null });
const output = `/** Generated from AHDGame ${revision}:${sourcePath}. */\nexport const PINNED_GAME_COLLECTION_POLICY = ${JSON.stringify(rows, null, 2)} as const;\n`;
writeFileSync(resolve(import.meta.dirname, "../../../engine/src/interchange/currentSpCollections.generated.ts"), output);
