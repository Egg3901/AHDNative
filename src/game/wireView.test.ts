import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import type { GameView } from "./types";

const options = { era: "1953", countryId: "US", seed: "native-wire-view", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";

function viewOf(session: GameSession): GameView {
  return session.view() as GameView;
}

describe("finance wire projection", () => {
  it("projects home balance, recorded recipients, and a full quota on a fresh world", () => {
    const session = new GameSession();
    session.create(options);
    const wire = viewOf(session).finance.wire;
    expect(wire).toBeDefined();
    expect(wire!.forexEnabled).toBe(true);
    expect(wire!.balances[0]).toMatchObject({ currency: "USD", balance: 10000, home: true });
    expect(wire!.recipients.length).toBeGreaterThan(0);
    expect(wire!.recipients.some((r) => r.crossBorder)).toBe(true);
    expect(wire!.recipients.some((r) => !r.crossBorder)).toBe(true);
    expect(wire!.quotaRemainingAnchor).toBe(50_000_000);
    expect(wire!.action.available).toBe(true);
  });

  it("projects recorded foreign buckets alongside home cash", () => {
    const session = new GameSession();
    session.create(options);
    const raw = JSON.parse(session.serialize(SAVED_AT)) as { world: Record<string, unknown> };
    const world = raw.world as { player: { currencyBalances?: { personal: Record<string, number> } } };
    world.player.currencyBalances = { personal: { DDM: 5000 } };
    session.load(JSON.stringify(raw));
    const balances = viewOf(session).finance.wire!.balances;
    expect(balances).toContainEqual({ currency: "USD", balance: 10000, home: true });
    expect(balances).toContainEqual({ currency: "DDM", balance: 5000, home: false });
  });

  it("reduces the projected quota after a settled wire and survives save/reload", () => {
    const session = new GameSession();
    session.create(options);
    const target = viewOf(session).finance.wire!.recipients.find((r) => !r.crossBorder)!;
    expect(session.act("wireTransfer", { targetPoliticianId: target.id, amount: 1000 }).ok).toBe(true);
    const wire = viewOf(session).finance.wire!;
    expect(wire.quotaRemainingAnchor).toBeLessThan(50_000_000);
    expect(wire.balances[0]!.balance).toBe(9000);

    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    const reloaded = (loaded.view() as GameView).finance.wire!;
    expect(reloaded.quotaRemainingAnchor).toBe(wire.quotaRemainingAnchor);
    expect(reloaded.balances[0]!.balance).toBe(9000);
  });
});
