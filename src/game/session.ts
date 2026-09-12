import { projectProfile } from "./profile";
import { validateProfileUpdate } from "./profileValidation";
import type { ProfileUpdate } from "./profileTypes";
import { projectRegions, type RegionsQuery } from "./regions";
import { projectCaucusManagement } from "./caucusManagement";
import { projectBondMarket } from "./bondMarket";
import { projectPartyManagement } from "./partyManagement";
import { searchWorld, type SearchFilter } from "./search";
import { projectMarkets } from "./markets";
import { buildLegislationDetails, type LegislationSelection } from "./legislationDetails";
import { projectWorldOverview } from "./worldOverview";
import { projectNation } from "./nation";
import { projectPolitics, projectPartyMembership } from "./politics";
import { projectResources } from "./resources";
import { racePhase } from "./racePhase";
import {
  ACTION_CATALOG, addDaysIso, advanceTurn, createWorld, deserializeSave, executeAction,
  getActionCost, getCatalog, isFundraiseEligible, fundraiseQuote, listEras, listPlayableCountries, serializeSave,
  type ActionId, type ExecuteActionParams, type WorldState,
} from "@ahdclient/engine";
import type { ActionCategory, ActionView, ElectionView, EraChoice, FinanceView, GameView, LegislatureView, NewGameOptions } from "./types";
import {
  actionNotification, addNotifications, deleteNotification, diffTurnSnapshots, markAllNotificationsRead,
  markNotificationRead, parseNotifications, saveNotification, toInbox, welcomeNotification,
  type NotificationDraft, type NotificationItem, type TurnSnapshot,
  type ActionChange, type ActionOutcome, type ActionTarget,
} from "./notifications";

/**
 * Player Actions hub membership. Categories mirror AHDGame src/app/actions
 * (influence/money/research): campaign, advertise and canvass drive influence;
 * fundraise, donor network and self-funding raise money; polls read the
 * electorate. Party membership stays reachable here under Influence.
 * poll/pollLarge are engine PORT-STUBs surfaced as honestly unavailable.
 * debatePrep (#37) sits under Intelligence per its mainline research category.
 */
const ACTIONS: { id: ActionId; requires?: ActionView["requires"]; category: ActionCategory; prerequisite?: string }[] = [
  { id: "campaign", requires: "region", category: "influence", prerequisite: "Choose a region." },
  { id: "advertise", category: "influence" },
  { id: "canvass", requires: "region", category: "influence", prerequisite: "Choose a region." },
  { id: "joinParty", requires: "party", category: "influence", prerequisite: "Choose a party." },
  { id: "leaveParty", category: "influence", prerequisite: "Requires party membership." },
  { id: "fundraise", category: "fundraising", prerequisite: "Requires a donor network." },
  { id: "buildDonorBase", category: "fundraising" },
  { id: "convertCash", requires: "amount", category: "fundraising", prerequisite: "Requires personal cash." },
  { id: "poll", category: "intelligence" },
  { id: "pollLarge", category: "intelligence" },
  { id: "debatePrep", category: "intelligence" },
];

/**
 * Fund-cost quote mirroring executeAction's tier scaling
 * (packages/engine/src/actions/execute.ts); executeAction stays authoritative.
 */
function quoteFundCost(id: ActionId, flat: number, donorBaseLevel: number, apCost: number): number {
  if (id === "campaign") {
    const mult = 1 + (apCost - 1) * 0.2;
    return Math.round((20_000 * apCost * mult) / 1_000) * 1_000;
  }
  if (id === "advertise") {
    const mult = 1 + (apCost - 5) * 0.2;
    return Math.round((100_000 * mult) / 1_000) * 1_000;
  }
  if (id === "buildDonorBase") return Math.round((3_000 + donorBaseLevel * 1_500) / 1_000) * 1_000;
  return flat;
}

export function gameChoices(): EraChoice[] {
  return listEras().map((era) => ({ id: era.id, label: era.label, countries: listPlayableCountries(era.id) }));
}

/** Owns mutable engine state; only detached display data and save strings cross the boundary. */
export class GameSession {
  private world?: WorldState;
  private notifications: NotificationItem[] = [];

