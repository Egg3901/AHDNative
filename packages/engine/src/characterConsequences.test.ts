import { describe, expect, it } from "vitest";
import { createWorld } from "./world.js";
import { executeAction } from "./actions/execute.js";
import { fundraiseYield } from "./actions/fundGeneration.js";
import { energyActionLimits } from "./actions/officeBonus.js";
import { STAT_KEYS, type CharacterStats } from "./stats/characterStats.js";
import { nearestParty, alignmentBand } from "./alignment/policyAlignment.js";

const base = { era: "1953", countryId: "US", playerName: "Alex", seed: "native-consequence" } as const;

/** A legal 28-point build: every stat at 4 (7 x 4 = 28). */
function evenBuild(): CharacterStats {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 4])) as CharacterStats;
}

/**
 * A legal 28-point build with `spiked` raised to 10 and the other six lowered
 * to 3 (10 + 6x3 = 28). Keeps the total contract exact.
 */
function spikedBuild(spiked: (typeof STAT_KEYS)[number]): CharacterStats {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 3])) as CharacterStats;
  stats[spiked] = 10;
  return stats;
}

function runCampaign(stats: CharacterStats): number {
  const world = createWorld({ ...base, stats, homeRegionId: "NY" });
  // Campaign costs campaign funds, which a fresh player has none of; fund the
  // fixture directly so the measured delta is the outcome only.
  world.player.funds = 1_000_000;
  const before = world.player.politicalInfluence;
  const result = executeAction(world, "player", "campaign", { regionId: "NY" });
  expect(result.ok).toBe(true);
  return world.player.politicalInfluence - before;
}

describe("creation consequences are observable through the public contract (#242)", () => {
  it("charisma scales the campaign political-influence outcome", () => {
    const highGain = runCampaign(spikedBuild("charisma"));
    const lowGain = runCampaign(spikedBuild("fundraising"));
    expect(STAT_KEYS.reduce((s, k) => s + spikedBuild("charisma")[k], 0)).toBe(28);
    expect(highGain).toBeGreaterThan(lowGain);
  });

  it("fundraising scales the fundraise yield, neutral when no stats are allocated", () => {
    const neutral = fundraiseYield(50, 50);
    const high = fundraiseYield(50, 50, { fundraising: 10 });
    const low = fundraiseYield(50, 50, { fundraising: 1 });
    expect(high).toBeGreaterThan(neutral);
    expect(low).toBeLessThan(neutral);
  });

  it("energy scales the action cap through the existing public boundary", () => {
    expect(energyActionLimits(10).cap).toBeGreaterThan(energyActionLimits(1).cap);
  });

  it("compass position drives party closeness at creation", () => {
    const parties = [
      { id: "US_DEM", economic: -3, social: -2 },
      { id: "US_REP", economic: 3, social: 2 },
    ];
    const closest = nearestParty({ economic: -2.5, social: -1.5 }, parties);
    expect(closest?.party.id).toBe("US_DEM");
    expect(alignmentBand(closest!.distance)).toBe("aligned");

    const world = createWorld({ ...base, policies: { economic: -2.5, social: -1.5 } });
    expect(world.player.policies).toEqual({ economic: -2.5, social: -1.5 });
  });

  it("a full spread of stats stays legal and observable", () => {
    const world = createWorld({ ...base, stats: evenBuild() });
    expect(world.player.stats).toEqual(evenBuild());
  });
});
