import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { campaignKey } from "./lifecycle.js";
import { realAccumulate } from "../elections/tallyAdapter.js";
import { executeAction } from "../actions/execute.js";
import {
  campaignStrengthContributionActions,
  campaignStrengthContributionCost,
} from "./campaignStrength.js";

/**
 * #68: campaign strength through the public engine boundary
 * (createWorld / executeAction / advanceTurn / serializeSave / realAccumulate),
 * plus the vote-accumulation no-op + presidential-only guarantees.
 */

const OPTS = { seed: "campaign-strength", playerName: "Tester", countryId: "US", era: "1953" } as const;
const SERIALIZED_AT = "2026-09-11T00:00:00.000Z";

function joinParty(world: ReturnType<typeof createWorld>): void {
  expect(executeAction(world, "player", "joinParty", { partyId: "US_DEM" }).ok).toBe(true);
}

/** File in the first open US president race, advancing turns as needed. */
function setupFiledPresidentRace() {
  const world = createWorld(OPTS);
  joinParty(world);
  for (let i = 0; i < 300; i += 1) {
    const race = world.elections.find(
      (e) =>
        e.status !== "resolved" &&
        e.countryId === "US" &&
        e.electionType === "president" &&
        world.meta.turn < e.primaryEndTurn &&
        !e.candidates.some((c) => c.id === "player"),
    );
    if (race) {
      expect(executeAction(world, "player", "declareCandidacy", { electionId: race.id }).ok).toBe(true);
      return { world, race };
    }
    advanceTurn(world);
  }
  throw new Error("no open US president race within 300 turns");
}

/** File in the first open US house race, advancing turns as needed (down-ballot control). */
function setupFiledHouseRace() {
  const world = createWorld(OPTS);
  joinParty(world);
  for (let i = 0; i < 300; i += 1) {
    const race = world.elections.find(
      (e) =>
        e.status !== "resolved" &&
        e.countryId === "US" &&
        e.electionType === "house" &&
        world.meta.turn < e.primaryEndTurn &&
        e.candidates.some((c) => c.partyId === "US_DEM") &&
        !e.candidates.some((c) => c.id === "player"),
    );
    if (race) {
      expect(executeAction(world, "player", "declareCandidacy", { electionId: race.id }).ok).toBe(true);
      return { world, race };
    }
    advanceTurn(world);
  }
  throw new Error("no open US house race within 300 turns");
}

describe("campaignContribute (player action)", () => {
  it("adds strength to the player's own campaign, debiting funds and actions atomically, and survives save/reload", () => {
    const { world, race } = setupFiledPresidentRace();
    const key = campaignKey(race.id, "player");
    const campaign = world.campaigns[key]!;
    expect(campaign.campaignStrength).toBe(0);

    world.player.actions = 50;
    world.player.funds = 1_000_000;
    const strengthAdded = 600;
    const expectedCost = campaignStrengthContributionCost(0, strengthAdded); // US rate = 1
    const expectedActions = campaignStrengthContributionActions(strengthAdded);
    expect(expectedActions).toBe(2);

    const beforeActions = world.player.actions;
    const beforeFunds = world.player.funds;

    const res = executeAction(world, "player", "campaignContribute", {
      electionId: race.id,
      strengthAdded,
    });
    expect(res.ok).toBe(true);

    expect(campaign.campaignStrength).toBeCloseTo(strengthAdded, 6);
    expect(world.player.funds).toBeCloseTo(beforeFunds - expectedCost, 4);
    expect(world.player.actions).toBe(beforeActions - expectedActions);

    const reloaded = deserializeSave(serializeSave(world, SERIALIZED_AT));
    expect(reloaded.campaigns[key]!.campaignStrength).toBeCloseTo(strengthAdded, 6);
  });

  it("rejects an unaffordable contribution without touching any state", () => {
    const { world, race } = setupFiledPresidentRace();
    const key = campaignKey(race.id, "player");
    const campaign = world.campaigns[key]!;
    world.player.actions = 50;
    world.player.funds = 0; // cannot cover any positive contribution
    const before = { actions: world.player.actions, funds: world.player.funds, cs: campaign.campaignStrength };

    const res = executeAction(world, "player", "campaignContribute", {
      electionId: race.id,
      strengthAdded: 600,
    });
    expect(res.ok).toBe(false);
    expect(campaign.campaignStrength).toBe(before.cs);
    expect(world.player.funds).toBe(before.funds);
    expect(world.player.actions).toBe(before.actions);

    // Invalid strengthAdded is likewise charged nothing.
    expect(
      executeAction(world, "player", "campaignContribute", { electionId: race.id, strengthAdded: 0 }).ok,
    ).toBe(false);
    expect(
      executeAction(world, "player", "campaignContribute", { electionId: race.id, strengthAdded: -5 }).ok,
    ).toBe(false);
    expect(campaign.campaignStrength).toBe(before.cs);
  });

  it("refuses contributions to a race the player cannot gain strength in", () => {
    const { world } = setupFiledHouseRace();
    const houseRace = world.elections.find(
      (e) => e.electionType === "house" && e.candidates.some((c) => c.id === "player"),
    )!;
    world.player.funds = 10_000_000;
    world.player.actions = 50;
    const before = { funds: world.player.funds, actions: world.player.actions };

    // Down-ballot races are rejected before any debit (reference UI-honesty gate).
    const res = executeAction(world, "player", "campaignContribute", {
      electionId: houseRace.id,
      strengthAdded: 600,
    });
    expect(res.ok).toBe(false);
    expect(world.player.funds).toBe(before.funds);
    expect(world.player.actions).toBe(before.actions);

    // Unknown election is rejected too.
    expect(
      executeAction(world, "player", "campaignContribute", { electionId: "nope", strengthAdded: 600 }).ok,
    ).toBe(false);
  });
});

