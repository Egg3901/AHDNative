/**
 * Issue #119 — FOMC committee rate-setting/meeting lifecycle + nomination
 * lifecycle. Exercises the ported rules through the public turn/save boundary
 * (createWorld / advanceTurn / serializeSave / deserializeSave) plus the pure
 * rule helpers.
 *
 * Reference: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
 *  - src/lib/turn/fomcMeetingTurn.ts
 *  - src/lib/fomcNominationLifecycle.ts
 *  - src/lib/centralBank/fomc.ts
 *  - src/lib/centralBank/seedFomcBoard.ts
 */
import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { SaveFile } from "../save.js";
import {
  FOMC_TERM_TURNS,
  FOMC_VOTE_WINDOW_TURNS,
} from "./constants.js";
import {
  boardCanCarryMotions,
  directionFromStep,
  majorityThreshold,
  proposeChairMotion,
  seatPreferredVote,
  tallyMeeting,
  type FomcMacroContext,
} from "./fomc.js";
import {
  castFomcBallot,
  createFomcBoard,
  processFomcMeetings,
  seedFomcBoard,
} from "./fomcMeeting.js";
import { proposeFomcNomination } from "./fomcNominationLifecycle.js";
import type { FomcSeat } from "./types.js";

const OPTS = { seed: "fomc-119", playerName: "Tester", countryId: "US", era: "1953" } as const;
const SAVED_AT = "2026-09-10T00:00:00.000Z";

const HOT_CTX: FomcMacroContext = {
  neutralRate: 3.0,
  inflationRate: 5.0,
  targetInflation: 2.0,
  gdpGrowth: 2.0,
  currentRate: 3.0,
};

function seat(overrides: Partial<FomcSeat> & { seatId: string }): FomcSeat {
  return {
    isChair: false,
    occupantType: "npp",
    characterId: null,
    characterName: null,
    nppId: null,
    alignment: "hawk",
    appointedByPresidentId: null,
    appointedAtTurn: 0,
    termExpiresAtTurn: 900,
    ...overrides,
  };
}

