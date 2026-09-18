import { describe, it, expect, vi } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { wireTransfer, DAILY_WIRE_CAP_ANCHOR, WIRE_QUOTA_WINDOW_TURNS } from "./wireTransfer.js";

const OPTS = { seed: "w35-wire-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

function samePoliticianCountry(world: ReturnType<typeof createWorld>): string {
  const target = world.politicians.find((p) => p.countryId === world.player.countryId);
  if (!target) throw new Error("fixture requires at least one same-country politician");
  return target.id;
}

describe("wireTransfer", () => {
  it("does not use host-locale formatting in persisted news", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.cash = 5000;
    const localeFormatter = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(() => {
      throw new Error("host locale accessed");
    });

    try {
      const result = wireTransfer(w, targetId, 1000);
      expect(result.ok).toBe(true);
      expect(w.news.at(-1)?.headline).toContain("1000");
    } finally {
      localeFormatter.mockRestore();
    }
  });

  it("moves cash 1:1 to a same-country politician and logs news, per the wire route's core transfer", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    const target = w.politicians.find((p) => p.id === targetId)!;
    w.player.cash = 5000;
    const before = target.cash;
    const res = wireTransfer(w, targetId, 1000);
    expect(res.ok).toBe(true);
    expect(w.player.cash).toBe(4000);
    expect(target.cash).toBe(before + 1000);
    expect(w.news.some((n) => n.headline.includes("You wire"))).toBe(true);
  });

  it("settles a cross-border wire in the sender home currency with no conversion", () => {
    const w = createWorld(OPTS);
    const foreign = w.politicians.find((p) => p.countryId !== w.player.countryId);
    if (!foreign) throw new Error("fixture requires at least one foreign politician");
    w.player.cash = 5000;
    const res = wireTransfer(w, foreign.id, 1000);
    // US sender home is USD at rate 1, so the anchor quota equals the amount.
    expect(res).toEqual({ ok: true, recipientName: foreign.name, currency: "USD", amount: 1000 });
    expect(w.player.cash).toBe(4000);
    expect(w.player.currencyBalances?.personal?.["USD"] ?? 0).toBe(0);
    // USD is foreign to the recipient, so it lands in their currency wallet,
    // never converted into their home-currency cash.
    expect(foreign.cash).toBe(0);
    expect(foreign.currencyBalances?.personal?.["USD"]).toBe(1000);
    expect(w.player.wireQuotaUsedAnchor).toBe(1000);
    expect(w.news.at(-1)?.headline).toBe(`You wire 1000 USD to ${foreign.name}.`);
  });

  it("credits the recipient home balance when the denomination matches it", () => {
    const w = createWorld(OPTS);
    const dd = w.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    w.player.currencyBalances = { personal: { DDM: 5000 } };
    const res = wireTransfer(w, dd.id, 1000, "DDM");
    expect(res.ok).toBe(true);
    expect(w.player.currencyBalances?.personal?.["DDM"]).toBe(4000);
    expect(w.player.cash).toBe(10000);
    // DDM is the recipient home currency, so it lands in their cash.
    expect(dd.cash).toBe(1000);
    expect(dd.currencyBalances?.personal?.["DDM"] ?? 0).toBe(0);
    // Quota uses the sender-home (USD) rate, not the transfer-currency rate.
    expect(w.player.wireQuotaUsedAnchor).toBe(1000);
  });

  it("holds a third currency untouched on both sides (no auto-conversion)", () => {
    const w = createWorld(OPTS);
    const dd = w.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    w.player.currencyBalances = { personal: { GBP: 2000 } };
    const playerCash = w.player.cash;
    const res = wireTransfer(w, dd.id, 500, "GBP");
    expect(res).toEqual({ ok: true, recipientName: dd.name, currency: "GBP", amount: 500 });
    expect(w.player.currencyBalances?.personal?.["GBP"]).toBe(1500);
    expect(dd.currencyBalances?.personal?.["GBP"]).toBe(500);
    expect(w.player.cash).toBe(playerCash);
    expect(dd.cash).toBe(0);
  });

  it("refuses unknown recipients, bad amounts, and unknown currencies with untouched state", () => {
    const w = createWorld(OPTS);
    const before = serializeSave(w, "2026-01-01T00:00:00.000Z");
    expect(wireTransfer(w, "no-such-politician", 10).ok).toBe(false);
    const targetId = samePoliticianCountry(w);
    for (const bad of [0, -5, 1.5, NaN, Infinity]) {
      expect(wireTransfer(w, targetId, bad).ok).toBe(false);
    }
    for (const badCurrency of ["XXX", "", " usd ", "usd", 42 as unknown as string]) {
      expect(wireTransfer(w, targetId, 10, badCurrency).ok).toBe(false);
    }
    expect(serializeSave(w, "2026-01-01T00:00:00.000Z")).toBe(before);
  });

  it("blocks cross-border and foreign-currency wires when forex is off, keeps domestic", () => {
    const w = createWorld(OPTS);
    w.featureFlags.foreignExchange = false;
    const foreign = w.politicians.find((p) => p.countryId !== w.player.countryId);
    if (!foreign) throw new Error("fixture requires at least one foreign politician");
    expect(wireTransfer(w, foreign.id, 100)).toEqual({
      ok: false,
      error: "You cannot wire funds to politicians from other countries",
    });
    const domesticId = samePoliticianCountry(w);
    expect(wireTransfer(w, domesticId, 100, "GBP")).toEqual({
      ok: false,
      error: "Foreign-currency transfers are not available",
    });
    w.player.cash = 5000;
    const res = wireTransfer(w, domesticId, 1000);
    expect(res.ok).toBe(true);
    expect(w.player.cash).toBe(4000);
  });

  it("rejects insufficient cash, unknown recipient, and invalid amounts", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.cash = 100;
    expect(wireTransfer(w, targetId, 1000).ok).toBe(false);
    expect(wireTransfer(w, "no-such-politician", 10).ok).toBe(false);
    for (const bad of [0, -5, 1.5, NaN, Infinity]) {
      expect(wireTransfer(w, targetId, bad).ok).toBe(false);
    }
  });

  it("refuses insufficient home and foreign balances with state untouched", () => {
    const w = createWorld(OPTS);
    const dd = w.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    w.player.cash = 100;
    w.player.currencyBalances = { personal: { DDM: 50 } };
    const before = serializeSave(w, "2026-01-01T00:00:00.000Z");
    expect(wireTransfer(w, dd.id, 1000)).toEqual({
      ok: false,
      error: "Insufficient USD balance. Available: 100",
    });
    expect(wireTransfer(w, dd.id, 100, "DDM").ok).toBe(false);
    expect(wireTransfer(w, dd.id, 100, "GBP").ok).toBe(false);
    expect(serializeSave(w, "2026-01-01T00:00:00.000Z")).toBe(before);
  });

  it("denominates the quota in anchor units at the sender-home rate", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.exchangeRates["US"].rate = 4;
    w.player.cash = DAILY_WIRE_CAP_ANCHOR * 4;
    const res = wireTransfer(w, targetId, 4000);
    expect(res.ok).toBe(true);
    expect(w.player.wireQuotaUsedAnchor).toBe(1000);
  });

  it("refuses fail-closed when the sender-home rate is missing", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.exchangeRates["US"].rate = NaN;
    const before = serializeSave(w, "2026-01-01T00:00:00.000Z");
    expect(wireTransfer(w, targetId, 100)).toEqual({
      ok: false,
      error: "Exchange rate unavailable, try again shortly",
    });
    expect(serializeSave(w, "2026-01-01T00:00:00.000Z")).toBe(before);
  });

  it("applies repeated wires independently with no double-apply on reload", () => {
    const w = createWorld(OPTS);
    const dd = w.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    w.player.cash = 5000;
    expect(wireTransfer(w, dd.id, 250).ok).toBe(true);
    expect(wireTransfer(w, dd.id, 250).ok).toBe(true);
    expect(w.player.cash).toBe(4500);
    expect(dd.currencyBalances?.personal?.["USD"]).toBe(500);
    expect(w.player.wireQuotaUsedAnchor).toBe(500);
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    expect(loaded.player.cash).toBe(4500);
    expect(loaded.politicians.find((p) => p.id === dd.id)?.currencyBalances?.personal?.["USD"]).toBe(500);
    expect(loaded.player.wireQuotaUsedAnchor).toBe(500);
    expect(serializeSave(loaded, "2026-01-01T00:00:00.000Z")).toBe(raw);
  });

  it("enforces the daily (turn-windowed) wire quota and resets after the window", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.cash = DAILY_WIRE_CAP_ANCHOR * 2;

    const first = wireTransfer(w, targetId, DAILY_WIRE_CAP_ANCHOR);
    expect(first.ok).toBe(true);
    expect(w.player.wireQuotaUsedAnchor).toBe(DAILY_WIRE_CAP_ANCHOR);
    expect(w.player.wireQuotaWindowStartTurn).toBe(w.meta.turn);

    const second = wireTransfer(w, targetId, 1);
    expect(second.ok).toBe(false);

    // Advance past the window; quota should reset.
    for (let i = 0; i < WIRE_QUOTA_WINDOW_TURNS; i++) advanceTurn(w);
    const third = wireTransfer(w, targetId, 1);
    expect(third.ok).toBe(true);
    expect(w.player.wireQuotaUsedAnchor).toBe(1);
  });

  it("wires through executeAction as wireTransfer (per-action success counter increments)", () => {
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    w.player.actions = 10;
    const res = executeAction(w, "player", "wireTransfer", { targetPoliticianId: targetId, amount: 500 });
    expect(res.ok).toBe(true);
    expect(w.player.actionCounts["wireTransfer"]).toBe(1);
  });

  it("wires a foreign denomination through executeAction and refunds actions on refusal", () => {
    const w = createWorld(OPTS);
    const dd = w.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    w.player.actions = 10;
    w.player.currencyBalances = { personal: { DDM: 5000 } };
    const res = executeAction(w, "player", "wireTransfer", {
      targetPoliticianId: dd.id,
      amount: 1000,
      currency: "DDM",
    });
    expect(res).toEqual({ ok: true, message: `Wired 1000 DDM to ${dd.name}` });
    expect(dd.cash).toBe(1000);

    const actionsBefore = w.player.actions;
    const cashBefore = w.player.cash;
    const refused = executeAction(w, "player", "wireTransfer", {
      targetPoliticianId: dd.id,
      amount: 999_999_999,
      currency: "DDM",
    });
    expect(refused.ok).toBe(false);
    expect(w.player.actions).toBe(actionsBefore);
    expect(w.player.cash).toBe(cashBefore);
    expect(dd.cash).toBe(1000);
  });

  it("settles immediately at action time: turns preserve balances and reset quota after the window", () => {
    const w = createWorld(OPTS);
    const dd = w.politicians.find((p) => p.countryId === "DD");
    if (!dd) throw new Error("fixture requires a DD politician");
    w.player.cash = 5000;
    expect(wireTransfer(w, dd.id, 1000).ok).toBe(true);
    // No pending-wire state: the recipient holds the funds synchronously.
    expect(dd.currencyBalances?.personal?.["USD"]).toBe(1000);
    for (let i = 0; i < 5; i++) advanceTurn(w);
    // Turn phases (interest, forex repricing) never move personal wire balances.
    expect(w.player.cash).toBe(4000);
    expect(dd.currencyBalances?.personal?.["USD"]).toBe(1000);
    expect(dd.cash).toBe(0);
    // Quota window still open at turn 5: filling the cap refuses.
    w.player.cash = DAILY_WIRE_CAP_ANCHOR * 2;
    expect(wireTransfer(w, dd.id, DAILY_WIRE_CAP_ANCHOR).ok).toBe(false);
    for (let i = 0; i < WIRE_QUOTA_WINDOW_TURNS; i++) advanceTurn(w);
    const after = wireTransfer(w, dd.id, 1);
    expect(after.ok).toBe(true);
    expect(w.player.wireQuotaUsedAnchor).toBe(1);
  });
});

