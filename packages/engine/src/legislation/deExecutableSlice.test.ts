import { describe, expect, it } from "vitest";
import { earnCareerGovernment } from "../government/earnCareerGovernment.testSupport.js";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { playerNationalInfluenceGain } from "../actions/playerInfluence.js";
import { proposalNpiCost } from "./proposalCosts.js";
import { getLaw } from "./catalog.js";
import type { Bill } from "./types.js";

const DE_TAX_LAWS = [
  "de_income_tax_rate",
  "de_solidarity_surcharge",
  "de_vat_rate",
  "de_domestic_corporate_tax_rate",
  "de_foreign_corporate_tax_rate",
  "de_payroll_social_insurance",
  "de_customs_tariff_rate",
] as const;

function passBill(world: ReturnType<typeof createWorld>, bill: Bill): void {
  for (let i = 0; i < 12 && bill.status !== "signed" && bill.status !== "failed"; i++) {
    advanceTurn(world);
  }
  expect(bill.status).toBe("signed");
}

function expectSourceSalesTax(world: ReturnType<typeof createWorld>, rate: number): void {
  const budget = world.budgets.DE!;
  const sourceRevenue = budget.taxBases.taxableSales * (rate / 100);
  // Game stores the direct float result; Native stores currency units rounded
  // to the nearest unit. The source-derived formula should differ by < 0.5.
  expect(Math.abs(budget.revenue.salesTax - sourceRevenue)).toBeLessThanOrEqual(0.5);
}

