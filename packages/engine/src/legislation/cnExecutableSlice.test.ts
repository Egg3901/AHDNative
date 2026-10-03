import { describe, expect, it } from "vitest";
import { earnCareerGovernment } from "../government/earnCareerGovernment.testSupport.js";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { getLaw } from "./catalog.js";
import { proposalNpiCost } from "./proposalCosts.js";
import type { BudgetTaxRates } from "../budget/types.js";

const TAX_LAWS = [
  {
    id: "cn_value_added_tax",
    taxType: "salesTax",
    base: "taxableSales",
    line: "salesTax",
    baseline1991: 22,
    baseline2019: 13,
    legalBaseline: 13,
    rates: [0, 3, 6, 9, 11, 13, 15, 17, 19, 22, 25],
    economic: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
    selected2019: 15,
    proposalNpiCost: 5,
  },
  {
    id: "cn_enterprise_income_tax",
    taxType: "domesticCorporateTax",
    base: "domesticCorporateProfits",
    line: "domesticCorporateTax",
    baseline1991: 38,
    baseline2019: 25,
    legalBaseline: 25,
    rates: [0, 5, 10, 15, 20, 25, 28, 32, 35, 38, 40],
    economic: [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5],
    selected2019: 28,
    proposalNpiCost: 5,
  },
  {
    id: "cn_individual_income_tax",
    taxType: "incomeTax",
    base: "taxableIncome",
    line: "incomeTax",
    baseline1991: 0,
    baseline2019: 45,
    legalBaseline: 35,
    rates: [0, 10, 15, 25, 30, 35, 40, 45, 47, 48, 50],
    economic: [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5],
    selected2019: 40,
    proposalNpiCost: 5,
  },
  {
    id: "cn_social_insurance_contribution",
    taxType: "payrollTax",
    base: "wagesAndSalaries",
    line: "payrollTax",
    baseline1991: 0,
    baseline2019: 28,
    legalBaseline: 28,
    rates: [0, 5, 10, 15, 22, 28, 32, 36, 40, 43, 45],
    economic: [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5],
    selected2019: 32,
    proposalNpiCost: 5,
  },
  {
    id: "cn_customs_tariff",
    taxType: "tariffs",
    base: "importValue",
    line: "tariffs",
    baseline1991: 0,
    baseline2019: 0,
    legalBaseline: 7,
    rates: [0, 1, 2, 3, 5, 7, 10, 13, 17, 21, 25],
    economic: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
    selected2019: 1,
    proposalNpiCost: 0,
  },
] as const;

// Captured by executing the immutable Game source's pure
// src/lib/utils/budgetCalculations.ts calculateFederalRevenue helper against
// the 2019 CN default bases. Revenue is recorded at enactment's one-step rate,
// before source treasuryTurn makes its independent end-of-turn one-step move.
const GAME_2019_ENACTMENT_WITNESS = {
  cn_value_added_tax: { base: 55_440_000_000_000, rate: 14, revenue: 7_761_600_000_000 },
  cn_enterprise_income_tax: { base: 13_230_000_000_000, rate: 26, revenue: 3_439_800_000_000 },
  cn_individual_income_tax: { base: 3_780_000_000_000, rate: 44, revenue: 1_663_200_000_000 },
  cn_social_insurance_contribution: { base: 13_860_000_000_000, rate: 29, revenue: 4_019_400_000_000 },
  cn_customs_tariff: { base: 22_680_000_000_000, rate: 1, revenue: 226_800_000_000 },
} as const;

function makeChinaWorld(era: "1991" | "2019") {
  const world = createWorld({
    seed: `cn-budget-laws-${era}`,
    playerName: "China Player",
    countryId: "CN",
    era,
    mode: "hos",
  });
  world.player.actions = 100;
  world.nppAutonomyLevel = "off";
  return world;
}

function resolveBill(world: ReturnType<typeof makeChinaWorld>, billId: string) {
  const bill = world.bills.find((candidate) => candidate.id === billId)!;
  // The local Chinese singleplayer HoS is a source mayRuleByDecree actor;
  // proposeNationalBill immediately signs the decree instead of opening a
  // legislative vote. Chamber timing belongs to non-HoS elected-seat play.
  expect(bill.status, `${billId} should be decreed immediately`).toBe("signed");
  expect(bill.voteSnapshot).toBeUndefined();
  expect(bill.votesFor).toBe(0);
  expect(bill.votesAgainst).toBe(0);
  return bill;
}

