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
    const peerId = (Object.keys(saved.corporations) as string[]).find((id) => id !== "US-financial" && saved.corporations[id]!.bankCharter)!;
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
    const peerId = (JSON.parse(before).world.corporations ? Object.keys(JSON.parse(before).world.corporations) : []).find(
      (id) => id !== "US-financial" && JSON.parse(before).world.corporations[id].bankCharter,
    )!;
    const result = session.lendInterbank("US-financial", peerId, 10_000_000, 4.8);
    expect(result).toEqual({ ok: false, error: "Amount exceeds interbank share of lendable headroom" });
    expect(session.serialize("2026-09-18T00:00:00.000Z")).toBe(before);
  });

  it("advances a turn, services interest, and repays through the session", () => {
    const session = new GameSession();
    session.load(twoBankSave());
    const parsed = JSON.parse(twoBankSave()).world;
    const peerId = (Object.keys(parsed.corporations) as string[]).find((id) => id !== "US-financial" && parsed.corporations[id].bankCharter)!;
    expect(session.lendInterbank("US-financial", peerId, 96_000, 4.8).ok).toBe(true);
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
