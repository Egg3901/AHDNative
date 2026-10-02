/**
 * Source-shaped Northern Ireland living-conflict continuation. This is kept
 * separate from the military conflict ledger and the constitutional border
 * referendum. Decision defaults and track thresholds mirror AHDGame's
 * northernIreland.ts authored nodes and transitions.
 */
import type { WorldState } from "../types.js";
import { applyUKDevolutionPolicy, type NorthernIrelandPosture } from "../devolution/ukInstitutions.js";
import { referendumYesShare, buildReferendumCohorts } from "../referendum/cohort.js";
import { cohortAffinitiesFor, getReferendumCohortProfile } from "../referendum/cohortProfiles.js";
import { resolveReferendumVote, CAMPAIGN_WINDOW_TURNS } from "../referendum/lifecycle.js";
import { seededVariance } from "../referendum/seededVariance.js";
import type { ReferendumRecord } from "../referendum/types.js";
import type { ReferendumCohort } from "../referendum/cohort.js";

export type NorthernIrelandPhase = "armed_stalemate" | "backchannels" | "ceasefire" | "multiparty_talks" | "agreement" | "power_sharing" | "fragile_settlement";
export type NorthernIrelandTrack = "violence" | "settlementMomentum" | "legitimacy" | "unionistConsent" | "nationalistConsent" | "decommissioning" | "institutionalStability" | "domesticConsent" | "referendumRatification" | "ratificationAuthorization" | "ratificationFailureCount";
export type NorthernIrelandTracks = Record<NorthernIrelandTrack, number>;
export type NorthernIrelandInteraction = "peace_initiative" | "agreement_implementation";

export interface NorthernIrelandDecision {
  nodeId: string;
  openedTurn: number;
  deadlineTurn: number;
  interaction: NorthernIrelandInteraction;
  /** One authored choice per required source role; the first authored option is the source expiry fallback. */
  nodeIndex: number;
}

export interface NorthernIrelandPeacePoll {
  id: string;
  kind: "peace_agreement";
  status: "campaigning" | "completed";
  agreementKey: string;
  openedTurn: number;
  closesTurn: number;
  yesShare: number;
  campaignBaseYesShare: number;
  campaignSpendUnits: { yes: number; no: number };
  cohortBaseline: ReferendumCohort[];
  finalYesShare?: number;
  passed?: boolean;
  resolvedTurn?: number;
}

export interface NorthernIrelandLivingConflict {
  _id: "northern_ireland";
  hasOpened: true;
  status: "active" | "negotiating" | "ceasefire" | "settled" | "closed";
  phase: NorthernIrelandPhase;
  phaseLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  phaseTurns: number;
  totalTurns: number;
  lastProcessedTurn: number;
  lastInteractionTurn: number;
  tracks: NorthernIrelandTracks;
  decision?: NorthernIrelandDecision;
  peacePoll?: NorthernIrelandPeacePoll;
  lastRejectedPollTurn?: number;
}

const PHASES: readonly NorthernIrelandPhase[] = ["armed_stalemate", "backchannels", "ceasefire", "multiparty_talks", "agreement", "power_sharing", "fragile_settlement"];
const START_TRACKS: NorthernIrelandTracks = {
  violence: 70, settlementMomentum: 18, legitimacy: 35, unionistConsent: 28,
  nationalistConsent: 28, decommissioning: 5, institutionalStability: 10,
  domesticConsent: 30, referendumRatification: 0, ratificationAuthorization: 0,
  ratificationFailureCount: 0,
};

type Option = { id: string; deltas: Partial<NorthernIrelandTracks> };
type Node = { nodeId: string; countryId: "UK" | "IE"; role: "government" | "unionist" | "nationalist" | "governor"; options: readonly [Option, Option] };
const node = (nodeId: string, countryId: "UK" | "IE", role: Node["role"], first: string, firstDeltas: Partial<NorthernIrelandTracks>, second: string, secondDeltas: Partial<NorthernIrelandTracks>): Node => ({ nodeId, countryId, role, options: [{ id: first, deltas: firstDeltas }, { id: second, deltas: secondDeltas }] });

