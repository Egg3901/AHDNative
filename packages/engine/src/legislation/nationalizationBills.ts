import type { WorldState } from "../types.js";
import type { Bill } from "./types.js";
import { applyBillEffects } from "./billLifecycle.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { BILL_PROPOSE_ACTION_COST, FIRST_PROVISION_NPI_COST } from "./proposalCosts.js";

/** Game's national state-ownership proposal command, through the existing action. */
export function proposeNationalizationBill(world: WorldState, params: {
  corporationId?: string;
  sponsorCountryId?: string;
  originChamber?: string;
  billTitle?: string;
}) {
  const countryId = world.player.countryId;
  if (params.sponsorCountryId && params.sponsorCountryId !== countryId) return { ok: false as const, error: "Cannot sponsor a bill outside the player's country." };
  const donor = params.corporationId ? world.corporations[params.corporationId] : undefined;
  if (!donor || donor.countryId !== countryId || isCorpStateOwned(donor)) return { ok: false as const, error: "Choose a private corporation headquartered in the bill's country." };
  const legislature = world.legislatures[countryId];
  const sovereign = world.player.mode === "hos" && world.player.permanentHeadOfState === true;
  const seat = world.player.legislativeSeat;
  if (!sovereign && (!seat || seat.countryId !== countryId || !legislature?.chambers.some(chamber => chamber.elected && chamber.key === seat.chamberKey))) {
    return { ok: false as const, error: "Must hold a legislative seat in the player's country to sponsor a state-ownership bill." };
  }
  if (!sovereign && params.originChamber && params.originChamber !== seat!.chamberKey) return { ok: false as const, error: "The bill must originate in the player's seated chamber." };
  const originChamber = sovereign
    ? params.originChamber ?? legislature?.chambers.find(chamber => chamber.elected)?.key
    : seat!.chamberKey;
  if (!originChamber || !legislature?.chambers.some(chamber => chamber.elected && chamber.key === originChamber)) return { ok: false as const, error: "Choose an elected origin chamber." };
  const bicameral = legislature.chambers.filter(chamber => chamber.elected).length > 1;
  if (world.bills.some(bill => bill.countryId === countryId && bill.sponsorId === "player" &&
    !["signed", "failed", "withdrawn", "override_failed", ...(bicameral ? ["active_other"] : [])].includes(bill.status))) {
    return { ok: false as const, error: "You already have a bill in progress in its first chamber." };
  }
  const npi = world.player.nationalInfluence ?? 0;
  if (npi < FIRST_PROVISION_NPI_COST) return { ok: false as const, error: "A state-ownership provision costs 5 national political influence." };
  if (world.player.actions < BILL_PROPOSE_ACTION_COST) return { ok: false as const, error: "Proposing a bill costs 10 action points." };
  const id = `bill-${world.meta.turn}-${world.bills.length + 1}-state-ownership`;
  const bill: Bill = {
    id, countryId, title: params.billTitle?.trim() || `Nationalize ${donor.name ?? donor.id}`,
    summary: "Acquire the corporation at fair compensation by legislative authority.",
    category: "state ownership", legislationTypeId: "state_ownership.nationalize",
    provisions: [{ type: "nationalize", legislationTypeId: "state_ownership.nationalize", effectDirection: 0, targetCorporationId: donor.id }],
    originChamber, currentChamber: originChamber, status: sovereign ? "signed" : "active",
    sponsorId: "player", sponsorName: world.player.name, sponsorPartyId: world.player.partyId,
    votes: {}, votesFor: 0, votesAgainst: 0, votesAbstain: 0,
    proposedAtTurn: world.meta.turn,
    ...(sovereign ? { enactedAtTurn: world.meta.turn } : { votingEndsOnTurn: world.meta.turn + 24 }),
    proposalActionCost: BILL_PROPOSE_ACTION_COST, proposalNpiCost: FIRST_PROVISION_NPI_COST,
    filibusterInvocations: [], updatedAtTurn: world.meta.turn,
  };
  world.player.actions -= BILL_PROPOSE_ACTION_COST;
  world.player.nationalInfluence = npi - FIRST_PROVISION_NPI_COST;
  world.bills.push(bill);
  if (sovereign) applyBillEffects(world, bill);
  return { ok: true as const, message: `${sovereign ? "Enacted" : "Sponsored"} state-ownership bill ${id}.` };
}
