import type { TurnPhase } from "./types.js";
import type { WorldRng } from "../rng.js";
import type { WorldState } from "../types.js";
import { processBillLifecycle, processStateBillTimers } from "../legislation/billLifecycle.js";
import { ideologyVote } from "../legislation/billVoteLogic.js";
import { isEligibleNppBillVoter, isFederalBillVoteWindowOpen, resolveNppBillVote } from "../npp/voteDecision.js";

/**
 * NPC auto-voting pass before lifecycle closes: every politician with a seat
 * in the voting chamber who hasn't yet voted uses the same source cross-pressure
 * resolver as nppBehavior. State bills keep the legacy voter until their source
 * state-legislature model is ported.
 *
 * Runs inside the same phase before lifecycle resolution so bills that opened
 * this turn also get immediate NPC votes.
 */
function autoVote(world: WorldState, rng: WorldRng): void {
  const endorsedPartyIdsByCountry = new Map<string, Set<string>>();
  // Build endorsed party set per country from world.endorsements (active only)
  for (const e of world.endorsements) {
    if (!e.active) continue;
    if (e.endorsedType !== "party") continue;
    const set = endorsedPartyIdsByCountry.get(e.countryId) ?? new Set<string>();
    set.add(e.endorsedId);
    endorsedPartyIdsByCountry.set(e.countryId, set);
  }

  for (const bill of world.bills) {
    if (bill.status !== "active" && bill.status !== "active_other" && bill.status !== "veto_override") continue;
    if (!isFederalBillVoteWindowOpen(world, bill)) continue;
    const chamberKey = bill.currentChamber;
    const targetVotesField = bill.status === "active_other" ? "otherChamberVotes" : bill.status === "veto_override" ? "vetoOverrideVotes" : "votes";
    const voteMap = (bill as unknown as Record<string, Record<string, string>>)[targetVotesField] ?? {};
    // Ensure map exists
    if (!(targetVotesField in bill)) (bill as unknown as Record<string, unknown>)[targetVotesField] = voteMap;

    for (const pol of world.politicians) {
      if (pol.countryId !== bill.countryId) continue;
      if (pol.chamberKey !== chamberKey) continue;
      if (!isEligibleNppBillVoter(world, bill, pol)) continue;
      const key = pol.id;
      if (key in voteMap) continue;
      // Skip if already voted in this phase (player vote may have used same id prefix)
      // Federal bills use the same source cross-pressure resolver in the
      // lifecycle catch-up pass as in nppBehavior. This path catches bills
      // which became active after that phase ran; retaining ideologyVote here
      // would silently restore chance-based voting for their first ballot.
      const finalVote = resolveNppBillVote(world, bill, pol);
      voteMap[key] = finalVote;
    }
    // Write back
    (bill as unknown as Record<string, unknown>)[targetVotesField] = voteMap;
  }

  // Also auto-vote stateBills similarly (same chamber key via bill.currentChamber or region)
  for (const bill of world.stateBills) {
    if (bill.status !== "active") continue;
    const chamberKey = bill.currentChamber;
    const voteMap = bill.votes ?? {};
    if (!bill.votes) bill.votes = voteMap;
    for (const pol of world.politicians) {
      if (pol.countryId !== bill.countryId) continue;
      if (pol.chamberKey !== chamberKey) continue;
      const key = pol.id;
      if (key in voteMap) continue;
      const vote = ideologyVote(pol, bill, {
        sponsorPartyId: bill.sponsorPartyId,
        endorsedPartyIds: endorsedPartyIdsByCountry.get(pol.countryId),
        rng,
      });
      voteMap[key] = vote;
    }
    bill.votes = voteMap;
  }
}

export const billLifecyclePhase: TurnPhase = {
  name: "billLifecycle",
  run(world: WorldState, rng: WorldRng): void {
    autoVote(world, rng);
    processBillLifecycle(world, rng);
    processStateBillTimers(world);
    // Handle repeal/expiry: bills with expiresAtTurn that reached turn expire
    for (const law of world.enactedLaws) {
      if (law.expiresAtTurn !== null && law.expiresAtTurn !== undefined && law.expiresAtTurn <= world.meta.turn && law.repealedAtTurn === undefined) {
        law.repealedAtTurn = world.meta.turn;
        world.news.push({ turn: world.meta.turn, date: world.meta.date, headline: `Law expired: ${law.id}` });
      }
    }
  },
};
