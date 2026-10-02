import type { PartyMergerProposal, WorldState } from "../types.js";
import { calculateRecruitmentSlots } from "../npp/recruitment.js";
import { recomputeComposition } from "../elections/orchestration.js";
import { isElectionCandidateActive } from "../elections/types.js";

export type PartyMergeVote = "yes" | "no";
export type PartyMergeSide = "proposing" | "target";

export const PARTY_MERGE_VOTE_WINDOW_TURNS = 24;
export const PARTY_MERGE_COOLDOWN_TURNS = 96;
const REQUIRED_YES_FRACTION = 0.6;

function eligibleVoterIds(world: WorldState, partyId: string): Set<string> {
  const party = world.parties[partyId];
  if (!party) return new Set();
  return new Set([
    ...(party.committeeIds ?? []),
    ...(party.chairId ? [party.chairId] : []),
    ...(party.viceChairId ? [party.viceChairId] : []),
    ...(party.treasurerId ? [party.treasurerId] : []),
  ]);
}

function voterPartyId(world: WorldState, voterId: string): string | null {
  if (voterId === "player") return world.player.partyId;
  return world.politicians.find((politician) => politician.id === voterId)?.partyId ?? null;
}

function sideOutcome(voterIds: Set<string>, votes: PartyMergerProposal["proposingVotes"], expired: boolean): "open" | "approved" | "rejected" {
  const size = voterIds.size;
  const yes = votes.filter((vote) => vote.vote === "yes" && voterIds.has(vote.voterId)).length;
  const no = votes.filter((vote) => vote.vote === "no" && voterIds.has(vote.voterId)).length;
  if (size === 0) return "rejected";
  const threshold = Math.ceil(size * REQUIRED_YES_FRACTION);
  if (yes >= threshold) return "approved";
  const remaining = size - yes - no;
  if (yes + remaining < threshold || expired) return "rejected";
  return "open";
}

export function proposePartyMerger(world: WorldState, proposerId: string, targetPartyId: string): { ok: true; proposal: PartyMergerProposal } | { ok: false; error: string } {
  const proposerPartyId = voterPartyId(world, proposerId);
  if (!proposerPartyId) return { ok: false, error: "Party membership is required to propose a merger." };
  const proposerParty = world.parties[proposerPartyId];
  const targetParty = world.parties[targetPartyId];
  if (!proposerParty || proposerParty.mergedIntoPartyId) return { ok: false, error: "The proposing party is not active." };
  if (!targetParty || targetParty.mergedIntoPartyId) return { ok: false, error: "The target party is not active." };
  if (proposerPartyId === targetPartyId) return { ok: false, error: "A party cannot merge with itself." };
  if (proposerParty.countryId !== targetParty.countryId) return { ok: false, error: "Parties from different countries cannot merge." };
  const canPropose = proposerParty.chairId === proposerId || proposerParty.viceChairId === proposerId || (proposerParty.committeeIds ?? []).includes(proposerId);
  if (!canPropose) return { ok: false, error: "Only the chair, vice-chair, or a national committee member may propose a merger." };
  const proposals = world.partyMergerProposals ?? [];
  if (proposals.some((proposal) => proposal.proposerPartyId === proposerPartyId && proposal.status === "open")) {
    return { ok: false, error: "This party already has an open merger proposal." };
  }
  const latestPassed = proposals
    .filter((proposal) => proposal.proposerPartyId === proposerPartyId && proposal.status === "passed")
    .reduce((latest, proposal) => Math.max(latest, proposal.resolvedTurn ?? proposal.createdTurn), -Infinity);
  if (Number.isFinite(latestPassed) && world.meta.turn < latestPassed + PARTY_MERGE_COOLDOWN_TURNS) {
    return { ok: false, error: "The merger proposal cooldown is still active." };
  }
  const sequence = proposals.filter((proposal) => proposal.createdTurn === world.meta.turn).length + 1;
  const proposal: PartyMergerProposal = {
    id: `party-merge:${proposerPartyId}:${world.meta.turn}:${sequence}`,
    proposerPartyId,
    targetPartyId,
    countryId: proposerParty.countryId,
    proposerId,
    createdTurn: world.meta.turn,
    expiresTurn: world.meta.turn + PARTY_MERGE_VOTE_WINDOW_TURNS,
    status: "open",
    proposingVotes: [],
    targetVotes: [],
  };
  (world.partyMergerProposals ??= []).push(proposal);
  return { ok: true, proposal };
}

