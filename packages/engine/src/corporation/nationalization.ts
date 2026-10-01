import type { WorldState } from "../types.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";

/** Source `NATIONALIZATION_REVENUE_HAIRCUT` for an executive taking. */
export const NATIONALIZATION_REVENUE_KEEP = 0.85;

export type NationalizationResult =
  | { ok: true; nationalCorporationId: string; absorbedAssetIds: string[]; message: string }
  | { ok: false; error: string };

/**
 * The source route authorizes a sitting human head of government. The Native
 * world has a real, playable presidential election record for the US; a
 * permanent Head-of-State sandbox identity is deliberately not an elected
 * mandate. Parliamentary authority is accepted only when the recorded PM and
 * the player's recorded office agree.
 */
export function isRecordedSittingHeadOfGovernment(world: WorldState, countryId: string): boolean {
  if (world.player.countryId !== countryId || world.player.mode !== "career" || world.player.permanentHeadOfState) return false;

  const executive = world.executives[countryId];
  if (executive?.presidentId === "player") {
    return world.elections.some((election) =>
      election.countryId === countryId &&
      election.electionType === "president" &&
      election.status === "resolved" &&
      election.resolvedTurn === executive.termStartTurn &&
      election.winners?.includes("player"),
    );
  }

  const government = world.governments[countryId];
  return government?.status === "formed" &&
    government.pmPoliticianId === "player" &&
    world.player.currentOffice?.countryId === countryId &&
    world.player.currentOffice.type === "primeMinister" &&
    world.player.legislativeSeat?.countryId === countryId;
}

/**
 * Executive seizure port for Native's one-sector-per-corporation model.
 * Game resolves a primary/split-off National Corporation by sector type,
 * merges a conflicting (stateId, sectorType) asset, applies the 15% revenue
 * transition haircut, assumes the dissolved shell's bonds, and dissolves that
 * shell. Native represents those split-offs as one issuer per sector type;
 * sector headcount itself transfers in full, matching absorbSectorIntoNatCorp.
 */
export function nationalizeDistressedCorporation(
  world: WorldState,
  corporationId: string,
  actorId: string,
): NationalizationResult {
  if (actorId !== "player" || !isRecordedSittingHeadOfGovernment(world, world.player.countryId)) {
    return { ok: false, error: "Only the sitting head of government may order an executive nationalization." };
  }

  const donor = world.corporations[corporationId];
  if (!donor) return { ok: false, error: `Unknown corporation: ${corporationId}` };
  if (donor.countryId !== world.player.countryId) {
    return { ok: false, error: "That corporation is not headquartered in your country." };
  }
  if (isCorpStateOwned(donor)) return { ok: false, error: "That corporation is already state-owned." };
  if (donor.insolventSinceTurn === null) {
    return { ok: false, error: "Executive power can only nationalize a distressed corporation." };
  }

  const nationalCorporationId = `NAT-${donor.countryId}-${donor.sectorType}`;
  const existingNational = world.corporations[nationalCorporationId];
  if (existingNational && !isCorpStateOwned(existingNational)) {
    return { ok: false, error: "The National Corporation identity is occupied by a private issuer." };
  }
  const assets = corporateSectorAssets(world);
  const absorbedAssetIds = Object.values(assets)
    .filter((asset) => asset.corporationId === donor.id)
    .map((asset) => asset.id)
    .sort();
  if (absorbedAssetIds.length === 0) {
    return { ok: false, error: "The corporation has no recorded sector assets to absorb." };
  }

  const keep = NATIONALIZATION_REVENUE_KEEP;
  const countryName = world.countries[donor.countryId]?.name ?? donor.countryId;
  const national = existingNational ?? {
    ...donor,
    id: nationalCorporationId,
    name: `${countryName} National Corporation · ${donor.sectorType}`,
    tickerSymbol: `NAT${donor.countryId}${donor.sectorType.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}`,
    isNationalCorporation: true as const,
    countryOwnerId: donor.countryId,
    ownershipState: "stateOwned" as const,
    ceoType: "npp" as const,
    ceoId: `state-${donor.countryId}`,
    ceoVacant: false,
    ceoVotes: [],
    ceoSalaryPerTurn: 0,
    dividendRate: 0,
    lastCeoSalaryPaid: 0,
    lastDividendPoolPaid: 0,
    lastPlayerDividendPaid: 0,
    lastUnpostedDividendPaid: 0,
    shareholders: [],
    totalShares: 0,
    publicFloat: 0,
    sharePrice: 1,
    fundamentalSharePrice: 1,
    earningsHistory: [],
    priceHistory: [],
    revenue: 0,
    foundingRevenue: 0,
    currentGrowthCost: 0,
  };
  national.isNationalCorporation = true;
  national.countryOwnerId = donor.countryId;
  national.ownershipState = "stateOwned";
  national.assignedSectorTypes = [...new Set([...(national.assignedSectorTypes ?? []), donor.sectorType])];

  for (const assetId of absorbedAssetIds) {
    const asset = assets[assetId]!;
    const absorbedRevenue = Math.round((asset.revenue ?? donor.revenue) * keep);
    const collision = Object.values(assets).find((candidate) =>
      candidate.id !== asset.id && candidate.corporationId === nationalCorporationId &&
      candidate.stateId === asset.stateId && candidate.sectorType === asset.sectorType,
    );
    if (collision) {
      collision.workers += asset.workers;
      collision.revenue = (collision.revenue ?? existingNational?.revenue ?? 0) + absorbedRevenue;
      collision.forSale = null;
      if (!collision.representingUnionId && asset.representingUnionId) {
        collision.representingUnionId = asset.representingUnionId;
      }
      delete assets[assetId];
    } else {
      asset.corporationId = nationalCorporationId;
      asset.owner = "corporation";
      asset.revenue = absorbedRevenue;
      asset.forSale = null;
    }
  }
  for (const bond of Object.values(world.bonds)) {
    if (bond.issuerType === "corporation" && bond.corporationId === donor.id) {
      bond.corporationId = nationalCorporationId;
    }
  }

  delete world.corporations[donor.id];
  national.revenue += Math.round(donor.revenue * keep);
  national.foundingRevenue += Math.round(donor.foundingRevenue * keep);
  national.currentGrowthCost += Math.round(donor.currentGrowthCost * keep);
  world.corporations[nationalCorporationId] = national;
  return {
    ok: true,
    nationalCorporationId,
    absorbedAssetIds,
    message: `${donor.name ?? donor.tickerSymbol} was absorbed into ${national.name}`,
  };
}
