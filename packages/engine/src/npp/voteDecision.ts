import type { Politician, WorldState } from "../types.js";
import { effectiveNppAutonomyLevelForCountry, nppAutonomyLevelAtLeast } from "../nppAutonomyLevel.js";
import { getLaw } from "../legislation/catalog.js";
import type { Bill } from "../legislation/types.js";
import { COUNTRY_CONFIGS } from "../electionEngine/countryElectionConstants.js";
import { computeCrossPressureForces, type CrossPressurePartyWhip } from "./crossPressure.js";

type PartyWhip = NonNullable<WorldState["partyWhips"]>[number];

function currentPartyWhip(world: WorldState, voter: Politician, bill: Bill): PartyWhip | undefined {
  const matchingWhips = (world.partyWhips ?? [])
    .filter((whip) => whip.billId === bill.id
      && whip.partyId === voter.partyId
      && whip.countryId === bill.countryId
      && whip.chamber === bill.currentChamber
      && whip.issuedAtTurn <= world.meta.turn)
    .sort((a, b) => b.issuedAtTurn - a.issuedAtTurn || b.id.localeCompare(a.id));

  // Game resolves a home-state party whip before the national party whip.
  // When no state whip is recorded, national instructions are suppressed if
  // that home-state party has a chair or vice-chair. Native seeds `homeState`
  // from Game's authored region/party seat rows; it is independent from the
  // current elected seat so later movement and unseating do not rewrite home.
  const homeRegionId = voter.homeState;
  const homeRegion = homeRegionId ? world.regions[homeRegionId] : undefined;
  if (homeRegionId && homeRegion?.countryId === bill.countryId) {
    const homeStateWhip = matchingWhips.find((whip) => whip.stateId === homeRegionId);
    if (homeStateWhip) return homeStateWhip;
    const stateParty = world.partyRegions[`${homeRegionId}:${voter.partyId}`];
    if (stateParty?.chairId || stateParty?.viceChairId) return undefined;
  }
  return matchingWhips.find((whip) => whip.stateId === undefined);
}

function currentOpposition(
  world: WorldState,
  countryId: string,
): { governingPartyId: string; oppositionPartyId: string; coordination: number } | null {
  const government = world.governments[countryId];
  if (government?.status !== "formed" || !government.governingPartyId || !government.chamberKey) return null;
  // Game tallies the formed government's lower chamber once per country,
  // even when the live bill is being voted in another chamber.
  const governmentChamberKey = government.chamberKey;
  const seatsByParty: Record<string, number> = {};
  for (const politician of world.politicians) {
    if (politician.countryId !== countryId || politician.chamberKey !== governmentChamberKey || politician.retiredAt != null) continue;
    seatsByParty[politician.partyId] = (seatsByParty[politician.partyId] ?? 0) + 1;
  }
  const playerSeat = world.player.legislativeSeat;
  if (playerSeat?.countryId === countryId && playerSeat.chamberKey === governmentChamberKey && world.player.partyId) {
    seatsByParty[world.player.partyId] = (seatsByParty[world.player.partyId] ?? 0) + 1;
  }
  let oppositionPartyId: string | null = null;
  let oppositionSeats = 0;
  for (const [partyId, seats] of Object.entries(seatsByParty)) {
    if (partyId === government.governingPartyId || seats <= 0) continue;
    if (seats > oppositionSeats || (seats === oppositionSeats && oppositionPartyId !== null && partyId < oppositionPartyId)) {
      oppositionPartyId = partyId;
      oppositionSeats = seats;
    }
  }
  if (!oppositionPartyId) return null;
  // Source: Game singleplayerDifficulty/rules/behavior.ts. Hosted/legacy
  // worlds default to normal; Native persists this same three-value axis.
  const coordination = world.difficulty === "easy" ? 0.6 : world.difficulty === "hard" ? 1.35 : 1;
  return { governingPartyId: government.governingPartyId, oppositionPartyId, coordination };
}

/** Resolve one ordinary federal NPP ballot from the source cross-pressure inputs. */
export function resolveNppBillVote(
  world: WorldState,
  bill: Bill,
  voter: Politician,
  whipOverride?: CrossPressurePartyWhip,
): "for" | "against" | "abstain" {
  const recordedWhip = whipOverride ?? currentPartyWhip(world, voter, bill);
  // Native's explicit abstain whip is a public extension; Game party whips only
  // express for/against, so keep the existing instruction's direct semantics.
  if (recordedWhip?.direction === "abstain") return "abstain";

  const partyWhip: CrossPressurePartyWhip | null = recordedWhip
    ? { direction: recordedWhip.direction, mode: recordedWhip.mode }
    : null;
  const level = effectiveNppAutonomyLevelForCountry(world.nppAutonomyLevel, bill.countryId, world.player.countryId);
  const opposition = nppAutonomyLevelAtLeast(level, "v1")
    ? currentOpposition(world, bill.countryId)
    : null;
  // Native does not persist Game NPP.homeState or national-address agenda
  // identity. Selected DE/CN tax options have no source group approval tables,
  // so passing null demographics yields the source-exact zero district force.
  const result = computeCrossPressureForces(
    voter,
    bill,
    bill.legislationTypeId ? getLaw(bill.legislationTypeId) ?? {} : {},
    {
      homeStateDemographics: null,
      partyWhip,
      opposition: partyWhip ? null : opposition,
      nationalAgendaActive: false,
    },
  );
  if (bill.status === "veto_override" && result.verdict === "abstain") return "against";
  return result.verdict;
}

/** Source federal voting stays live independently of autonomous NPP actions. */
export function isFederalBillVoteWindowOpen(world: WorldState, bill: Bill): boolean {
  const deadline = bill.status === "active_other"
    ? bill.otherChamberVotingEndsOnTurn
    : bill.status === "veto_override"
      ? bill.overrideVotingEndsOnTurn ?? bill.votingEndsOnTurn
      : bill.votingEndsOnTurn;
  return deadline === undefined || deadline > world.meta.turn;
}

/** Mirror Game's active-NPP query and one-party banned-party guard. */
export function isEligibleNppBillVoter(world: WorldState, bill: Bill, voter: Politician): boolean {
  if (voter.retiredAt != null) return false;
  if (COUNTRY_CONFIGS[bill.countryId]?.governmentType === "onePartyState"
    && world.parties[voter.partyId]?.regimeStatus === "banned") return false;
  return true;
}
