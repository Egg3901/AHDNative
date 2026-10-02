import type { WorldState } from "../types.js";

export type TradeTariffScope = "economy_wide";

/** Persisted importer tariff row, corresponding to Game's Tariff record. */
export interface TradeTariffRecord {
  id: string;
  countryId: string;
  scopeType: TradeTariffScope;
  rate: number;
  sourceBillId: string;
  createdTurn: number;
  updatedTurn: number;
}

/** Source `importerTariffOnFlow`, including the FTA tariff exemption. */
export function importerTariffFraction(
  rows: readonly TradeTariffRecord[],
  importer: string,
  ftaCovered: boolean,
): number {
  if (ftaCovered) return 0;
  const totalPct = rows.reduce((sum, row) => {
    if (row.countryId !== importer || !Number.isFinite(row.rate)) return sum;
    return sum + row.rate;
  }, 0);
  return totalPct <= 0 ? 0 : Math.min(1, totalPct / 100);
}

/** Game's trade affinity tariff drag scale, sourced from trade/constants.ts. */
export function tariffAdjustedAffinity(
  affinity: number,
  rows: readonly TradeTariffRecord[],
  importer: string,
  ftaCovered: boolean,
): number {
  const fraction = importerTariffFraction(rows, importer, ftaCovered);
  return affinity / (1 + 3 * fraction);
}

/** Read validated, optional tariff state without mutating legacy saves. */
export function tradeTariffs(world: WorldState): readonly TradeTariffRecord[] {
  return world.tradeTariffs ?? [];
}

export function enactTradeTariff(world: WorldState, input: Omit<TradeTariffRecord, "id" | "createdTurn" | "updatedTurn">): TradeTariffRecord {
  const keyMatches = (row: TradeTariffRecord) => row.countryId === input.countryId && row.scopeType === input.scopeType;
  const existing = (world.tradeTariffs ?? []).find(keyMatches);
  const turn = world.meta.turn;
  const record: TradeTariffRecord = {
    id: existing?.id ?? `tariff-${input.countryId}-${input.scopeType}`,
    ...input,
    createdTurn: existing?.createdTurn ?? turn,
    updatedTurn: turn,
  };
  world.tradeTariffs = [...(world.tradeTariffs ?? []).filter((row) => !keyMatches(row)), record];
  return record;
}

/**
 * Port `reconcileSignedTariffBills` at Game cb66. Four source-authored
 * economy-wide defaults are bootstrapped from their existing budget rate;
 * then signed economy-wide tariff provisions replay in enactment order so a
 * save interrupted before row persistence heals on its next market phase.
 */
export function reconcileTradeTariffs(world: WorldState): void {
  const baselines = [
    ["US", "680bfd000000000000000001"],
    ["UK", "680bfd000000000000000002"],
    ["JP", "680bfd000000000000000003"],
    ["DE", "680bfd000000000000000004"],
  ] as const;
  for (const [countryId, sourceBillId] of baselines) {
    if ((world.tradeTariffs ?? []).some((row) => row.countryId === countryId && row.scopeType === "economy_wide")) continue;
    const rate = world.budgets[countryId]?.taxRates.tariffs;
    if (typeof rate !== "number" || !Number.isFinite(rate)) continue;
    world.tradeTariffs = [...(world.tradeTariffs ?? []), {
      id: `tariff-${countryId}-economy_wide`, countryId, scopeType: "economy_wide", rate,
      sourceBillId, createdTurn: 0, updatedTurn: 0,
    }];
  }
  const signedTariffBills = world.bills
    .filter((bill) => bill.status === "signed")
    .flatMap((bill) => bill.provisions
      .filter((provision) => provision.type === "tariff" && provision.tariffScopeType === "economy_wide" &&
        Number.isFinite(provision.tariffRate) && provision.tariffRate! >= 0 && provision.tariffRate! <= 100)
      .map((provision) => ({ bill, rate: provision.tariffRate! })))
    .sort((a, b) => (a.bill.enactedAtTurn ?? a.bill.updatedAtTurn) - (b.bill.enactedAtTurn ?? b.bill.updatedAtTurn) ||
      a.bill.proposedAtTurn - b.bill.proposedAtTurn || a.bill.id.localeCompare(b.bill.id));
  for (const { bill, rate } of signedTariffBills) {
    enactTradeTariff(world, {
      countryId: bill.countryId,
      scopeType: "economy_wide",
      rate,
      sourceBillId: bill.id,
    });
  }
}
