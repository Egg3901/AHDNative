import { describe, expect, it } from "vitest";
import { sourceUsLayer1ForYear, supportsSourceUsStartingYear } from "./sourceUsLayer1Year.js";
import { sourceCampaignUnits1953, sourceCampaignUnitsForYear } from "./sourceCampaignElectorate.js";
import { createWorld } from "../world.js";
import { campaignCellsForRegion, hasSource1953DemographicShape, hasSourceYearDemographicShape } from "./targetedAds.js";
import { executeAction } from "../actions/execute.js";
import { quoteTargetedAds } from "../actions/campaignTargetedAd.js";
import { deserializeSave, serializeSave } from "../save.js";
import { realAccumulate } from "../elections/tallyAdapter.js";
import { rngFromSeed } from "../rng.js";
import { ensureCampaignsForElection } from "./lifecycle.js";
import type { ElectionRecord } from "../elections/types.js";
import { dateForTurn } from "../calendar.js";

describe("current-source US annual Layer-1 substrate", () => {
  it("matches independently captured source vectors across starting eras and interpolation years", () => {
    const anchor = sourceUsLayer1ForYear("NY", 1953, 1953)!;
    expect(anchor.marginals.race).toEqual({ white: 91, black: 6, hispanic: 2, asian: 1, other: 0 });
    expect(anchor.positions.race!.white).toEqual({ economicLean: 1.2, socialLean: -0.9 });
    expect(anchor.turnoutRates.race!.black).toBe(40);

    const checkpoint = sourceUsLayer1ForYear("NY", 1985, 1953)!;
    expect(checkpoint.marginals.race).toEqual({ white: 72, black: 14.000000000000002, hispanic: 10.5, asian: 3, other: 0.5 });
    expect(checkpoint.positions.race!.white).toEqual({ economicLean: 0.09999999999999998, socialLean: 0 });
    expect(checkpoint.turnoutRates.race!.black).toBe(47.5);

    const alternateClock = sourceUsLayer1ForYear("NY", 1985, 1979)!;
    expect(alternateClock.marginals.race).toEqual(checkpoint.marginals.race);
    expect(alternateClock.turnoutRates.race!.black).toBe(52.5);
    const customStartYear = sourceUsLayer1ForYear("NY", 1985, 2020)!;
    expect(customStartYear).toEqual(alternateClock);
    const modernEra = sourceUsLayer1ForYear("NY", 2025, 2019)!;
    expect(modernEra.marginals.race).toEqual({ white: 51.5, black: 15, hispanic: 20.5, asian: 9.5, other: 3.5000000000000004 });
    expect(modernEra.positions.race!.white).toEqual({ economicLean: -1.5, socialLean: -1.5 });
    expect(sourceUsLayer1ForYear("NY", 2035, 1953)).toEqual(sourceUsLayer1ForYear("NY", 2027, 1953));
    expect(supportsSourceUsStartingYear(2020)).toBe(true);
    expect(supportsSourceUsStartingYear(999)).toBe(false);
    expect(sourceUsLayer1ForYear("not-a-state", 1985, 1953)).toBeNull();
    expect(supportsSourceUsStartingYear(2019)).toBe(true);
  });

  it("retains the discrete legacy path and derives anchored source-year units", () => {
    const legacy = sourceCampaignUnits1953("NY")!;
    const anchored = sourceCampaignUnitsForYear("NY", 1953, 1953)!;
    // The current Game resolver applies its source checkpoint correction even
    // at the 1953 anchor; the older Native path predates that correction.
    expect(anchored).not.toEqual(legacy);
    expect(anchored.reduce((sum, unit) => sum + unit.share, 0)).toBeCloseTo(1, 10);
    const later = sourceCampaignUnitsForYear("NY", 1985, 1953)!;
    expect(later.length).toBeGreaterThan(0);
    expect(later.reduce((sum, unit) => sum + unit.share, 0)).toBeCloseTo(1, 10);
    expect(later).not.toEqual(legacy);
  });

  it("preserves the clockless 1953 legacy consumer without fabricating a year anchor", () => {
    const world = createWorld({ seed: "source-year-legacy-fallback", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "NY" });
    delete world.meta.startingYear;
    expect(hasSourceYearDemographicShape(world, "NY")).toBe(false);
    expect(hasSource1953DemographicShape(world, "NY")).toBe(true);
    expect(campaignCellsForRegion(world, "NY")).toEqual(sourceCampaignUnits1953("NY")!.flatMap((unit) => unit.campaignCells));
  });

  it("leaves non-US source-clock worlds on their existing authored-cell fallback", () => {
    const world = createWorld({ seed: "source-year-non-us-fallback", playerName: "Player", countryId: "UK", era: "1953", homeRegionId: "LON" });
    expect(world.meta.startingYear).toBe(1953);
    expect(campaignCellsForRegion(world, "LON").length).toBeGreaterThan(0);
  });

  it("carries an ordinary source-year ad purchase through save/reload into the general tally", () => {
    const world = createWorld({ seed: "source-year-ad-save-tally", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "NY" });
    world.meta.turn = 48;
    world.meta.date = dateForTurn(48);
    world.player.actions = 5;
    world.player.funds = 500;
    const partyId = Object.values(world.parties).find((party) => party.countryId === "US")!.id;
    const opponent = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === partyId)!;
    world.player.partyId = partyId;
    const race: ElectionRecord = {
      id: "house:US:NY:source-year-ad-save-tally", electionType: "house", countryId: "US", state: "NY", cycle: 1,
      status: "active", startTurn: 0, primaryEndTurn: 0, endTurn: 90, totalSeats: 1, chamberKey: "house",
      candidates: [
        { id: "player", name: world.player.name, partyId, isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId, isNPP: true, incumbent: true },
      ],
      tally: {},
    };
    world.elections = [race];
    ensureCampaignsForElection(world, race);
    const quote = quoteTargetedAds(world, 3)!;
    const bought = executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id, regionId: "NY", demographicCategory: "race", demographicGroup: "white",
      count: quote.count, expectedRevision: quote.revision, expectedTurn: quote.turn, expectedCost: quote.cost,
    });
    expect(bought.ok).toBe(true);

    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(loaded.meta.startingYear).toBe(1953);
    expect(loaded.meta.turn).toBe(48);
    expect(loaded.player.targetedAds).toEqual(world.player.targetedAds);
    expect(campaignCellsForRegion(loaded, "NY")).toEqual(campaignCellsForRegion(world, "NY"));
    const snapshots: unknown[] = [];
    expect(realAccumulate(loaded, rngFromSeed("source-year-ad-save-tally"), loaded.elections[0]!, undefined, (snapshot) => snapshots.push(snapshot))).toBe(true);
    const snapshot = snapshots[0] as import("../electionEngine/tally/types.js").VoteDistributionDiagnosticSnapshot | undefined;
    expect(snapshot?.categories[0]?._id).toBe("granularCells");
    const playerInput = snapshot?.candidates.find((candidate) => candidate.candidateId === "player");
    expect(Object.keys(playerInput?.targetedAdBonuses ?? {}).length).toBeGreaterThan(0);
  });
});
