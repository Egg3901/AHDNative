import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";
import { deserializeSave, serializeSave, projectSaveToV42 } from "../save.js";
import { advanceTurn } from "../engine.js";
import { runVoteAccumulation } from "../elections/orchestration.js";
import { rngFromSeed } from "../rng.js";

const source = JSON.parse(readFileSync(new URL("../../../../docs/fixtures/canvass-08820d1.json", import.meta.url), "utf8")) as {
  vectors: { candidate: { economicLean: number; socialLean: number }; audience: { economicLean: number; socialLean: number }; current: number; count: number; closing: boolean; after: number; legacyAfter: number; decayed: number }[];
};
const savedAt = "2026-10-01T00:00:00.000Z";
function setup(countryId = "US") {
  const world = createWorld({ era: "1953", countryId, playerName: "Canvasser", seed: "demographic-canvass" });
  const regionId = world.player.homeRegionId!;
  const category = world.demographicCategories[countryId]![0]!;
  const group = category.groups[0]!;
  return { world, regionId, demographicCategory: category._id, demographicGroup: group.id };
}

describe("standalone source canvassing through execute/save/turn", () => {
  it.each(source.vectors)("uses source batch and directional headroom %#", vector => {
    const { world, ...target } = setup();
    world.player.policies = { economic: vector.candidate.economicLean, social: vector.candidate.socialLean };
    world.demographicCategories.US = structuredClone(world.demographicCategories.US!);
    const definition = world.demographicCategories.US[0]!.groups.find(group => group.id === target.demographicGroup)!;
    definition.defaultEconomicLean = vector.audience.economicLean;
    definition.defaultSocialLean = vector.audience.socialLean;
    const row = world.stateDemographics[target.regionId]!.groups[target.demographicGroup]!;
    row.economicLean = vector.audience.economicLean;
    row.socialLean = vector.audience.socialLean;
    world.regionTurnouts[target.regionId]!.modifiers = { [target.demographicCategory]: { [target.demographicGroup]: vector.current } };
    if (vector.closing) {
      world.elections.push({ id: "canvass-season", electionType: "governor", countryId: "US", state: target.regionId, cycle: 1, status: "active", startTurn: 0, primaryEndTurn: 0, endTurn: 4, totalSeats: 1, chamberKey: "governor", candidates: [], tally: {} });
    }
    world.player.actions = 100;
    const before = { actions: world.player.actions, funds: world.player.funds };
    const result = executeAction(world, "player", "canvass", { ...target, count: vector.count });
    expect(result.ok).toBe(true);
    expect(world.player.actions).toBe(before.actions - vector.count);
    expect(world.player.funds).toBe(before.funds - 100 * vector.count);
    const turnout = world.regionTurnouts[target.regionId]! as typeof world.regionTurnouts[string] & { campaignModifiers?: Record<string, Record<string, number>> };
    expect(turnout.campaignModifiers?.[target.demographicCategory]?.[target.demographicGroup]).toBeCloseTo(vector.after, 12);
    expect(turnout.modifiers[target.demographicCategory]?.[target.demographicGroup]).toBeCloseTo(vector.legacyAfter, 12);
    const loaded = deserializeSave(serializeSave(world, savedAt));
    expect(loaded.regionTurnouts[target.regionId]).toEqual(world.regionTurnouts[target.regionId]);
    advanceTurn(loaded);
    expect(loaded.regionTurnouts[target.regionId]!.campaignModifiers?.[target.demographicCategory]?.[target.demographicGroup]).toBeCloseTo(vector.decayed, 12);
  });

  it("requires a chosen demographic and refuses arbitrary domestic regions atomically", () => {
    const { world, ...target } = setup();
    const before = serializeSave(world, savedAt);
    expect(executeAction(world, "player", "canvass", { regionId: target.regionId }).ok).toBe(false);
    const elsewhere = Object.values(world.regions).find(region => region.countryId === "US" && region.id !== target.regionId)!;
    expect(executeAction(world, "player", "canvass", { ...target, regionId: elsewhere.id }).ok).toBe(false);
    expect(executeAction(world, "player", "canvass", { ...target, demographicGroup: "unknown" }).ok).toBe(false);
    for (const count of [0, -1, 1.5, 51, NaN, Infinity]) {
      expect(executeAction(world, "player", "canvass", { ...target, count }).ok).toBe(false);
    }
    expect(serializeSave(world, savedAt)).toBe(before);
  });

  it("charges frozen home currency for the complete batch and refuses underfunding", () => {
    const { world, ...target } = setup("UK");
    const before = world.player.funds;
    expect(executeAction(world, "player", "canvass", { ...target, count: 3 }).ok).toBe(true);
    expect(world.player.funds).toBe(before - 225);
    world.player.funds = 74;
    const snapshot = serializeSave(world, savedAt);
    expect(executeAction(world, "player", "canvass", target).ok).toBe(false);
    expect(serializeSave(world, savedAt)).toBe(snapshot);
  });

  it("rejects corrupt modern turnout saves and refuses a lossy v42 export", () => {
    const { world, ...target } = setup();
    expect(executeAction(world, "player", "canvass", target).ok).toBe(true);
    const raw = serializeSave(world, savedAt);
    expect(projectSaveToV42(raw)).toMatchObject({ ok: false, error: expect.stringContaining("campaignModifiers") });
    for (const value of [null, [], { age: [] }, { age: { voters: "1" } }, { age: { voters: 21 } }]) {
      const corrupt = JSON.parse(raw);
      corrupt.world.regionTurnouts[target.regionId].campaignModifiers = value;
      expect(() => deserializeSave(JSON.stringify(corrupt))).toThrow(/campaignModifiers/);
    }
  });

  it("changes the home electorate once, decays on turns and resumes deterministically", () => {
    const { world, ...target } = setup();
    const dem = world.politicians.find(pol => pol.countryId === "US" && pol.partyId === "US_DEM")!;
    const rep = world.politicians.find(pol => pol.countryId === "US" && pol.partyId === "US_REP")!;
    world.meta.turn = 6;
    world.elections = [{ id: "canvass-house", electionType: "house", countryId: "US", state: target.regionId, cycle: 1, status: "active", startTurn: 0, primaryEndTurn: 5, endTurn: 20, totalSeats: 1, chamberKey: "house",
      candidates: [dem, rep].map(pol => ({ id: pol.id, name: pol.name, partyId: pol.partyId, isNPP: true, incumbent: false })), tally: {},
      primaryResults: { byParty: Object.fromEntries([dem, rep].map(pol => [pol.partyId, [{ candidateId: pol.id, candidateName: pol.name, score: 20, sharePct: 100, won: true }]])), recordedAt: savedAt } }];
    const control = deserializeSave(serializeSave(world, savedAt));
    expect(executeAction(world, "player", "canvass", { ...target, count: 10 }).ok).toBe(true);
    runVoteAccumulation(control, rngFromSeed("canvass-tally"));
    runVoteAccumulation(world, rngFromSeed("canvass-tally"));
    const sum = (tally: Record<string, number>) => Object.values(tally).reduce((a, b) => a + b, 0);
    expect(sum(world.elections[0]!.tally)).toBeGreaterThan(sum(control.elections[0]!.tally));
    const loaded = deserializeSave(serializeSave(world, savedAt));
    advanceTurn(world); advanceTurn(loaded);
    expect(serializeSave(loaded, savedAt)).toBe(serializeSave(world, savedAt));
  });
});
