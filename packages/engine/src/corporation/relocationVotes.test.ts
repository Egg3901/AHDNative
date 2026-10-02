import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { resolveDueCorporateRelocationVotes, sourceRelocationVoteThreshold } from "./relocationVotes.js";

function publicIssuer() {
  const world = createWorld({ era: "1953", countryId: "US", seed: "corp-relocation-vote", playerName: "Alex" });
  const corporation = world.corporations["US-manufacturing"]!;
  corporation.ceoId = "player";
  corporation.ceoType = "player";
  corporation.ceoVacant = false;
  const playerShares = Math.floor(corporation.totalShares / 2);
  corporation.shareholders = [
    { holder: "player", shares: playerShares },
    { holder: "npc", shares: corporation.totalShares - playerShares },
  ];
  return { world, corporation };
}

describe("source corporate relocation votes", () => {
  it("uses source country thresholds and applies a public headquarters move through actions and save", () => {
    expect(sourceRelocationVoteThreshold("UK")).toBe(0.4);
    expect(sourceRelocationVoteThreshold("US")).toBe(0.5);
    const { world, corporation } = publicIssuer();
    const opened = executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: "LON",
    });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    expect(corporation.relocationVote).toMatchObject({ status: "open", destinationCountryId: "UK", deadlineTurn: world.meta.turn + 24 });

    const cast = executeAction(world, "player", "voteCorporateRelocation", {
      corporationId: corporation.id, relocationChoice: "yes",
    });
    expect(cast).toMatchObject({ ok: true });
    expect(corporation.relocationVote?.status).toBe("passed");
    expect(corporation).toMatchObject({ countryId: "UK", headquartersRegionId: "LON" });

    const restored = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(restored.corporations[corporation.id]?.relocationVote).toEqual(corporation.relocationVote);
    expect(restored.corporations[corporation.id]).toMatchObject({ countryId: "UK", headquartersRegionId: "LON" });
  });

  it("checks destination marketization at proposal and permits entry at the dual-track boundary", () => {
    const { world, corporation } = publicIssuer();
    const destination = Object.values(world.regions).find((region) => region.countryId === "RU")!;
    expect(destination).toBeDefined();
    world.commandEconomy.RU!.marketizationLevel = 29.99;
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringMatching(/command economy/i) });
    world.commandEconomy.RU!.marketizationLevel = 30;
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
  });

  it("fails an unpassed ballot at the source 24-turn deadline on the next corporate phase", () => {
    const { world, corporation } = publicIssuer();
    expect(executeAction(world, "player", "openCorporateRelocationVote", {
      corporationId: corporation.id, regionId: "LON",
    }).ok).toBe(true);
    world.meta.turn = corporation.relocationVote!.deadlineTurn;
    resolveDueCorporateRelocationVotes(world);
    expect(corporation.relocationVote?.status).toBe("failed");
    expect(corporation.countryId).toBe("US");
    expect(corporation.headquartersRegionId).not.toBe("LON");
  });
});