/** Majority and minority US senate parties, computed from the generated roster. */
function senateParties(world: ReturnType<typeof createWorld>): { majority: string; minority: string } {
  const counts = new Map<string, number>();
  for (const p of world.politicians) {
    if (p.countryId === "US" && p.chamberKey === "senate") {
      counts.set(p.partyId, (counts.get(p.partyId) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { majority: sorted[0]![0], minority: sorted[1]![0] };
}

describe("#119 pure FOMC rules (centralBank/fomc.ts)", () => {
  it("majorityNeeded is a strict majority of the FULL board; vacant seats count against", () => {
    expect(majorityThreshold(7)).toBe(4);
    const full = createFomcBoard(0);
    expect(boardCanCarryMotions(full)).toBe(true);
    // Four seats vacant -> only 3 seated < 4: the board is structurally dead.
    const dead = full.map((s, i) => (i < 4 ? seat({ seatId: s.seatId, occupantType: "vacant", termExpiresAtTurn: null }) : s));
    expect(boardCanCarryMotions(dead)).toBe(false);
  });

  it("directionFromStep applies the hold deadband (0.125)", () => {
    expect(directionFromStep(0.12)).toBe("hold");
    expect(directionFromStep(0.2)).toBe("hike");
    expect(directionFromStep(-0.2)).toBe("cut");
  });

  it("a hawk seat prefers a hike on hot inflation; the chair motion matches", () => {
    expect(seatPreferredVote("hawk", HOT_CTX)).toBe("hike");
    const motion = proposeChairMotion("hawk", HOT_CTX, { canChangeRate: true });
    expect(motion.motion).toBe("hike");
    expect(motion.proposedDelta).toBeCloseTo(0.75, 10); // clamped to MAX_RATE_CHANGE_DELTA
  });

  it("the chair can only table a hold when canChangeRate is false", () => {
    expect(proposeChairMotion("hawk", HOT_CTX, { canChangeRate: false })).toEqual({
      motion: "hold",
      proposedDelta: 0,
    });
  });

  it("tallyMeeting passes on a strict majority of the full board and reports early decisions", () => {
    const ballots = createFomcBoard(0)
      .slice(0, 4)
      .map((s) => ({ seatId: s.seatId, vote: "hike" as const, auto: true, castAtTurn: 1 }));
    const passed = tallyMeeting(ballots, "hike", 7);
    expect(passed).toMatchObject({ agree: 4, disagree: 0, abstain: 3, needed: 4, decided: true, passed: true });
    // Four disagreeing of seven leave only three possible agrees -> can never
    // reach a majority, so the motion is decided (failed) already.
    const opposing = ballots.map((b) => ({ ...b, vote: "cut" as const }));
    const failed = tallyMeeting(opposing, "hike", 7);
    expect(failed).toMatchObject({ agree: 0, disagree: 4, abstain: 3, decided: true, passed: false });
  });
});

describe("#119 FOMC meeting lifecycle (turn boundary)", () => {
  it("is a strict no-op for a world with no committee board (legacy single-chair banks)", () => {
    const world = createWorld(OPTS);
    for (let i = 0; i < 3; i++) advanceTurn(world);
    for (const bank of Object.values(world.centralBanks)) {
      expect(bank.fomcBoard).toBeUndefined();
      expect(bank.activeFomcMeeting ?? null).toBeNull();
    }
    expect(world.fomcNominations).toEqual([]);
    // The committee is the US Fed's institution; a non-committee bank cannot seed one.
    expect(seedFomcBoard(world, "UK")).toBe(false);
  });

  it("opens a meeting on cadence, auto-ballots the NPP seats and executes the carried hike", () => {
    const world = createWorld(OPTS);
    expect(seedFomcBoard(world, "US", 0)).toBe(true);
    expect(world.centralBanks["US"]!.fomcBoard).toHaveLength(7);
    // Hold the macro inputs for the open so the chair's motion is exact.
    world.countries["US"]!.economy.inflationRate = 0.05;
    world.countries["US"]!.economy.growthRate = 0.02;

    advanceTurn(world); // turn 1: meeting opens; NPP seats auto-ballot
    const bank = world.centralBanks["US"]!;
    expect(bank.activeFomcMeeting?.status).toBe("voting");
    expect(bank.activeFomcMeeting?.motion).toBe("hike");
    expect(bank.activeFomcMeeting?.ballots.every((b) => b.auto)).toBe(true);

    advanceTurn(world); // turn 2: the decided motion resolves and executes
    const resolved = bank.fomcMeetingHistory![0]!;
    expect(resolved.result).toBe("passed");
    expect(resolved.executionOutcome).toBe("applied");
    expect(resolved.motion).toBe("hike");
    // Rate moved by the snapped proposed delta, and the per-term budget ticked.
    expect(bank.primeRate).toBe(3.75);
    expect(bank.rateChangesThisTerm).toBe(1);
    expect(bank.activeFomcMeeting ?? null).toBeNull();
  });

  it("accepts a valid live player ballot, rejects bad ones, and resolves on the next turn", () => {
    const world = createWorld(OPTS);
    seedFomcBoard(world, "US", 0);
    const pSeat = world.centralBanks["US"]!.fomcBoard![1]!;
    pSeat.occupantType = "player";
    pSeat.characterId = "player";
    pSeat.characterName = "Tester";

    // No meeting yet.
    expect(castFomcBallot(world, { bankId: "US", characterId: "player", vote: "hike" })).toEqual({
      ok: false,
      reason: "no-meeting",
    });

    advanceTurn(world); // turn 1: meeting opens; the player seat is pending so it stays open
    expect(world.centralBanks["US"]!.activeFomcMeeting?.status).toBe("voting");

    // Invalid: not a seated player board member.
    expect(castFomcBallot(world, { bankId: "US", characterId: "ghost", vote: "hike" })).toEqual({
      ok: false,
      reason: "not-seated",
    });

    // Valid ballot, but a meeting never resolves on the turn it opened.
    const cast = castFomcBallot(world, { bankId: "US", characterId: "player", vote: "hike" });
    expect(cast.ok).toBe(true);
    if (cast.ok) {
      expect(cast.resolved).toBe(false);
      expect(cast.motion).toBe("hike");
    }

    // Invalid: the seat already voted this meeting.
    expect(castFomcBallot(world, { bankId: "US", characterId: "player", vote: "cut" })).toEqual({
      ok: false,
      reason: "already-voted",
    });

    advanceTurn(world); // turn 2: the pending player seat has voted, so it resolves
    expect(world.centralBanks["US"]!.fomcMeetingHistory!.length).toBeGreaterThan(0);
  });

  it("expires seats into vacancies; a dead board opens no meeting and signals the executive", () => {
    const world = createWorld(OPTS);
    seedFomcBoard(world, "US", 0);
    const board = world.centralBanks["US"]!.fomcBoard!;
    // Expire four of seven seats: only three remain seated, below the carry-a-motion threshold.
    for (const idx of [1, 2, 3, 4]) board[idx]!.termExpiresAtTurn = 0;

    advanceTurn(world); // turn 1
    const bank = world.centralBanks["US"]!;
    expect(bank.fomcBoard!.filter((s) => s.occupantType === "vacant")).toHaveLength(4);
    expect(boardCanCarryMotions(bank.fomcBoard!)).toBe(false);
    // A structurally dead board opens no meeting; the chair holds the rate.
    expect(bank.activeFomcMeeting ?? null).toBeNull();
    // Throttled vacancy notice posted to the executive.
    expect(bank.lastFomcVacancyNoticeAtTurn).toBe(1);
    expect(world.news.some((n) => /cannot carry a rate motion/.test(n.headline))).toBe(true);
  });
});

describe("#119 FOMC nomination lifecycle (turn boundary)", () => {
  it("takes a nomination through Senate confirmation into the seat", () => {
    const world = createWorld(OPTS);
    seedFomcBoard(world, "US", 0);
    world.centralBanks["US"]!.fomcBoard![1]!.termExpiresAtTurn = 0; // seat-2 expires
    const { majority } = senateParties(world);

    advanceTurn(world); // turn 1: seat-2 vacated
    const bank = world.centralBanks["US"]!;
    expect(bank.fomcBoard![1]!.occupantType).toBe("vacant");

    const id = proposeFomcNomination(world, {
      countryId: "US",
      seatId: "seat-2",
      nomineeNppId: "US-governor-new",
      nomineeName: "New Governor",
      nomineeParty: majority,
      occupantType: "npp",
      alignment: "dove",
      votingEndsOnTurn: world.meta.turn + 2,
    });

    advanceTurn(world); // turn 2: catch-up NPP senator votes
    advanceTurn(world); // turn 3: expires -> confirmed
    const nom = world.fomcNominations.find((n) => n.id === id)!;
    expect(nom.votesFor).toBeGreaterThan(nom.votesAgainst);
    expect(nom.status).toBe("confirmed");
    expect(nom.confirmedAtTurn).toBe(3);

    const seated = bank.fomcBoard!.find((s) => s.seatId === "seat-2")!;
    expect(seated.occupantType).toBe("npp");
    expect(seated.nppId).toBe("US-governor-new");
    expect(seated.alignment).toBe("dove");
    // A fresh term so the confirm is not immediately re-vacated.
    expect(seated.termExpiresAtTurn).toBe(3 + FOMC_TERM_TURNS);
  });

  it("rejects a nomination that fails the Senate and leaves the seat vacant", () => {
    const world = createWorld(OPTS);
    seedFomcBoard(world, "US", 0);
    world.centralBanks["US"]!.fomcBoard![1]!.termExpiresAtTurn = 0;
    const { minority } = senateParties(world);

    advanceTurn(world); // turn 1
    const id = proposeFomcNomination(world, {
      countryId: "US",
      seatId: "seat-2",
      nomineeNppId: "US-governor-doomed",
      nomineeName: "Doomed",
      nomineeParty: minority,
      occupantType: "npp",
      alignment: "hawk",
      votingEndsOnTurn: world.meta.turn + 2,
    });

    advanceTurn(world); // turn 2: votes
    advanceTurn(world); // turn 3: resolved -> rejected
    const nom = world.fomcNominations.find((n) => n.id === id)!;
    expect(nom.status).toBe("rejected");
    expect(nom.rejectedAtTurn).toBe(3);
    expect(world.centralBanks["US"]!.fomcBoard!.find((s) => s.seatId === "seat-2")!.occupantType).toBe(
      "vacant",
    );
  });

  it("enforces the appointment-pool eligibility rules (unknown seat, duplicate active nomination)", () => {
    const world = createWorld(OPTS);
    seedFomcBoard(world, "US", 0);
    expect(() =>
      proposeFomcNomination(world, {
        countryId: "US",
        seatId: "seat-999",
        nomineeCharacterId: "player",
        nomineeName: "X",
        occupantType: "player",
        alignment: "hawk",
      }),
    ).toThrow(/Unknown seat/);

    proposeFomcNomination(world, {
      countryId: "US",
      seatId: "seat-3",
      nomineeCharacterId: "player",
      nomineeName: "X",
      occupantType: "player",
      alignment: "hawk",
    });
    expect(() =>
      proposeFomcNomination(world, {
        countryId: "US",
        seatId: "seat-3",
        nomineeCharacterId: "player",
        nomineeName: "Y",
        occupantType: "player",
        alignment: "hawk",
      }),
    ).toThrow(/already before the Senate/);
    expect(() =>
      proposeFomcNomination(world, {
        countryId: "US",
        seatId: "seat-4",
        nomineeName: "Z",
        occupantType: "player",
        alignment: "hawk",
      }),
    ).toThrow(/exactly one/);
  });
});

describe("#119 save/reload determinism + migration", () => {
  it("round-trips FOMC board, meeting and nomination state identically across save/reload", () => {
    const a = createWorld(OPTS);
    seedFomcBoard(a, "US", 0);
    a.centralBanks["US"]!.fomcBoard![1]!.termExpiresAtTurn = 0;
    advanceTurn(a); // turn 1: vacate + open meeting
    proposeFomcNomination(a, {
      countryId: "US",
      seatId: "seat-2",
      nomineeNppId: "US-governor-x",
      nomineeName: "Governor X",
      occupantType: "npp",
      alignment: "dove",
      votingEndsOnTurn: a.meta.turn + 2,
    });
    for (let i = 0; i < 8; i++) advanceTurn(a);

    const raw = serializeSave(a, SAVED_AT);
    const b = deserializeSave(raw);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));

    for (let i = 0; i < 8; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Sanity: the cluster actually did something (not a silent no-op).
    expect((a.centralBanks["US"]!.fomcMeetingHistory ?? []).length).toBeGreaterThan(0);
    expect(a.fomcNominations.some((n) => n.status !== "active")).toBe(true);
  });

  it("backfills an empty fomcNominations on an old save and invents no board", () => {
    const world = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(world, SAVED_AT)) as SaveFile;
    raw.schemaVersion = 46;
    (raw.world.meta as unknown as Record<string, unknown>)["schemaVersion"] = 46;
    delete (raw.world as unknown as Record<string, unknown>)["fomcNominations"];

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.fomcNominations).toEqual([]);
    // No board is fabricated: the FOMC phases remain strict no-ops for old saves.
    expect(migrated.centralBanks["US"]!.fomcBoard).toBeUndefined();
  });

  it("processFomcMeetings is a no-op when a bank carries no board", () => {
    const world = createWorld(OPTS);
    const before = JSON.stringify(world.centralBanks["US"]);
    processFomcMeetings(world);
    expect(JSON.stringify(world.centralBanks["US"])).toBe(before);
  });
});

// FOMC_VOTE_WINDOW_TURNS is asserted here to keep the import meaningful and
// pin the meeting/nomination voting window the phases rely on.
describe("#119 constants", () => {
  it("exposes the reference voting window", () => {
    expect(FOMC_VOTE_WINDOW_TURNS).toBe(24);
  });
});
