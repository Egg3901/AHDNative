import type { Region } from "../types.js";
import { applySourceStateCorporateTaxBaseUpdate, createSourceStateBudgetSnapshot } from "./sourceStateBudget.js";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function validateSourceStateBudgets(value: unknown, regions: Record<string, Region>, era: string): void {
  if (value === undefined) return;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Not a valid save file: invalid source StateBudget map");
  }
  const snapshots = value as Record<string, unknown>;
  const expectedRegionIds = Object.entries(regions)
    .filter(([, region]) => region.countryId === "NG" && region.sourceGdp !== undefined)
    .map(([regionId]) => regionId)
    .sort();
  if (Object.keys(snapshots).sort().join("\n") !== expectedRegionIds.join("\n")) {
    throw new Error("Not a valid save file: incomplete source StateBudget region set");
  }
  for (const [regionId, raw] of Object.entries(snapshots)) {
    const region = regions[regionId];
    if (!region || region.countryId !== "NG" || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`Not a valid save file: invalid source StateBudget identity ${regionId}`);
    }
    const expected = createSourceStateBudgetSnapshot(region, era);
    const row = raw as Record<string, unknown>;
    const update = row["corporateTaxBaseUpdate"];
    let expectedCurrent = expected;
    if (update !== undefined) {
      if (typeof update !== "object" || update === null || Array.isArray(update)) {
        throw new Error(`Not a valid save file: invalid source StateBudget update ${regionId}`);
      }
      const fields = update as Record<string, unknown>;
      const turn = fields["turn"];
      const domesticAnnualIncomeLocal = fields["domesticAnnualIncomeLocal"];
      const foreignAnnualIncomeLocal = fields["foreignAnnualIncomeLocal"];
      if (Object.keys(fields).sort().join(",") !== "domesticAnnualIncomeLocal,foreignAnnualIncomeLocal,turn" ||
        typeof turn !== "number" || !Number.isSafeInteger(turn) || turn < 0 ||
        typeof domesticAnnualIncomeLocal !== "number" || !Number.isFinite(domesticAnnualIncomeLocal) || domesticAnnualIncomeLocal < 0 ||
        typeof foreignAnnualIncomeLocal !== "number" || !Number.isFinite(foreignAnnualIncomeLocal) || foreignAnnualIncomeLocal < 0) {
        throw new Error(`Not a valid save file: invalid source StateBudget update ${regionId}`);
      }
      if (expected) {
        expectedCurrent = applySourceStateCorporateTaxBaseUpdate(expected, {
          turn,
          domesticAnnualIncomeLocal,
          foreignAnnualIncomeLocal,
        });
      }
    }
    // Seed rows are exact generation snapshots. Updated rows are reconstructed
    // from their persisted source-turn accounting input; unknown fields remain
    // rejected, and historical rows without that optional input remain valid.
    if (!expectedCurrent || canonical(row) !== canonical(expectedCurrent)) {
      throw new Error(`Not a valid save file: invalid source StateBudget snapshot ${regionId}`);
    }
  }
}
