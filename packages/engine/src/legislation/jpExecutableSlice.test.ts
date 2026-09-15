import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { processBillLifecycle } from "./billLifecycle.js";
import type { Bill } from "./types.js";

const LAW_ID = "jp_consumption_tax";

describe("Japan executable legislation slice", () => {
  function passBill(world: ReturnType<typeof createWorld>, bill: Bill): void {
    processBillLifecycle(world, world.meta.rng);
    world.player.legislativeSeat = { countryId: "JP", chamberKey: bill.currentChamber };
    expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
    world.meta.turn = bill.votingEndsOnTurn!;
    processBillLifecycle(world, world.meta.rng);
    if (bill.status === "active_other") {
      world.player.legislativeSeat = { countryId: "JP", chamberKey: bill.currentChamber };
      expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
      world.meta.turn = bill.otherChamberVotingEndsOnTurn!;
      processBillLifecycle(world, world.meta.rng);
    }
    world.meta.turn = bill.presidentActionDeadlineOnTurn!;
    processBillLifecycle(world, world.meta.rng);
    expect(bill.status).toBe("signed");
  }

  it("proposes, votes, enacts, replaces, repeals, and reloads the consumption-tax posture", () => {
    // JP is an economy-preview (non-playable) country in every Native pack, so
    // the player must be a playable country and the JP national law is driven
    // cross-country via sponsorCountryId. US in era 1991 is the source-backed
    // playable pick (mainline POST_COLD_WAR_PLAYER); the authored 1991 JP
    // budget carries salesTax 3 (option[1]), below the catalog baseline 10,
    // which is what the enact/replace/repeal step assertions below are written
    // against.
    const world = createWorld({ seed: "jp-law", playerName: "P", countryId: "US", era: "1991" });
    world.player.mode = "hos";
    world.player.actions = 100;
    const startingRate = world.budgets.JP!.taxRates.salesTax;

    const invalid = executeAction(world, "player", "sponsorBill", { catalogId: LAW_ID, sponsorCountryId: "JP", taxRate: 11 });
    expect(invalid).toMatchObject({ ok: false, error: expect.stringContaining("not an authored option") });

    const result = executeAction(world, "player", "sponsorBill", { catalogId: LAW_ID, sponsorCountryId: "JP", taxRate: 13 });

    expect(result.ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({
      legislationTypeId: LAW_ID,
      selectedRate: 13,
      effectDirection: 1,
      status: "proposed",
    });
    const first = world.bills.at(-1)!;
    expect(first.provisions[0]).toMatchObject({ policyOptionId: "jp_consumption_tax_opt_6", economic: 1 });
    passBill(world, first);
    expect(world.budgets.JP!.taxRates.salesTax).toBe(startingRate + 1);
    expect(world.budgets.JP!.taxRatePhaseIn?.salesTax).toBe(13);
    expect(world.enactedLaws.some((law) => law.id === LAW_ID && law.repealedAtTurn === undefined)).toBe(true);

    delete world.player.actionCooldowns.sponsorBill;
    world.player.legislativeSeat = null;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: LAW_ID, sponsorCountryId: "JP", taxRate: 0 }).ok).toBe(true);
    const replacement = world.bills.at(-1)!;
    expect(replacement.effectDirection).toBe(-1);
    passBill(world, replacement);
    expect(world.budgets.JP!.taxRates.salesTax).toBe(startingRate);
    expect(world.budgets.JP!.taxRatePhaseIn?.salesTax).toBe(0);
    expect(world.enactedLaws.filter((law) => law.id === LAW_ID && law.repealedAtTurn === undefined)).toHaveLength(1);

    delete world.player.actionCooldowns.repealLaw;
    world.player.legislativeSeat = null;
    expect(executeAction(world, "player", "repealLaw", { catalogId: LAW_ID }).ok).toBe(true);
    passBill(world, world.bills.at(-1)!);
    expect(world.budgets.JP!.taxRates.salesTax).toBe(startingRate + 1);
    expect(world.budgets.JP!.taxRatePhaseIn?.salesTax).toBe(10);

    const restored = deserializeSave(serializeSave(world));
    expect(restored.bills.at(-1)?.status).toBe("signed");
    expect(restored.policyLedger[first.id]?.repealedAtTurn).toBeDefined();
    expect(restored.enactedLaws.some((law) => law.id === LAW_ID && law.repealedAtTurn === undefined)).toBe(false);
  });
});