describe("W35 wire transfer schema", () => {
  it("round-trips wireQuota fields through save/load at SCHEMA_VERSION 36", () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(36);
    const w = createWorld(OPTS);
    const targetId = samePoliticianCountry(w);
    wireTransfer(w, targetId, 100);
    const raw = serializeSave(w, "2026-01-01T00:00:00.000Z");
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.player.wireQuotaUsedAnchor).toBe(100);
    expect(loaded.player.wireQuotaWindowStartTurn).toBe(w.meta.turn);
    const target = loaded.politicians.find((p) => p.id === targetId)!;
    expect(target.cash).toBe(100);
  });

  it("migrates a pre-v36 save with wireQuota fields backfilled to 0/null and politician cash to 0", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z"));
    delete raw.world.player.wireQuotaUsedAnchor;
    delete raw.world.player.wireQuotaWindowStartTurn;
    for (const pol of raw.world.politicians) delete pol.cash;
    raw.world.meta.schemaVersion = 33;
    raw.schemaVersion = 33;
    const loaded = deserializeSave(JSON.stringify(raw));
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.player.wireQuotaUsedAnchor).toBe(0);
    expect(loaded.player.wireQuotaWindowStartTurn).toBeNull();
    for (const pol of loaded.politicians) expect(pol.cash).toBe(0);
  });

  it("loads a save without currency wallets and settles a cross-border wire", () => {
    const w = createWorld(OPTS);
    const raw = JSON.parse(serializeSave(w, "2026-01-01T00:00:00.000Z"));
    delete raw.world.player.currencyBalances;
    for (const pol of raw.world.politicians) delete pol.currencyBalances;
    const loaded = deserializeSave(JSON.stringify(raw));
    const dd = loaded.politicians.find((p) => p.countryId !== loaded.player.countryId);
    if (!dd) throw new Error("fixture requires at least one foreign politician");
    expect(dd.currencyBalances).toBeUndefined();
    loaded.player.cash = 5000;
    const res = wireTransfer(loaded, dd.id, 1000);
    expect(res.ok).toBe(true);
    expect(dd.currencyBalances?.personal?.["USD"]).toBe(1000);
  });

  it("determinism: identical seeds produce identical politician cash + quota state after a wire and turns", () => {
    const mk = () => {
      const w = createWorld(OPTS);
      const targetId = samePoliticianCountry(w);
      wireTransfer(w, targetId, 250);
      const dd = w.politicians.find((p) => p.countryId !== w.player.countryId);
      if (dd) wireTransfer(w, dd.id, 100);
      return w;
    };
    const a = mk();
    const b = mk();
    for (let i = 0; i < 5; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(a.player.wireQuotaUsedAnchor).toBe(b.player.wireQuotaUsedAnchor);
    expect(a.politicians.map((p) => p.cash)).toEqual(b.politicians.map((p) => p.cash));
    expect(a.politicians.map((p) => p.currencyBalances?.personal?.["USD"] ?? 0)).toEqual(
      b.politicians.map((p) => p.currencyBalances?.personal?.["USD"] ?? 0),
    );
  });
});