export function castPartyMergerVote(world: WorldState, voterId: string, proposalId: string, vote: PartyMergeVote): { ok: true; proposal: PartyMergerProposal } | { ok: false; error: string } {
  const proposal = world.partyMergerProposals?.find((candidate) => candidate.id === proposalId);
  if (!proposal) return { ok: false, error: `Unknown merger proposal ${proposalId}.` };
  if (proposal.status !== "open") return { ok: false, error: "This merger proposal is no longer open." };
  if (world.meta.turn >= proposal.expiresTurn) return { ok: false, error: "This merger proposal has expired." };
  const voterParty = voterPartyId(world, voterId);
  const side: PartyMergeSide | null = voterParty === proposal.proposerPartyId ? "proposing" : voterParty === proposal.targetPartyId ? "target" : null;
  if (!side) return { ok: false, error: "Voter must belong to one of the two parties." };
  const voters = eligibleVoterIds(world, voterParty!);
  if (!voters.has(voterId)) return { ok: false, error: "Only committee members and national leadership may vote." };
  const votes = side === "proposing" ? proposal.proposingVotes : proposal.targetVotes;
  const existing = votes.find((entry) => entry.voterId === voterId);
  if (existing) {
    existing.vote = vote;
    existing.turn = world.meta.turn;
  } else {
    votes.push({ voterId, vote, turn: world.meta.turn });
  }
  const proposerOutcome = sideOutcome(eligibleVoterIds(world, proposal.proposerPartyId), proposal.proposingVotes, false);
  const targetOutcome = sideOutcome(eligibleVoterIds(world, proposal.targetPartyId), proposal.targetVotes, false);
  if (proposerOutcome === "rejected" || targetOutcome === "rejected") {
    proposal.status = "rejected";
    proposal.resolvedTurn = world.meta.turn;
  } else if (proposerOutcome === "approved" && targetOutcome === "approved") {
    applyPartyMerge(world, proposal);
    proposal.status = "passed";
    proposal.resolvedTurn = world.meta.turn;
  }
  return { ok: true, proposal };
}

/** Resolve abstentions as no at the source's 24-turn proposal expiry. */
export function expirePartyMergerProposals(world: WorldState): number {
  let expired = 0;
  for (const proposal of world.partyMergerProposals ?? []) {
    if (proposal.status !== "open" || world.meta.turn < proposal.expiresTurn) continue;
    const proposerOutcome = sideOutcome(eligibleVoterIds(world, proposal.proposerPartyId), proposal.proposingVotes, true);
    const targetOutcome = sideOutcome(eligibleVoterIds(world, proposal.targetPartyId), proposal.targetVotes, true);
    if (proposerOutcome === "approved" && targetOutcome === "approved") {
      applyPartyMerge(world, proposal);
      proposal.status = "passed";
    } else proposal.status = "rejected";
    proposal.resolvedTurn = world.meta.turn;
    expired++;
  }
  return expired;
}

