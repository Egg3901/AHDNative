import type { WorldState } from "../types.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { resolveCountryCurrency } from "../bonds/denomination.js";
import { anchorToLocal, getRateForCountry, localToAnchor } from "../forex/conversion.js";

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
  if (corp.isPrivate !== true && !passedVoteMatches) {
    return { ok: false, error: "Public corporations require a passed shareholder relocation vote for this destination" };
  }
  if (!changed && !passedVoteMatches) return { ok: false, error: "Corporation is already headquartered in this region" };
  if (!isCorpStateOwned(corp) && crossCountry && !privateEnterprisePermittedInCountry(world, destination.countryId)) {
    return { ok: false, error: "Private corporations cannot relocate into a command economy" };
  }
  // A foreign currency move has to convert the issuer's full portfolio and
  // route the source FX spread. Keep it refused until that transaction exists.
  if (crossCountry && resolveCountryCurrency(world, sourceCountryId) !== resolveCountryCurrency(world, destination.countryId)) {
    return { ok: false, error: "Cross-country relocation requires the source treasury and asset currency-conversion transaction" };
  }
  const corpFxRate = getRateForCountry(world, sourceCountryId);
  const marketCapAnchor = localToAnchor(corp.sharePrice * corp.totalShares, corpFxRate);
  const costAnchor = Math.round(marketCapAnchor * SOURCE_CORPORATE_RELOCATION_COST_FRACTION * (crossCountry ? SOURCE_CROSS_COUNTRY_RELOCATION_MULTIPLIER : 1));
  const cost = Math.round(anchorToLocal(costAnchor, corpFxRate));
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, error: "Cannot relocate: market capitalization is too low" };
  if (!Number.isFinite(corp.liquidCapital) || corp.liquidCapital < cost) return { ok: false, error: "Insufficient corporate cash for relocation" };

  const ceoVacated = world.player.homeRegionId !== destination.id;
  corp.liquidCapital -= cost;
  corp.headquartersRegionId = destination.id;
  corp.countryId = destination.countryId;
  if (ceoVacated) {
    corp.ceoVacant = true;
    corp.ceoVacantSinceTurn = world.meta.turn;
    delete corp.pendingCeoId;
    corp.ceoVotes = [];
  }
  return { ok: true, cost, ceoVacated };
}
