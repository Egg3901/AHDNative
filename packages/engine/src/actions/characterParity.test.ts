import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";
import { serializeSave, deserializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import { readFileSync } from "node:fs";
type Quote = { apCost: number; fundCostAnchor: number };
const reference: { vectors: Array<{ countryId: string; era: string; scale: number; target: { gdpMillions: number; population: number }; campaign: Quote; advertise: Quote; donor: Quote }> } =
  JSON.parse(readFileSync(new URL("../../../../docs/fixtures/character-actions-08820d1.json", import.meta.url), "utf8"));

describe("current Game character actions through the public engine (#91)", () => {
  it.each(reference.vectors)("matches independently executed GDP quotes for $countryId/$era at $scale baseline", vector => {
    const world = createWorld({ era: vector.era, countryId: vector.countryId, playerName: "Quoted", seed: "quote-matrix",
      stats: { charisma: 10, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 3 } });
    const home = world.regions[world.player.homeRegionId!]!;
    home.gdp = vector.target.gdpMillions;
    home.population = vector.target.population;
    const rate = ({ US: 1, UK: 0.75, RU: 2.22, DD: 2.22, IE: 0.92, CN: 7.2 } as Record<string, number>)[vector.countryId]!;
    for (const [actionId, quote] of [["campaign", vector.campaign], ["advertise", vector.advertise], ["buildDonorBase", vector.donor]] as const) {
      world.player.actions = 100;
      world.player.funds = 10_000_000;
      world.player.politicalInfluence = 65;
      world.player.favorability = 75;
      world.player.donorBaseLevel = 4;
      if (actionId === "buildDonorBase") world.player.stats = { charisma: 3, debate: 3, energy: 3, fundraising: 10, businessAcumen: 3, statecraft: 3, intellect: 3 };
      expect(executeAction(world, "player", actionId)).toMatchObject({ ok: true,
        changes: { actions: -quote.apCost, funds: -Math.round(quote.fundCostAnchor * rate) } });
    }
  });
  it("consumes the source 72-hour Debate windows on the saved offline turn clock", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Debater", seed: "debate-clock",
      stats: { charisma: 3, debate: 10, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 3 } });
    world.meta.turn = 71;
    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    advanceTurn(loaded);
    expect(loaded.player.stats?.debate).toBe(9);
    advanceTurn(loaded);
    expect(loaded.player.stats?.debate).toBe(9);
    // Legacy date anchors do not accrue a synthetic debt on first adoption.
    const legacy = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    delete legacy.world.player.debateDecayAnchorTurn;
    const migrated = deserializeSave(JSON.stringify(legacy));
    advanceTurn(migrated);
    expect(migrated.player.stats?.debate).toBe(10);
  });
  it("charges UK campaign GDP pricing in frozen home currency and continues after reload", () => {
    const world = createWorld({ era: "1979", countryId: "UK", playerName: "Campaigner", seed: "character-parity",
      stats: { charisma: 10, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 3 } });
    const home = world.regions[world.player.homeRegionId!];
    expect(home).toBeDefined();
    home!.gdp = 2189.5;
    home!.population = 1_000_000;
    world.player.politicalInfluence = 65;
    world.player.actions = 50;
    world.player.funds = 90833;
    // Actual Game quote at 08820d1: 121111 anchor, 0.944 PI, four AP.
    // Its frozen GBP conversion rounds 121111 * 0.75 to 90833.
    expect(executeAction(world, "player", "campaign", { regionId: home!.id })).toMatchObject({ ok: true });
    expect(world.player.funds).toBe(0);
    expect(world.player.actions).toBe(46);
    expect(world.player.politicalInfluence).toBeCloseTo(65.944, 12);
    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    advanceTurn(world);
    advanceTurn(loaded);
    expect(serializeSave(loaded, "2026-10-01T00:00:00.000Z")).toBe(serializeSave(world, "2026-10-01T00:00:00.000Z"));
  });
  it("accrues successful action XP and flushes it once after a saved turn", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Donor", seed: "character-xp",
      stats: { charisma: 3, debate: 3, energy: 3, fundraising: 10, businessAcumen: 3, statecraft: 3, intellect: 3 } });
    world.player.donorBaseLevel = 50;
    world.player.politicalInfluence = 50;
    world.player.funds = 0;
    expect(executeAction(world, "player", "fundraise")).toMatchObject({ ok: true });
    // Game command source writes 0.03 to fundraising and Energy per success.
    expect(world.player.statXp).toEqual({ fundraising: 0.03, energy: 0.03 });
    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    advanceTurn(loaded);
    expect(loaded.player.stats?.energy).toBe(3.03);
    expect(loaded.player.stats?.fundraising).toBe(10);
    expect(loaded.player.stats?.charisma).toBe(3);
    expect(loaded.player.statXp).toEqual({});
    advanceTurn(loaded);
    expect(loaded.player.stats?.energy).toBe(3.03);
  });
  it.each(["campaign", "advertise", "buildDonorBase", "poll", "pollLarge"])("refuses %s on an unallocated old save without charging resources", action => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Legacy", seed: "statless-action" });
    delete world.player.stats;
    delete world.player.statsAllocated;
    world.player.actions = 50;
    world.player.funds = 1_000_000;
    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    const before = serializeSave(loaded, "2026-10-01T00:00:00.000Z");
    expect(executeAction(loaded, "player", action)).toMatchObject({ ok: false, error: expect.stringContaining("allocated") });
    expect(serializeSave(loaded, "2026-10-01T00:00:00.000Z")).toBe(before);
  });
  it("returns the exact conversion effects and refuses an invalid amount atomically", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Donor", seed: "structured-action" });
    world.player.cash = 100_000;
    world.player.funds = 0;
    world.player.infamy = 0;
    world.player.actions = 10;
    const before = serializeSave(world, "2026-10-01T00:00:00.000Z");
    expect(executeAction(world, "player", "convertCash", { amount: Number.NaN })).toMatchObject({ ok: false });
    expect(serializeSave(world, "2026-10-01T00:00:00.000Z")).toBe(before);
    // Independently executed Game conversion quote: 2 AP, half cash, 4 infamy.
    expect(executeAction(world, "player", "convertCash", { amount: 100_000 })).toMatchObject({
      ok: true, changes: { actions: -2, cash: -100_000, funds: 50_000, infamy: 4 },
    });
  });
});
