import type { Region } from "../types.js";
import { createSourceStateBudgetSnapshot } from "./sourceStateBudget.js";

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
    // Every persisted field is deterministic from the retained source GDP.
    // This also rejects unknown fields so the writer cannot silently accept a
    // new continuation meaning under the same schema family.
    if (!expected || canonical(row) !== canonical(expected)) {
      throw new Error(`Not a valid save file: invalid source StateBudget snapshot ${regionId}`);
    }
  }
}