const INITIATIVE: readonly Node[] = [
  node("uk_position", "UK", "government", "uk_security_first", { violence: 7, settlementMomentum: -5, legitimacy: -3 }, "uk_backchannel", { violence: -4, settlementMomentum: 12, legitimacy: 6, domesticConsent: 3 }),
  node("irish_position", "IE", "government", "ie_distance", { settlementMomentum: -6, legitimacy: -4, nationalistConsent: -3 }, "ie_coordinate", { settlementMomentum: 10, legitimacy: 7, nationalistConsent: 5 }),
  node("unionist_position", "UK", "unionist", "unionist_withhold", { unionistConsent: -6, settlementMomentum: -4, violence: 3 }, "unionist_join", { unionistConsent: 12, settlementMomentum: 8, legitimacy: 4, institutionalStability: 6 }),
  node("nationalist_position", "UK", "nationalist", "nationalist_withhold", { nationalistConsent: -6, settlementMomentum: -4, violence: 4 }, "nationalist_join", { nationalistConsent: 12, settlementMomentum: 8, violence: -5, legitimacy: 4, decommissioning: 12 }),
  node("regional_executive_position", "UK", "governor", "executive_unavailable", { institutionalStability: -2 }, "executive_implement", { institutionalStability: 14, domesticConsent: 6, legitimacy: 4 }),
];
const IMPLEMENTATION: readonly Node[] = [
  node("unionist_implementation", "UK", "unionist", "unionist_withhold_implementation", { institutionalStability: -4, settlementMomentum: -2 }, "unionist_implement_agreement", { institutionalStability: 12, settlementMomentum: 2 }),
  node("nationalist_implementation", "UK", "nationalist", "nationalist_withhold_implementation", { institutionalStability: -4, settlementMomentum: -2, violence: 2 }, "nationalist_implement_agreement", { institutionalStability: 12, decommissioning: 12, settlementMomentum: 2, violence: -2 }),
];

export function initialNorthernIrelandLivingConflict(startingYear: number): NorthernIrelandLivingConflict | undefined {
  if (startingYear < 1991) return undefined;
  // AHDGame auto-opens its 1991-onward definition at phase 1 when a fresh
  // world first reaches the ordinary living-conflict turn driver. Only the
  // explicit 2027 continuation snapshot is pre-seeded as settled.
  return { _id: "northern_ireland", hasOpened: true, status: "active", phase: "armed_stalemate", phaseLevel: 1, phaseTurns: 0, totalTurns: 0, lastProcessedTurn: -1, lastInteractionTurn: -24, tracks: { ...START_TRACKS } };
}

function clampTrack(value: number): number { return Math.max(0, Math.min(100, value)); }
function applyDeltas(state: NorthernIrelandLivingConflict, deltas: Partial<NorthernIrelandTracks>): void {
  for (const [key, amount] of Object.entries(deltas) as [NorthernIrelandTrack, number][]) {
    const max = key === "referendumRatification" ? 1 : key === "ratificationAuthorization" ? 2 : key === "ratificationFailureCount" ? 2 : 100;
    state.tracks[key] = Math.max(0, Math.min(max, state.tracks[key] + amount));
  }
}

function applyAuthoredPosition(world: WorldState, state: NorthernIrelandLivingConflict, deltas: Partial<NorthernIrelandTracks>): void {
  applyDeltas(state, deltas);
  const region = world.regions.NIR;
  if (!region) return;
  const constructive = (deltas.settlementMomentum ?? 0) > 0;
  region.independenceDesire = clampTrack((region.independenceDesire ?? 50) + (constructive ? -1 : 2));
  const localAutonomy = world.regionalMetrics.NIR?.["governance.localAutonomy"];
  if (localAutonomy) localAutonomy.value = clampTrack(localAutonomy.value + (constructive ? 2 : -2));
}

