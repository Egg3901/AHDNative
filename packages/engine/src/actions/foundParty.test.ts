import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave } from "../save.js";
import type { WorldState } from "../types.js";
import { ACTION_CATALOG, getActionCost } from "./catalog.js";
import { executeAction } from "./execute.js";
import { FOUND_PARTY_FUND_COST } from "../membership.js";

/**
 * foundParty single-charge accounting through the public action boundary.
 * Uses the genuine career-elected fixture plus real turns (no invented
 * funds, no campaign generation). The catalog entry is the independent
 * price contract: 100k funds, 8 AP.
 */

const ELECTED_FIXTURE = new URL(
  "../../../../fixtures/career-elected-1953-US.save.json.gz",
  import.meta.url,
);

function electedWorld(): WorldState {
  return deserializeSave(
    gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"),
  );
}

/** One real turn: refreshes AP to 9, keeps fixture funds in the 100k-200k band. */
function readyWorld(): WorldState {
  const world = electedWorld();
  advanceTurn(world);
  return world;
}

function foundingCost(world: WorldState): number {
  const player = world.player;
  return getActionCost(
    ACTION_CATALOG.foundParty,
    player.donorBaseLevel,
    player.politicalInfluence,
    player.favorability,
  );
}

function snapshot(world: WorldState) {
  return {
    funds: world.player.funds,
    actions: world.player.actions,
    partyId: world.player.partyId,
    partyCount: Object.keys(world.parties).length,
    cooldowns: { ...world.player.actionCooldowns },
    counts: { ...world.player.actionCounts },
  };
}

describe("foundParty public action accounting", () => {
  it("holds the independent 100k catalog contract", () => {
    expect(ACTION_CATALOG.foundParty.fundCost).toBe(100_000);
    expect(FOUND_PARTY_FUND_COST).toBe(100_000);
    expect(ACTION_CATALOG.foundParty.baseCost).toBe(8);
  });

  it("founds inside the 100k-200k band with exactly one 100k charge", () => {
    const world = readyWorld();
    expect(world.player.funds).toBeGreaterThanOrEqual(100_000);
    expect(world.player.funds).toBeLessThan(200_000);
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    const cost = foundingCost(world);
    const countsBefore = world.player.actionCounts["foundParty"] ?? 0;

    const result = executeAction(world, "player", "foundParty", {
      foundPartyName: "New Frontier",
      foundPartyAbbr: "NFP",
    });
    expect(result.ok).toBe(true);
    expect(world.player.funds).toBe(fundsBefore - 100_000);
    expect(world.player.actions).toBe(actionsBefore - cost);
    expect(world.player.actionCounts["foundParty"]).toBe(countsBefore + 1);
    expect(world.player.partyId).toBe("US_NFP");
    const charter = world.charters.find((c) => c.partyId === "US_NFP");
    expect(charter).toMatchObject({ status: "ratified", founderId: "player" });
  });

  it("founds at exactly 100k funds, leaving zero", () => {
    const world = readyWorld();
    world.player.funds = 100_000;
    const actionsBefore = world.player.actions;
    const cost = foundingCost(world);
    const result = executeAction(world, "player", "foundParty", {
      foundPartyName: "Exact Hundred",
      foundPartyAbbr: "EXH",
    });
    expect(result.ok).toBe(true);
    expect(world.player.funds).toBe(0);
    expect(world.player.actions).toBe(actionsBefore - cost);
  });

  it("leaves the world unchanged when the name is taken", () => {
    const world = readyWorld();
    const before = snapshot(world);
    const taken = world.parties["US_DEM"]!.name;
    const result = executeAction(world, "player", "foundParty", {
      foundPartyName: taken,
      foundPartyAbbr: "ZZZ",
    });
    expect(result.ok).toBe(false);
    expect(snapshot(world)).toEqual(before);
    expect(world.player.actionCounts["foundParty"] ?? 0).toBe(
      before.counts["foundParty"] ?? 0,
    );
  });

  it("leaves the world unchanged when funds are short", () => {
    const world = readyWorld();
    world.player.funds = 50_000;
    const before = snapshot(world);
    const result = executeAction(world, "player", "foundParty", {
      foundPartyName: "Broke Wave",
      foundPartyAbbr: "BRW",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/fund/i);
    expect(snapshot(world)).toEqual(before);
  });

  it("blocks a second founding on the switch cooldown without charging", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "foundParty", {
        foundPartyName: "New Frontier",
        foundPartyAbbr: "NFP",
      }).ok,
    ).toBe(true);
    world.player.funds = 150_000;
    world.player.actions = 10;
    const before = snapshot(world);
    const second = executeAction(world, "player", "foundParty", {
      foundPartyName: "Second Wave",
      foundPartyAbbr: "SWP",
    });
    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.error).toMatch(/cooldown/i);
    expect(snapshot(world)).toEqual(before);
  });

  it("rejects a non-player founder without touching the world", () => {
    const world = readyWorld();
    const politician = world.politicians[0]!;
    // Fund the actor past the common gates so the rejection comes from the
    // player-only gate itself.
    (politician as unknown as { funds: number }).funds = 200_000;
    (politician as unknown as { actions: number }).actions = 10;
    const before = snapshot(world);
    const result = executeAction(world, politician.id, "foundParty", {
      foundPartyName: "Outsider Bloc",
      foundPartyAbbr: "OBB",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/only player/i);
    expect(snapshot(world)).toEqual(before);
  });
});
