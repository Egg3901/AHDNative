import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import type { ElectionRecord } from "./types.js";

/**
 * #99 — player candidacy fees and eligibility, exercised through the public
 * action boundary (createWorld / executeAction / serializeSave / deserialize).
 *
 * The reference national candidacy command
 * (AHDGame src/app/api/elections/[id]/enter/route.ts) charges NO filing fee, so
 * the headline assertion here is that declaring moves funds by exactly 0 while
 * still costing solo's own 2 AP.
 */

const OPTS = { seed: "candidacy-test", playerName: "Tester", countryId: "US", era: "1953" } as const;

function houseRace(state: string, id = `house:US:${state}:c1`): ElectionRecord {
  return {
    id,
    electionType: "house",
    countryId: "US",
    state,
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 10,
    endTurn: 20,
    totalSeats: 1,
    chamberKey: "house",
    candidates: [],
    tally: {},
  };
}

function presidentRace(id = "president:US:-:c1"): ElectionRecord {
  return {
    id,
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: 0,
    primaryEndTurn: 10,
    endTurn: 20,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [],
    tally: {},
  };
}

/** A joined player with one open, in-window house race in their home state. */
function worldWithHomeRace() {
  const world = createWorld(OPTS);
  expect(executeAction(world, "player", "joinParty", { partyId: "US_DEM" }).ok).toBe(true);
  const home = world.player.homeRegionId!;
  expect(home).toBeTruthy();
  const rec = houseRace(home);
  world.elections = [rec];
  world.meta.turn = 5; // inside the [startTurn, primaryEndTurn) window
  world.player.actions = 10;
  world.player.funds = 100_000;
  return { world, rec };
}

describe("player candidacy fees and eligibility (#99)", () => {
  it("declares in a home-state race inside the window and charges no filing fee", () => {
    const { world, rec } = worldWithHomeRace();
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;

    const res = executeAction(world, "player", "declareCandidacy", { electionId: rec.id });

    expect(res.ok).toBe(true);
    // Reference parity: no funds move (the enter route has no fee/cost debit).
    expect(world.player.funds).toBe(fundsBefore);
    // Solo's own action-economy AP charge still applies (baseCost 2).
    expect(world.player.actions).toBe(actionsBefore - 2);
    expect(rec.candidates.some((c) => c.id === "player")).toBe(true);
  });

  it("rejects a duplicate declaration with an actionable error and leaves the world unchanged", () => {
    const { world, rec } = worldWithHomeRace();
    expect(executeAction(world, "player", "declareCandidacy", { electionId: rec.id }).ok).toBe(true);

    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    const res = executeAction(world, "player", "declareCandidacy", { electionId: rec.id });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already a candidate/i);
    // Rejected prerequisite refunds the AP pre-charge; no funds ever moved.
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.actions).toBe(actionsBefore);
  });

  it("rejects a race outside the player's home state (constituency gate)", () => {
    const { world, rec } = worldWithHomeRace();
    world.player.homeRegionId = rec.state === "CA" ? "NY" : "CA";

    const res = executeAction(world, "player", "declareCandidacy", { electionId: rec.id });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/home state/i);
    expect(rec.candidates.some((c) => c.id === "player")).toBe(false);
  });

  it("exempts nationwide executive races from the home-state gate", () => {
    const world = createWorld(OPTS);
    world.player.partyId = "US_DEM";
    world.player.homeRegionId = "CA";
    world.player.actions = 10;
    const rec = presidentRace();
    world.elections = [rec];
    world.meta.turn = 5;

    const res = executeAction(world, "player", "declareCandidacy", { electionId: rec.id });
    expect(res.ok).toBe(true);
    expect(rec.candidates.some((c) => c.id === "player")).toBe(true);
  });

  it("requires party membership with an actionable error", () => {
    const { world, rec } = worldWithHomeRace();
    world.player.partyId = null;

    const res = executeAction(world, "player", "declareCandidacy", { electionId: rec.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/join a party/i);
  });

  it("blocks a second race while an active candidacy exists, naming the conflict", () => {
    const { world, rec } = worldWithHomeRace();
    const president = presidentRace();
    world.elections = [rec, president];
    expect(executeAction(world, "player", "declareCandidacy", { electionId: rec.id }).ok).toBe(true);

    const res = executeAction(world, "player", "declareCandidacy", { electionId: president.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already running/i);
  });

  it("closes the filing window at primaryEndTurn (turn-window boundary)", () => {
    // One turn before the boundary: still open.
    const open = worldWithHomeRace();
    open.world.meta.turn = open.rec.primaryEndTurn - 1;
    expect(executeAction(open.world, "player", "declareCandidacy", { electionId: open.rec.id }).ok).toBe(true);

    // Exactly at primaryEndTurn: closed (reference uses `currentTurn >= primaryEndTurn`).
    const closed = worldWithHomeRace();
    closed.world.meta.turn = closed.rec.primaryEndTurn;
    const res = executeAction(closed.world, "player", "declareCandidacy", { electionId: closed.rec.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/filing window/i);
    expect(closed.rec.candidates.some((c) => c.id === "player")).toBe(false);
  });

  it("withdraws an active candidacy and rejects a withdrawal when not entered", () => {
    const { world, rec } = worldWithHomeRace();
    expect(executeAction(world, "player", "declareCandidacy", { electionId: rec.id }).ok).toBe(true);

    const withdrew = executeAction(world, "player", "withdrawCandidacy", { electionId: rec.id });
    expect(withdrew.ok).toBe(true);
    expect(rec.candidates.some((c) => c.id === "player")).toBe(false);

    const again = executeAction(world, "player", "withdrawCandidacy", { electionId: rec.id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/not entered/i);
  });

  it("preserves the candidacy across a save/reload round trip and allows withdrawal after", () => {
    const { world, rec } = worldWithHomeRace();
    expect(executeAction(world, "player", "declareCandidacy", { electionId: rec.id }).ok).toBe(true);

    const raw = serializeSave(world, "2026-09-10T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    const loadedRec = loaded.elections.find((e) => e.id === rec.id)!;
    expect(loadedRec.candidates.some((c) => c.id === "player")).toBe(true);

    const withdrew = executeAction(loaded, "player", "withdrawCandidacy", { electionId: rec.id });
    expect(withdrew.ok).toBe(true);
    expect(loadedRec.candidates.some((c) => c.id === "player")).toBe(false);
  });
});