function nextPhase(state: NorthernIrelandLivingConflict): NorthernIrelandPhase | null {
  const t = state.tracks;
  if (state.phase === "armed_stalemate" && t.settlementMomentum >= 35 && t.legitimacy >= 40) return "backchannels";
  if (state.phase === "backchannels" && t.violence <= 55 && t.unionistConsent >= 35 && t.nationalistConsent >= 35) return "ceasefire";
  if (state.phase === "ceasefire" && t.settlementMomentum >= 55 && t.legitimacy >= 50) return "multiparty_talks";
  if (state.phase === "multiparty_talks" && t.settlementMomentum >= 78 && t.unionistConsent >= 60 && t.nationalistConsent >= 60 && t.domesticConsent >= 55) return "agreement";
  if (state.phase === "agreement" && t.ratificationAuthorization >= 2 && t.referendumRatification >= 1 && t.decommissioning >= 45 && t.institutionalStability >= 45) return "power_sharing";
  if (state.phase === "power_sharing" && t.ratificationAuthorization < 2) return "multiparty_talks";
  if (state.phase === "power_sharing" && t.referendumRatification < 1) return "agreement";
  if (state.phase === "power_sharing" && (t.violence >= 82 || t.institutionalStability <= 25)) return "fragile_settlement";
  if (state.phase === "fragile_settlement" && t.violence >= 90) return "armed_stalemate";
  if (state.phase === "fragile_settlement" && t.ratificationAuthorization >= 2 && t.referendumRatification >= 1 && t.violence <= 55 && t.institutionalStability >= 50 && t.domesticConsent >= 55) return "power_sharing";
  if (["multiparty_talks", "ceasefire"].includes(state.phase) && t.violence >= 82) return "armed_stalemate";
  return null;
}

function reconcilePosture(world: WorldState, turn: number): void {
  const state = world.northernIrelandConflict;
  const uk = world.ukDevolution;
  if (!state || !uk) return;
  const posture: NorthernIrelandPosture = state.phase === "power_sharing" && state.status === "settled" && state.tracks.ratificationAuthorization >= 2 && state.tracks.referendumRatification >= 1 ? "power_sharing" : state.phase === "fragile_settlement" ? "suspended" : "unsettled";
  const startingYear = Number(world.meta.date.slice(0, 4));
  // Source migration rule: modern pack institutions predate a fresh living
  // conflict record; opening the phase-1 conflict cannot abolish them.
  if (!uk.northernIrelandPeace && startingYear >= 1999 && posture === "unsettled") return;
  if (uk.northernIrelandPeace?.posture === posture) return;
  const prior = uk.regions.NIR;
  const firstCycle = world.elections
    .filter((e) => e.countryId === "UK" && e.state === "NIR" && e.electionType === "governor")
    .reduce((max, election) => Math.max(max, election.cycle), 0) + 1;
  const region = posture === "power_sharing" && !prior.active
    ? { active: true, firstCycle, firstElectionEndTurn: turn + 72 }
    : { ...prior, active: posture === "power_sharing" };
  const next = {
    ...uk,
    regions: { ...uk.regions, NIR: region },
    northernIrelandPeace: {
      posture,
      changedTurn: turn,
      ...(posture === "power_sharing" && !prior.active
        ? {
            assemblyFirstCycle: world.elections
              .filter((e) => e.countryId === "UK" && e.state === "NIR" && e.electionType === "regionalCouncil")
              .reduce((max, election) => Math.max(max, election.cycle), 0) + 1,
            assemblyFirstElectionEndTurn: turn + 72,
          }
        : {}),
    },
  };
  world.ukDevolution = next;
}

