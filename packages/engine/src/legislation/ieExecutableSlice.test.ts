import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";

/**
 * Public player-command boundary for Ireland's authored VAT Act (#284).
 * AHDGame 96831835: src/lib/countries/ie/data/ieLegislationTypes.ts
 * authors the 21% 1991 posture and the 23% option (ie_vat_rate_opt_6).
 * Native's 1991 IE pack is playable and seeds salesTax=21.
 */
describe("Ireland executable VAT law (#284)", () => {
  it("refuses a foreign Head of State attempting to sponsor an Irish bill", () => {
    const world = createWorld({ seed: "ie-vat-foreign", playerName: "P", countryId: "US", era: "1991", mode: "hos" });
    world.player.actions = 100;
    // Scoped lifecycle fixture funds proposals at source 10 AP / 5 NPI each.
    world.player.nationalInfluence = 15;
    const before = world.player.actions;
    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "ie_vat_rate", sponsorCountryId: "IE", taxRate: 23,
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("player's country") });
    expect(world.player.actions).toBe(before);
    expect(world.bills).toHaveLength(0);
  });

  it("enacts the authored 23% option as an immediate source HoS decree", () => {
    const world = createWorld({ seed: "ie-vat-284", playerName: "P", countryId: "IE", era: "1991", mode: "hos" });
    world.player.actions = 100;
    // Scoped lifecycle fixture funds proposals at source 10 AP / 5 NPI each.
    world.player.nationalInfluence = 15;
    expect(world.budgets.IE?.taxRates.salesTax).toBe(21);
    const beforeActions = world.player.actions;
    const beforeInfluence = world.player.nationalInfluence;
    const actionsBeforeInvalidOption = world.player.actions;

    const unsupported = executeAction(world, "player", "sponsorBill", {
      catalogId: "ie_vat_rate", taxRate: 22,
    });
    expect(unsupported).toMatchObject({ ok: false, error: expect.stringContaining("not an authored option") });
    expect(world.bills).toHaveLength(0);
    expect(world.player.actions).toBe(actionsBeforeInvalidOption);

    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "ie_vat_rate", taxRate: 23,
    });
    expect(result.ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({
      countryId: "IE",
      legislationTypeId: "ie_vat_rate",
      selectedRate: 23,
      effectDirection: 0,
      status: "signed",
      enactedAtTurn: world.meta.turn,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_6", economic: 0, social: 0 })],
    });
    expect(world.bills.at(-1)?.votes).toEqual({});
    expect(world.bills.at(-1)?.voteSnapshot).toBeUndefined();
    expect(world.budgets.IE?.taxRates.salesTax).toBe(22);
    expect(world.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(23);
    expect(world.player.actions).toBe(beforeActions);
    expect(world.player.nationalInfluence).toBe(beforeInfluence);
  });

  it("keeps a career member's Irish VAT bill on the ordinary chamber vote and save path", () => {
    const world = createWorld({ seed: "ie-vat-continuation", playerName: "P", countryId: "IE", era: "1991" });
    // A same-country Dáil seat is the ordinary career sponsorship
    // prerequisite; unlike the HoS path above, this bill must pass chamber votes.
    const dail = world.legislatures.IE!.chambers.find((chamber) => chamber.key === "dail")!;
    const sponsorPartyId = Object.entries(dail.composition.seatsByParty)
      .filter(([, seats]) => seats > 0)
      .sort(([leftId, leftSeats], [rightId, rightSeats]) => rightSeats - leftSeats || leftId.localeCompare(rightId))[0]![0];
    world.player.partyId = sponsorPartyId;
    world.player.legislativeSeat = { countryId: "IE", chamberKey: "dail" };
    // Isolate the player bill from autonomous NPP proposals. Their option
    // selection is a separate reference-parity gap in #284.
    world.nppAutonomyLevel = "off";
    world.player.actions = 100;
    // Scoped lifecycle fixture funds proposals at source 10 AP / 5 NPI each.
    world.player.nationalInfluence = 15;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23 }).ok).toBe(true);
    const bill = world.bills.at(-1)!;
    for (let i = 0; i < 12 && bill.status !== "signed" && bill.status !== "failed"; i++) advanceTurn(world);
    expect(bill.status).toBe("signed");
    expect(bill.voteSnapshot?.for).toBeGreaterThan(bill.voteSnapshot?.against ?? 0);
    // Signing makes the first one-point step; the target advances next turn.
    expect(world.budgets.IE?.taxRates.salesTax).toBe(22);
    expect(world.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(23);
    for (let i = 0; i < 3; i++) advanceTurn(world);
    expect(world.budgets.IE?.taxRates.salesTax).toBe(23);

    const restored = deserializeSave(serializeSave(world, "2026-09-25T00:00:00.000Z"));
    expect(restored.bills.find((candidate) => candidate.id === bill.id)?.status).toBe("signed");
    advanceTurn(world);
    advanceTurn(restored);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(world.budgets.IE?.taxRates.salesTax);
    expect(restored.enactedLaws).toEqual(world.enactedLaws);

    const repeal = executeAction(restored, "player", "repealLaw", { catalogId: "ie_vat_rate" });
    expect(repeal.ok).toBe(true);
    const repealBill = restored.bills.at(-1)!;
    for (let i = 0; i < 12 && repealBill.status !== "signed" && repealBill.status !== "failed"; i++) advanceTurn(restored);
    expect(repealBill.status).toBe("signed");
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(22);
    expect(restored.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(21);
    advanceTurn(restored);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(21);
    expect(restored.enactedLaws.some((law) => law.id === "ie_vat_rate" && law.repealedAtTurn === undefined)).toBe(false);
  });

  it("gives an autonomous Irish VAT proposal an authored rate option", () => {
    const world = createWorld({ seed: "ie-vat-continuation", playerName: "P", countryId: "IE", era: "1991", mode: "hos" });
    world.player.actions = 100;
    // Scoped lifecycle fixture funds proposals at source 10 AP / 5 NPI each.
    world.player.nationalInfluence = 15;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23 }).ok).toBe(true);
    for (let i = 0; i < 4 && !world.bills.some((bill) => bill.nppSponsored && bill.legislationTypeId === "ie_vat_rate"); i++) advanceTurn(world);
    const nppBill = world.bills.find((bill) => bill.nppSponsored && bill.legislationTypeId === "ie_vat_rate");
    expect(nppBill).toBeDefined();
    expect(nppBill?.selectedRate).toEqual(expect.any(Number));
    expect(nppBill?.selectedRate).not.toBe(21);
    expect(nppBill?.selectedRate).not.toBe(23);
    expect(nppBill?.provisions[0]?.policyOptionId).toMatch(/^ie_vat_rate_opt_/);
  });
});
