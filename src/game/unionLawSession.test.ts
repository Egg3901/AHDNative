import { describe, expect, it } from "vitest";
import { GameSession } from "./session.js";

describe("public union-law session flow", () => {
  it("enacts only in the player's own country and continues the ban after save/reload and another turn", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "union-law-session-flow", playerName: "Alex", mode: "hos" });

    const foreign = session.act("sponsorBill", {
      catalogId: "labour.union_law",
      banAction: "ban",
      sponsorCountryId: "UK",
    });
    expect(foreign.ok).toBe(false);
    expect(session.view().legislature.unionLawBanned).toBe(false);

    const enacted = session.act("sponsorBill", { catalogId: "labour.union_law", banAction: "ban" });
    expect(enacted.ok).toBe(true);
    expect(session.view().legislature.unionLawBanned).toBe(true);
    expect(session.unionManagement().unions.find((row) => row.id === "US-manufacturing")?.suspended).toBe(true);

    const loaded = new GameSession();
    loaded.load(session.serialize("2026-10-02T00:00:00.000Z"));
    expect(loaded.view().legislature.unionLawBanned).toBe(true);
    expect(loaded.unionManagement().unions.find((row) => row.id === "US-manufacturing")?.suspended).toBe(true);

    loaded.advance();
    session.advance();
    expect(loaded.view().legislature.unionLawBanned).toBe(true);
    expect(loaded.unionManagement().unions.find((row) => row.id === "US-manufacturing")?.suspended).toBe(true);
    expect(loaded.serialize("2026-10-02T00:00:00.000Z")).toBe(session.serialize("2026-10-02T00:00:00.000Z"));
  });
});