export function advanceNorthernIrelandLivingConflict(world: WorldState): void {
  const state = world.northernIrelandConflict;
  if (!state || state.status === "closed" || state.lastProcessedTurn === world.meta.turn) return;
  state.lastProcessedTurn = world.meta.turn; state.totalTurns += 1; state.phaseTurns += 1;
  if (state.totalTurns % 6 === 0 && state.phase === "power_sharing") applyDeltas(state, { violence: -3, decommissioning: 1 });
  const currentYear = Number(world.meta.date.slice(0, 4));
  if (state.totalTurns % 12 === 0 && currentYear >= 1991 && currentYear <= 2005) applyDeltas(state, { settlementMomentum: 2, legitimacy: 1 });
  if (state.totalTurns % 18 === 0 && ["backchannels", "ceasefire", "multiparty_talks", "power_sharing"].includes(state.phase)) applyDeltas(state, { violence: 3, domesticConsent: -1 });
  if (state.decision && world.meta.turn >= state.decision.deadlineTurn) {
    const nodes = state.decision.interaction === "peace_initiative" ? INITIATIVE : IMPLEMENTATION;
    // The source interaction window is eight turns. On expiry the driver
    // resolves every remaining node using its authored first-option fallback.
    for (let i = state.decision.nodeIndex; i < nodes.length; i++) {
      applyAuthoredPosition(world, state, nodes[i]!.options[0].deltas);
    }
    delete state.decision;
  }
  if (state.phase === "agreement") {
    const cutoff = state.lastRejectedPollTurn ?? -1;
    const signed = world.bills.filter((bill) => bill.category === "northern_ireland_peace" && bill.status === "signed" && bill.enactedLevel === 1 && bill.proposedAtTurn > cutoff);
    if (signed.some((bill) => bill.countryId === "UK") && signed.some((bill) => bill.countryId === "IE")) {
      state.tracks.ratificationAuthorization = 2;
      openNorthernIrelandPeacePoll(world);
    }
    resolveNorthernIrelandPeacePoll(world);
  }
  if (!state.decision && world.meta.turn - state.lastInteractionTurn >= 24) {
    const interaction: NorthernIrelandInteraction | null = state.phase === "agreement" && state.tracks.referendumRatification >= 1 ? "agreement_implementation" : state.phase === "agreement" ? null : ["power_sharing", "fragile_settlement"].includes(state.phase) ? "agreement_implementation" : "peace_initiative";
    if (interaction) {
      const nodes = interaction === "peace_initiative" ? INITIATIVE : IMPLEMENTATION;
      state.decision = { interaction, nodeId: nodes[0]!.nodeId, nodeIndex: 0, openedTurn: world.meta.turn, deadlineTurn: world.meta.turn + 8 };
      state.lastInteractionTurn = world.meta.turn;
    }
  }
  const phase = nextPhase(state);
  if (phase) {
    state.phase = phase; state.phaseLevel = PHASES.indexOf(phase) + 1 as NorthernIrelandLivingConflict["phaseLevel"]; state.phaseTurns = 0;
    state.status = phase === "power_sharing" ? "settled" : phase === "ceasefire" ? "ceasefire" : phase === "armed_stalemate" ? "active" : "negotiating";
    if (phase === "agreement") state.tracks.ratificationAuthorization = 0;
    if (["armed_stalemate", "backchannels", "ceasefire", "multiparty_talks", "power_sharing", "fragile_settlement"].includes(phase)) {
      const interaction: NorthernIrelandInteraction = phase === "power_sharing" || phase === "fragile_settlement" ? "agreement_implementation" : "peace_initiative";
      const nodes = interaction === "peace_initiative" ? INITIATIVE : IMPLEMENTATION;
      state.decision = { interaction, nodeId: nodes[0]!.nodeId, nodeIndex: 0, openedTurn: world.meta.turn, deadlineTurn: world.meta.turn + 8 };
      state.lastInteractionTurn = world.meta.turn;
    }
  }
  reconcilePosture(world, world.meta.turn);
}

export function chooseNorthernIrelandLivingConflictOption(world: WorldState, actorId: string, optionId: string): { ok: true } | { ok: false; error: string } {
  const state = world.northernIrelandConflict;
  if (!state?.decision) return { ok: false, error: "There is no open Northern Ireland conflict decision." };
  const nodes = state.decision.interaction === "peace_initiative" ? INITIATIVE : IMPLEMENTATION;
  const current = nodes[state.decision.nodeIndex];
  if (!current) return { ok: false, error: "The Northern Ireland decision is invalid." };
  const actor = actorId === "player" ? world.player : world.politicians.find((p) => p.id === actorId);
  if (!actor || actor.countryId !== current.countryId) return { ok: false, error: `This decision requires an authorized ${current.countryId} participant.` };
  const actorPartyId = "partyId" in actor ? actor.partyId : undefined;
  const party = typeof actorPartyId === "string" ? world.parties[actorPartyId] : undefined;
  const isPartyLeader = party?.chairId === actorId;
  const partyAbbreviation = party?.abbreviation;
  const authorized = current.role === "government" ? actorId === "player" && world.player.mode === "hos" : current.role === "governor" ? world.governors.NIR?.governorId === actorId : current.role === "unionist" ? isPartyLeader && (partyAbbreviation === "DUP" || partyAbbreviation === "UUP") : isPartyLeader && (partyAbbreviation === "SF" || partyAbbreviation === "SDLP");
  if (!authorized) return { ok: false, error: `This decision is reserved for the source ${current.role} role.` };
  const option = current.options.find((candidate) => candidate.id === optionId);
  if (!option) return { ok: false, error: "Unknown Northern Ireland decision option." };
  applyAuthoredPosition(world, state, option.deltas);
  const nextIndex = state.decision.nodeIndex + 1;
  if (nextIndex >= nodes.length) delete state.decision;
  else state.decision = { ...state.decision, nodeId: nodes[nextIndex]!.nodeId, nodeIndex: nextIndex };
  return { ok: true };
}

