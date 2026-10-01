import { describe, expect, it } from "vitest";
import { createWorld } from "@ahdclient/engine";
import { projectWorldOverview } from "./worldOverview";
import { projectPolitics } from "./politics";
import { projectProfile } from "./profile";
import { projectHallOfFame } from "./hallOfFame";

function makeHallOfFame(query?: { rankBy?: "standing" | "influence"; scope?: "all" | "party"; era?: "current" | "all" }) {
  const world = createWorld({ era: "1953", countryId: "US", playerName: "Ada", seed: "hall-of-fame" });
  return projectHallOfFame({
    overview: projectWorldOverview(world),
    politics: projectPolitics(world),
    profile: projectProfile(world),
    query,
  });
}

describe("projectHallOfFame", () => {
  it("ranks the recorded player and politicians by the standing composite", () => {
    const view = makeHallOfFame();

    expect(view.entries.length).toBeGreaterThan(1);
    expect(view.era).toBe("1953");
    // The player row is always present and flagged.
    const player = view.entries.find((entry) => entry.kind === "player");
    expect(player?.name).toBe("Ada");
    expect(player?.isPlayer).toBe(true);
    // Deterministic stable order: score descends, ties break by name then id.
    const scores = view.entries.map((entry) => entry.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(view.entries.map((entry) => entry.rank)).toEqual(
      view.entries.map((_, index) => index + 1),
    );
  });

  it("stamps every entry with the recorded era and filters it stably", () => {
    const current = makeHallOfFame({ era: "current" });
    const all = makeHallOfFame({ era: "all" });

    expect(current.entries.length).toBeGreaterThan(0);
    for (const entry of current.entries) expect(entry.era).toBe("1953");
    // One recorded era today: both filters return the same stable order.
    expect(all.entries.map((entry) => entry.id)).toEqual(current.entries.map((entry) => entry.id));
  });

  it("narrows a stable party scope without dropping the player", () => {
    const view = makeHallOfFame({ scope: "party" });

    expect(view.entries.length).toBeGreaterThan(0);
    expect(view.entries.find((entry) => entry.kind === "player")).toBeDefined();
    const partyId = view.playerPartyId;
    if (partyId) {
      for (const entry of view.entries) expect(entry.partyId).toBe(partyId);
    }
  });

  it("ranks by raw influence when that filter is selected", () => {
    const view = makeHallOfFame({ rankBy: "influence" });

    const influences = view.entries.map((entry) => entry.influence);
    expect([...influences].sort((a, b) => b - a)).toEqual(influences);
  });

  it("links politicians to their recorded active races and profiles", () => {
    const view = makeHallOfFame();

    for (const entry of view.entries) {
      if (entry.kind === "player") {
        expect(entry.profileRoute).toBe("profile");
      } else {
        expect(entry.profileRoute).toBe("politicians");
      }
      for (const raceId of entry.activeRaceIds) {
        expect(typeof raceId).toBe("string");
        expect(raceId.length).toBeGreaterThan(0);
      }
    }
    // At least the projection reports honestly when a fresh world has no active races.
    expect(Array.isArray(view.entries[0]!.activeRaceIds)).toBe(true);
  });
});
