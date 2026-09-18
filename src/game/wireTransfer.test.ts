import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-wire-xborder", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";

interface WireWorld {
  player: { cash: number; currencyBalances?: { personal: Record<string, number> } };
  politicians: Array<{
    id: string;
    name: string;
    countryId: string;
    cash: number;
    currencyBalances?: { personal: Record<string, number> };
  }>;
}

function worldOf(session: GameSession): WireWorld {
  return (JSON.parse(session.serialize(SAVED_AT)) as { world: WireWorld }).world;
}

function domesticId(world: WireWorld): string {
  const target = world.politicians.find((p) => p.countryId === "US");
  if (!target) throw new Error("fixture requires a same-country politician");
  return target.id;
}

function foreignId(world: WireWorld): string {
  const target = world.politicians.find((p) => p.countryId !== "US");
  if (!target) throw new Error("fixture requires a foreign politician");
  return target.id;
}

describe("session cross-border wires", () => {
  it("settles a domestic wire through act with save/reload identity", () => {
    const session = new GameSession();
    session.create(options);
    const id = domesticId(worldOf(session));
    const res = session.act("wireTransfer", { targetPoliticianId: id, amount: 1000 });
    expect(res.ok).toBe(true);
    const after = worldOf(session);
    expect(after.player.cash).toBe(9000);
    expect(after.politicians.find((p) => p.id === id)?.cash).toBe(1000);

    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    const reloaded = worldOf(loaded);
    expect(reloaded.player.cash).toBe(9000);
    expect(reloaded.politicians.find((p) => p.id === id)?.cash).toBe(1000);
  });

  it("settles a cross-border wire in the sender home currency", () => {
    const session = new GameSession();
    session.create(options);
    const id = foreignId(worldOf(session));
    const res = session.act("wireTransfer", { targetPoliticianId: id, amount: 1000 });
    expect(res.ok).toBe(true);
    const after = worldOf(session);
    const target = after.politicians.find((p) => p.id === id)!;
    expect(after.player.cash).toBe(9000);
    expect(target.cash).toBe(0);
    expect(target.currencyBalances?.personal?.["USD"]).toBe(1000);

    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(worldOf(loaded).politicians.find((p) => p.id === id)?.currencyBalances?.personal?.["USD"]).toBe(1000);
  });

  it("settles a foreign denomination through act", () => {
    const session = new GameSession();
    session.create(options);
    const before = worldOf(session);
    const dd = before.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    // Fund a DDM balance through a save round-trip so the session path owns it.
    const raw = JSON.parse(session.serialize(SAVED_AT)) as { world: WireWorld };
    raw.world.player.currencyBalances = { personal: { DDM: 5000 } };
    session.load(JSON.stringify(raw));
    const res = session.act("wireTransfer", { targetPoliticianId: dd.id, amount: 1000, currency: "DDM" });
    expect(res.ok).toBe(true);
    const after = worldOf(session);
    expect(after.player.currencyBalances?.personal?.["DDM"]).toBe(4000);
    expect(after.politicians.find((p) => p.id === dd.id)?.cash).toBe(1000);
  });

  it("leaves the session untouched when a wire is refused", () => {
    const session = new GameSession();
    session.create(options);
    const id = foreignId(worldOf(session));
    const before = session.serialize(SAVED_AT);
    expect(session.act("wireTransfer", { targetPoliticianId: id, amount: 999_999_999 }).ok).toBe(false);
    expect(session.act("wireTransfer", { targetPoliticianId: "no-such-politician", amount: 10 }).ok).toBe(false);
    expect(session.act("wireTransfer", { targetPoliticianId: id, amount: 10, currency: "XXX" }).ok).toBe(false);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });
});
