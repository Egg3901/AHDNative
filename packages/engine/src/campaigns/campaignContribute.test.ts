import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { campaignKey, ensureCampaign } from "./lifecycle.js";
import { realAccumulate } from "../elections/tallyAdapter.js";
import { executeAction } from "../actions/execute.js";
import {
  CAMPAIGN_STRENGTH_BATCH_STEPS,
  CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER,
  campaignStrengthContributionActions,
  campaignStrengthContributionCost,
} from "./campaignStrength.js";

/**
 * #68: campaign strength through the public engine boundary
 * (createWorld / executeAction / advanceTurn / serializeSave / realAccumulate),
 * plus the click-based national-influence contribution, batched quote/ceiling
 * rules, cross-campaign transfer and the vote-accumulation guarantees.
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

/** The first rival candidate in a race that has (or can be given) an active campaign. */
function rivalCandidate(world: ReturnType<typeof createWorld>, race: ReturnType<typeof createWorld>["elections"][number]) {
  const rival = race.candidates.find((candidate) => candidate.id !== "player");
  if (!rival) throw new Error("expected a rival candidate in the race");
  ensureCampaign(world, {
    electionId: race.id,
    candidateId: rival.id,
    candidateIsNPP: rival.isNPP,
    partyId: rival.partyId,
    countryId: race.countryId,
    electionType: race.electionType,
    turn: world.meta.turn,
  });
  return rival;
}

// NPI = 100 -> strengthPerClick = 100 * 0.75 = 75, one action per click.
const NPI = 100;
const PER_CLICK = NPI * CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER; // 75

describe("campaignContribute (click-based, national-influence coupled)", () => {
  it("buys nationalInfluence * 0.75 strength per click and debits funds/actions atomically", () => {
    const { world, race } = setupFiledPresidentRace();
    const key = campaignKey(race.id, "player");
    const campaign = world.campaigns[key]!;
    expect(campaign.campaignStrength).toBe(0);

    world.player.nationalInfluence = NPI;
    world.player.actions = 50;
    world.player.funds = 1_000_000;

    const beforeActions = world.player.actions;
    const beforeFunds = world.player.funds;
    const expectedCost = campaignStrengthContributionCost(0, PER_CLICK); // US rate = 1

    const res = executeAction(world, "player", "campaignContribute", { electionId: race.id, clicks: 1 });
    expect(res.ok).toBe(true);

    expect(campaign.campaignStrength).toBeCloseTo(PER_CLICK, 6);
    expect(world.player.funds).toBeCloseTo(beforeFunds - expectedCost, 4);
    expect(world.player.actions).toBe(beforeActions - campaignStrengthContributionActions(PER_CLICK));

    const reloaded = deserializeSave(serializeSave(world, SERIALIZED_AT));
    expect(reloaded.campaigns[key]!.campaignStrength).toBeCloseTo(PER_CLICK, 6);
  });

  it("prices a ×N batch as the summed single clicks on funds, but ceilings do not add on actions", () => {
    const batchClicks = CAMPAIGN_STRENGTH_BATCH_STEPS[0]!;

    // Live: a single ×N batch vs N separate ×1 clicks must move funds identically.
    const batched = setupFiledPresidentRace().world;
    const singles = setupFiledPresidentRace().world;
    for (const world of [batched, singles]) {
      world.player.nationalInfluence = NPI;
      world.player.actions = 100;
      world.player.funds = 10_000_000;
    }
    // Same seed -> same election ids in both worlds.
    const raceId = batched.elections.find((e) => batched.campaigns[campaignKey(e.id, "player")])!.id;

    const batchedStart = { funds: batched.player.funds, actions: batched.player.actions };
    expect(
      executeAction(batched, "player", "campaignContribute", { electionId: raceId, clicks: batchClicks }).ok,
    ).toBe(true);

    const singlesStart = { funds: singles.player.funds, actions: singles.player.actions };
    for (let i = 0; i < batchClicks; i += 1) {
      expect(executeAction(singles, "player", "campaignContribute", { electionId: raceId, clicks: 1 }).ok).toBe(true);
    }

    const batchedCampaign = batched.campaigns[campaignKey(raceId, "player")]!;
    const singlesCampaign = singles.campaigns[campaignKey(raceId, "player")]!;
    // Funds are the exact integral of the marginal price, so they sum; actions
    // are `clicks * singleClickActions` (ceilings do not add).
    expect(batchedCampaign.campaignStrength ?? 0).toBeCloseTo(singlesCampaign.campaignStrength ?? 0, 6);
    expect(batched.player.funds).toBeCloseTo(singles.player.funds, 4);
    expect(batchedStart.funds - batched.player.funds).toBeCloseTo(singlesStart.funds - singles.player.funds, 4);
    expect(batchedStart.actions - batched.player.actions).toBe(batchClicks);
    expect(singlesStart.actions - singles.player.actions).toBe(batchClicks);

    // The merged single-click action cost WOULD have been smaller — proof the
    // batch deliberately does not merge ceilings.
    const mergedStrength = PER_CLICK * batchClicks;
    expect(campaignStrengthContributionActions(mergedStrength)).toBeLessThan(batchClicks);
  });

  it("resolves 'max' server-side to the largest affordable click count and never overspends", () => {
    const { world, race } = setupFiledPresidentRace();
    world.player.nationalInfluence = NPI;
    world.player.actions = 3; // one action per click -> at most 3 clicks
    world.player.funds = 10_000_000;

    const res = executeAction(world, "player", "campaignContribute", { electionId: race.id, clicks: "max" });
    expect(res.ok).toBe(true);
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    expect(campaign.campaignStrength).toBeCloseTo(PER_CLICK * 3, 6);
    expect(world.player.actions).toBe(0);

    // A further click is now unaffordable and rejected without any write.
    const before = { actions: world.player.actions, funds: world.player.funds, cs: campaign.campaignStrength };
    const over = executeAction(world, "player", "campaignContribute", { electionId: race.id, clicks: 1 });
    expect(over.ok).toBe(false);
    expect(campaign.campaignStrength).toBe(before.cs);
    expect(world.player.funds).toBe(before.funds);
    expect(world.player.actions).toBe(before.actions);
  });

  it("refuses a contribution from a player with no national influence", () => {
    const { world, race } = setupFiledPresidentRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    world.player.nationalInfluence = 0;
    world.player.actions = 50;
    world.player.funds = 10_000_000;
    const before = { funds: world.player.funds, actions: world.player.actions, cs: campaign.campaignStrength };

    const res = executeAction(world, "player", "campaignContribute", { electionId: race.id, clicks: 1 });
    expect(res.ok).toBe(false);
    expect(campaign.campaignStrength).toBe(before.cs);
    expect(world.player.funds).toBe(before.funds);
    expect(world.player.actions).toBe(before.actions);
  });

  it("keeps the internal raw-amount helper override working", () => {
    const { world, race } = setupFiledPresidentRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    world.player.nationalInfluence = 0; // raw override does not need NPI
    world.player.actions = 50;
    world.player.funds = 1_000_000;
    const expectedCost = campaignStrengthContributionCost(0, 600);

    const res = executeAction(world, "player", "campaignContribute", { electionId: race.id, strengthAdded: 600 });
    expect(res.ok).toBe(true);
    expect(campaign.campaignStrength).toBeCloseTo(600, 6);
    expect(world.player.funds).toBeCloseTo(1_000_000 - expectedCost, 4);
    expect(world.player.actions).toBe(50 - campaignStrengthContributionActions(600));
  });
});

