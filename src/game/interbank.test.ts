/**
 * Interbank lifecycle through the public session seam — issue #326.
 *
 * Solo seeds one chartered bank per country, so the market peer is a
 * synthetic second charter smuggled in via an engine-built save (a setup
 * mechanism, not a seam under test). Everything asserted — lend, refuse,
 * repay, turn servicing, save/reload — goes through GameSession methods and
 * the serialized save.
 */
import { describe, expect, it } from "vitest";
import { createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const OPTIONS = { era: "1953", countryId: "US", seed: "interbank-session", playerName: "Alex" };

/** Engine-built world with lender headroom and a second same-country bank. */
function twoBankSave(): string {
  const world = createWorld(OPTIONS);
  const lender = world.corporations["US-financial"]!;
  lender.bankCharter!.npcDeposits = 1_000_000;
  lender.bankCharter!.cashReserves = 1_000_000;
  lender.bankCharter!.totalLoans = 0;
  const peer = Object.values(world.corporations).find((c) => c.countryId === "US" && c.id !== "US-financial" && !c.bankCharter)!;
  peer.bankCharter = {
    ...structuredClone(lender.bankCharter!),
    cashReserves: 500_000,
    npcDeposits: 0,
    totalLoans: 0,
    totalDeposits: 0,
    interbankDebt: 0,
    lastBankingTurn: null,
    lastSolvencyTurn: null,
  };
  return serializeSave(world, "2026-09-18T00:00:00.000Z");
}

/** The synthetic market peer: the only US-chartered bank that is not the lender. */
function peerIdOf(world: { corporations: Record<string, { countryId?: string; bankCharter?: unknown }> }): string {
  return (Object.keys(world.corporations) as string[]).find(
    (id) => id !== "US-financial" && world.corporations[id]!.countryId === "US" && world.corporations[id]!.bankCharter,
  )!;
}

function loansOf(session: GameSession) {
  return (JSON.parse(session.serialize("2026-09-18T00:00:00.000Z")).world as { interbankLoans: unknown[] }).interbankLoans;
}

function charterCash(session: GameSession, corpId: string): number {
  const world = JSON.parse(session.serialize("2026-09-18T00:00:00.000Z")).world as {
    corporations: Record<string, { bankCharter: { cashReserves: number; interbankDebt?: number } }>;
  };
  return world.corporations[corpId]!.bankCharter.cashReserves;
}

describe("interbank session seam", () => {
  it("lends through the session command and persists the loan across save/reload", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const saved = JSON.parse(twoBankSave()).world as { corporations: Record<string, { bankCharter?: unknown }> };
    const peerId = peerIdOf(saved);
    const result = session.lendInterbank("US-financial", peerId, 100_000, 4.8);
    expect(result.ok).toBe(true);
    expect(loansOf(session)).toHaveLength(1);

    const reloaded = new GameSession();
    reloaded.load(session.serialize("2026-09-18T00:00:00.000Z"));
    expect(loansOf(reloaded)).toEqual(loansOf(session));
    // A second lend on the reloaded session keeps working (book survived).
    expect(reloaded.lendInterbank("US-financial", peerId, 10_000, 4.8).ok).toBe(true);
    expect(loansOf(reloaded)).toHaveLength(2);
  });

  it("refuses over-cap lending with the exact engine error and untouched state", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const before = session.serialize("2026-09-18T00:00:00.000Z");
    const peerId = peerIdOf(JSON.parse(before).world);
    const result = session.lendInterbank("US-financial", peerId, 10_000_000, 4.8);
    expect(result).toEqual({ ok: false, error: "Amount exceeds interbank share of lendable headroom" });
    expect(session.serialize("2026-09-18T00:00:00.000Z")).toBe(before);
  });

  it("advances a turn, services interest, and repays through the session", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const peerId = peerIdOf(JSON.parse(twoBankSave()).world);
    expect(session.lendInterbank("US-financial", peerId, 96_000, 4.8).ok).toBe(true);
    // Freeze NPC flows so the assertion reads interest only (engine-suite
    // approach, applied out-of-band as setup): drain the household pool so
    // the synthetic peer attracts no deposits mid-turn.
    const frozen = JSON.parse(session.serialize("2026-09-18T00:00:00.000Z"));
    frozen.world.centralBanks["US"].externalBroadMoney = 0;
    session.load(JSON.stringify(frozen));
    const lenderBefore = charterCash(session, "US-financial");
    const borrowerBefore = charterCash(session, peerId);

    session.advance();
    const loan = loansOf(session) as { id: string; lastProcessedTurn: number; outstanding: number; status: string; arrearsTurns: number }[];
    expect(loan[0]).toMatchObject({ outstanding: 96_000, status: "current", arrearsTurns: 0 });
    expect(loan[0]!.lastProcessedTurn).toBe(1);
    // Interest-only servicing: the borrower paid, the lender collected.
    expect(charterCash(session, peerId)).toBeLessThan(borrowerBefore);
    expect(charterCash(session, "US-financial")).toBeGreaterThan(lenderBefore - 96_000 - 1);

    const repay = session.repayInterbank(loan[0]!.id as unknown as string, 96_000);
    expect(repay.ok).toBe(true);
    expect((loansOf(session) as { status: string }[])[0]!.status).toBe("repaid");
  });

  it("quotes through the session: max lends, a dollar more is refused", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const peerId = peerIdOf(JSON.parse(twoBankSave()).world);
    const quote = session.interbankQuote("US-financial");
    expect(quote.max).toBeGreaterThan(0);
    expect(quote.max).toBe(Math.min(quote.maxByShare, quote.lenderCash));
    expect(session.lendInterbank("US-financial", peerId, quote.max, 3).ok).toBe(true);
    expect(session.lendInterbank("US-financial", peerId, quote.max + 1, 3)).toEqual({
      ok: false,
      error: "Amount exceeds interbank share of lendable headroom",
    });
  });

  it("refuses an uncovered repay through the session with untouched state", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const peerId = peerIdOf(JSON.parse(twoBankSave()).world);
    const lent = session.lendInterbank("US-financial", peerId, 100_000, 4.8);
    expect(lent.ok).toBe(true);
    const loanId = (lent.ok ? lent.value : null!).id;

    // Drain the borrower out-of-band (setup mechanism, not a seam under test).
    const drained = JSON.parse(session.serialize("2026-09-18T00:00:00.000Z"));
    drained.world.corporations[peerId].bankCharter.cashReserves = 10;
    const broke = new GameSession();
    broke.load(JSON.stringify(drained));
    const before = broke.serialize("2026-09-18T00:00:00.000Z");
    expect(broke.repayInterbank(loanId, 1_000)).toEqual({ ok: false, error: "Borrower has insufficient liquid capital" });
    expect(broke.serialize("2026-09-18T00:00:00.000Z")).toBe(before);
  });

  it("defaults through advance on the 8th shortfall: debt cleared, no cash moved", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const peerId = peerIdOf(JSON.parse(twoBankSave()).world);
    expect(session.lendInterbank("US-financial", peerId, 96_000, 4.8).ok).toBe(true);

    // Seven consecutive shortfalls already booked, borrower dry, household
    // pool drained so no NPC inflow can rescue the 8th (setup mechanism).
    const primed = JSON.parse(session.serialize("2026-09-18T00:00:00.000Z"));
    primed.world.interbankLoans[0].arrearsTurns = 7;
    primed.world.corporations[peerId].bankCharter.cashReserves = 0;
    primed.world.centralBanks["US"].externalBroadMoney = 0;
    const distressed = new GameSession();
    distressed.load(JSON.stringify(primed));

    distressed.advance();
    const loans = loansOf(distressed) as { status: string; arrearsTurns: number; outstanding: number }[];
    expect(loans[0]).toMatchObject({ status: "defaulted", arrearsTurns: 8 });
    // Source keeps the defaulted outstanding on the record; the borrower's
    // debt is cleared with no cash moving for the principal.
    expect(loans[0]!.outstanding).toBe(96_000);
    const world = JSON.parse(distressed.serialize("2026-09-18T00:00:00.000Z")).world as {
      corporations: Record<string, { bankCharter: { interbankDebt?: number; cashReserves: number } }>;
    };
    expect(world.corporations[peerId]!.bankCharter.interbankDebt).toBe(0);
    expect(world.corporations[peerId]!.bankCharter.cashReserves).toBe(0);
  });

  it("repeats lend plus advance deterministically across sessions", () => {
    const run = () => {
      const session = new GameSession();
      session.load(twoBankSave());
      const peerId = peerIdOf(JSON.parse(twoBankSave()).world);
      expect(session.lendInterbank("US-financial", peerId, 96_000, 4.8).ok).toBe(true);
      session.advance();
      session.advance();
      const world = JSON.parse(session.serialize("2026-09-18T00:00:00.000Z")).world as {
        interbankLoans: unknown;
        corporations: Record<string, { bankCharter: { cashReserves: number; interbankDebt?: number } }>;
      };
      return JSON.stringify({ loans: world.interbankLoans, corps: world.corporations });
    };
    expect(run()).toBe(run());
  });

  it("round-trips a live book through load byte-identically", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const peerId = peerIdOf(JSON.parse(twoBankSave()).world);
    expect(session.lendInterbank("US-financial", peerId, 96_000, 4.8).ok).toBe(true);
    session.advance();
    const raw = session.serialize("2026-09-18T00:00:00.000Z");
    const reloaded = new GameSession();
    reloaded.load(raw);
    expect(reloaded.serialize("2026-09-18T00:00:00.000Z")).toBe(raw);
  });

  it("loads a pre-#326 save with an empty interbank book", () => {
    const world = createWorld(OPTIONS) as unknown as Record<string, unknown>;
    (world["meta"] as Record<string, unknown>)["schemaVersion"] = 47;
    delete world["interbankLoans"];
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 47, savedAt: "2026-09-18T00:00:00.000Z", world });
    const session = new GameSession();
    session.load(raw);
    expect(loansOf(session)).toEqual([]);
    expect(session.interbankQuote("US-financial")).toMatchObject({ maxByShare: 0, max: 0 });
  });
});
