import {
  ACTION_CATALOG, addDaysIso, getActionCost, canJoinParty, canLeaveParty, type WorldState,
} from "@ahdclient/engine";
import type { ActionView } from "./types";

/**
 * Politics projection: per party detail, per election detail with its real
 * candidate roster, and the country politician roster.
 *
 * Display hints mirror the pinned engine; executeAction remains authoritative.
 * Vote figures come only from each election tally record. Campaign strength
 * is never presented as vote share.
 */

export interface PoliticsPartyDetail {
  id: string; name: string; abbreviation: string; color: string;
  members: number; treasury: number; isPlayerParty: boolean;
  economicPosition: number; socialPosition: number;
  tier: "major" | "minor"; organization: number; politicalStrength: number;
  leaderName: string | null; viceLeaderName: string | null; treasurerName: string | null;
  memberNames: string[];
  join: ActionView; leave: ActionView;
}

export interface PoliticsCandidateView {
  id: string; name: string; partyId: string; partyName: string;
  incumbent: boolean; isPlayer: boolean;
  votes: number | null; voteShare: number | null; winner: boolean;
}

export interface PoliticsElectionDetail {
  id: string; title: string; status: string; date: string; filingDate: string;
  playerCandidate: boolean;
  candidates: PoliticsCandidateView[];
  winnerNames: string[];
  totalVotes: number | null;
  candidacy: ActionView;
}

export interface PoliticsPoliticianView {
  id: string; name: string; partyId: string; partyName: string;
  office: string | null; age: number;
  economic: number; social: number;
  influence: number; favorability: number; infamy: number;
  activeRaceIds: string[];
}

export interface PoliticsView {
  countryId: string; countryName: string; currency: string; playerPartyId: string | null;
  parties: PoliticsPartyDetail[];
  elections: PoliticsElectionDetail[];
  politicians: PoliticsPoliticianView[];
}

function actionCost(world: WorldState, id: "joinParty" | "leaveParty" | "declareCandidacy" | "withdrawCandidacy"): number {
  const entry = ACTION_CATALOG[id];
  const player = world.player;
  return getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
}

function actionGate(world: WorldState, id: "joinParty" | "leaveParty" | "declareCandidacy" | "withdrawCandidacy"): string | undefined {
  const player = world.player;
  if ((player.actionCooldowns[id] ?? 0) > world.meta.turn) return "Available after its cooldown.";
  if (player.actions < actionCost(world, id)) return "Not enough action points.";
  return undefined;
}

/** Join/leave hints mirror session.ts; executeAction remains authoritative. */
export function projectPartyMembership(world: WorldState, partyId: string): { join: ActionView; leave: ActionView } {
  const isPlayerParty = world.player.partyId === partyId;
  const join = canJoinParty(world, partyId);
  const leave = canLeaveParty(world);
  const joinReason = isPlayerParty ? "You are already a member of this party."
    : actionGate(world, "joinParty") ?? (!join.ok ? join.error : undefined);
  const leaveReason = !world.player.partyId ? "You are independent." : !isPlayerParty ? "You are not a member of this party."
    : actionGate(world, "leaveParty") ?? (!leave.ok ? leave.error : undefined);
  const joinEntry = ACTION_CATALOG.joinParty;
  const leaveEntry = ACTION_CATALOG.leaveParty;
  return {
    join: { id: "joinParty", name: joinEntry.name, description: joinEntry.description,
      cost: actionCost(world, "joinParty"), available: !joinReason,
      ...(joinReason ? { disabledReason: joinReason } : {}) },
    leave: { id: "leaveParty", name: leaveEntry.name, description: leaveEntry.description,
      cost: actionCost(world, "leaveParty"), available: !leaveReason,
      ...(leaveReason ? { disabledReason: leaveReason } : {}) },
  };
}

/** Candidacy hints mirror session.ts projectElections; executeAction remains authoritative. */
function candidacyAction(
  world: WorldState,
  election: WorldState["elections"][number],
  active: WorldState["elections"][number] | undefined,
  playerCandidate: boolean,
): ActionView {
  const id = playerCandidate ? "withdrawCandidacy" : "declareCandidacy";
  const entry = ACTION_CATALOG[id];
  const player = world.player;
  const reason = election.status === "resolved" ? "This election has ended."
    : !playerCandidate && world.meta.turn > election.primaryEndTurn ? "Filing has closed."
    : !playerCandidate && !player.partyId ? "Join a party before filing."
    : !playerCandidate && active ? "Withdraw from your current race before filing for another."
    : actionGate(world, id);
  return { id, name: playerCandidate ? "Withdraw candidacy" : "Run for office", description: "",
    cost: actionCost(world, id), available: !reason, ...(reason ? { disabledReason: reason } : {}) };
}

function politicianName(world: WorldState, id: string | null | undefined): string | null {
  if (!id) return null;
  if (id === "player") return world.player.name;
  return world.politicians.find((p) => p.id === id)?.name ?? null;
}

