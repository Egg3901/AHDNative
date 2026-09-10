import {
  ACTION_CATALOG, addDaysIso, advanceTurn, createWorld, deserializeSave, executeAction,
  getActionCost, listEras, listPlayableCountries, serializeSave,
  type ActionId, type ExecuteActionParams, type WorldState,
} from "@ahdclient/engine";
import type { ActionView, ElectionView, EraChoice, GameView, NewGameOptions } from "./types";

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