  create(options: NewGameOptions): GameView {
    if (!options || typeof options.playerName !== "string" || !options.playerName.trim() || options.playerName.trim().length > 80) {
      throw new Error("Enter a player name between 1 and 80 characters.");
    }
    if (typeof options.seed !== "string" || !options.seed.trim() || options.seed.length > 256) {
      throw new Error("Enter a world seed between 1 and 256 characters.");
    }
    const era = gameChoices().find((choice) => choice.id === options.era);
    if (!era?.countries.some((country) => country.id === options.countryId)) {
      throw new Error("Choose a playable country in the selected era.");
    }
    const world = createWorld({ ...options, playerName: options.playerName.trim() });
    return this.commit(world, addNotifications([], [welcomeNotification(world.player.name, world.meta.turn, world.meta.date)]));
  }

  act(actionId: string, params: ExecuteActionParams = {}) {
    const source = this.requireWorld();
    const before = snapshotNotifications(source);
    const actionBefore = snapshotActionFields(source);
    const candidate = structuredClone(this.requireWorld());
    const result = executeAction(candidate, "player", actionId, params);
    if (!result.ok) return result;
    const world = candidate;
    const drafts: NotificationDraft[] = [];
    const outcome = buildActionOutcome(actionId, params, actionBefore, world);
    const detail = describeAction(actionId, params, world, result, outcome);
    if (detail) {
      const draft = actionNotification(actionId, detail, world.meta.turn, world.meta.date);
      if (draft) drafts.push({ ...draft, key: this.uniqueKey(draft.key) });
    }
    drafts.push(...diffTurnSnapshots(before, snapshotNotifications(world), world.player.name));
    this.commit(candidate, addNotifications(this.notifications, drafts));
    return { ...result, outcome };
  }

  advance(): GameView {
    // The engine mutates in place. Commit only a completed turn so phase failures
    // cannot leave the active session partially advanced. Profile this copy cost.
    const before = snapshotNotifications(this.requireWorld());
    const candidate = structuredClone(this.requireWorld());
    advanceTurn(candidate);
    const world = candidate;
    return this.commit(candidate, addNotifications(
      this.notifications, diffTurnSnapshots(before, snapshotNotifications(world), world.player.name)));
  }

  markNotificationRead(id: string): GameView {
    this.notifications = markNotificationRead(this.notifications, id);
    return this.view();
  }

  deleteNotification(id: string): GameView {
    this.notifications = deleteNotification(this.notifications, id);
    return this.view();
  }

  markAllNotificationsRead(): GameView {
    this.notifications = markAllNotificationsRead(this.notifications);
    return this.view();
  }

  /** Save-event notice, upserted after a successful save; deduped to one per turn. */
  recordSave(): GameView {
    const world = this.requireWorld();
    this.notifications = addNotifications(
      this.notifications, [saveNotification(world.meta.turn, world.meta.date)]);
    return this.view();
  }

  serialize(savedAt: string, includeSaveNotice = false): string {
    const world = this.requireWorld();
    const envelope = serializeSave(world, savedAt);
    const items = includeSaveNotice
      ? addNotifications(this.notifications, [saveNotification(world.meta.turn, world.meta.date)])
      : this.notifications;
    // Canonical field order: live-built and save-parsed items must serialize
    // to identical bytes so reload round-trips stay byte-deterministic.
    // serializeSave returns a compact object. Append app metadata without
    // parsing and copying the full world a second time on every autosave.
    return envelope.slice(0, -1) + ",\"notifications\":" + JSON.stringify(parseNotifications(items)) + "}";
  }

  load(contents: string): GameView {
    const world = deserializeSave(contents);
    const stored = parseNotifications((JSON.parse(contents) as { notifications?: unknown }).notifications);
    return this.commit(world, stored);
  }

  profile() { return projectProfile(this.requireWorld()); }

  updateProfile(update: ProfileUpdate): GameView {
    const valid = validateProfileUpdate(update);
    const candidate = structuredClone(this.requireWorld());
    Object.assign(candidate.player, valid);
    return this.commit(candidate);
  }


  legislation(selection: LegislationSelection = {}) { return buildLegislationDetails(this.requireWorld(), selection); }

  worldOverview() { return projectWorldOverview(this.requireWorld()); }

  search(query: string, filter?: SearchFilter) { return searchWorld(this.requireWorld(), query, filter); }

  bondMarket() { return projectBondMarket(this.requireWorld()); }

  regions(query: RegionsQuery = {}) { return projectRegions(this.requireWorld(), query); }

  caucusManagement() { return projectCaucusManagement(this.requireWorld()); }

  partyManagement() { return projectPartyManagement(this.requireWorld()); }

  markets() { return projectMarkets(this.requireWorld()); }

  politics() { return projectPolitics(this.requireWorld()); }

