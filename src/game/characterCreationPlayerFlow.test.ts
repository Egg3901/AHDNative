import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { STAT_KEYS, type CharacterStats } from "@ahdclient/engine";
import type { CharacterCreation } from "./types";

const setup = { era: "1953", countryId: "US", seed: "native-creation-flow", playerName: "Alex", homeRegionId: "NY" } as const;
const stamp = "2026-09-15T00:00:00.000Z";

/**
 * A legal 28-point build with fundraising spiked to 10 and the other six at
 * 3 (10 + 6x3 = 28). Fundraise yield scales with fundraising, so the act
 * steps below exercise a creation-stat consequence on both sides of reload.
 */
function fundraisingBuild(): CharacterStats {
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [key, 3])) as CharacterStats;
  stats.fundraising = 10;
  return stats;
}

const creation: CharacterCreation = {
  name: "Eleanor Vance",
  homeRegionId: "CA",
  partyId: "US_DEM",
  policies: { economic: -2, social: -2 },
  demographics: { race: "black", gender: "female", education: "graduate", wealth: "high" },
  stats: fundraisingBuild(),
};

function expectCreationIntact(session: GameSession) {
  const profile = session.profile();
  expect(profile.name).toBe("Eleanor Vance");
  expect(profile.homeRegion?.id).toBe("CA");
  expect(profile.party?.id).toBe("US_DEM");
  expect(profile.policies).toEqual({ economic: -2, social: -2 });
  expect(profile.demographics).toEqual(creation.demographics);
  expect(profile.stats).toEqual(fundraisingBuild());
}

describe("character-creation player flow through the public session (#242)", () => {
  it("creates, acts, advances, saves, relaunches and continues with every creation field intact", () => {
    const session = new GameSession();
    const view = session.create({ ...setup, creation });
    expect(view.player).toMatchObject({ name: "Eleanor Vance", homeRegionId: "CA" });
    expect(view.player.partyName).toMatch(/Democratic/);
    expectCreationIntact(session);

    // Act before the turn: convert seed cash, build the donor base, then
    // fundraise on the spiked fundraising stat.
    expect(session.act("convertCash", { amount: 10_000 }).ok).toBe(true);
    expect(session.act("buildDonorBase").ok).toBe(true);
    expect(session.act("fundraise").ok).toBe(true);

    session.advance();
    expect(session.view().turn).toBe(1);

    // Close and relaunch: every creation field survives the save boundary.
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    expect(loaded.view().turn).toBe(1);
    expect(loaded.view().player).toMatchObject({ name: "Eleanor Vance", homeRegionId: "CA" });
    expect(loaded.view().player.partyName).toMatch(/Democratic/);
    expectCreationIntact(loaded);

    // Continue in the relaunched session: the persisted stats still drive
    // actions and the world still advances.
    expect(loaded.act("fundraise").ok).toBe(true);
    loaded.advance();
    expect(loaded.view().turn).toBe(2);
    expectCreationIntact(loaded);
  });
});
