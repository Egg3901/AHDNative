import {
  ACTION_CATALOG, addDaysIso, calculateCampaignIncome, calculateMaintenanceCosts,
  campaignAnchorToLocal, campaignKey, canJoinParty, canLeaveParty, getActionCost,
  getCampaignFamilyScalar, getEffectiveBranchCost, RALLY_IMMEDIATE_SHARE,
  RALLY_SPREAD_TURNS, SUPPORT_RALLY_ACTION_COST, SUPPORT_RALLY_FULL_VALUE,
  type OpsBranchKey, type WorldState,
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

export interface PoliticsCampaignBranchView {
  branch: "a" | "b" | "c"; level: number; maxLevel: number;
  nextFunds: number | null; nextActions: number | null; nextEffect: string | null;
  affordable: boolean; maxed: boolean;
  upgrade: ActionView;
}

export interface PoliticsCampaignLeverView {
  category: "fundraising" | "oppositionResearch" | "groundGame" | "mediaSpending";
  started: boolean;
  starterFunds: number | null; starterActions: number | null; starterEffect: string | null;
  starterAffordable: boolean;
  starterUpgrade: ActionView | null;
  branches: PoliticsCampaignBranchView[];
}

export interface PoliticsCampaignActivityView {
  type: "upgrade" | "downgrade";
  category: "fundraising" | "oppositionResearch" | "groundGame" | "mediaSpending";
  branch: "a" | "b" | "c" | null;
  fromLevel: number | null;
  newLevel: number;
  costFunds: number | null;
  costActions: number | null;
  reason: "insolvency" | null;
  turnNumber: number;
}

export interface PoliticsCampaignRallyView {
  action: ActionView;
  immediateSupport: number;
  pendingPerTurn: number;
  pendingTurns: number;
}

export interface PoliticsPlayerCampaignView {
  status: string;
  funds: number; actions: number;
  spendThisTurn: number; spendStock: number;
  totalFundsGenerated: number; totalFundsSpent: number;
  incomePerTurn: number; maintenancePerTurn: number;
  /** Candidate support mood input (Phase 5a), not a vote forecast. */
  support: number | null;
  generalPhase: boolean;
  activity: PoliticsCampaignActivityView[];
  rally: PoliticsCampaignRallyView;
  levers: PoliticsCampaignLeverView[];
}

export interface PoliticsProjectionDriverView {
  kind: "campaign" | "support" | "region";
  label: string;
  refId: string;
}

export interface PoliticsProjectionView {
  resolved: boolean;
  /** Votes counted so far (cumulative tally), never a forecast. */
  countedVotes: number | null;
  leaderName: string | null; leaderShare: number | null;
  runnerUpName: string | null; marginPct: number | null;
  /** Seat projection from the saved tally seatsEstimate, null when absent. */
  seats: { candidateId: string; name: string; seats: number }[] | null;
  snapshotTurn: number | null;
  drivers: PoliticsProjectionDriverView[];
}

export interface PoliticsElectionDetail {
  id: string; title: string; status: string; date: string; filingDate: string;
  playerCandidate: boolean;
  candidates: PoliticsCandidateView[];
  winnerNames: string[];
  totalVotes: number | null;
  candidacy: ActionView;
  playerCampaign: PoliticsPlayerCampaignView | null;
  projection: PoliticsProjectionView;
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

const CAMPAIGN_LEVERS: PoliticsCampaignLeverView["category"][] =
  ["fundraising", "oppositionResearch", "groundGame", "mediaSpending"];
const CAMPAIGN_BRANCHES: ("a" | "b" | "c")[] = ["a", "b", "c"];

function isGeneralPhase(world: WorldState, election: WorldState["elections"][number]): boolean {
  const primaryClosed = typeof election.primaryEndTurn === "number"
    ? world.meta.turn >= election.primaryEndTurn : true;
  const generalOpen = typeof election.endTurn === "number" ? world.meta.turn <= election.endTurn : true;
  return primaryClosed && generalOpen;
}

function upgradeAction(
  branch: OpsBranchKey | null,
  fundsLocal: number | null,
  actions: number | null,
  maxed: boolean,
  campaignFunds: number,
  campaignActions: number,
  noCampaignReason?: string,
): ActionView {
  const entry = ACTION_CATALOG.campaignUpgrade;
  const reason = noCampaignReason
    ?? (maxed ? "Max level reached."
      : fundsLocal == null || actions == null ? "Unavailable."
      : campaignFunds < fundsLocal ? `Needs ${Math.ceil(fundsLocal).toLocaleString()} campaign funds.`
      : campaignActions < actions ? `Needs ${actions} campaign actions.` : undefined);
  return {
    id: "campaignUpgrade", name: entry.name,
    description: branch === null ? "Unlock this lever's starter." : `Upgrade branch ${branch}.`,
    cost: 0, available: !reason,
    ...(reason ? { disabledReason: reason } : {}),
  };
}

function rallyAction(
  world: WorldState,
  election: WorldState["elections"][number],
  campaignActions: number,
  supportStatus: "active" | "withdrawn" | undefined,
  lastRallyTurn: number | undefined,
): PoliticsCampaignRallyView {
  const scalar = getCampaignFamilyScalar(election.electionType);
  const actionCost = Math.ceil(SUPPORT_RALLY_ACTION_COST * scalar);
  const fullValue = SUPPORT_RALLY_FULL_VALUE * scalar;
  const immediateSupport = fullValue * RALLY_IMMEDIATE_SHARE;
  const pendingPerTurn = fullValue * (1 - RALLY_IMMEDIATE_SHARE) / RALLY_SPREAD_TURNS;
  const noRace = election.status === "resolved"
    ? "This election has ended."
    : election.status !== "active" ? "Election is not active" : undefined;
  const reason = noRace
    ?? (supportStatus === "withdrawn" ? "Candidate support is inactive." : undefined)
    ?? (typeof lastRallyTurn === "number" && lastRallyTurn >= world.meta.turn
      ? "Rally already fired this turn"
      : undefined)
    ?? (campaignActions < actionCost ? `Needs ${actionCost} campaign actions.` : undefined);
  const entry = ACTION_CATALOG.campaignRally;
  return {
    action: {
      id: "campaignRally", name: entry.name, description: entry.description,
      cost: actionCost, available: !reason, ...(reason ? { disabledReason: reason } : {}),
    },
    immediateSupport,
    pendingPerTurn,
    pendingTurns: RALLY_SPREAD_TURNS,
  };
}

function projectPlayerCampaign(
  world: WorldState,
  election: WorldState["elections"][number],
): PoliticsPlayerCampaignView | null {
  if (!election.candidates.some((c) => c.id === "player")) return null;
  const campaign = world.campaigns[campaignKey(election.id, "player")];
  if (!campaign || campaign.status !== "active") return null;
  const generalPhase = isGeneralPhase(world, election);
  const noRace = election.status === "resolved" ? "This election has ended." : undefined;
  const storedSupport = world.candidateSupports?.["player"];
  const supportRow = storedSupport &&
    (storedSupport.electionId === undefined || storedSupport.electionId === election.id)
    ? storedSupport : undefined;
  const rally = rallyAction(world, election, campaign.actions, supportRow?.status, supportRow?.lastRallyTurn);
  const levers: PoliticsCampaignLeverView[] = CAMPAIGN_LEVERS.map((category) => {
    const tree = campaign[`${category}Tree`];
    const starterCost = tree.starter ? null
      : getEffectiveBranchCost(category, null, 0, election.electionType, generalPhase);
    const starterFunds = starterCost ? campaignAnchorToLocal(starterCost.funds, campaign.countryId) : null;
    const starterUpgrade = tree.starter ? null : upgradeAction(
      null, starterFunds, starterCost?.actions ?? null,
      false, campaign.funds, campaign.actions, noRace);
    const branches: PoliticsCampaignBranchView[] = CAMPAIGN_BRANCHES.map((branch) => {
      const level = tree[branch];
      const next = tree.starter
        ? getEffectiveBranchCost(category, branch, level + 1, election.electionType, generalPhase)
        : null;
      const maxed = tree.starter && next === null;
      const nextFunds = next ? campaignAnchorToLocal(next.funds, campaign.countryId) : null;
      const affordable = !noRace && !maxed && nextFunds != null && next != null
        && campaign.funds >= nextFunds && campaign.actions >= next.actions;
      return {
        branch, level, maxLevel: 3,
        nextFunds, nextActions: next?.actions ?? null, nextEffect: next?.effect ?? null,
        affordable, maxed,
        upgrade: upgradeAction(branch, nextFunds,
          next?.actions ?? null, maxed, campaign.funds, campaign.actions,
          noRace ?? (!tree.starter ? "Unlock this lever's starter first." : undefined)),
      };
    });
    return {
      category, started: tree.starter,
      starterFunds, starterActions: starterCost?.actions ?? null,
      starterEffect: starterCost?.effect ?? null,
      starterAffordable: starterUpgrade?.available ?? false,
      starterUpgrade, branches,
    };
  });
  return {
    status: campaign.status,
    funds: campaign.funds, actions: campaign.actions,
    spendThisTurn: campaign.spendThisTurn, spendStock: campaign.spendStock ?? 0,
    totalFundsGenerated: campaign.totalFundsGenerated, totalFundsSpent: campaign.totalFundsSpent,
    incomePerTurn: campaignAnchorToLocal(
      calculateCampaignIncome(campaign, election.electionType), campaign.countryId),
    maintenancePerTurn: campaignAnchorToLocal(
      calculateMaintenanceCosts(campaign, election.electionType), campaign.countryId),
    support: supportRow?.support ?? 50,
    generalPhase,
    activity: (campaign.activityHistory ?? []).map((entry) => ({
      type: entry.type,
      category: entry.category,
      branch: entry.branch ?? null,
      fromLevel: entry.fromLevel ?? null,
      newLevel: entry.newLevel,
      costFunds: entry.costFunds ?? null,
      costActions: entry.costActions ?? null,
      reason: entry.reason ?? null,
      turnNumber: entry.turnNumber,
    })),
    rally,
    levers,
  };
}

function projectProjection(
  world: WorldState,
  election: WorldState["elections"][number],
  candidates: PoliticsCandidateView[],
  totalVotes: number | null,
): PoliticsProjectionView {
  const resolved = election.status === "resolved";
  const counted = [...candidates]
    .filter((c) => c.votes != null)
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const leader = counted[0] ?? null;
  const runnerUp = counted[1] ?? null;
  // Seat projection rides the saved tally document (estimateSeats), never
  // the counted totals: null until the tally has produced one.
  const tallyDoc = election.tallyState as {
    seatsEstimate?: Record<string, number>;
    turnSnapshots?: { turn: number }[];
  } | undefined;
  const seatsRaw = !resolved ? tallyDoc?.seatsEstimate : undefined;
  const nameOf = (id: string) => candidates.find((c) => c.id === id)?.name ?? id;
  const seats = seatsRaw
    ? Object.entries(seatsRaw)
      .map(([candidateId, seats]) => ({ candidateId, name: nameOf(candidateId), seats }))
      .sort((a, b) => b.seats - a.seats)
    : null;
  const snapshots = tallyDoc?.turnSnapshots;
  const drivers: PoliticsProjectionDriverView[] = [];
  for (const c of election.candidates) {
    drivers.push({
      kind: "campaign",
      label: `${c.name} campaign spend`,
      refId: campaignKey(election.id, c.id),
    });
  }
  for (const c of election.candidates) {
    if (world.candidateSupports?.[c.id] != null) {
      drivers.push({ kind: "support", label: `${c.name} support`, refId: c.id });
    }
  }
  if (election.state) {
    drivers.push({ kind: "region", label: `${election.state} organization`, refId: election.state });
  }
  return {
    resolved,
    countedVotes: totalVotes,
    leaderName: leader?.name ?? null,
    leaderShare: leader?.voteShare ?? null,
    runnerUpName: runnerUp?.name ?? null,
    marginPct: leader?.voteShare != null && runnerUp?.voteShare != null
      ? leader.voteShare - runnerUp.voteShare : null,
    seats, snapshotTurn: snapshots?.length ? snapshots[snapshots.length - 1]!.turn : null,
    drivers,
  };
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
        playerCampaign: projectPlayerCampaign(world, election),
        projection: projectProjection(world, election, candidates, totalVotes),
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