describe("campaign strength at vote accumulation", () => {
  it("is a strict no-op at strength 0 (identical tallies)", () => {
    const { world, race } = setupFiledPresidentRace();
    const key = campaignKey(race.id, "player");
    world.meta.turn = race.primaryEndTurn; // deterministically in the general phase

    const baseline = deserializeSave(serializeSave(world, SERIALIZED_AT));
    const baseRace = baseline.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(baseline, rngFromSeed("cs-zero"), baseRace)).toBe(true);

    const zero = deserializeSave(serializeSave(world, SERIALIZED_AT));
    zero.campaigns[key]!.campaignStrength = 0;
    const zeroRace = zero.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(zero, rngFromSeed("cs-zero"), zeroRace)).toBe(true);

    expect(zeroRace.tally).toEqual(baseRace.tally);
    expect(Object.values(baseRace.tally).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("boosts only the contributing candidate in a presidential general", () => {
    const { world, race } = setupFiledPresidentRace();
    const key = campaignKey(race.id, "player");
    world.meta.turn = race.primaryEndTurn;

    const baseline = deserializeSave(serializeSave(world, SERIALIZED_AT));
    const baseRace = baseline.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(baseline, rngFromSeed("cs-boost"), baseRace)).toBe(true);

    const boosted = deserializeSave(serializeSave(world, SERIALIZED_AT));
    boosted.campaigns[key]!.campaignStrength = 100_000;
    const boostedRace = boosted.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(boosted, rngFromSeed("cs-boost"), boostedRace)).toBe(true);

    expect(boostedRace.tally["player"] ?? 0).toBeGreaterThan(baseRace.tally["player"] ?? 0);
    // Every other candidate's tally is untouched (only the contributing
    // candidate carries strength).
    for (const [candId, votes] of Object.entries(baseRace.tally)) {
      if (candId === "player") continue;
      expect(boostedRace.tally[candId]).toBe(votes);
    }
  });

  it("does not apply the multiplier to down-ballot races", () => {
    const { world, race } = setupFiledHouseRace();
    const key = campaignKey(race.id, "player");
    world.meta.turn = race.primaryEndTurn;

    const baseline = deserializeSave(serializeSave(world, SERIALIZED_AT));
    const baseRace = baseline.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(baseline, rngFromSeed("cs-house"), baseRace)).toBe(true);

    const boosted = deserializeSave(serializeSave(world, SERIALIZED_AT));
    boosted.campaigns[key]!.campaignStrength = 100_000;
    const boostedRace = boosted.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(boosted, rngFromSeed("cs-house"), boostedRace)).toBe(true);

    expect(boostedRace.tally).toEqual(baseRace.tally);
  });
});
