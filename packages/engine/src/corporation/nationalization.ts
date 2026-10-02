import type { WorldState } from "../types.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { corporateSectorAssets, type CorporateSectorAsset } from "./corporateSectorAssets.js";
import { mergeCorporateSectorPhysicalLedger } from "./physicalAssetMerge.js";
import { EXECUTIVE_OFFICE_BY_COUNTRY } from "../actions/officeRegistry.js";
import { GOVERNMENT_CHAMBER_BY_COUNTRY } from "../government/constants.js";
import { isRecordedSingleplayerHeadOfGovernment } from "../government/singleplayerHeadOfGovernment.js";
import { executiveTakingEligibility } from "./nationalizationEligibility.js";
import { nationalizationCompensation, settleNationalizationCompensation, indicativeNationalizationCompensation, type CompensationTier } from "./nationalizationCompensation.js";

/** Source `NATIONALIZATION_REVENUE_HAIRCUT` for an executive taking. */
export const NATIONALIZATION_REVENUE_KEEP = 0.85;

export type NationalizationResult =
  | { ok: true; nationalCorporationId: string; absorbedAssetIds: string[]; message: string }
  | { ok: false; error: string };

/**
 * The source route authorizes a sitting human head of government. Presidential
 * authority resolves through the canonical executive record; parliamentary
 * authority resolves through the formed government record. HoS mode is valid
 * only when its permanent player projection agrees with that canonical state.
 */
export function isRecordedSittingHeadOfGovernment(world: WorldState, countryId: string): boolean {
  if (world.player.countryId !== countryId) return false;

  if (world.player.mode === "hos") {
    return isRecordedSingleplayerHeadOfGovernment(world, countryId);
  }
  if (world.player.mode !== "career" || world.player.permanentHeadOfState) return false;

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
  const expectedOfficeType = EXECUTIVE_OFFICE_BY_COUNTRY[countryId];
  return government?.status === "formed" &&
    government.pmPoliticianId === "player" &&
    government.chamberKey === GOVERNMENT_CHAMBER_BY_COUNTRY[countryId] &&
    world.player.currentOffice?.countryId === countryId &&
    world.player.currentOffice.type === expectedOfficeType &&
    world.player.legislativeSeat?.countryId === countryId;
}

/** Domestic targets that pass the command's recorded-office and seizure gates. */
export function nationalizationTargets(world: WorldState): Array<{ id: string; label: string }> {
  if (!isRecordedSittingHeadOfGovernment(world, world.player.countryId)) return [];
  const assets = corporateSectorAssets(world);
  return Object.values(world.corporations)
    .filter((corporation) => corporation.countryId === world.player.countryId)
    .filter((corporation) => !isCorpStateOwned(corporation) && executiveTakingEligibility(world, corporation).takeable)
    .filter((corporation) => !world.corporations[`NAT-${corporation.countryId}-${corporation.sectorType}`] ||
      isCorpStateOwned(world.corporations[`NAT-${corporation.countryId}-${corporation.sectorType}`]!))
    .filter((corporation) => Object.values(assets).some((asset) => asset.corporationId === corporation.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((corporation) => ({ id: corporation.id, label: corporation.name ?? corporation.tickerSymbol ?? corporation.id }));
}

/** Source wizard target details and its indicative discounted quote. */
export function nationalizationTargetDetails(world: WorldState) {
  const assets = Object.values(corporateSectorAssets(world));
  return nationalizationTargets(world).map(target => {
    const donor = world.corporations[target.id]!;
    return { id: target.id, ownerKind: donor.nationalizationOwnerKind ?? "npc",
      sectorCount: assets.filter(asset => asset.corporationId === donor.id).length,
      discountedIndicativeLocal: indicativeNationalizationCompensation(donor) };
  });
}

export function nationalizationUnavailableReason(world: WorldState): string | undefined {
  if (!isRecordedSittingHeadOfGovernment(world, world.player.countryId)) {
    return "Only the sitting head of government may order an executive nationalization.";
  }
  const targets = nationalizationTargets(world);
  if (targets.length > 0) return undefined;
  return "No eligible domestic corporation with recorded assets is available for nationalization.";
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
  tier: CompensationTier = "seizure",
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
  const treasury = world.budgets[donor.countryId];
  if (!treasury) return { ok: false, error: "No national treasury is recorded for this country." };
  const eligibility = executiveTakingEligibility(world, donor);
  if (!eligibility.takeable) return { ok: false, error: eligibility.reason };

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
  const compensation = nationalizationCompensation(world, donor, absorbedAssetIds.map(id => assets[id]!), tier);
  const debtAnchor = compensation.debtAnchor;
  const sectorTypes = [...new Set(absorbedAssetIds.map(id => assets[id]!.sectorType))];
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
    // Source dissolved-shell seizure cash goes to the national treasury;
    // a newly created National Corporation starts with its own zero balance.
    liquidCapital: 0,
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
  settleNationalizationCompensation(world, donor, tier, compensation.payoutAnchor);

  for (const assetId of absorbedAssetIds) {
    const asset = assets[assetId]!;
    const absorbedRevenue = Math.round((asset.revenue ?? donor.revenue) * keep);
    // Source plants absorption haircuts the built capacity and its paid basis.
    // Already-paid construction and its queue transfer whole.
    if (asset.capitalStock !== undefined) asset.capitalStock = Math.round(asset.capitalStock * keep * 100) / 100;
    if (asset.capacityBookAnchor !== undefined) asset.capacityBookAnchor *= keep;
    const collision = Object.values(assets).find((candidate) =>
      candidate.id !== asset.id && candidate.corporationId === nationalCorporationId &&
      candidate.stateId === asset.stateId && candidate.sectorType === asset.sectorType,
    );
    if (collision) {
      collision.workers += asset.workers;
      collision.revenue = (collision.revenue ?? existingNational?.revenue ?? 0) + absorbedRevenue;
      mergeCorporateSectorPhysicalLedger(collision, asset);
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
    if (bond.issuerType === "corporation" && bond.corporationId === donor.id && !bond.matured) {
      bond.corporationId = nationalCorporationId;
    }
  }

  delete world.corporations[donor.id];
  national.revenue += Math.round(donor.revenue * keep);
  national.foundingRevenue += Math.round(donor.foundingRevenue * keep);
  national.currentGrowthCost += Math.round(donor.currentGrowthCost * keep);
  world.corporations[nationalCorporationId] = national;
  const ledger = world.stateOwnershipLedger ??= [];
  ledger.push({
    id: `taking-${donor.countryId}-${world.meta.turn}-${ledger.length}-${donor.id}`,
    countryId: donor.countryId,
    nationalCorporationId,
    kind: "nationalize_whole",
    method: "executive",
    triggers: eligibility.triggers,
    tier,
    formerCorpName: donor.name ?? donor.tickerSymbol ?? donor.id,
    sectorTypes,
    compensationAnchor: compensation.payoutAnchor,
    debtAnchor,
    shareholdersSettled: donor.shareholders.length,
    turn: world.meta.turn,
  });
  return {
    ok: true,
    nationalCorporationId,
    absorbedAssetIds,
    message: `${donor.name ?? donor.tickerSymbol} was absorbed into ${national.name}`,
  };
}