function applyPartyMerge(world: WorldState, proposal: PartyMergerProposal): void {
  const absorbed = world.parties[proposal.proposerPartyId];
  const survivor = world.parties[proposal.targetPartyId];
  if (!absorbed || !survivor || absorbed.mergedIntoPartyId || survivor.mergedIntoPartyId) {
    throw new Error("Party merger proposal no longer has two active parties.");
  }
  if (absorbed.countryId !== survivor.countryId || absorbed.countryId !== proposal.countryId) {
    throw new Error("Party merger proposal country no longer matches the parties.");
  }
  const countryId = proposal.countryId;
  const absorbedId = absorbed.id;
  const survivorId = survivor.id;
  survivor.organization = Math.min(100, survivor.organization + Math.floor(absorbed.organization * 0.5));
  absorbed.organization = 0;
  const incoming = world.politicians.filter((politician) => politician.countryId === countryId && politician.partyId === absorbedId);
  const absorbedCharacterIds = world.player.countryId === countryId && world.player.partyId === absorbedId ? ["player"] : [];

  // Native's sole human character is a source Character; politician roster
  // rows are NPP-backed and therefore do not receive Character party clout.
  if (world.player.partyId === absorbedId) {
    world.player.partyId = survivorId;
    world.player.partyInfluence = Math.floor((world.player.partyInfluence ?? 0) * 0.5);
    if (world.player.hosPartyId === absorbedId) world.player.hosPartyId = survivorId;
  }
  const targetActiveByRegion = new Map<string, number>();
  for (const politician of world.politicians) {
    if (politician.countryId !== countryId || politician.partyId !== survivorId || politician.retiredAt) continue;
    const stateId = politician.homeState ?? politician.electedState;
    if (stateId) targetActiveByRegion.set(stateId, (targetActiveByRegion.get(stateId) ?? 0) + 1);
  }

  // 1. Transfer half the absorbed organization's state-level organizing to
  // the survivor. Registration is not party organization: source releases it
  // to the region's unregistered pool before deleting the absorbed row.
  for (const [key, org] of Object.entries(world.partyRegions)) {
    if (org.countryId !== countryId || org.partyId !== absorbedId) continue;
    const transferredOrganization = Math.floor(org.organization * 0.5);
    const survivorKey = `${org.regionId}:${survivorId}`;
    const survivorOrg = world.partyRegions[survivorKey];
    if (survivorOrg) {
      survivorOrg.organization += transferredOrganization;
    } else if (transferredOrganization > 0) {
      world.partyRegions[survivorKey] = {
        regionId: org.regionId,
        partyId: survivorId,
        countryId,
        organization: transferredOrganization,
        registration: 0,
        chairId: null,
        viceChairId: null,
        treasurerId: null,
      };
    }
    const pool = world.electoratePools[org.regionId];
    if (pool) pool.unregistered += Math.max(0, org.registration);
    delete world.partyRegions[key];
  }

  // 2. Enforce the reference per-region recruitment cap against incoming
  // NPP-backed politicians only; existing survivor NPPs consume slots first.
  const incomingByRegion = new Map<string, typeof incoming>();
  for (const politician of incoming) {
    if (politician.retiredAt) continue;
    const stateId = politician.homeState ?? politician.electedState;
    if (!stateId) continue;
    const list = incomingByRegion.get(stateId) ?? [];
    list.push(politician);
    incomingByRegion.set(stateId, list);
  }
  const culled = new Set<string>();
  for (const [stateId, politicians] of incomingByRegion) {
    const org = world.partyRegions[`${stateId}:${survivorId}`]?.organization ?? 0;
    const slots = Math.max(0, calculateRecruitmentSlots(org) - (targetActiveByRegion.get(stateId) ?? 0));
    politicians.sort((a, b) => b.politicalInfluence - a.politicalInfluence || b.favorability - a.favorability || a.id.localeCompare(b.id));
    for (const politician of politicians.slice(slots)) culled.add(politician.id);
  }
  for (const politician of incoming) {
    if (culled.has(politician.id)) continue;
    politician.partyId = survivorId;
  }
  if (culled.size) {
    world.politicians = world.politicians.filter((politician) => !culled.has(politician.id));
    for (const election of world.elections) {
      election.candidates = election.candidates.filter((candidate) => !culled.has(candidate.id));
      for (const id of culled) delete election.tally[id];
    }
    for (const [key, campaign] of Object.entries(world.campaigns)) {
      if (culled.has(campaign.candidateId)) delete world.campaigns[key];
    }
  }

  // 3. Transfer the national treasury and update all live source references.
  survivor.treasury += absorbed.treasury;
  absorbed.treasury = 0;
  const movedCandidateIds = new Set([
    ...absorbedCharacterIds,
    ...incoming.filter((politician) => !culled.has(politician.id)).map((politician) => politician.id),
  ]);
  for (const election of world.elections) {
    for (const candidate of election.candidates) {
      if (candidate.partyId === absorbedId && movedCandidateIds.has(candidate.id) && isElectionCandidateActive(candidate)) {
        candidate.partyId = survivorId;
      }
    }
  }
  for (const campaign of Object.values(world.campaigns)) {
    if (campaign.partyId === absorbedId && movedCandidateIds.has(campaign.candidateId) && campaign.status === "active") {
      campaign.partyId = survivorId;
    }
  }
  for (const whip of world.partyWhips ?? []) {
    if (whip.countryId === countryId && whip.partyId === absorbedId) whip.partyId = survivorId;
  }
  for (const endorsement of world.endorsements) {
    if (endorsement.countryId !== countryId) continue;
    if (endorsement.endorsedType === "party" && endorsement.endorsedId === absorbedId) endorsement.endorsedId = survivorId;
    if (endorsement.endorsedPartyId === absorbedId) endorsement.endorsedPartyId = survivorId;
    if (endorsement.endorserPartyId === absorbedId) endorsement.endorserPartyId = survivorId;
  }
  for (const coalition of world.coalitions) {
    if (coalition.countryId !== countryId || !coalition.memberPartyIds.includes(absorbedId)) continue;
    coalition.memberPartyIds = [...new Set(coalition.memberPartyIds.map((id) => id === absorbedId ? survivorId : id))];
    if (coalition.chairPartyId === absorbedId) coalition.chairPartyId = survivorId;
    coalition.updatedAtTurn = world.meta.turn;
  }
  if (survivor.coalitionId == null) survivor.coalitionId = absorbed.coalitionId;
  absorbed.coalitionId = null;
  const government = world.governments[countryId];
  if (government) {
    if (government.governingPartyId === absorbedId) government.governingPartyId = survivorId;
    if (government.coalitionPartyIds) government.coalitionPartyIds = [...new Set(government.coalitionPartyIds.map((id) => id === absorbedId ? survivorId : id))];
    if (government.seatsByParty[absorbedId] !== undefined) {
      government.seatsByParty[survivorId] = (government.seatsByParty[survivorId] ?? 0) + government.seatsByParty[absorbedId]!;
      delete government.seatsByParty[absorbedId];
    }
  }
  for (const office of Object.values(world.executives)) {
    if (office.countryId === countryId && office.presidentParty === absorbedId) office.presidentParty = survivorId;
  }

  const members = world.politicians.filter((politician) => politician.countryId === countryId && politician.partyId === survivorId && !politician.retiredAt).length
    + (world.player.countryId === countryId && world.player.partyId === survivorId ? 1 : 0);
  survivor.memberCount = members;
  absorbed.memberCount = 0;
  absorbed.mergedIntoPartyId = survivorId;
  absorbed.chairId = null;
  absorbed.viceChairId = null;
  absorbed.treasurerId = null;
  absorbed.committeeIds = [];
  for (const chamber of world.legislatures[countryId]?.chambers ?? []) recomputeComposition(world, countryId, chamber.key);
  world.news.push({
    id: `${proposal.id}:completed`,
    turn: world.meta.turn,
    date: world.meta.date,
    headline: `${absorbed.name} merged into ${survivor.name}`,
    category: "Politics",
    countryId,
    partyId: survivorId,
  });
}
