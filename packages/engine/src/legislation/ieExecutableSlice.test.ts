import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { nppBillSponsorshipPhase } from "../npp/nppBillSponsorship.js";

function seatIrishGovernment(world: ReturnType<typeof createWorld>): void {
  // Controlled formed-government fixture for isolated bill lifecycle tests.
  // The integrated browser smoke separately covers a resolver-awarded seat,
  // source PM nomination, weighted Dáil vote, and persisted appointment.
  const gov = world.governments.IE!;
  const chamber = world.legislatures.IE!.chambers.find((entry) => entry.key === "dail")!;
  const [partyId, seats] = Object.entries(chamber.composition.seatsByParty)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]!;
  const pm = world.politicians.find((person) => person.countryId === "IE" && person.chamberKey === "dail" && person.partyId === partyId)!;
  Object.assign(gov, {
    status: "formed",
    formationType: "minority",
    governingPartyId: partyId,
    coalitionPartyIds: null,
    pmPoliticianId: pm.id,
    totalSeatsSupporting: seats,
    totalSeats: chamber.seats,
    majorityThreshold: Math.floor(chamber.seats / 2) + 1,
    seatsByParty: { ...chamber.composition.seatsByParty },
    lostMajority: false,
    formedTurn: world.meta.turn,
    pmVacancyDeadlineTurn: null,
    confidence: 75,
  });
}

/**
 * Public player-command boundary for Ireland's authored VAT Act (#284).
 * AHDGame cb66acdf0129616b8a09902727e9b58715c8bacb: src/lib/countries/ie/data/ieLegislationTypes.ts
 * authors the 21% 1991 posture and the 23% option (ie_vat_rate_opt_6).
 * Native's 1991 IE pack is playable and seeds salesTax=21.
 */
