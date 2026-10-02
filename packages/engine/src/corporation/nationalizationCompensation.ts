import type { WorldState } from "../types.js";
import type { Corporation } from "./types.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices } from "./plantCapacity.js";
import { anchorToLocal, getRateForCountry, localToAnchor } from "../forex/conversion.js";
import { assumedDebtAnchor } from "./stateOwnershipLedger.js";

export type CompensationTier = "fair" | "discounted" | "seizure";
const TIER_MULTIPLIER: Record<CompensationTier, number> = { fair: 1, discounted: 0.5, seizure: 0 };

/** Game plants wholeCorpCompensationAnchor: paid book + CIP, cash at par,
 * debt against cash first. The current source book premium is exactly 1. */
export function nationalizationCompensation(world: WorldState, donor: Corporation, assets: CorporateSectorAsset[], tier: CompensationTier) {
  const prices = corporateSectorBasePrices(world);
  const book = assets.reduce((sum, asset) => {
    const basis = asset.capacityBookAnchor;
    const capacityBook = typeof basis === "number" && Number.isFinite(basis) && basis >= 0
      ? basis : Math.max(0, asset.capitalStock ?? 0) * capacityPricePerUnitAnchor(asset.sectorType, prices);
    return sum + capacityBook + Math.max(0, asset.constructionInProgressAnchor ?? 0);
  }, 0);
  const cash = Math.max(0, localToAnchor(donor.liquidCapital, getRateForCountry(world, donor.countryId)));
  const debt = Math.max(0, assumedDebtAnchor(world, donor.id));
  const valuationAnchor = Math.max(0, cash - debt) + Math.max(0, book - Math.max(0, debt - cash));
  return { valuationAnchor, payoutAnchor: valuationAnchor * TIER_MULTIPLIER[tier], cashAnchor: cash, debtAnchor: debt };
}

/** Game allocateShareholderPool floors each holder separately. Its nppId
 * rows receive no allocation; Native's anonymous founding NPC rows preserve
 * that source behavior rather than inventing a personal account. */
export function settleNationalizationCompensation(world: WorldState, donor: Corporation, tier: CompensationTier, payoutAnchor: number): void {
  const treasury = world.budgets[donor.countryId]!;
  const rate = getRateForCountry(world, donor.countryId);
  // The source debit is unconditional, including an overdrawn treasury.
  treasury.treasuryBalance -= Math.round(anchorToLocal(payoutAnchor, rate));
  if (payoutAnchor > 0 && donor.totalShares > 0) {
    const playerPayout = donor.shareholders.filter(row => row.holder === "player" && row.shares > 0)
      .reduce((sum, row) => sum + Math.floor(payoutAnchor * row.shares / donor.totalShares), 0);
    world.player.cash += world.featureFlags.foreignExchange === false ? playerPayout : anchorToLocal(playerPayout, rate);
    const publicFloatPayout = Math.floor(payoutAnchor * Math.max(0, donor.publicFloat) / donor.totalShares);
    treasury.treasuryBalance += Math.round(anchorToLocal(publicFloatPayout, rate));
  }
  const cashAnchor = Math.max(0, localToAnchor(donor.liquidCapital, rate));
  // Source resolves the CEO in the Character collection. Native NPP CEOs
  // do not resolve there; the actual human player does.
  const playerCeo = tier !== "seizure" && !donor.ceoVacant && donor.ceoType === "player" && donor.ceoId === "player";
  const ceoSurplus = playerCeo ? Math.max(0, cashAnchor - payoutAnchor) : 0;
  if (ceoSurplus > 0) world.player.cash += Math.round(world.featureFlags.foreignExchange === false ? ceoSurplus : anchorToLocal(ceoSurplus, rate));
  treasury.treasuryBalance += Math.round(anchorToLocal(cashAnchor - ceoSurplus, rate));
}

/** The source wizard labels this as indicative, using market cap or cash;
 * the final plants paid-basis amount is computed again during execution. */
export function indicativeNationalizationCompensation(donor: Corporation): number {
  return Math.max(donor.sharePrice * donor.totalShares, donor.liquidCapital, 0) * TIER_MULTIPLIER.discounted;
}
