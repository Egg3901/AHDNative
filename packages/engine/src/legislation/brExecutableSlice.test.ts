import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { processBillLifecycle } from "./billLifecycle.js";
import type { Bill } from "./types.js";

const LAW_ID = "br_income_tax_rate";

describe("Brazil executable legislation slice", () => {
  function passBill(world: ReturnType<typeof createWorld>, bill: Bill): void {
    processBillLifecycle(world, world.meta.rng);
    world.player.legislativeSeat = { countryId: "BR", chamberKey: bill.currentChamber };
    expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
    world.meta.turn = bill.votingEndsOnTurn!;
    processBillLifecycle(world, world.meta.rng);
    if (bill.status === "active_other") {
      world.player.legislativeSeat = { countryId: "BR", chamberKey: bill.currentChamber };
      expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
      world.meta.turn = bill.otherChamberVotingEndsOnTurn!;
      processBillLifecycle(world, world.meta.rng);
    }
    world.meta.turn = bill.presidentActionDeadlineOnTurn!;
    processBillLifecycle(world, world.meta.rng);
    expect(bill.status).toBe("signed");
  }

  it("proposes, votes, enacts, replaces, repeals, and reloads the income-tax posture", () => {
    // BR is playable in the 1991 pack, so the national law is driven
    // in-country. Source: AHDGame src/lib/seeds/br/brLegislationTypes.ts
    // br_income_tax_rate at e364c049 (6 authored options, rates
    // 0/8/13/18/24/30, baseline 18 = median authored option and the budget
    // policyDefaults match). The authored 1991 BR budget carries incomeTax
    // 22 (taxRateOverrides), above the catalog baseline 18, which is what
    // the enact/replace/repeal step assertions below are written against.
    const world = createWorld({ seed: "br-law", playerName: "P", countryId: "BR", era: "1991" });
    world.player.mode = "hos";
    world.player.actions = 100;
    const startingRate = world.budgets.BR!.taxRates.incomeTax;

    const invalid = executeAction(world, "player", "sponsorBill", { catalogId: LAW_ID, taxRate: 11 });
    expect(invalid).toMatchObject({ ok: false, error: expect.stringContaining("not an authored option") });

    const result = executeAction(world, "player", "sponsorBill", { catalogId: LAW_ID, taxRate: 24 });

    expect(result.ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({
      legislationTypeId: LAW_ID,
      selectedRate: 24,
      effectDirection: 1,
      status: "proposed",
    });
    const first = world.bills.at(-1)!;
    expect(first.provisions[0]).toMatchObject({ policyOptionId: "br_income_tax_rate_opt_4", economic: -2 });
    passBill(world, first);
    expect(world.budgets.BR!.taxRates.incomeTax).toBe(startingRate + 1);
    expect(world.budgets.BR!.taxRatePhaseIn?.incomeTax).toBe(24);
    expect(world.enactedLaws.some((law) => law.id === LAW_ID && law.repealedAtTurn === undefined)).toBe(true);

    delete world.player.actionCooldowns.sponsorBill;
    world.player.legislativeSeat = null;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: LAW_ID, taxRate: 0 }).ok).toBe(true);
    const replacement = world.bills.at(-1)!;
    expect(replacement.effectDirection).toBe(-1);
    passBill(world, replacement);
    expect(world.budgets.BR!.taxRates.incomeTax).toBe(startingRate);
    expect(world.budgets.BR!.taxRatePhaseIn?.incomeTax).toBe(0);
    expect(world.enactedLaws.filter((law) => law.id === LAW_ID && law.repealedAtTurn === undefined)).toHaveLength(1);

    delete world.player.actionCooldowns.repealLaw;
    world.player.legislativeSeat = null;
    expect(executeAction(world, "player", "repealLaw", { catalogId: LAW_ID }).ok).toBe(true);
    passBill(world, world.bills.at(-1)!);
    // Repeal retargets the catalog baseline (18): one step down from 22.
    expect(world.budgets.BR!.taxRates.incomeTax).toBe(startingRate - 1);
    expect(world.budgets.BR!.taxRatePhaseIn?.incomeTax).toBe(18);

    const restored = deserializeSave(serializeSave(world));
    expect(restored.bills.at(-1)?.status).toBe("signed");
    expect(restored.policyLedger[first.id]?.repealedAtTurn).toBeDefined();
    expect(restored.enactedLaws.some((law) => law.id === LAW_ID && law.repealedAtTurn === undefined)).toBe(false);
  });
});
