import {
  ACTION_CATALOG, addDaysIso, advanceTurn, createWorld, deserializeSave, executeAction,
  getActionCost, getCatalog, listEras, listPlayableCountries, serializeSave,
  type ActionId, type ExecuteActionParams, type WorldState,
} from "@ahdclient/engine";
import type { ActionView, ElectionView, EraChoice, FinanceView, GameView, LegislatureView, NewGameOptions } from "./types";

const ACTIONS: { id: ActionId; requires?: ActionView["requires"] }[] = [
  { id: "convertCash", requires: "amount" }, { id: "fundraise" }, { id: "buildDonorBase" },
  { id: "campaign", requires: "region" }, { id: "advertise" }, { id: "canvass", requires: "region" },
  { id: "joinParty", requires: "party" }, { id: "leaveParty" },
];

export function gameChoices(): EraChoice[] {
  return listEras().map((era) => ({ id: era.id, label: era.label, countries: listPlayableCountries(era.id) }));
}

/** Owns mutable engine state; only detached display data and save strings cross the boundary. */
export class GameSession {
  private world?: WorldState;

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
    return this.commit(createWorld({ ...options, playerName: options.playerName.trim() }));
  }

  act(actionId: string, params: ExecuteActionParams = {}) {
    const candidate = structuredClone(this.requireWorld());
    const result = executeAction(candidate, "player", actionId, params);
    if (result.ok) this.commit(candidate);
    return result;
  }

  advance(): GameView {
    // The engine mutates in place. Commit only a completed turn so phase failures
    // cannot leave the active session partially advanced. Profile this copy cost.
    const candidate = structuredClone(this.requireWorld());
    advanceTurn(candidate);
    return this.commit(candidate);
  }

  serialize(savedAt: string): string {
    return serializeSave(this.requireWorld(), savedAt);
  }

  load(contents: string): GameView {
    return this.commit(deserializeSave(contents));
  }

  view(): GameView { return projectWorld(this.requireWorld()); }

  private requireWorld(): WorldState {
    if (!this.world) throw new Error("Start or load a game first.");
    return this.world;
  }

  private commit(candidate: WorldState): GameView {
    const view = projectWorld(candidate);
    this.world = candidate;
    return view;
  }
}

function projectWorld(world: WorldState): GameView {
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
    metrics: [
      { id: "gdp", label: "GDP", value: country.economy.gdp * 1_000_000, format: "money" },
      { id: "growth", label: "GDP growth", value: country.economy.growthRate, format: "percent" },
      { id: "inflation", label: "Inflation", value: country.economy.inflationRate, format: "percent" },
      { id: "unemployment", label: "Unemployment", value: country.economy.unemploymentRate, format: "percent" },
    ],
    parties: Object.values(world.parties).filter((party) => party.countryId === country.id).map((party) => ({
      id: party.id, name: party.name, abbreviation: party.abbreviation, color: party.color,
      members: party.memberCount, treasury: party.treasury, isPlayerParty: player.partyId === party.id,
    })),
    elections: projectElections(world),
    news: world.news.slice(-50).reverse().map((item, index) => ({ id: `${item.turn}:${index}`, title: item.headline, body: "", date: item.date })),
    actions: ACTIONS.map(({ id, requires }) => {
      const entry = ACTION_CATALOG[id];
      const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
      const cooldown = (player.actionCooldowns[id] ?? 0) > world.meta.turn;
      const reason = cooldown ? "Available after its cooldown." : player.actions < cost ? "Not enough action points."
        : id === "leaveParty" && !player.partyId ? "You are independent." : undefined;
      return { id, name: entry.name, description: entry.description, cost, available: !reason,
        ...(requires ? { requires } : {}), ...(reason ? { disabledReason: reason } : {}) };
    }),
    regions: Object.values(world.regions).filter((region) => region.countryId === country.id).map(({ id, name }) => ({ id, name })),
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
