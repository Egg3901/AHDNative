// Run actual database-free AHDGame rules from an immutable git object.
// Runtime imports used by these cases are supplied from that same revision.
// No Native engine/formula is imported; no database or live checkout is used.
import { execFileSync } from "node:child_process";
import ts from "typescript";

const repo = process.argv[2];
if (!repo) throw new Error("Usage: node scripts/banking-reference-vectors.mjs <AHDGame git repository>");
const revision = "595a3b8a9e32e6a25848556a9e05ce5cc6d6e450";
const paths = [];
function rules(path, bindings = {}) {
  paths.push(path);
  const source = execFileSync("git", ["-C", repo, "show", `${revision}:${path}`], { encoding: "utf8" });
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true);
  const cleaned = ts.transform(parsed, [context => root => {
      const visit = node => ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)
        ? undefined : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit);
    }]);
  const compiled = ts.transpileModule(ts.createPrinter().printFile(cleaned.transformed[0]), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  cleaned.dispose();
  const module = { exports: {} };
  new Function(...Object.keys(bindings), "exports", "module", compiled.outputText)(...Object.values(bindings), module.exports, module);
  return module.exports;
}
const time = rules("src/lib/constants/turnTime.ts");
const boundary = rules("src/lib/banking/rules/boundary.ts");
const capabilities = rules("src/lib/banking/rules/capabilities.ts");
const sheet = rules("src/lib/banking/rules/balanceSheet.ts");
const lifecycle = rules("src/lib/banking/rules/lifecycle.ts");
const window = rules("src/lib/banking/rules/discountWindow.ts", { ...sheet, ...capabilities });
const decide = rules("src/lib/banking/rules/decide.ts", { ...boundary, ...sheet, ...capabilities, ...lifecycle, ...window });
const interest = rules("src/lib/banking/rules/facilityInterest.ts", { ...boundary, TURNS_PER_YEAR: time.TURNS_PER_YEAR });
const corridors = rules("src/lib/banking/regulationQ.ts");

const charter = { type: "investment", status: "active", warningBand: "green", cashReserves: 1_000_000,
  postedCapital: 1_000_000, npcDeposits: 0, totalLoans: 0, propBookMarkValue: 96_000, cbMarginArrears: 1_000 };
const snapshot = { bankId: "000000000000000000000001", currency: "USD", turn: 0, charter,
  centralBankId: "US", primeRate: 5, reserveRatio: 0.2, policy: { privateBanking: true, propTrading: true } };
const marginDraw = decide.decideBankCommand(snapshot, { type: "draw_cb_margin", amount: 47_000 }, { commandId: "draw" });
const fullSnapshot = { ...snapshot, charter: { ...charter, cbMarginDebt: 47_000, cashReserves: 1_047_000 } };
const marginOverCap = decide.decideBankCommand(fullSnapshot, { type: "draw_cb_margin", amount: 0.01 }, { commandId: "over" });
const marginRepay = decide.decideBankCommand(fullSnapshot, { type: "repay_cb_margin", amount: 100_000 }, { commandId: "repay" });
function facility(kind, debt, ratePercent, availableCash) {
  const transition = interest.facilityInterestTransition({ key: "interest", bankId: snapshot.bankId,
    centralBankId: "US", currency: "USD", turn: 1, facility: kind, debt, ratePercent, availableCash });
  return { ...interest.facilityInterestAmounts(transition), transition };
}
console.log(JSON.stringify({ revision, paths,
  charterCapabilities: Object.fromEntries(["retail", "investment", "universal"].map(type => [type, capabilities.charterCapabilities({ type, status: "active" })])),
  historicalDeposit: corridors.HISTORICAL_DEPOSIT_CORRIDOR, historicalLending: corridors.HISTORICAL_LENDING_CORRIDOR,
  modernDeposit: corridors.MODERN_DEPOSIT_CORRIDOR, modernLending: corridors.MODERN_LENDING_CORRIDOR,
  historicalDepositEdge: [-4, -0.5, -0.49].map(offset => ({ offset, allowed: corridors.isOffsetInCorridor(offset, corridors.HISTORICAL_DEPOSIT_CORRIDOR) })),
  marginDraw, marginOverCap, marginRepay,
  marginInterest: facility("cbMargin", 47_000, 6.5, 1_047_000),
  windowInterest: facility("discountWindow", 100_001, 8, 1_000_000),
  marginShortfall: facility("cbMargin", 100_000, 6.5, 40),
}, null, 2));