  private requireWorld(): WorldState {
    if (!this.world) throw new Error("Start or load a game first.");
    return this.world;
  }

  private commit(candidate: WorldState, notifications = this.notifications): GameView {
    const view = projectWorld(candidate, notifications);
    this.world = candidate;
    this.notifications = notifications;
    return view;
  }

  view(): GameView { return projectWorld(this.requireWorld(), this.notifications); }

  /** Keeps repeated same-turn action notices distinct while staying deterministic. */
  private uniqueKey(base: string): string {
    if (!this.notifications.some((item) => item.key === base)) return base;
    let attempt = 2;
    while (this.notifications.some((item) => item.key === `${base}:${attempt}`)) attempt += 1;
    return `${base}:${attempt}`;
  }
}

/** Minimal notification snapshot over the authoritative world; diffs drive local notices. */
function snapshotNotifications(world: WorldState): TurnSnapshot {
  const player = world.player;
  const seat = player.legislativeSeat;
  const votingOpen = (status: string) => ["active", "active_other", "veto_override"].includes(status);
  return {
    turn: world.meta.turn,
    date: world.meta.date,
    news: world.news.map((item) => ({ headline: item.headline })),
    elections: world.elections
      .filter((election) => election.countryId === player.countryId)
      .map((election) => ({
        id: election.id,
        title: election.electionType.replaceAll("_", " ") + (election.state ? ` · ${election.state}` : ""),
        status: election.status,
        playerCandidate: election.candidates.some((candidate) => candidate.id === "player"),
        playerWon: election.winners?.includes("player") ?? false,
        winnerNames: (election.winners ?? []).map((id) =>
          election.candidates.find((candidate) => candidate.id === id)?.name
          ?? world.politicians.find((politician) => politician.id === id)?.name ?? id),
        filingOpen: election.status !== "resolved" && world.meta.turn <= election.primaryEndTurn,
      })),
    bills: world.bills
      .filter((bill) => bill.countryId === player.countryId)
      .map((bill) => ({
        id: bill.id,
        title: bill.title,
        status: bill.status,
        votingOpenForPlayer: votingOpen(bill.status) && seat !== null
          && seat.countryId === bill.countryId && seat.chamberKey === bill.currentChamber,
      })),
    partyId: player.partyId,
    partyName: player.partyId ? world.parties[player.partyId]?.name ?? "Independent" : "Independent",
    funds: player.funds,
    savings: player.savings,
  };
}

