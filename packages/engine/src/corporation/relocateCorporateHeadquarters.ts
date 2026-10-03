import type { WorldState } from "../types.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { anchorToLocal, localToAnchor } from "../forex/conversion.js";
import { quoteCorporationCurrencyConversion, applyCorporationCurrencyConversion, SOURCE_CORPORATE_RELOCATION_FX_SPREAD } from "./corporationCurrencyConversion.js";
import { resolveSectorSpreadRoute } from "./playerSectorExpansion.js";

/** Source corporate relocation cost: 7% of market cap, doubled across borders. */
export const SOURCE_CORPORATE_RELOCATION_COST_FRACTION = 0.07;
export const SOURCE_CROSS_COUNTRY_RELOCATION_MULTIPLIER = 2;

export function relocateCorporateHeadquarters(
  world: WorldState,
  corporationId: string,
  destinationRegionId: string,
): { ok: true; cost: number; ceoVacated: boolean } | { ok: false; error: string } {
  const corp = world.corporations[corporationId];
  if (!corp) return { ok: false, error: "Corporation not found" };
  if (corp.ceoId !== "player" || corp.ceoType !== "player" || corp.ceoVacant === true) return { ok: false, error: "Only the active CEO may relocate corporate headquarters" };
  const destination = world.regions[destinationRegionId];
  if (!destination || destination.corporationHeadquartersOnly) return { ok: false, error: "Invalid headquarters region" };
  const changed = corp.headquartersRegionId !== destination.id || corp.countryId !== destination.countryId;
  const passedVoteMatches = corp.relocationVote?.status === "passed" &&
    corp.relocationVote.destinationRegionId === destination.id &&
    corp.relocationVote.destinationCountryId === destination.countryId;
  const sourceCountryId = passedVoteMatches ? corp.relocationVote!.sourceCountryId : corp.countryId;
  const crossCountry = destination.countryId !== sourceCountryId;
  if (crossCountry && world.countries[destination.countryId]?.playable !== true) {
    return { ok: false, error: "Destination country is not open to player relocation in this era" };
  }
  if (corp.isPrivate !== true && !passedVoteMatches) {
    return { ok: false, error: "Public corporations require a passed shareholder relocation vote for this destination" };
  }
  if (!changed && !passedVoteMatches) return { ok: false, error: "Corporation is already headquartered in this region" };
  if (!isCorpStateOwned(corp) && crossCountry && !privateEnterprisePermittedInCountry(world, destination.countryId)) {
    return { ok: false, error: "Private corporations cannot relocate into a command economy" };
  }
  const conversion = quoteCorporationCurrencyConversion(world, corp, sourceCountryId, destination.countryId);
  if ("error" in conversion) return { ok: false, error: conversion.error };
  const corpFxRate = conversion.fromRate;
  const marketCapAnchor = localToAnchor(corp.sharePrice * corp.totalShares, corpFxRate);
  const costAnchor = Math.round(marketCapAnchor * SOURCE_CORPORATE_RELOCATION_COST_FRACTION * (crossCountry ? SOURCE_CROSS_COUNTRY_RELOCATION_MULTIPLIER : 1));
  const fxSpreadAnchor = conversion.changesCurrency ? costAnchor * SOURCE_CORPORATE_RELOCATION_FX_SPREAD : 0;
  const spreadRoute = fxSpreadAnchor > 0
    ? resolveSectorSpreadRoute(world, conversion.fromCurrency, conversion.toCurrency, Math.round(anchorToLocal(fxSpreadAnchor, conversion.fromRate)))
    : undefined;
  if (fxSpreadAnchor > 0 && !spreadRoute) return { ok: false, error: "Cross-currency relocation requires source central-bank FX anchors" };
  const postConversionCapital = conversion.changesCurrency ? Math.round(corp.liquidCapital * conversion.scale * 100) / 100 : corp.liquidCapital;
  const cost = Math.round(anchorToLocal(costAnchor + fxSpreadAnchor, conversion.toRate));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, error: "Cannot relocate: market capitalization is too low" };
  if (!Number.isFinite(postConversionCapital) || postConversionCapital < cost) return { ok: false, error: "Insufficient corporate cash for relocation" };

  const ceoVacated = world.player.homeRegionId !== destination.id;
  applyCorporationCurrencyConversion(world, corp, conversion);
  corp.liquidCapital -= cost;
  corp.headquartersRegionId = destination.id;
  corp.countryId = destination.countryId;
  if (spreadRoute) {
    const sourceBank = world.centralBanks[spreadRoute.sourceCountryId]!;
    const destinationBank = world.centralBanks[spreadRoute.destinationCountryId]!;
    sourceBank.forexRevenue = (sourceBank.forexRevenue ?? 0) + spreadRoute.forexRevenue;
    destinationBank.spreadFeeReserveBalances ??= {};
    destinationBank.spreadFeeReserveBalances[conversion.fromCurrency] =
      (destinationBank.spreadFeeReserveBalances[conversion.fromCurrency] ?? 0) + spreadRoute.reserveAmount;
  }
  if (ceoVacated) {
    corp.ceoVacant = true;
    corp.ceoVacantSinceTurn = world.meta.turn;
    delete corp.pendingCeoId;
    corp.ceoVotes = [];
  }
  return { ok: true, cost, ceoVacated };
}
