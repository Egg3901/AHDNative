import type { WorldState } from "../types.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { anchorToLocal, localToAnchor } from "../forex/conversion.js";
import { applyCorporationCurrencyConversion, quoteCorporationCurrencyConversion, SOURCE_CORPORATE_RELOCATION_FX_SPREAD } from "./corporationCurrencyConversion.js";
import { resolveSectorSpreadRoute } from "./playerSectorExpansion.js";
import { leaveParty } from "../membership.js";
import { archiveCampaign } from "../campaigns/lifecycle.js";

export const SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS = 72;
export const SOURCE_CORPORATION_RELOCATION_COST_FRACTION = 0.07;
export const SOURCE_CROSS_COUNTRY_RELOCATION_MULTIPLIER = 2;

export type RelocatePlayerWithCorporationResult =
  | { ok: true; cost: number; crossCountry: boolean }
  | { ok: false; error: string };

/**
 * Source character/CEO combined relocation transaction.
 */
export function relocatePlayerWithCorporation(
  world: WorldState,
  corporationId: string,
  destinationRegionId: string,
): RelocatePlayerWithCorporationResult {
  const corp = world.corporations[corporationId];
  if (!corp) return { ok: false, error: "Corporation not found" };
  if (corp.ceoId !== "player" || corp.ceoType !== "player" || corp.ceoVacant === true) {
    return { ok: false, error: "Only the active CEO may move with this corporation" };
  }
  if (!corp.headquartersRegionId || world.player.homeRegionId !== corp.headquartersRegionId) {
    return { ok: false, error: "The CEO must reside at the corporation's current headquarters" };
  }
  const destination = world.regions[destinationRegionId];
  if (!destination || destination.corporationHeadquartersOnly) return { ok: false, error: "Invalid destination region" };
  if (destinationRegionId === world.player.homeRegionId) return { ok: false, error: "Already in this region" };
  const currentRegion = world.regions[world.player.homeRegionId];
  if (!currentRegion) return { ok: false, error: "Current residence region is unavailable" };
  if (corp.countryId !== currentRegion.countryId) return { ok: false, error: "The CEO's current residence and corporation must be in the same country" };
  const crossCountry = destination.countryId !== currentRegion.countryId;
  if (crossCountry && world.countries[destination.countryId]?.playable !== true) {
    return { ok: false, error: "Destination country is not open to player relocation in this era" };
  }
  if (!isCorpStateOwned(corp) && crossCountry && !privateEnterprisePermittedInCountry(world, destination.countryId)) {
    return { ok: false, error: "Private corporations cannot relocate into a command economy" };
  }
  const lastRelocatedTurn = world.player.lastRelocatedTurn;
  if (lastRelocatedTurn !== undefined && world.meta.turn < lastRelocatedTurn + SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS) {
    return { ok: false, error: `Relocation cooldown active for ${lastRelocatedTurn + SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS - world.meta.turn} more turns` };
  }

  const conversion = quoteCorporationCurrencyConversion(world, corp, corp.countryId, destination.countryId);
  if ("error" in conversion) return { ok: false, error: conversion.error };
  const marketCapAnchor = localToAnchor(corp.sharePrice * corp.totalShares, conversion.fromRate);
  const costAnchor = Math.round(marketCapAnchor * SOURCE_CORPORATION_RELOCATION_COST_FRACTION * (crossCountry ? SOURCE_CROSS_COUNTRY_RELOCATION_MULTIPLIER : 1));
  const fxSpreadAnchor = conversion.changesCurrency ? costAnchor * SOURCE_CORPORATE_RELOCATION_FX_SPREAD : 0;
  const spreadRoute = fxSpreadAnchor > 0
    ? resolveSectorSpreadRoute(world, conversion.fromCurrency, conversion.toCurrency, Math.round(anchorToLocal(fxSpreadAnchor, conversion.fromRate)))
    : undefined;
  if (fxSpreadAnchor > 0 && !spreadRoute) return { ok: false, error: "Cross-currency relocation requires source central-bank FX anchors" };
  const postConversionCapital = conversion.changesCurrency ? Math.round(corp.liquidCapital * conversion.scale * 100) / 100 : corp.liquidCapital;
  const cost = Math.round(anchorToLocal(costAnchor + fxSpreadAnchor, conversion.toRate));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, error: "Cannot relocate: market capitalization is too low" };
  if (!Number.isFinite(postConversionCapital) || postConversionCapital < cost) return { ok: false, error: "Insufficient corporate cash for relocation" };

  // Validate the completed save shape before committing either side.
  const turn = world.meta.turn;
  if (!Number.isSafeInteger(turn) || turn < 0) return { ok: false, error: "Invalid current turn" };
  const oldRegionId = currentRegion.id;
  const oldCountryId = currentRegion.countryId;
  applyCorporationCurrencyConversion(world, corp, conversion);
  corp.liquidCapital -= cost;
  corp.headquartersRegionId = destination.id;
  corp.countryId = destination.countryId;
  world.player.homeRegionId = destination.id;
  world.player.lastRelocatedTurn = turn;
  if (world.player.currentOffice && (crossCountry || (world.player.currentOffice.regionId && world.player.currentOffice.regionId !== destination.id))) {
    world.player.currentOffice = null;
  }
  if (world.player.legislativeSeat && (crossCountry || (world.player.legislativeSeat.regionId && world.player.legislativeSeat.regionId !== destination.id))) {
    world.player.legislativeSeat = null;
  }
  if (world.player.constituency && world.player.constituency.regionId !== destination.id) delete world.player.constituency;
  for (const org of Object.values(world.partyRegions)) {
    if (org.regionId !== oldRegionId) continue;
    for (const role of ["chairId", "viceChairId", "treasurerId"] as const) {
      if (org[role] === "player") org[role] = null;
    }
  }
  world.player.politicalInfluence = 0;
  world.player.donorBaseLevel = 0;
  for (const election of world.elections) {
    if (election.status === "resolved") continue;
    const candidate = election.candidates.find((entry) => entry.id === "player");
    if (candidate && candidate.status !== "withdrawn") {
      candidate.status = "withdrawn";
      delete election.tally[candidate.id];
      // Match the public candidacy withdrawal path: a departed candidate is
      // retained as a withdrawn historical row, but no longer contributes
      // stale votes or an active campaign to the race.
      if (election.stateTallyStates) {
        for (const state of Object.values(election.stateTallyStates) as Array<{ totalVotes?: Record<string, number> }>) {
          if (state?.totalVotes) delete state.totalVotes[candidate.id];
        }
      }
      archiveCampaign(world, election.id, candidate.id);
    }
  }
  if (crossCountry) {
    for (const campaign of Object.values(world.campaigns)) {
      if (campaign.managerId !== "player") continue;
      delete campaign.managerId;
      delete campaign.managerName;
    }
    if (world.player.partyId) leaveParty(world);
    world.player.countryId = destination.countryId;
    world.player.nationalInfluence = 0;
    world.player.partyInfluence = 0;
    world.cabinetMembers = world.cabinetMembers.filter((member) => !(member.countryId === oldCountryId && member.characterId === "player"));
    const executive = world.executives[oldCountryId];
    if (executive?.presidentId === "player") {
      executive.presidentId = null;
      executive.presidentParty = null;
      executive.termStartTurn = null;
    }
    if (executive?.vicePresidentId === "player") {
      executive.vicePresidentId = null;
      executive.vicePresidentParty = null;
    }
    const oldBank = world.centralBanks[oldCountryId];
    if (oldBank?.fomcBoard) {
      for (const seat of oldBank.fomcBoard) {
        if (seat.characterId !== "player") continue;
        seat.occupantType = "vacant";
        seat.characterId = null;
        seat.characterName = null;
        seat.nppId = null;
        seat.appointedByPresidentId = null;
        seat.appointedAtTurn = null;
        seat.termExpiresAtTurn = null;
      }
      if (oldBank.fomcBoard.some((seat) => seat.isChair && seat.occupantType === "vacant")) {
        oldBank.chairMode = "npp";
        oldBank.chairAppointedBy = null;
        oldBank.chairTermExpiresAtTurn = null;
      }
    }
  }
  if (spreadRoute) {
    const sourceBank = world.centralBanks[spreadRoute.sourceCountryId]!;
    const destinationBank = world.centralBanks[spreadRoute.destinationCountryId]!;
    sourceBank.forexRevenue = (sourceBank.forexRevenue ?? 0) + spreadRoute.forexRevenue;
    destinationBank.spreadFeeReserveBalances ??= {};
    destinationBank.spreadFeeReserveBalances[conversion.fromCurrency] =
      (destinationBank.spreadFeeReserveBalances[conversion.fromCurrency] ?? 0) + spreadRoute.reserveAmount;
  }
  return { ok: true, cost, crossCountry };
}
