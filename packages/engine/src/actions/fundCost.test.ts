import { describe, expect, it } from "vitest";
import { actionFundCost } from "./fundCost.js";
import { executeAction } from "./execute.js";
import { createWorld } from "../world.js";
import { statMultiplier } from "../stats/characterStats.js";

const base = { era: "1953", countryId: "US", playerName: "Alex", seed: "native-fund-cost" } as const;

/** A legal 28-point build: six stats at 3, the named one raised to 10 (18 + 10). */
function spiked(spiked: string) {
  const stats = { charisma: 3, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 3 } as Record<string, number>;
  stats[spiked] = 10;
  return stats;
}

describe("action fund cost shares one stat-scaled source (#242)", () => {
  it("scales the campaign fund cost by Intellect, like the reference effect", () => {
    const neutral = actionFundCost({ actionId: "campaign", actionCost: 1, donorBaseLevel: 0, catalogFundCost: 20_000 });
    const high = actionFundCost({ actionId: "campaign", actionCost: 1, donorBaseLevel: 0, stats: { intellect: 10 }, catalogFundCost: 20_000 });
    expect(neutral).toBe(20_000);
    expect(high).toBe(Math.round(20_000 / statMultiplier(10)));
    expect(high).toBeLessThan(neutral);
  });

  it("does not scale the advertise fund cost by Intellect (reference has no hook there)", () => {
    const neutral = actionFundCost({ actionId: "advertise", actionCost: 7, donorBaseLevel: 0, catalogFundCost: 100_000 });
    const high = actionFundCost({ actionId: "advertise", actionCost: 7, donorBaseLevel: 0, stats: { intellect: 10 }, catalogFundCost: 100_000 });
    expect(neutral).toBe(140_000);
    expect(high).toBe(140_000);
  });

  it("scales the buildDonorBase fund cost by Fundraising, like the reference effect", () => {
    const neutral = actionFundCost({ actionId: "buildDonorBase", actionCost: 4, donorBaseLevel: 0, catalogFundCost: 3_000 });
    const high = actionFundCost({ actionId: "buildDonorBase", actionCost: 4, donorBaseLevel: 0, stats: { fundraising: 10 }, catalogFundCost: 3_000 });
    expect(neutral).toBe(3_000);
    expect(high).toBe(Math.round(3_000 / statMultiplier(10)));
  });

  it("scales polling by Intellect and frozen campaign currency", () => {
    expect(actionFundCost({ actionId: "poll", actionCost: 2, donorBaseLevel: 0, stats: { intellect: 10 }, catalogFundCost: 25_000, countryId: "UK" }))
      .toBe(Math.round(Math.round(25_000 / statMultiplier(10)) * 0.75));
    expect(actionFundCost({ actionId: "pollLarge", actionCost: 6, donorBaseLevel: 0, stats: { intellect: 1 }, catalogFundCost: 75_000, countryId: "RU" }))
      .toBe(Math.round(Math.round(75_000 / statMultiplier(1)) * 2.22));
  });
});

describe("executeAction charges exactly the quoted campaign cost (#242)", () => {
  it("charges the high-Intellect campaign cost the quote advertises, at the affordability edge", () => {
    const stats = spiked("intellect");
    const world = createWorld({ ...base, homeRegionId: "NY", stats });
    const quoted = actionFundCost({ actionId: "campaign", actionCost: 1, donorBaseLevel: 0, stats, catalogFundCost: 20_000 });
    // Fund the exact quote: the charge must not exceed it, or the edge attempt fails.
    world.player.funds = quoted;
    const before = world.player.funds;
    const result = executeAction(world, "player", "campaign", { regionId: "NY" });
    expect(result.ok).toBe(true);
    expect(before - world.player.funds).toBe(quoted);
    expect(quoted).toBe(Math.round(20_000 / statMultiplier(10)));
  });

  it("rejects the campaign one unit under the quoted cost", () => {
    const stats = spiked("intellect");
    const world = createWorld({ ...base, homeRegionId: "NY", stats });
    const quoted = actionFundCost({ actionId: "campaign", actionCost: 1, donorBaseLevel: 0, stats, catalogFundCost: 20_000 });
    world.player.funds = quoted - 1;
    expect(executeAction(world, "player", "campaign", { regionId: "NY" }).ok).toBe(false);
  });

  it("does not discount advertise with Intellect", () => {
    const world = createWorld({ ...base, homeRegionId: "NY", stats: spiked("intellect") });
    world.player.funds = 1_000_000;
    const before = world.player.funds;
    const result = executeAction(world, "player", "advertise");
    expect(result.ok).toBe(true);
    expect(before - world.player.funds).toBe(140_000);
  });

  it("charges the Fundraising-scaled buildDonorBase cost", () => {
    const stats = spiked("fundraising");
    const world = createWorld({ ...base, homeRegionId: "NY", stats });
    expect(world.player.donorBaseLevel).toBe(1);
    const quoted = actionFundCost({
      actionId: "buildDonorBase",
      actionCost: 4,
      donorBaseLevel: world.player.donorBaseLevel,
      stats,
      catalogFundCost: 3_000,
    });
    world.player.funds = 1_000_000;
    const before = world.player.funds;
    const result = executeAction(world, "player", "buildDonorBase");
    expect(result.ok).toBe(true);
    expect(world.player.donorBaseLevel).toBe(2);
    expect(quoted).toBe(Math.round(5_000 / statMultiplier(10)));
    expect(before - world.player.funds).toBe(quoted);
  });
});
