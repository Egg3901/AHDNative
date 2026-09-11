import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { getCampaignFamilyScalar } from "../campaigns/upgradeCosts.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";

const OPTS = { seed: "campaign-rally", playerName: "Tester", countryId: "US", era: "1953" } as const;

function setupFiledRace() {
  const world = createWorld(OPTS);
  const joined = executeAction(world, "player", "joinParty", { partyId: "US_DEM" });
  expect(joined.ok).toBe(true);
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
      const filed = executeAction(world, "player", "declareCandidacy", { electionId: race.id });
      expect(filed.ok).toBe(true);
      return { world, raceId: race.id };
    }
    advanceTurn(world);
  }
  throw new Error("no open US house race within 300 turns");
}

describe("campaignRally", () => {
  it("fires one rally per turn, queues the source support split, and persists it", () => {
    const { world, raceId } = setupFiledRace();
    const key = campaignKey(raceId, "player");
    const campaign = world.campaigns[key]!;
    const scalar = getCampaignFamilyScalar("house");
    const actionCost = Math.ceil(20 * scalar);
    campaign.actions = actionCost;
    const supportBefore = world.candidateSupports.player?.support ?? 50;
    const turn = world.meta.turn;

    const fired = executeAction(world, "player", "campaignRally", { electionId: raceId });

    expect(fired).toMatchObject({ ok: true });
    expect(campaign.actions).toBe(0);
    expect(world.candidateSupports.player).toMatchObject({
      support: supportBefore + 10 * scalar * 0.6,
      lastRallyTurn: turn,
      supportAccrual: [{ amountPerTurn: (10 * scalar * 0.4) / 4, turnsRemaining: 4 }],
    });

    campaign.actions = actionCost;
    const blocked = executeAction(world, "player", "campaignRally", { electionId: raceId });
    expect(blocked).toEqual({ ok: false, error: "Rally already fired this turn" });
    expect(campaign.actions).toBe(actionCost);

    const saved = deserializeSave(serializeSave(world, new Date().toISOString()));
    expect(saved.candidateSupports.player).toEqual(world.candidateSupports.player);

    advanceTurn(saved);
    expect(saved.candidateSupports.player!.supportAccrual).toEqual([
      { amountPerTurn: (10 * scalar * 0.4) / 4, turnsRemaining: 3 },
    ]);
    saved.campaigns[key]!.actions = actionCost;
    const second = executeAction(saved, "player", "campaignRally", { electionId: raceId });
    expect(second.ok).toBe(true);
    expect(saved.candidateSupports.player!.lastRallyTurn).toBe(saved.meta.turn);
    expect(saved.candidateSupports.player!.supportAccrual).toHaveLength(2);
  });

  it("rejects missing, inactive, and unavailable rally targets without charging the player", () => {
    const { world, raceId } = setupFiledRace();
    const playerBefore = { actions: world.player.actions, funds: world.player.funds };

    expect(executeAction(world, "player", "campaignRally")).toEqual({
      ok: false,
      error: "campaignRally requires electionId",
    });
    expect(executeAction(world, "player", "campaignRally", { electionId: "missing" })).toEqual({
      ok: false,
      error: "Unknown election missing",
    });

    world.elections.find((e) => e.id === raceId)!.status = "resolved";
    expect(executeAction(world, "player", "campaignRally", { electionId: raceId })).toEqual({
      ok: false,
      error: "This election has ended.",
    });
    expect(world.player.actions).toBe(playerBefore.actions);
    expect(world.player.funds).toBe(playerBefore.funds);
  });
});
