import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { survivingElectionPartyId } from "./survivingParty.js";

describe("surviving election party lookup", () => {
  it("follows merged party chains while preserving independent, unknown, and null IDs", () => {
    const world = createWorld({ seed: "merged-election-party-chain", playerName: "Tester", countryId: "US", era: "1953" });
    world.parties.TEST_FED = { ...world.parties.US_REP!, id: "TEST_FED", name: "Old Party" };
    world.parties.TEST_CUP = { ...world.parties.US_REP!, id: "TEST_CUP", name: "Middle Party" };
    world.parties.TEST_UNION = { ...world.parties.US_REP!, id: "TEST_UNION", name: "Surviving Party" };
    world.parties.TEST_FED.mergedIntoPartyId = "TEST_CUP";
    world.parties.TEST_CUP.mergedIntoPartyId = "TEST_UNION";

    expect(survivingElectionPartyId(world, "TEST_FED")).toBe("TEST_UNION");
    expect(survivingElectionPartyId(world, "US_DEM")).toBe("US_DEM");
    expect(survivingElectionPartyId(world, "independent")).toBe("independent");
    expect(survivingElectionPartyId(world, "unknown-party")).toBe("unknown-party");
    expect(survivingElectionPartyId(world, null)).toBeNull();
  });

  it("caps a malformed cycle at the source 16-link traversal bound", () => {
    const world = createWorld({ seed: "merged-election-party-cycle", playerName: "Tester", countryId: "US", era: "1953" });
    world.parties.TEST_FED = { ...world.parties.US_REP!, id: "TEST_FED", name: "Old Party" };
    world.parties.TEST_CUP = { ...world.parties.US_REP!, id: "TEST_CUP", name: "Middle Party" };
    world.parties.TEST_FED.mergedIntoPartyId = "TEST_CUP";
    world.parties.TEST_CUP.mergedIntoPartyId = "TEST_FED";

    expect(survivingElectionPartyId(world, "TEST_FED")).toBe("TEST_FED");
  });
});