/** Distinct from the border/reunification referendum: no territorial actuation. */
export function openNorthernIrelandPeacePoll(world: WorldState): NorthernIrelandPeacePoll | null {
  const state = world.northernIrelandConflict;
  if (!state || state.phase !== "agreement" || state.tracks.ratificationAuthorization < 2 || world.northernIrelandPeacePoll?.status === "campaigning") return null;
  const bills = world.bills.filter((bill) => bill.category === "northern_ireland_peace" && bill.status === "signed");
  const uk = bills.find((bill) => bill.countryId === "UK" && (state.lastRejectedPollTurn === undefined || bill.proposedAtTurn > state.lastRejectedPollTurn));
  const ie = bills.find((bill) => bill.countryId === "IE" && (state.lastRejectedPollTurn === undefined || bill.proposedAtTurn > state.lastRejectedPollTurn));
  if (!uk || !ie) return null;
  const id = `${uk.id}:${ie.id}`;
  if (world.northernIrelandPeacePoll?.agreementKey === id) return null;
  const base = Math.min(state.tracks.unionistConsent, state.tracks.nationalistConsent, state.tracks.legitimacy);
  const profile = getReferendumCohortProfile(world.meta.era, "NIR");
  const cohortBaseline = profile ? buildReferendumCohorts(profile, base, cohortAffinitiesFor("NIR")) : [{ groupId: "_all", share: 1, turnout: 60, yesLean: base }];
  const poll: NorthernIrelandPeacePoll = { id, kind: "peace_agreement", status: "campaigning", agreementKey: id, openedTurn: world.meta.turn, closesTurn: world.meta.turn + CAMPAIGN_WINDOW_TURNS, yesShare: base, campaignBaseYesShare: base, campaignSpendUnits: { yes: 0, no: 0 }, cohortBaseline };
  world.northernIrelandPeacePoll = poll;
  return poll;
}

export function campaignNorthernIrelandPeacePoll(world: WorldState, side: "yes" | "no", units: number): { ok: true } | { ok: false; error: string } {
  const poll = world.northernIrelandPeacePoll;
  if (!poll || poll.status !== "campaigning") return { ok: false, error: "No Northern Ireland peace agreement poll is campaigning." };
  if (side !== "yes" && side !== "no") return { ok: false, error: "Peace agreement campaign side must be yes or no." };
  if (!Number.isInteger(units) || units < 1 || units > 100) return { ok: false, error: "Campaign units must be an integer from 1 to 100." };
  poll.campaignSpendUnits[side] += units;
  const ref = { id: poll.id, countryId: "UK", regionId: "NIR", kind: "independence" as const, status: "campaigning" as const, yesShare: poll.yesShare, requestedTurn: poll.openedTurn, grantedTurn: poll.openedTurn, campaignOpenTurn: poll.openedTurn, campaignCloseTurn: poll.closesTurn, campaignBaseYesShare: poll.campaignBaseYesShare, campaignSpendUnits: poll.campaignSpendUnits, cohortBaseline: poll.cohortBaseline } as ReferendumRecord;
  poll.yesShare = referendumYesShare(ref);
  return { ok: true };
}

export function resolveNorthernIrelandPeacePoll(world: WorldState): void {
  const poll = world.northernIrelandPeacePoll;
  const state = world.northernIrelandConflict;
  if (!poll || poll.status !== "campaigning" || world.meta.turn < poll.closesTurn || !state) return;
  const result = resolveReferendumVote({ yesShare: poll.yesShare, varianceRoll: seededVariance(poll.id, world.meta.turn) });
  poll.status = "completed"; poll.finalYesShare = result.finalYesShare; poll.passed = result.passed; poll.resolvedTurn = world.meta.turn;
  if (result.passed) state.tracks.referendumRatification = 1;
  else {
    state.tracks.referendumRatification = 0; state.tracks.ratificationAuthorization = 0; state.tracks.ratificationFailureCount = Math.min(2, state.tracks.ratificationFailureCount + 1); state.lastRejectedPollTurn = world.meta.turn; state.phase = "multiparty_talks"; state.phaseLevel = 4; state.status = "negotiating"; state.phaseTurns = 0; state.lastInteractionTurn = world.meta.turn;
  }
}
