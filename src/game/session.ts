import {
  ACTION_CATALOG, addDaysIso, advanceTurn, createWorld, deserializeSave, executeAction,
  getActionCost, listEras, listPlayableCountries, serializeSave,
  type ActionId, type ExecuteActionParams, type WorldState,
} from "@ahdclient/engine";
import type { ActionView, EraChoice, GameView, NewGameOptions } from "./types";

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
    elections: world.elections.filter((election) => election.countryId === country.id)
      .sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || b.endTurn - a.endTurn)
      .slice(0, 40).map((election) => ({ id: election.id,
        title: election.electionType.replaceAll("_", " ") + (election.state ? ` · ${election.state}` : ""),
        status: election.status, date: addDaysIso(world.meta.date, (election.endTurn - world.meta.turn) * 7) })),
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
