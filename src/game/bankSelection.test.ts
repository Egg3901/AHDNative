import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-bank-select-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";

describe("session bank selection (#76)", () => {
  it("projects bank options and the moveSavings action on create", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view.finance.savingsHolderId).toBe("centralBank");
    expect(view.finance.moveSavings).toMatchObject({
      id: "moveSavings",
      requires: "holder",
      available: true,
    });
    const ids = (view.finance.banks ?? []).map((b) => b.id);
    expect(ids).toContain("centralBank");
    expect(ids).toContain("US-financial");
  });

  it("moves the savings holder to a chartered bank and back, preserving balances", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("moveSavings", { holder: "US-financial" }).ok).toBe(true);
    expect(session.view().finance).toMatchObject({
      cash: 10000,
      savings: 0,
      savingsHolderId: "US-financial",
    });
    expect(session.act("depositSavings", { amount: 2000 }).ok).toBe(true);
    expect(session.act("moveSavings", { holder: "centralBank" }).ok).toBe(true);
    expect(session.view().finance).toMatchObject({
      cash: 8000,
      savings: 2000,
      savingsHolderId: "centralBank",
    });
  });

  it("leaves the world untouched when a bank move is refused", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.serialize(SAVED_AT);
    expect(session.act("moveSavings", { holder: "no-such-bank" }).ok).toBe(false);
    expect(session.act("moveSavings", {}).ok).toBe(false);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("preserves the selected holder through save/load", () => {
    const session = new GameSession();
    session.create(options);
    session.act("moveSavings", { holder: "US-financial" });
    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(loaded.view().finance.savingsHolderId).toBe("US-financial");
    expect((loaded.view().finance.banks ?? []).map((b) => b.id)).toContain("US-financial");
  });
});