function stringParam(params: ExecuteActionParams, key: "partyId" | "electionId"): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberParam(params: ExecuteActionParams, key: "amount"): number | undefined {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Gathers real display details for an action notice from the committed world. */
function describeAction(
  actionId: string, params: ExecuteActionParams, world: WorldState, result: { ok: boolean }, outcome: ActionOutcome,
): import("./notifications").ActionDetail | null {
  if (!result.ok) return null;
  const message = (result as { message?: unknown }).message;
  const detail: import("./notifications").ActionDetail =
    typeof message === "string" && message.length > 0 ? { message } : {};
  detail.outcome = outcome;
  const partyId = stringParam(params, "partyId");
  if (partyId) {
    detail.partyId = partyId;
    detail.partyName = world.parties[partyId]?.name;
  }
  const electionId = stringParam(params, "electionId");
  if (electionId) {
    detail.electionId = electionId;
    detail.electionTitle = world.elections.find((election) => election.id === electionId)?.electionType
      .replaceAll("_", " ");
  }
  const amount = numberParam(params, "amount");
  if (amount !== undefined) detail.amount = amount;
  switch (actionId) {
    case "joinParty": case "leaveParty":
    case "declareCandidacy": case "withdrawCandidacy":
    case "fundraise": case "convertCash": case "depositSavings": case "withdrawSavings":
    case "campaign": case "advertise": case "canvass":
    case "sponsorBill": case "voteOnBill": case "buildDonorBase":
      return detail;
    default:
      return detail;
  }
}

const ACTION_FIELDS = [
  ["actions", "Actions"], ["funds", "Campaign funds"], ["cash", "Cash"], ["savings", "Savings"],
  ["politicalInfluence", "Influence"], ["nationalInfluence", "National influence"],
  ["partyInfluence", "Party influence"], ["favorability", "Favorability"], ["infamy", "Infamy"],
  ["donorBaseLevel", "Donor network"], ["partyId", "Party"],
] as const;

function snapshotActionFields(world: WorldState): Record<string, number | string | null> {
  const player = world.player as unknown as Record<string, unknown>;
  return Object.fromEntries(ACTION_FIELDS.map(([field]) => {
    const value = player[field];
    return [field, typeof value === "number" || typeof value === "string" ? value : null];
  }));
}

function actionTarget(params: ExecuteActionParams, world: WorldState): ActionTarget | undefined {
  const candidates: [keyof ExecuteActionParams, string, (id: string) => string | undefined][] = [
    ["regionId", "region", id => world.regions[id]?.name],
    ["partyId", "party", id => world.parties[id]?.name],
    ["electionId", "election", id => world.elections.find(item => item.id === id)?.electionType.replaceAll("_", " ")],
    ["billId", "bill", id => world.bills.find(item => item.id === id)?.title],
    ["corpId", "company", id => world.corporations[id]?.tickerSymbol],
    ["bondId", "bond", id => world.bonds[id]?.id],
    ["caucusId", "caucus", id => world.caucuses.find(item => item.id === id)?.name],
    ["intrapartyElectionId", "intra-party election", () => undefined],
    ["candidateId", "candidate", id => world.politicians.find(item => item.id === id)?.name],
    ["endorsedId", "endorsement", id => world.politicians.find(item => item.id === id)?.name ?? world.parties[id]?.name],
    ["coalitionId", "coalition", () => undefined],
    ["targetPoliticianId", "politician", id => world.politicians.find(item => item.id === id)?.name],
    ["budgetCountryId", "nation", id => world.countries[id]?.name],
    ["countryId", "nation", id => world.countries[id]?.name],
    ["catalogId", "proposal", () => undefined],
  ];
  for (const [key, kind, label] of candidates) {
    const id = params[key];
    if (typeof id === "string" && id) return { kind, id, label: label(id) ?? id };
  }
  return undefined;
}

function buildActionOutcome(actionId: string, params: ExecuteActionParams,
  before: Record<string, number | string | null>, world: WorldState): ActionOutcome {
  const after = snapshotActionFields(world);
  const changes: ActionChange[] = [];
  for (const [field, label] of ACTION_FIELDS) {
    if (before[field] === after[field]) continue;
    const previous = before[field]; const next = after[field];
    changes.push({ field, label, before: previous, after: next,
      ...(typeof previous === "number" && typeof next === "number" ? { delta: next - previous } : {}) });
  }
  const entry = ACTION_CATALOG[actionId as ActionId];
  const readyTurn = world.player.actionCooldowns[actionId] ?? world.meta.turn;
  const followUps = readyTurn > world.meta.turn
    ? [`Available again on turn ${readyTurn}.`]
    : [`No cooldown. You can use ${entry?.name ?? actionId} again this turn.`];
  const target = actionTarget(params, world);
  return { actionId, changes, ...(target ? { target } : {}), followUps };
}

function projectWorld(world: WorldState, notifications: NotificationItem[]): GameView {
  const country = world.countries[world.player.countryId];
  if (!country || !country.playable) throw new Error("The save does not contain the player's playable country.");
  const player = world.player;
  return {
    turn: world.meta.turn, date: world.meta.date, era: world.meta.era,
    countryId: country.id, countryName: country.name,
    player: { name: player.name, cash: player.cash, funds: player.funds, actions: player.actions,
      influence: player.politicalInfluence, favorability: player.favorability,
      partyName: player.partyId ? world.parties[player.partyId]?.name ?? "Independent" : "Independent" },
    legislature: projectLegislature(world),
    finance: projectFinance(world),
    resources: projectResources(world),
    nation: projectNation(world),
    metrics: [
      { id: "gdp", label: "GDP", value: country.economy.gdp * 1_000_000, format: "money" },
      { id: "growth", label: "GDP growth", value: country.economy.growthRate, format: "percent" },
      { id: "inflation", label: "Inflation", value: country.economy.inflationRate, format: "percent" },
      { id: "unemployment", label: "Unemployment", value: country.economy.unemploymentRate, format: "percent" },
    ],
    parties: Object.values(world.parties).filter((party) => party.countryId === country.id).map((party) => ({
      id: party.id, name: party.name, abbreviation: party.abbreviation, color: party.color,
      members: party.memberCount, treasury: party.treasury, isPlayerParty: player.partyId === party.id,
      membership: projectPartyMembership(world, party.id),
    })),
    elections: projectElections(world),
    news: world.news.slice(-50).reverse().map((item, index) => ({ id: `${item.turn}:${index}`, title: item.headline, body: "", date: item.date })),
    actions: ACTIONS.map(({ id, requires, category, prerequisite }) => {
      const entry = ACTION_CATALOG[id];
      const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
      const fundCost = quoteFundCost(id, entry.fundCost, player.donorBaseLevel, cost);
      const cooldownTurns = Math.max(0, (player.actionCooldowns[id] ?? 0) - world.meta.turn);
      // Gate order mirrors executeAction validation; executeAction stays authoritative.
      const reason = entry.status === "unavailable" ? `Not yet available: requires the ${entry.blockingSystem ?? "unported system"} system.`
        : cooldownTurns > 0 ? `Available in ${cooldownTurns} ${cooldownTurns === 1 ? "turn" : "turns"}.`
        : player.actions < cost ? "Not enough action points."
        : fundCost > 0 && player.funds < fundCost ? `Not enough funds. Requires ${fundCost}.`
        : id === "fundraise" && !isFundraiseEligible(player.donorBaseLevel) ? "No donor base. Use Build Donor Network first."
        : id === "convertCash" && player.cash <= 0 ? "No cash to convert."
        : id === "leaveParty" && !player.partyId ? "You are independent." : undefined;
      return { id, name: entry.name, description: entry.description, cost, available: !reason,
        category, fundCost, cooldownTurns,
        ...(id === "fundraise" && isFundraiseEligible(player.donorBaseLevel) ? { fundsGain: fundraiseQuote(player.donorBaseLevel, player.politicalInfluence) } : {}),
        ...(requires ? { requires } : {}), ...(prerequisite ? { prerequisite } : {}),
        ...(reason ? { disabledReason: reason } : {}) };
    }),
    regions: Object.values(world.regions).filter((region) => region.countryId === country.id).map(({ id, name }) => ({ id, name })),
    notifications: toInbox(notifications),
    actionHistory: notifications.flatMap((item) => item.actionOutcome ? [{
      ...item.actionOutcome, id: item.id, turn: item.turn, date: item.date,
      title: item.title, message: item.body || item.title, destination: item.destination,
    }] : []),
  };
}

/** Display hints mirror the pinned engine; executeAction remains authoritative. */
function projectElections(world: WorldState): ElectionView[] {
  const player = world.player;
  const active = world.elections.find((e) => e.status !== "resolved" && e.candidates.some((c) => c.id === "player"));
  return world.elections.filter((e) => e.countryId === player.countryId)
    .sort((a, b) => Number(b.id === active?.id) - Number(a.id === active?.id)
      || Number(a.status === "resolved") - Number(b.status === "resolved")
      || (a.status === "resolved" ? b.endTurn - a.endTurn : a.primaryEndTurn - b.primaryEndTurn))
    .map((election) => {
      const playerCandidate = election.candidates.some((c) => c.id === "player");
      const id = playerCandidate ? "withdrawCandidacy" : "declareCandidacy";
      const entry = ACTION_CATALOG[id];
      const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
      const reason = election.status === "resolved" ? "This election has ended."
        : !playerCandidate && world.meta.turn > election.primaryEndTurn ? "Filing has closed."
        : !playerCandidate && !player.partyId ? "Join a party before filing."
        : !playerCandidate && active ? "Withdraw from your current race before filing for another."
        : (player.actionCooldowns[id] ?? 0) > world.meta.turn ? "Available after its cooldown."
        : player.actions < cost ? "Not enough action points." : undefined;
      const dateAt = (turn: number) => addDaysIso(world.meta.date, (turn - world.meta.turn) * 7);
      return {
        id: election.id,
        title: election.electionType.replaceAll("_", " ") + (election.state ? ` · ${election.state}` : ""),
        status: election.status, date: dateAt(election.endTurn), filingDate: dateAt(election.primaryEndTurn),
        phase: racePhase(world, election),
        playerCandidate, candidateNames: election.candidates.map((c) => c.name),
        winnerNames: (election.winners ?? []).map((id) => election.candidates.find((c) => c.id === id)?.name ?? world.politicians.find((p) => p.id === id)?.name ?? id),
        candidacy: { id, name: playerCandidate ? "Withdraw candidacy" : "Run for office", description: "", cost,
          available: !reason, ...(reason ? { disabledReason: reason } : {}) },
      };
    });
}


function homeCurrency(world: WorldState, countryId: string): string {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "XXX";
}

/** Display hints mirror the pinned engine; executeAction remains authoritative. */
function projectFinance(world: WorldState): FinanceView {
  const player = world.player;
  const savingsAction = (id: "depositSavings" | "withdrawSavings", empty: boolean, emptyReason: string): ActionView => {
    const entry = ACTION_CATALOG[id];
    const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const remaining = (player.actionCooldowns[id] ?? 0) - world.meta.turn;
    const reason = remaining > 0 ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
      : player.actions < cost ? "Not enough action points."
      : empty ? emptyReason : undefined;
    return { id, name: entry.name, description: entry.description, cost, available: !reason,
      requires: "amount", ...(reason ? { disabledReason: reason } : {}) };
  };
  return {
    cash: player.cash, savings: player.savings, currency: homeCurrency(world, player.countryId),
    savingsHolder: player.savingsHolder === "centralBank" ? "Central Bank"
      : world.corporations[player.savingsHolder]?.id ?? player.savingsHolder,
    holdings: Object.values(world.corporations).flatMap((corp) => {
      const entry = corp.shareholders.find((s) => s.holder === "player");
      if (!entry || entry.shares <= 0) return [];
      return [{ id: corp.id, name: corp.id, ticker: corp.tickerSymbol, shares: entry.shares,
        price: corp.sharePrice, currency: homeCurrency(world, corp.countryId) }];
    }),
    deposit: savingsAction("depositSavings", player.cash <= 0, "No cash to deposit."),
    withdraw: savingsAction("withdrawSavings", player.savings <= 0, "No savings to withdraw."),
  };
}

function projectLegislature(world: WorldState): LegislatureView {
  const player = world.player;
  const seat = player.legislativeSeat;
  const chamberName = (countryId: string, key: string) => world.legislatures[countryId]?.chambers.find((c) => c.key === key)?.name ?? key;
  const action = (id: "sponsorBill" | "voteOnBill", reason?: string): ActionView => {
    const entry = ACTION_CATALOG[id];
    const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
    const remaining = (player.actionCooldowns[id] ?? 0) - world.meta.turn;
    reason ??= remaining > 0 ? `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.`
      : player.actions < cost ? "Not enough action points." : undefined;
    return { id, name: entry.name, description: "", cost, available: !reason, ...(reason ? { disabledReason: reason } : {}) };
  };
  return {
    office: seat ? `${chamberName(seat.countryId, seat.chamberKey)} · ${world.countries[seat.countryId]?.name ?? seat.countryId}`
      : player.mode === "hos" ? "Head of state" : null,
    proposals: getCatalog(player.countryId, Number(world.meta.date.slice(0, 4)))
      .filter((entry) => entry.status === "available" && entry.kind !== "tax")
      .map(({ id, title, description }) => ({ id, title, description })),
    sponsor: action("sponsorBill", !seat && player.mode !== "hos" ? "Win a legislative seat before sponsoring a bill." : undefined),
    bills: world.bills.filter((bill) => bill.countryId === player.countryId)
      .sort((a, b) => b.proposedAtTurn - a.proposedAtTurn)
      .map((bill) => {
        const override = bill.status === "veto_override" || bill.status === "override_failed" || bill.overrideDisplaySnapshot != null;
        const other = !override && bill.currentChamber !== bill.originChamber;
        const votingOpen = ["active", "active_other", "veto_override"].includes(bill.status);
        const votes = other ? bill.otherChamberVotes : override ? bill.vetoOverrideVotes : bill.votes;
        const liveTally = { for: 0, against: 0, abstain: 0 };
        for (const vote of Object.values(votes ?? {})) liveTally[vote]++;
        const reason = !seat ? "Win a legislative seat before voting."
          : seat.countryId !== bill.countryId || seat.chamberKey !== bill.currentChamber ? "This bill is in another chamber."
          : !votingOpen ? "Voting is not open on this bill." : undefined;
        return { id: bill.id, title: bill.title, status: bill.status, chamber: chamberName(bill.countryId, bill.currentChamber), sponsorName: bill.sponsorName,
          votesFor: votingOpen ? liveTally.for : (other ? bill.otherChamberVotesFor : override ? bill.vetoOverrideVotesFor : bill.votesFor) ?? 0,
          votesAgainst: votingOpen ? liveTally.against : (other ? bill.otherChamberVotesAgainst : override ? bill.vetoOverrideVotesAgainst : bill.votesAgainst) ?? 0,
          votesAbstain: votingOpen ? liveTally.abstain : (other ? bill.otherChamberVotesAbstain : override ? 0 : bill.votesAbstain) ?? 0,
          playerVote: votes?.player ?? null, voting: action("voteOnBill", reason) };
      }),
  };
}