describe("Germany national tax laws (#287)", () => {
  it("projects source HoS office NPI and accrues it on normal turns", () => {
    const world = createWorld({ seed: "de-hos-npi-287", playerName: "P", countryId: "DE", era: "2019", mode: "hos" });
    expect(world.player.currentOffice).toMatchObject({ countryId: "DE", type: "chancellor" });
    expect(playerNationalInfluenceGain(world)).toBe(2.5);
    advanceTurn(world);
    expect(world.player.nationalInfluence).toBe(2.5);
    advanceTurn(world);
    expect(world.player.nationalInfluence).toBe(5);
  });

  it("exposes only the seven source-authored national tax rows with their full option ladders", () => {
    const expectedRates: Record<(typeof DE_TAX_LAWS)[number], number[]> = {
      de_income_tax_rate: [0, 10, 20, 28, 35, 42, 45, 50, 55, 60, 65],
      de_solidarity_surcharge: [0, 0.5, 1, 2, 4, 5.5, 6.5, 7.5, 8.5, 9.5, 10],
      de_vat_rate: [0, 5, 7, 10, 16, 19, 20, 22, 24, 25, 28],
      de_domestic_corporate_tax_rate: [0, 3, 5, 8, 12, 15, 18, 20, 22, 25, 30],
      de_foreign_corporate_tax_rate: [0, 3, 5, 8, 12, 15, 18, 20, 22, 25, 30],
      de_payroll_social_insurance: [0, 5, 10, 13, 16, 20, 22, 24, 26, 28, 30],
      de_customs_tariff_rate: [0, 1, 2, 3, 4, 5, 6, 8, 10, 14, 20],
    };
    const incomeDirection = [1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1];
    const incomeEffect = [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5];
    const vatDirection = [-1, -1, -1, -1, -1, 0, 1, 1, 1, 1, 1];
    const vatEffect = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const tariffDirection = [-1, -1, -1, -1, -1, 0, 1, 1, 1, 1, 1];
    const tariffEffect = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const taxTypes: Record<(typeof DE_TAX_LAWS)[number], string> = {
      de_income_tax_rate: "incomeTax",
      de_solidarity_surcharge: "solidaritySurcharge",
      de_vat_rate: "salesTax",
      de_domestic_corporate_tax_rate: "domesticCorporateTax",
      de_foreign_corporate_tax_rate: "foreignCorporateTax",
      de_payroll_social_insurance: "payrollTax",
      de_customs_tariff_rate: "tariffs",
    };
    for (const id of DE_TAX_LAWS) {
      const law = getLaw(id);
      expect(law, id).toMatchObject({ countryId: "DE", kind: "tax", allowedScope: "national", status: "available" });
      expect(law?.taxPolicy?.taxType, id).toBe(taxTypes[id]);
      const options = law?.taxPolicy?.options ?? [];
      expect(options.map((option) => option.rate), id).toEqual(expectedRates[id]);
      expect(options.map((option) => option.effectDirection), id).toEqual(
        id === "de_customs_tariff_rate" ? tariffDirection : id === "de_vat_rate" ? vatDirection : incomeDirection,
      );
      expect(options.map((option) => option.economic), id).toEqual(
        id === "de_customs_tariff_rate" ? tariffEffect : id === "de_vat_rate" ? vatEffect : incomeEffect,
      );
      expect(options.every((option) => option.social === 0), id).toBe(true);
    }
    expect(getLaw("de_vat_rate")?.taxPolicy?.options?.[6]).toMatchObject({
      id: "de_vat_rate_opt_6",
      rate: 20,
      effectDirection: 1,
      economic: 1,
      social: 0,
    });
    expect(getLaw("de_trade_tax")).toMatchObject({ status: "unavailable", blockingSystem: "budget/taxRateLadder" });
  });

  it("refuses a foreign Head of State from initiating a German bill without spending resources", () => {
    const world = createWorld({ seed: "de-tax-foreign-287", playerName: "P", countryId: "US", era: "2019", mode: "hos" });
    world.player.actions = 100;
    world.player.nationalInfluence = 30;
    const beforeActions = world.player.actions;
    const beforeInfluence = world.player.nationalInfluence;
    expect(executeAction(world, "player", "sponsorBill", {
      catalogId: "de_vat_rate",
      sponsorCountryId: "DE",
      taxRate: 20,
    })).toMatchObject({ ok: false, error: expect.stringContaining("player's country") });
    expect(world.player.actions).toBe(beforeActions);
    expect(world.player.nationalInfluence).toBe(beforeInfluence);
    expect(world.bills).toHaveLength(0);
  });

  it("lets the Germany 2019 singleplayer Chancellor issue a direct tax decree, replace, repeal, and continue it", () => {
    const world = createWorld({ seed: "de-tax-287", playerName: "P", countryId: "DE", era: "2019", mode: "hos" });
    world.nppAutonomyLevel = "off";
    world.player.actions = 100;
    world.player.nationalInfluence = 30;
    expect(world.player.currentOffice).toMatchObject({ countryId: "DE", type: "chancellor" });
    // Independently evaluated AHDGame@96831835 DE/2019 seed vector:
    // getNationalBudgetSeedConfigsForPreset("2019-default") gives GDP=4.5T
    // and taxableSales ratio=.5 (budgets.ts); revenue.ts multiplies that base
    // by VAT/100, producing 2.25T × 19% = 427.5B.
    expect(world.budgets.DE?.taxRates.salesTax).toBe(19);
    expect(world.budgets.DE?.taxBases.taxableSales).toBe(2_250_000_000_000);
    expect(world.budgets.DE?.revenue.salesTax).toBe(427_500_000_000);

    const invalid = executeAction(world, "player", "sponsorBill", { catalogId: "de_vat_rate", taxRate: 18 });
    expect(invalid).toMatchObject({ ok: false, error: expect.stringContaining("not an authored option") });
    expect(world.bills).toHaveLength(0);

    expect(executeAction(world, "player", "sponsorBill", { catalogId: "de_vat_rate", taxRate: 20 }).ok).toBe(true);
    const first = world.bills.at(-1)!;
    expect(first).toMatchObject({
      countryId: "DE",
      selectedRate: 20,
      status: "signed",
      proposalActionCost: 10,
      proposalNpiCost: 5,
      votesFor: 0,
      votesAgainst: 0,
      enactedAtTurn: world.meta.turn,
    });
    expect(world.player.actions).toBe(100);
    expect(world.player.nationalInfluence).toBe(30);
    expect(first.proposalCostsRefunded).toBe(true);
    expect(world.player.actionCooldowns.sponsorBill).toBeUndefined();
    expect(first.provisions[0]?.policyOptionId).toBe("de_vat_rate_opt_6");
    // Game@968's local singleplayer HoS proposal is enacted immediately by
    // enactSingleplayerDecree; it does not enter a Bundestag vote.
    expect(world.budgets.DE?.taxRates.salesTax).toBe(20);
    // Game 96831835 src/lib/budget/revenue.ts:353 computes taxableSales ×
    // rate/100. Revenue settles before the tax-rate ramp in the source turn
    // order, so the next stepped rate affects receipts on the following turn.
    expectSourceSalesTax(world, 20);
    expect(first.votesFor).toBe(0);
    expect(world.enactedLaws.filter((law) => law.id === "de_vat_rate" && law.repealedAtTurn === undefined)).toHaveLength(1);

    world.player.legislativeSeat = null;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "de_vat_rate", taxRate: 22 }).ok).toBe(true);
    const replacement = world.bills.at(-1)!;
    passBill(world, replacement);
    expect(world.budgets.DE?.taxRates.salesTax).toBe(21);
    expect(world.budgets.DE?.taxRatePhaseIn?.salesTax).toBe(22);
    expectSourceSalesTax(world, 21);
    advanceTurn(world);
    expect(world.budgets.DE?.taxRates.salesTax).toBe(22);
    expectSourceSalesTax(world, 21);
    expect(world.enactedLaws.filter((law) => law.id === "de_vat_rate" && law.repealedAtTurn === undefined)).toHaveLength(1);

    expect(executeAction(world, "player", "repealLaw", { catalogId: "de_vat_rate" }).ok).toBe(true);
    const repeal = world.bills.at(-1)!;
    passBill(world, repeal);
    expect(world.budgets.DE?.taxRates.salesTax).toBe(21);
    expect(world.budgets.DE?.taxRatePhaseIn?.salesTax).toBe(19);
    expectSourceSalesTax(world, 21);
    advanceTurn(world);
    expect(world.budgets.DE?.taxRates.salesTax).toBe(20);
    expectSourceSalesTax(world, 21);
    advanceTurn(world);
    expectSourceSalesTax(world, 20);
    advanceTurn(world);
    expect(world.budgets.DE?.taxRates.salesTax).toBe(19);
    expectSourceSalesTax(world, 19);
    expect(world.enactedLaws.some((law) => law.id === "de_vat_rate" && law.repealedAtTurn === undefined)).toBe(false);

    const restored = deserializeSave(serializeSave(world, "2019-01-01T00:00:00.000Z"));
    expect(restored.bills.at(-1)?.status).toBe("signed");
    advanceTurn(world);
    advanceTurn(restored);
    expect(restored.budgets.DE?.taxRates).toEqual(world.budgets.DE?.taxRates);
    expect(restored.enactedLaws).toEqual(world.enactedLaws);
  });

  it("keeps the tariff NPI exemption through the source singleplayer decree", () => {
    const world = createWorld({ seed: "de-tariff-cost-287", playerName: "P", countryId: "DE", era: "2019", mode: "hos" });
    world.player.actions = 100;
    world.player.nationalInfluence = 30;
    expect(executeAction(world, "player", "sponsorBill", {
      catalogId: "de_customs_tariff_rate",
      taxRate: 6,
    }).ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({ proposalActionCost: 10 });
    expect(world.bills.at(-1)?.proposalNpiCost).toBeUndefined();
    expect(world.player.actions).toBe(100);
    expect(world.player.nationalInfluence).toBe(30);
  });

  it("resolves a shortened Bundestag race and votes each available tax row into effect", () => {
    let world = createWorld({ seed: "career-check", playerName: "P", countryId: "DE", era: "2019", mode: "career" });
    expect(executeAction(world, "player", "joinParty", { partyId: "DE_SPD" }).ok).toBe(true);
    advanceTurn(world);
    const election = world.elections.find((candidate) =>
      candidate.countryId === "DE" &&
      candidate.electionType === "bundestag" &&
      candidate.state === world.player.homeRegionId,
    );
    expect(election).toBeDefined();
    expect(election?.status).toBe("active");
    expect(executeAction(world, "player", "declareCandidacy", { electionId: election!.id }).ok).toBe(true);
    // The source-created race is retained; only its long calendar is shortened
    // so this ordinary-turn test reaches its authentic candidate resolver quickly.
    election!.primaryEndTurn = world.meta.turn + 1;
    election!.endTurn = world.meta.turn + 3;
    for (let i = 0; i < 5 && election!.status !== "resolved"; i++) advanceTurn(world);
    expect(election!.status).toBe("resolved");
    expect(election!.candidates.some((candidate) => candidate.id === "player")).toBe(true);
    // Actual AHDGame@0a68fee4 allocation of this resolved race's recorded
    // candidate slate and ballots gives the player 6 of the region's 38 seats.
    expect(world.player.legislativeSeat).toEqual({
      countryId: "DE",
      chamberKey: "bundestag",
      regionId: world.player.homeRegionId,
      seatsHeld: 6,
    });
    world = earnCareerGovernment(world, "de_income_tax_rate");
    // A well-resourced legal player: authority still comes from the resolved
    // race, while public commands debit their normal AP and NPI prices below.
    world.player.actions = 200;
    world.player.nationalInfluence = 100;
    const careerBills: Array<{ id: string; lawId: (typeof DE_TAX_LAWS)[number]; before: number; selected: number; taxType: keyof NonNullable<typeof world.budgets.DE>["taxRates"] }> = [];

    for (const id of DE_TAX_LAWS) {
      const law = getLaw(id)!;
      const policy = law.taxPolicy!;
      const taxType = policy.taxType as keyof NonNullable<typeof world.budgets.DE>["taxRates"];
      const beforeRate = world.budgets.DE!.taxRates[taxType];
      const option = [...(policy.options ?? [])]
        .filter((candidate) => candidate.rate !== beforeRate && candidate.economic > 0)
        .sort((a, b) => Math.abs(a.economic) - Math.abs(b.economic) || Math.abs(a.rate - beforeRate) - Math.abs(b.rate - beforeRate))[0];
      expect(option, id).toBeDefined();
      const sponsored = executeAction(world, "player", "sponsorBill", { catalogId: id, taxRate: option!.rate });
      expect(sponsored.ok, `${id}: ${sponsored.ok ? "" : sponsored.error}`).toBe(true);
      let bill = world.bills.at(-1)!;
      expect(bill.status, id).toBe("proposed");
      advanceTurn(world);
      expect(bill.status, id).toBe("active");
      expect(bill.currentChamber, id).toBe("bundestag");
      expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok, id).toBe(true);
      expect(bill.votes.player, id).toBe("for");
      expect(sponsored.changes?.actions).toBe(-10);
      if (proposalNpiCost(law) > 0) expect(sponsored.changes?.nationalInfluence).toBe(-proposalNpiCost(law));
      careerBills.push({ id: bill.id, lawId: id, before: beforeRate, selected: option!.rate, taxType });
      advanceTurn(world); // the native sponsor cooldown expires on its authored later turn
    }
    for (let i = 0; i < 8 && careerBills.some((entry) => {
      const bill = world.bills.find((candidate) => candidate.id === entry.id)!;
      return bill.status !== "signed" && bill.status !== "failed";
    }); i++) advanceTurn(world);
    for (const entry of careerBills) {
      const bill = world.bills.find((candidate) => candidate.id === entry.id)!;
      const id = entry.lawId;
      expect(bill.status, id).toBe("signed");
      expect(bill.voteSnapshot?.votes.player, id).toBe("for");
      const currentRate = world.budgets.DE!.taxRates[entry.taxType];
      const phaseIn = world.budgets.DE!.taxRatePhaseIn?.[entry.taxType];
      expect(currentRate !== entry.before || phaseIn === entry.selected, id).toBe(true);
      expect(bill.selectedRate, id).toBe(entry.selected);
    }
    const restored = deserializeSave(serializeSave(world));
    expect(restored.player.legislativeSeat).toEqual(world.player.legislativeSeat);
    expect(restored.enactedLaws).toEqual(world.enactedLaws);
  });
});
