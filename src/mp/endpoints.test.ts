import { describe, expect, it } from "vitest";
import { MP_EXECUTE_ACTIONS, MP_ORIGIN } from "./endpoints";

/**
 * Pins the nine action names/descriptions to the audited AHDGame catalog
 * (src/lib/actions.ts at e364c0495). The UI renders these into button labels
 * and aria descriptions, so drift here is player-visible copy drift.
 */
describe("MP_EXECUTE_ACTIONS audit pin", () => {
  it("matches the nine server action names and descriptions exactly", () => {
    expect(MP_EXECUTE_ACTIONS).toEqual([
      { type: "fundraise", name: "Fundraise", description: "Raise money from your donor base" },
      {
        type: "campaign",
        name: "Campaign",
        description:
          "Increase your political influence — up to +1%, with diminishing returns above 50% (cost scales with current influence and state GDP)",
      },
      {
        type: "advertise",
        name: "Run Advertisements",
        description: "Run ads to boost your favorability rating",
      },
      {
        type: "buildDonorBase",
        name: "Build Donor Network",
        description: "Expand your donor base to increase fundraising effectiveness",
      },
      {
        type: "poll",
        name: "Quick Poll",
        description:
          "Commission a quick poll — see your topline appeal and best/worst demographic groups ($25,000)",
      },
      {
        type: "pollLarge",
        name: "Full Demographic Poll",
        description:
          "Commission a comprehensive poll — full breakdown across every demographic group and category ($75,000)",
      },
      {
        type: "convertCash",
        name: "Personal Campaign Donation",
        description:
          "Convert personal cash on hand into campaign funds at a 50% rate (infamy scales with amount)",
      },
      { type: "rest", name: "Rest", description: "Take a break (does nothing)" },
      {
        type: "debatePrep",
        name: "Debate Prep",
        description:
          "Study briefing books and rehearse. 10% chance to raise your Debate skill by 1. No fund cost.",
      },
    ]);
  });

  it("keeps the bridge pinned to the exact live-site origin", () => {
    expect(MP_ORIGIN).toBe("https://ahousedividedgame.com");
  });
});
