import type { WorldState } from "@ahdclient/engine";
import { isCorpStateOwned } from "../../packages/engine/src/bonds/corporateBonds";
import { anchorToLocal, getRateForCountry } from "../../packages/engine/src/forex/conversion";
import { primaryNationalCorporation } from "../../packages/engine/src/corporation/nationalCorporation";

/** Country-wide register, matching Game's state-ownership redirect and ledger read. */
export function projectStateOwnership(world: WorldState, countryId = world.player.countryId) {
  if (!world.countries[countryId]) throw new Error(`Unknown country: ${countryId}`);
  const currency = world.budgets[countryId]?.currencyCode ?? "USD";
  const rate = getRateForCountry(world, countryId);
  const rows = (world.stateOwnershipLedger ?? [])
    .filter(entry => entry.countryId === countryId)
    .slice().reverse()
    .map(entry => ({
      ...entry,
      firm: entry.formerCorpName,
      pathLabel: entry.method === "legislative" ? "Legislative" : entry.method === "supermajority" ? "Supermajority" : "Executive",
      tierLabel: entry.tier === "fair" ? "Fair value" : entry.tier === "discounted" ? "Discounted" : "Seizure",
      triggerLabel: ({ npc: "NPC-owned", unowned: "Unowned", distress: "Financial distress", strategic: "Strategic sector", monopoly: "Monopoly", supermajority: "Supermajority" })[entry.triggers[0]!],
      // Source registerView renders a zero seizure payout as missing, while
      // the summary correctly includes a zero compensation total.
      compensationLocal: entry.compensationAnchor > 0 ? Math.round(anchorToLocal(entry.compensationAnchor, rate)) : null,
      debtLocal: Math.round(anchorToLocal(entry.debtAnchor, rate)),
    }));
  const assets = Object.values(world.corporateSectors ?? {});
  const holdings = Object.values(world.corporations)
    .filter(corporation => isCorpStateOwned(corporation) && corporation.countryOwnerId === countryId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(corporation => ({
      corporationId: corporation.id,
      name: corporation.name ?? corporation.tickerSymbol ?? corporation.id,
      sectorType: corporation.sectorType,
      assets: assets.filter(asset => asset.corporationId === corporation.id).map(asset => ({
        id: asset.id, regionId: asset.stateId, sectorType: asset.sectorType, workers: asset.workers,
      })),
    }));
  return {
    countryId, countryName: world.countries[countryId]?.name ?? countryId, currency,
    nationalCorporationId: primaryNationalCorporation(world, countryId)?.id,
    historyRecorded: world.stateOwnershipLedger !== undefined,
    rows, holdings,
    totals: {
      firmsAbsorbed: rows.filter(row => row.kind === "nationalize_whole").length,
      compensationLocal: rows.reduce((sum, row) => sum + (row.compensationLocal ?? 0), 0),
      debtLocal: rows.reduce((sum, row) => sum + row.debtLocal, 0),
      shareholdersSettled: rows.reduce((sum, row) => sum + row.shareholdersSettled, 0),
    },
  };
}

export type StateOwnershipView = ReturnType<typeof projectStateOwnership>;