describe("Ireland executable VAT law (#284)", () => {
  it("refuses a foreign Head of State attempting to sponsor an Irish bill", () => {
    const world = createWorld({ seed: "ie-vat-foreign", playerName: "P", countryId: "US", era: "1991" });
    world.player.mode = "hos";
    world.player.actions = 100;
    const before = world.player.actions;
    const result = executeAction(world, "player", "sponsorBill", {
      catalogId: "ie_vat_rate", sponsorCountryId: "IE", taxRate: 23,
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("player's country") });
    expect(world.player.actions).toBe(before);
    expect(world.bills).toHaveLength(0);
  });

  it("lets the 1991 Irish Head of State sponsor the authored 23% option", () => {
    const world = createWorld({ seed: "ie-vat-284", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(world);
    world.player.mode = "hos";
    world.player.actions = 100;
    world.player.nationalInfluence = 5;
    expect(world.budgets.IE?.taxRates.salesTax).toBe(21);
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
      status: "proposed",
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_6", effectDirection: 0, economic: 0, social: 0 })],
    });
    expect(world.player.actions).toBe(90);
    expect(world.player.nationalInfluence).toBe(0);

    const zeroOptionWorld = createWorld({ seed: "ie-vat-zero-option", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(zeroOptionWorld);
    zeroOptionWorld.player.mode = "hos";
    zeroOptionWorld.player.actions = 100;
    zeroOptionWorld.player.nationalInfluence = 5;
    const abolitionOption = executeAction(zeroOptionWorld, "player", "sponsorBill", {
      catalogId: "ie_vat_rate", taxRate: 0,
    });
    expect(abolitionOption.ok).toBe(true);
    expect(zeroOptionWorld.bills.at(-1)).toMatchObject({
      selectedRate: 0,
      effectDirection: -1,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_0", effectDirection: -1 })],
    });
  });

  it("carries the Irish VAT bill through votes, enactment, phase-in, save and continued turns", () => {
    const world = createWorld({ seed: "ie-vat-continuation", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(world);
    // Isolate the player bill from the autonomous NPP proposal path below.
    world.nppAutonomyLevel = "off";
    world.player.legislativeSeat = { countryId: "IE", chamberKey: "dail" };
    world.player.actions = 100;
    world.player.nationalInfluence = 5;
    world.player.partyId = Object.entries(world.legislatures.IE!.chambers[0]!.composition.seatsByParty)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23 }).ok).toBe(true);
    const bill = world.bills.at(-1)!;
    for (let i = 0; i < 12 && bill.status !== "signed" && bill.status !== "failed"; i++) {
      advanceTurn(world);
      if (bill.status === "active" && !bill.votes.player) {
        expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
      }
    }
    expect(bill.status).toBe("signed");
    expect(bill.voteSnapshot?.for).toBeGreaterThan(bill.voteSnapshot?.against ?? 0);
    // Source bill enactment applies one point in its signing turn and queues
    // the target. The next turn reaches 23 and clears the persisted ramp.
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

    restored.player.nationalInfluence = 5;
    restored.player.actions = 100;
    seatIrishGovernment(restored);
    const rateReplacement = executeAction(restored, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 25 });
    expect(rateReplacement.ok).toBe(true);
    const replacementBill = restored.bills.at(-1)!;
    expect(replacementBill).toMatchObject({
      selectedRate: 25,
      effectDirection: 1,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_7", effectDirection: 1 })],
    });
    for (let i = 0; i < 48 && replacementBill.status !== "signed" && replacementBill.status !== "failed"; i++) {
      advanceTurn(restored);
      if (replacementBill.status === "active" && !replacementBill.votes.player) {
        expect(executeAction(restored, "player", "voteOnBill", { billId: replacementBill.id, vote: "for" }).ok).toBe(true);
      }
    }
    expect(replacementBill.status, JSON.stringify({ party: restored.player.partyId, partySeats: restored.legislatures.IE!.chambers[0]!.composition.seatsByParty[restored.player.partyId ?? ""], voteSnapshot: replacementBill.voteSnapshot, playerVote: replacementBill.votes.player })).toBe("signed");
    expect(replacementBill.selectedRate).toBe(25);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(24);
    expect(restored.budgets.IE?.taxRatePhaseIn?.salesTax).toBe(25);
    expect(restored.enactedLaws.filter((law) => law.id === "ie_vat_rate" && law.repealedAtTurn === undefined)).toHaveLength(1);
    expect(restored.enactedLaws.find((law) => law.id === "ie_vat_rate" && law.repealedAtTurn === undefined)?.level).toBe(1);
    const resumed = deserializeSave(serializeSave(restored, "2026-09-25T00:00:00.000Z"));
    advanceTurn(restored);
    advanceTurn(resumed);
    expect(resumed.budgets.IE?.taxRates.salesTax).toBe(restored.budgets.IE?.taxRates.salesTax);
    expect(restored.budgets.IE?.taxRates.salesTax).toBe(25);
    expect(resumed.budgets.IE?.taxRatePhaseIn?.salesTax).toBeUndefined();
    expect(resumed.budgets.IE?.taxRatePhaseIn).toEqual(restored.budgets.IE?.taxRatePhaseIn);
  });

  it("refuses the source proposal without 5 NPI and leaves saved command state unchanged", () => {
    const world = createWorld({ seed: "ie-vat-npi-gate", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(world);
    world.player.mode = "hos";
    world.player.actions = 20;
    world.player.nationalInfluence = 4;
    const before = serializeSave(world, "2026-10-01T00:00:00.000Z");
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 0 })).toMatchObject({
      ok: false, error: expect.stringContaining("Required: 5"),
    });
    expect(serializeSave(world, "2026-10-01T00:00:00.000Z")).toEqual(before);
  });

  it("gives an autonomous Irish VAT proposal an authored rate option", () => {
    const world = createWorld({ seed: "ie-vat-continuation", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(world);
    for (let i = 0; i < 4 && !world.bills.some((bill) => bill.nppSponsored && bill.legislationTypeId === "ie_vat_rate"); i++) advanceTurn(world);
    const nppBill = world.bills.find((bill) => bill.nppSponsored && bill.legislationTypeId === "ie_vat_rate");
    expect(nppBill).toBeDefined();
    // Game 01797b2708's historical NPP seed copies the resolved party platform
    // exactly (seedHistorical.ts), and Fianna Fáil is authored at (0, 0). The
    // nearest available source rung after excluding enacted 21% is 23%, option 6.
    expect(nppBill).toMatchObject({
      selectedRate: 23,
      effectDirection: 0,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_6", effectDirection: 0 })],
    });
  });

  it("uses source tax urgency to choose a right-stance VAT option when inflation is hot", () => {
    const world = createWorld({ seed: "ie-vat-continuation", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(world);
    world.countries.IE!.economy.inflationRate = 0.08;
    world.player.mode = "hos";
    world.meta.turn = 1;
    nppBillSponsorshipPhase.run(world, rngFromSeed("ie-vat-continuation"));
    const nppBill = world.bills.find((bill) => bill.nppSponsored && bill.legislationTypeId === "ie_vat_rate");

    // Game 01797b2708 uses inflation > 4% as positive tax urgency, then picks
    // the best platform fit among right-stance (+1) options. Fianna Fáil's
    // (0, 0) platform makes 25%, option 7, the nearest eligible authored rung.
    expect(nppBill).toMatchObject({
      selectedRate: 25,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_7" })],
    });
  });

  it("uses the sponsor's progressed stance within the source urgency slate", () => {
    const world = createWorld({ seed: "ie-vat-continuation", playerName: "P", countryId: "IE", era: "1991" });
    seatIrishGovernment(world);
    world.countries.IE!.economy.inflationRate = 0.08;
    world.meta.turn = 1;
    const majority = Object.entries(world.legislatures.IE!.chambers[0]!.composition.seatsByParty)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    // The source selector scores the current NPP party policy within the urgency
    // directed (+1) option slate. A later rightward shift must therefore move
    // its pick above the neutral seeded-platform vector (25%).
    world.parties[majority]!.economicPosition = 5;
    world.parties[majority]!.socialPosition = 2;
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    nppBillSponsorshipPhase.run(restored, rngFromSeed("ie-vat-continuation"));
    const nppBill = restored.bills.find((bill) => bill.nppSponsored && bill.legislationTypeId === "ie_vat_rate");
    expect(nppBill).toMatchObject({
      selectedRate: 35,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_10" })],
    });
  });
});