describe("campaignContribute cross-campaign transfer", () => {
  it("credits a rival campaign in the same election and debits only the player, atomically", () => {
    const { world, race } = setupFiledPresidentRace();
    const rival = rivalCandidate(world, race);
    const ownKey = campaignKey(race.id, "player");
    const rivalKey = campaignKey(race.id, rival.id);

    world.player.nationalInfluence = NPI;
    world.player.actions = 50;
    world.player.funds = 1_000_000;
    world.campaigns[rivalKey]!.campaignStrength = 2000;

    const ownBefore = world.campaigns[ownKey]!.campaignStrength;
    const rivalBefore = world.campaigns[rivalKey]!.campaignStrength;
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    const expectedCost = campaignStrengthContributionCost(rivalBefore, PER_CLICK); // US rate 1

    const res = executeAction(world, "player", "campaignContribute", {
      electionId: race.id,
      clicks: 1,
      targetCandidateId: rival.id,
    });
    expect(res.ok).toBe(true);

    // Strength lands on the RIVAL, using the rival's current strength as the
    // marginal-price base; the player's own campaign is untouched.
    expect(world.campaigns[rivalKey]!.campaignStrength).toBeCloseTo(rivalBefore + PER_CLICK, 6);
    expect(world.campaigns[ownKey]!.campaignStrength).toBe(ownBefore);
    // Funds/actions come only from the player, using the rival's strength base.
    expect(fundsBefore - world.player.funds).toBeCloseTo(expectedCost, 4);
    expect(actionsBefore - world.player.actions).toBe(campaignStrengthContributionActions(PER_CLICK));

    // Atomic rejection: an unaffordable transfer changes NOTHING on either side.
    world.player.funds = 0;
    const frozen = {
      rival: world.campaigns[rivalKey]!.campaignStrength,
      own: world.campaigns[ownKey]!.campaignStrength,
      funds: world.player.funds,
      actions: world.player.actions,
    };
    const rejected = executeAction(world, "player", "campaignContribute", {
      electionId: race.id,
      clicks: 1,
      targetCandidateId: rival.id,
    });
    expect(rejected.ok).toBe(false);
    expect(world.campaigns[rivalKey]!.campaignStrength).toBe(frozen.rival);
    expect(world.campaigns[ownKey]!.campaignStrength).toBe(frozen.own);
    expect(world.player.funds).toBe(frozen.funds);
    expect(world.player.actions).toBe(frozen.actions);

    // Unknown / non-running targets are rejected without any debit.
    expect(
      executeAction(world, "player", "campaignContribute", {
        electionId: race.id,
        clicks: 1,
        targetCandidateId: "not-a-candidate",
      }).ok,
    ).toBe(false);
    expect(world.campaigns[rivalKey]!.campaignStrength).toBe(frozen.rival);
  });

  it("survives save/reload and a real turn deterministically", () => {
    const { world, race } = setupFiledPresidentRace();
    const rival = rivalCandidate(world, race);
    world.player.nationalInfluence = NPI;
    world.player.actions = 50;
    world.player.funds = 1_000_000;

    expect(
      executeAction(world, "player", "campaignContribute", {
        electionId: race.id,
        clicks: CAMPAIGN_STRENGTH_BATCH_STEPS[0]!,
        targetCandidateId: rival.id,
      }).ok,
    ).toBe(true);

    const reloaded = deserializeSave(serializeSave(world, SERIALIZED_AT));
    expect(reloaded.campaigns[campaignKey(race.id, rival.id)]!.campaignStrength ?? 0)
      .toBeCloseTo(world.campaigns[campaignKey(race.id, rival.id)]!.campaignStrength ?? 0, 6);

    // Both worlds then advance a real turn (which includes the leader pullback)
    // and stay byte-identical.
    advanceTurn(world);
    advanceTurn(reloaded);
    expect(JSON.stringify(reloaded.campaigns)).toBe(JSON.stringify(world.campaigns));
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
