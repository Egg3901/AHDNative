import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "./execute.js";

const OPTS = { seed: "campaign-manager", playerName: "Tester", countryId: "US", era: "1953" } as const;

function setupFiledRace() {
  const world = createWorld(OPTS);
  expect(executeAction(world, "player", "joinParty", { partyId: "US_DEM" }).ok).toBe(true);
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

describe("campaignManager", () => {
  it("persists a same-country manager and supports clearing the appointment", () => {
    const { world, race } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    const manager = world.politicians.find((politician) => politician.countryId === "US");
    expect(manager).toBeDefined();
    const campaignActions = campaign.actions;

    expect(executeAction(world, "player", "campaignManager", {
      electionId: race.id,
      managerId: manager!.id,
    })).toEqual({ ok: true, message: `${manager!.name} appointed as campaign manager.` });
    expect(campaign.actions).toBe(campaignActions);
    expect(campaign).toMatchObject({ managerId: manager!.id, managerName: manager!.name });

    const saved = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(saved.campaigns[campaignKey(race.id, "player")]).toMatchObject({
      managerId: manager!.id,
      managerName: manager!.name,
    });
    expect(executeAction(saved, "player", "campaignManager", {
      electionId: race.id,
      managerId: "",
    })).toEqual({ ok: true, message: "Campaign manager cleared." });
    expect(saved.campaigns[campaignKey(race.id, "player")]).not.toHaveProperty("managerId");
  });

  it("rejects managers outside the campaign country and archived campaigns", () => {
    const { world, race } = setupFiledRace();
    const otherCountryManager = world.politicians.find((politician) => politician.countryId !== "US");
    expect(otherCountryManager).toBeDefined();
    expect(executeAction(world, "player", "campaignManager", {
      electionId: race.id,
      managerId: otherCountryManager!.id,
    })).toEqual({ ok: false, error: "Campaign managers must be from the same country as the campaign." });

    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    campaign.status = "archived";
    expect(executeAction(world, "player", "campaignManager", {
      electionId: race.id,
      managerId: "",
    })).toEqual({ ok: false, error: "Campaign is archived and read-only." });
  });
});
