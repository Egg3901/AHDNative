import { GameSession } from "./session";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  advanceTurn,
  createWorld,
  deserializeSave,
  executeAction,
  serializeSave,
  type WorldState,
} from "@ahdclient/engine";
import {
  projectPartyCharters,
  projectPartyFounding,
  projectPartyManagement,
  validatePartyFounding,
} from "./partyManagement";

const FRESH = { era: "1953", countryId: "US", seed: "native-party-mgmt-v1", playerName: "Alex" } as const;
const ELECTED_FIXTURE = new URL("../../fixtures/career-elected-1953-US.save.json.gz", import.meta.url);

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"));
}

/**
 * One real turn on the genuine elected fixture. Fixture funds (152k) stay in
 * the 100k-200k band and AP refreshes to 9, so founding is executable after
 * a single turn with the fixed single 100k charge.
 */
function readyWorld(): WorldState {
  const world = electedWorld();
  advanceTurn(world);
  return world;
}

describe("projectPartyFounding", () => {
  it("blocks a fresh player on funds with the real founder cost", () => {
    const world = createWorld({ ...FRESH });
    const founding = projectPartyFounding(world);
    expect(founding.fundCost).toBe(100_000);
    expect(founding.fundsRequired).toBe(100_000);
    expect(founding.actionCost).toBe(8);
    expect(founding.funds).toBe(0);
    expect(founding.available).toBe(false);
    expect(founding.disabledReason).toMatch(/fund/i);
  });

  it("rejects a founding attempt with no funds through the public action", () => {
    const world = createWorld({ ...FRESH });
    const before = projectPartyManagement(world).partyCount;
    const result = executeAction(world, "player", "foundParty", {
      foundPartyName: "New Frontier",
      foundPartyAbbr: "NFP",
    });
    expect(result.ok).toBe(false);
    expect(projectPartyManagement(world).partyCount).toBe(before);
  });

  it("rejects short names, short abbreviations and taken names", () => {
    const world = createWorld({ ...FRESH });
    expect(validatePartyFounding(world, "", "NFP").ok).toBe(false);
    expect(validatePartyFounding(world, "New Frontier", "N").ok).toBe(false);
    const existing = projectPartyManagement(world).parties[0]!;
    expect(validatePartyFounding(world, existing.name, "ZZZ").ok).toBe(false);
    expect(validatePartyFounding(world, "Unique Party", existing.abbreviation).ok).toBe(false);
  });
});

describe("foundParty through the public action", () => {
  it("founds, auto-joins and records a ratified charter on a genuinely funded save", () => {
    const world = readyWorld();
    const before = projectPartyManagement(world);
    expect(before.founding.available).toBe(true);
    expect(before.founding.funds).toBeGreaterThanOrEqual(100_000);
    expect(before.founding.funds).toBeLessThan(200_000);
    const fundsBefore = before.founding.funds;
    const actionsBefore = before.founding.actions;
    const costBefore = before.founding.actionCost;

    const result = executeAction(world, "player", "foundParty", {
      foundPartyName: "New Frontier",
      foundPartyAbbr: "NFP",
    });
    expect(result.ok).toBe(true);

    const after = projectPartyManagement(world);
    expect(after.partyCount).toBe(before.partyCount + 1);
    expect(after.foundedCount).toBe(before.foundedCount + 1);
    expect(after.playerPartyName).toBe("New Frontier");
    // Single 100k charge, actual action cost, exactly one success count.
    expect(after.founding.funds).toBe(fundsBefore - 100_000);
    expect(after.founding.actions).toBe(actionsBefore - costBefore);
    expect(world.player.actionCounts["foundParty"]).toBe(1);
    const charter = projectPartyCharters(world).find((c) => c.partyName === "New Frontier");
    expect(charter).toMatchObject({ status: "ratified" });
  });

  it("survives save and reload with membership and charter intact", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "foundParty", {
        foundPartyName: "New Frontier",
        foundPartyAbbr: "NFP",
      }).ok,
    ).toBe(true);
    const raw = serializeSave(world, "2026-09-10T00:00:00.000Z");
    const revived = deserializeSave(raw);
    const after = projectPartyManagement(revived);
    expect(after.playerPartyName).toBe("New Frontier");
    expect(projectPartyCharters(revived).some((c) => c.partyName === "New Frontier")).toBe(true);
  });

  it("blocks a second founding on the party switch cooldown", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "foundParty", {
        foundPartyName: "New Frontier",
        foundPartyAbbr: "NFP",
      }).ok,
    ).toBe(true);
    // Rebuild AP and funds through real turns and a real fundraise so the
    // second attempt reaches the membership cooldown gate on genuine state.
    advanceTurn(world);
    expect(executeAction(world, "player", "fundraise", {}).ok).toBe(true);
    advanceTurn(world);
    advanceTurn(world);
    const second = executeAction(world, "player", "foundParty", {
      foundPartyName: "Second Wave",
      foundPartyAbbr: "SWP",
    });
    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.error).toMatch(/cooldown/i);
  });

  it("starts founded parties at neutral positions: the public action sets no platform", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "foundParty", {
        foundPartyName: "New Frontier",
        foundPartyAbbr: "NFP",
      }).ok,
    ).toBe(true);
    const founded = projectPartyManagement(world).parties.find((p) => p.name === "New Frontier")!;
    expect(founded.economicPosition).toBe(0);
    expect(founded.socialPosition).toBe(0);
  });
});


it("queries, founds and resumes through the session boundary without leaking state", () => {
  const session = new GameSession();
  expect(() => session.partyManagement()).toThrow("Start or load");
  session.load(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"));
  session.advance();
  const before = session.partyManagement();
  expect(before.founding.available).toBe(true);
  expect(session.act("foundParty", { foundPartyName: "New Frontier", foundPartyAbbr: "NFP" }).ok).toBe(true);
  const after = session.partyManagement();
  expect(after.playerPartyName).toBe("New Frontier");
  expect(after.founding.funds).toBe(before.founding.funds - 100_000);
  after.parties[0]!.name = "Detached query";
  expect(session.partyManagement().parties[0]!.name).toBe("New Frontier");
  const resumed = new GameSession();
  resumed.load(session.serialize("2026-09-10T00:00:00.000Z"));
  expect(resumed.partyManagement()).toEqual(session.partyManagement());
  expect(resumed.search("New Frontier").results.some(result => result.id === "US_NFP")).toBe(true);
});