describe("China's executable national budget-tax slice (#286)", () => {
  it("exposes five source-authored federal tax ladders and both playable preset baselines", () => {
    for (const law of TAX_LAWS) {
      const entry = getLaw(law.id);
      expect(entry, law.id).toMatchObject({
        countryId: "CN",
        allowedScope: "national",
        kind: "tax",
        status: "available",
      });
      expect(entry?.blockingSystem, law.id).toBeUndefined();
      expect(entry?.taxPolicy, law.id).toMatchObject({
        scope: "federal",
        taxType: law.taxType,
        baselineRate: law.legalBaseline,
      });
      expect(
        entry?.taxPolicy?.options?.map((option) => [
          option.id,
          option.rate,
          option.economic,
          option.social,
        ]),
        law.id,
      ).toEqual(
        law.rates.map((rate, index) => [
          `${law.id}_opt_${index}`,
          rate,
          law.economic[index],
          0,
        ]),
      );
      expect(
        makeChinaWorld("1991").budgets.CN?.taxRates[
          law.taxType as keyof BudgetTaxRates
        ],
      ).toBe(law.baseline1991);
      expect(
        makeChinaWorld("2019").budgets.CN?.taxRates[
          law.taxType as keyof BudgetTaxRates
        ],
      ).toBe(law.baseline2019);
    }
  });

  it("matches the independent Game 2019 revenue helper at the enactment stage", () => {
    const world = makeChinaWorld("2019");
    for (const law of TAX_LAWS) {
      const witness = GAME_2019_ENACTMENT_WITNESS[law.id];
      const budget = world.budgets.CN!;
      expect(budget.taxBases[law.base as keyof typeof budget.taxBases], law.id).toBe(witness.base);
      expect(budget.taxRates[law.taxType as keyof typeof budget.taxRates], law.id).toBe(law.baseline2019);
      expect(Math.round(budget.taxBases[law.base as keyof typeof budget.taxBases] * witness.rate / 100), law.id)
        .toBe(witness.revenue);
    }
  });

  it("quotes and charges source AP/NPI costs once, and refuses unaffordable proposals atomically", () => {
    const world = makeChinaWorld("2019");
    world.player.nationalInfluence = 4;
    const before = serializeSave(world, "2026-10-01T00:00:00.000Z");
    expect(executeAction(world, "player", "sponsorBill", {
      catalogId: "cn_value_added_tax",
      taxRate: 15,
    })).toMatchObject({ ok: false, error: expect.stringContaining("national influence") });
    expect(serializeSave(world, "2026-10-01T00:00:00.000Z")).toBe(before);

    const tariff = TAX_LAWS.find((law) => law.id === "cn_customs_tariff")!;
    expect(executeAction(world, "player", "sponsorBill", {
      catalogId: tariff.id,
      taxRate: tariff.selected2019,
    })).toMatchObject({ ok: true });
    expect(world.player.actions).toBe(100);
    expect(world.player.nationalInfluence).toBe(4);
    expect(world.bills.at(-1)).toMatchObject({ proposalActionCost: 10 });
    expect(world.bills.at(-1)?.proposalNpiCost).toBeUndefined();
    const tampered = JSON.parse(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    tampered.world.bills[0].proposalNpiCost = -1;
    expect(() => deserializeSave(JSON.stringify(tampered))).toThrow(/invalid bill proposalNpiCost/);

    const lowActions = makeChinaWorld("2019");
    lowActions.player.actions = 9;
    lowActions.player.nationalInfluence = 5;
    const lowActionsSnapshot = serializeSave(lowActions, "2026-10-01T00:00:00.000Z");
    expect(executeAction(lowActions, "player", "sponsorBill", {
      catalogId: "cn_value_added_tax",
      taxRate: 15,
    })).toMatchObject({ ok: false, error: expect.stringContaining("Not enough action points") });
    expect(serializeSave(lowActions, "2026-10-01T00:00:00.000Z")).toBe(lowActionsSnapshot);
  });

  it.each(TAX_LAWS)(
    "enacts, taxes revenue, saves, reloads and replaces $id",
    (law) => {
      const world = makeChinaWorld("2019");
      world.player.nationalInfluence = law.proposalNpiCost;
      const foreign = createWorld({
        seed: `foreign-cannot-file-${law.id}`,
        playerName: "Foreign Player",
        countryId: "US",
        era: "2019",
        mode: "hos",
      });
      foreign.player.actions = 100;
      const foreignActions = foreign.player.actions;
      expect(
        executeAction(foreign, "player", "sponsorBill", {
          catalogId: law.id,
          sponsorCountryId: "CN",
          taxRate: law.selected2019,
        }),
      ).toMatchObject({ ok: false });
      expect(foreign.player.actions).toBe(foreignActions);
      expect(foreign.bills).toHaveLength(0);

      const startingActions = world.player.actions;
      const invalidRate = executeAction(world, "player", "sponsorBill", {
        catalogId: law.id,
        taxRate: 16,
      });
      expect(invalidRate).toMatchObject({
        ok: false,
        error: expect.stringContaining("not an authored option"),
      });
      expect(world.player.actions).toBe(startingActions);
      expect(world.bills).toHaveLength(0);

      expect(
        executeAction(world, "player", "sponsorBill", {
          catalogId: law.id,
          taxRate: law.selected2019,
        }).ok,
      ).toBe(true);
      const firstProposal = world.bills.at(-1)!;
      expect(firstProposal).toMatchObject({
        countryId: "CN",
        legislationTypeId: law.id,
        selectedRate: law.selected2019,
        status: "signed",
        proposalActionCost: 10,
        provisions: [
          expect.objectContaining({
            type: "policy",
            legislationTypeId: law.id,
            policyOptionId: `${law.id}_opt_${(law.rates as readonly number[]).indexOf(law.selected2019)}`,
          }),
        ],
      });
      if (law.proposalNpiCost > 0) expect(firstProposal.proposalNpiCost).toBe(5);
      else expect(firstProposal.proposalNpiCost).toBeUndefined();
      expect(world.player.actions).toBe(startingActions);
      const firstBill = resolveBill(world, firstProposal.id);
      expect(firstBill.proposalCostsRefunded).toBe(true);
      expect(world.player.nationalInfluence).toBe(law.proposalNpiCost);

      const activeLaw = world.enactedLaws.find(
        (entry) => entry.id === law.id && entry.repealedAtTurn === undefined,
      );
      expect(activeLaw?.countryId).toBe("CN");
      expect(world.policyLedger[firstBill.id]).toMatchObject({
        sourcePolicyOptionId: `${law.id}_opt_${(law.rates as readonly number[]).indexOf(law.selected2019)}`,
      });
      const budget = world.budgets.CN!;
      const afterTreasuryRate =
        budget.taxRates[law.taxType as keyof typeof budget.taxRates];
      expect(afterTreasuryRate).toBe(
        law.baseline2019 +
          Math.sign(law.selected2019 - law.baseline2019) *
            Math.min(1, Math.abs(law.selected2019 - law.baseline2019)),
      );
      const sourceRevenueRate =
        law.baseline2019 +
        Math.sign(law.selected2019 - law.baseline2019) *
          Math.min(1, Math.abs(law.selected2019 - law.baseline2019));
      expect(budget.revenue[law.line as keyof typeof budget.revenue]).toBe(
        Math.round(
          (budget.taxBases[law.base as keyof typeof budget.taxBases] *
            sourceRevenueRate) /
            100,
        ),
      );

      const restored = deserializeSave(
        serializeSave(world, "2026-10-01T00:00:00.000Z"),
      );
      expect(
        restored.bills.find((bill) => bill.id === firstBill.id)?.status,
      ).toBe("signed");
      expect(restored.bills.find((bill) => bill.id === firstBill.id)).toMatchObject({
        proposalActionCost: 10,
        proposalCostsRefunded: true,
      });
      if (law.proposalNpiCost > 0) {
        expect(restored.bills.find((bill) => bill.id === firstBill.id)?.proposalNpiCost).toBe(5);
      }
      expect(restored.player.nationalInfluence).toBe(world.player.nationalInfluence);
      expect(
        restored.budgets.CN?.taxRatePhaseIn?.[
          law.taxType as keyof typeof budget.taxRates
        ],
      ).toBe(
        world.budgets.CN?.taxRatePhaseIn?.[
          law.taxType as keyof typeof budget.taxRates
        ],
      );
      for (
        let turn = 0;
        turn < 12 &&
        world.budgets.CN?.taxRates[
          law.taxType as keyof typeof budget.taxRates
        ] !== law.selected2019;
        turn++
      ) {
        advanceTurn(world);
        advanceTurn(restored);
      }
      expect(
        world.budgets.CN?.taxRates[law.taxType as keyof typeof budget.taxRates],
      ).toBe(law.selected2019);
      expect(
        restored.budgets.CN?.taxRates[
          law.taxType as keyof typeof budget.taxRates
        ],
      ).toBe(law.selected2019);
      expect(restored.enactedLaws).toEqual(world.enactedLaws);
      expect(restored.budgets.CN?.revenue).toEqual(world.budgets.CN?.revenue);

      world.player.actions = 100;
      const replacementRate = law.baseline2019;
      expect(
        executeAction(world, "player", "sponsorBill", {
          catalogId: law.id,
          taxRate: replacementRate,
        }).ok,
      ).toBe(true);
      const replacementProposal = world.bills.at(-1)!;
      const replacement = resolveBill(world, replacementProposal.id);
      expect(replacement.status).toBe("signed");
      expect(
        world.enactedLaws.filter(
          (entry) => entry.id === law.id && entry.repealedAtTurn === undefined,
        ),
      ).toHaveLength(1);
      expect(
        world.enactedLaws.some(
          (entry) => entry.id === law.id && entry.repealedAtTurn !== undefined,
        ),
      ).toBe(true);
      const replacementTurnRate =
        law.selected2019 +
        Math.sign(replacementRate - law.selected2019) *
          Math.min(1, Math.abs(replacementRate - law.selected2019));
      expect(
        world.budgets.CN?.taxRates[law.taxType as keyof typeof budget.taxRates],
      ).toBe(replacementTurnRate);
    },
  );

  it("runs the same public sponsored-bill path for the playable 1991 Chinese start", () => {
    const world = makeChinaWorld("1991");
    world.player.nationalInfluence = 5;
    expect(world.budgets.CN?.taxRates.salesTax).toBe(22);
    expect(
      executeAction(world, "player", "sponsorBill", {
        catalogId: "cn_value_added_tax",
        taxRate: 19,
      }).ok,
    ).toBe(true);
    const bill = resolveBill(world, world.bills.at(-1)!.id);
    expect(bill.countryId).toBe("CN");
    expect(bill.selectedRate).toBe(19);
    expect(world.budgets.CN?.taxRates.salesTax).toBeLessThan(22);
    const restored = deserializeSave(
      serializeSave(world, "2026-10-01T00:00:00.000Z"),
    );
    expect(restored.bills.find((entry) => entry.id === bill.id)?.status).toBe(
      "signed",
    );
    expect(restored.budgets.CN?.taxRates.salesTax).toBe(
      world.budgets.CN?.taxRates.salesTax,
    );
  });

  it("resolves a shortened NPC delegate race and votes each available tax row into effect", () => {
    let world = createWorld({ seed: "career-check", playerName: "P", countryId: "CN", era: "2019", mode: "career" });
    expect(executeAction(world, "player", "joinParty", { partyId: "CN_CCP" }).ok).toBe(true);
    advanceTurn(world);
    const election = world.elections.find((candidate) =>
      candidate.countryId === "CN" &&
      candidate.electionType === "npcDelegate" &&
      candidate.state === world.player.homeRegionId,
    );
    expect(election).toBeDefined();
    expect(election?.status).toBe("active");
    expect(executeAction(world, "player", "declareCandidacy", { electionId: election!.id }).ok).toBe(true);
    // Preserve the source-generated regional delegate race and its resolver;
    // shorten its long election calendar only for this ordinary-turn test.
    election!.primaryEndTurn = world.meta.turn + 1;
    election!.endTurn = world.meta.turn + 3;
    for (let i = 0; i < 5 && election!.status !== "resolved"; i++) advanceTurn(world);
    expect(election!.status).toBe("resolved");
    expect(election!.candidates.some((candidate) => candidate.id === "player")).toBe(true);
    // Actual AHDGame@0a68fee4 allocation of this resolved race's recorded
    // candidate slate and ballots gives the player 24 of DB's 238 seats.
    expect(world.player.legislativeSeat).toEqual({
      countryId: "CN",
      chamberKey: "npc",
      regionId: world.player.homeRegionId,
      seatsHeld: 24,
    });
    world = earnCareerGovernment(world, "cn_value_added_tax");
    // Test a well-resourced legal player; their office still comes solely from
    // the source-generated election and each action uses its authored price.
    world.player.actions = 200;
    world.player.nationalInfluence = 100;
    const sourceVectorVoter = world.politicians.find(
      (politician) => politician.countryId === "CN" && politician.chamberKey === "npc" && politician.partyId === "CN_CDL",
    );
    expect(sourceVectorVoter).toBeDefined();
    sourceVectorVoter!.ideology = { economic: -3, social: 0 };
    sourceVectorVoter!.donorBaseLevel = 3;
    sourceVectorVoter!.personality = { loyalty: 80, ambition: 50, stubbornness: 20 };
    const careerBills: Array<{ id: string; lawId: (typeof TAX_LAWS)[number]["id"]; before: number; selected: number; taxType: keyof BudgetTaxRates }> = [];

    for (const row of TAX_LAWS) {
      const law = getLaw(row.id)!;
      const policy = law.taxPolicy!;
      const taxType = row.taxType as keyof BudgetTaxRates;
      const beforeRate = world.budgets.CN!.taxRates[taxType]!;
      const option = [...(policy.options ?? [])]
        .filter((candidate) => candidate.rate !== beforeRate && candidate.economic < 0)
        .sort((a, b) => Math.abs(a.economic) - Math.abs(b.economic) || Math.abs(a.rate - beforeRate) - Math.abs(b.rate - beforeRate))[0];
      expect(option, row.id).toBeDefined();
      const sponsored = executeAction(world, "player", "sponsorBill", { catalogId: row.id, taxRate: option!.rate });
      expect(sponsored.ok, `${row.id}: ${sponsored.ok ? "" : sponsored.error}`).toBe(true);
      if (!sponsored.ok) throw new Error(`${row.id}: ${sponsored.error}`);
      let bill = world.bills.at(-1)!;
      expect(bill.status, row.id).toBe("proposed");
      advanceTurn(world);
      expect(bill.status, row.id).toBe("active");
      expect(bill.currentChamber, row.id).toBe("npc");
      expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok, row.id).toBe(true);
      expect(bill.votes.player, row.id).toBe("for");
      expect(sponsored.changes?.actions).toBe(-10);
      if (proposalNpiCost(law) > 0) expect(sponsored.changes?.nationalInfluence).toBe(-proposalNpiCost(law));
      careerBills.push({ id: bill.id, lawId: row.id, before: beforeRate, selected: option!.rate, taxType });
      advanceTurn(world); // the native sponsor cooldown expires on its authored later turn
      if (row.id === "cn_value_added_tax") {
        // Independently executed Game cb66acdf source vector for this recorded
        // opposition voter and 11% VAT option: forces (60, 0, 0, 36), resolving
        // FOR. The public turn records that NPC ballot after the proposed bill
        // has crossed into its active stage.
        const bill = world.bills.find((candidate) => candidate.id === careerBills.at(-1)!.id)!;
        expect(bill.votes[sourceVectorVoter!.id], row.id).toBe("for");
      }
    }
    for (let i = 0; i < 8 && careerBills.some((entry) => {
      const bill = world.bills.find((candidate) => candidate.id === entry.id)!;
      return bill.status !== "signed" && bill.status !== "failed";
    }); i++) advanceTurn(world);
    for (const entry of careerBills) {
      const bill = world.bills.find((candidate) => candidate.id === entry.id)!;
      const rowId = entry.lawId;
      expect(bill.status, rowId).toBe("signed");
      expect(bill.voteSnapshot?.votes.player, rowId).toBe("for");
      const currentRate = world.budgets.CN!.taxRates[entry.taxType];
      const phaseIn = world.budgets.CN!.taxRatePhaseIn?.[entry.taxType];
      expect(currentRate !== entry.before || phaseIn === entry.selected, rowId).toBe(true);
      expect(bill.selectedRate, rowId).toBe(entry.selected);
    }
    const restored = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(restored.player.legislativeSeat).toEqual(world.player.legislativeSeat);
    expect(restored.enactedLaws).toEqual(world.enactedLaws);
  });
});