function officeLabel(world: WorldState, chamberKey: string, electedState?: string, senateClass?: 1 | 2 | 3): string | null {
  if (!chamberKey) return null;
  const chamber = world.legislatures[world.player.countryId]?.chambers.find((c) => c.key === chamberKey)?.name ?? chamberKey;
  const parts = [chamber];
  if (electedState) parts.push(electedState);
  if (senateClass) parts.push(`class ${senateClass}`);
  return parts.join(" · ");
}

export function projectPolitics(world: WorldState): PoliticsView {
  const country = world.countries[world.player.countryId];
  if (!country || !country.playable) throw new Error("The save does not contain the player's playable country.");
  const player = world.player;
  const dateAt = (turn: number) => addDaysIso(world.meta.date, (turn - world.meta.turn) * 7);
  const partyName = (partyId: string) => world.parties[partyId]?.name ?? partyId;

  const active = world.elections.find((e) => e.status !== "resolved" && e.candidates.some((c) => c.id === "player"));
  const elections = world.elections.filter((e) => e.countryId === player.countryId)
    .sort((a, b) => Number(b.id === active?.id) - Number(a.id === active?.id)
      || Number(a.status === "resolved") - Number(b.status === "resolved")
      || (a.status === "resolved" ? b.endTurn - a.endTurn : a.primaryEndTurn - b.primaryEndTurn))
    .map((election) => {
      const playerCandidate = election.candidates.some((c) => c.id === "player");
      const winnerIds = new Set(election.winners ?? []);
      const tallyEntries = Object.entries(election.tally ?? {});
      const hasVotes = tallyEntries.some(([, v]) => v > 0);
      const totalVotes = hasVotes ? tallyEntries.reduce((sum, [, v]) => sum + v, 0) : null;
      const candidates = election.candidates.map((c) => {
        const votes = hasVotes ? (election.tally[c.id] ?? 0) : null;
        return {
          id: c.id, name: c.name, partyId: c.partyId, partyName: partyName(c.partyId),
          incumbent: c.incumbent, isPlayer: c.id === "player",
          votes, voteShare: votes == null || !totalVotes ? null : votes / totalVotes,
          winner: winnerIds.has(c.id),
        };
      });
      const winnerNames = (election.winners ?? []).map((id) =>
        election.candidates.find((c) => c.id === id)?.name ?? politicianName(world, id) ?? id);
      return {
        id: election.id,
        title: election.electionType.replaceAll("_", " ") + (election.state ? ` · ${election.state}` : ""),
        status: election.status, date: dateAt(election.endTurn), filingDate: dateAt(election.primaryEndTurn),
        playerCandidate, candidates, winnerNames, totalVotes,
        candidacy: candidacyAction(world, election, active, playerCandidate),
      };
    });

  const activeRaceIdsByPolitician = new Map<string, string[]>();
  for (const election of world.elections) {
    if (election.status === "resolved" || election.countryId !== player.countryId) continue;
    for (const candidate of election.candidates) {
      if (candidate.id === "player") continue;
      const list = activeRaceIdsByPolitician.get(candidate.id) ?? [];
      list.push(election.id);
      activeRaceIdsByPolitician.set(candidate.id, list);
    }
  }

  const politicians = world.politicians.filter((p) => p.countryId === player.countryId)
    .map((p) => ({
      id: p.id, name: p.name, partyId: p.partyId, partyName: partyName(p.partyId),
      office: officeLabel(world, p.chamberKey, p.electedState, p.senateClass),
      age: p.age, economic: p.ideology.economic, social: p.ideology.social,
      influence: p.partyInfluence, favorability: p.favorability, infamy: p.infamy,
      activeRaceIds: activeRaceIdsByPolitician.get(p.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parties = Object.values(world.parties).filter((party) => party.countryId === country.id)
    .map((party) => {
      const isPlayerParty = player.partyId === party.id;
      const memberNames = world.politicians
        .filter((p) => p.id !== "player" && p.countryId === country.id && p.partyId === party.id)
        .map((p) => p.name);
      if (isPlayerParty) memberNames.push(player.name);
      memberNames.sort();
      return {
        id: party.id, name: party.name, abbreviation: party.abbreviation, color: party.color,
        members: party.memberCount, treasury: party.treasury, isPlayerParty,
        economicPosition: party.economicPosition, socialPosition: party.socialPosition,
        tier: party.tier, organization: party.organization, politicalStrength: party.politicalStrength,
        leaderName: politicianName(world, party.chairId),
        viceLeaderName: politicianName(world, party.viceChairId),
        treasurerName: politicianName(world, party.treasurerId),
        memberNames,
        ...projectPartyMembership(world, party.id),
      };
    })
    .sort((a, b) => Number(b.isPlayerParty) - Number(a.isPlayerParty) || b.members - a.members);

  return { countryId: country.id, countryName: country.name, currency: world.budgets[country.id]?.currencyCode ?? world.exchangeRates[country.id]?.currencyCode ?? "XXX", playerPartyId: player.partyId, parties, elections, politicians };
}
