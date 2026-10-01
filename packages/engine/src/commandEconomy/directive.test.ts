import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { plannedShare } from "./constants.js";
import { directedCreditIssuance, overhangInjectionFromIssuance } from "./state.js";

const OPTIONS = { seed: "command-directive-public-flow", playerName: "P", countryId: "RU", era: "1953", mode: "hos" } as const;

describe("command-economy Gosbank directive player flow (#94)", () => {
  it("queues a country-scoped directive, persists it, then changes marketization through the source policy stance", () => {
    const controlled = createWorld(OPTIONS);
    const baseline = createWorld(OPTIONS);
    const before = controlled.commandEconomy.RU!;
    const actionPointsBefore = controlled.player.actions;

    const result = executeAction(controlled, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.1,
      budgetSoftness: 0.1,
    });

    expect(result.ok).toBe(true);
    expect(controlled.player.actions).toBe(actionPointsBefore);
    expect(before.creditAggressiveness).toBe(0.55);
    expect(before.budgetSoftness).toBe(0.85);
    expect(before.pendingDirectives).toEqual([
      expect.objectContaining({
        countryId: "RU",
        creditAggressiveness: 0.1,
        budgetSoftness: 0.1,
        proposedTurn: 0,
        effectiveTurn: 1,
      }),
    ]);

    const resumed = deserializeSave(serializeSave(controlled, "2026-10-01T00:00:00.000Z"));
    advanceTurn(resumed);
    advanceTurn(baseline);

    expect(resumed.commandEconomy.RU!.pendingDirectives).toEqual([]);
    expect(resumed.commandEconomy.RU!.creditAggressiveness).toBe(0.1);
    expect(resumed.commandEconomy.RU!.budgetSoftness).toBe(0.1);
    // Source policy stance moves +0.48 × 0.12 = +0.0576 marketization.
    // Directed credit also changes output/capacity. Calculate that independent
    // source formula from the authored per-sector target and 10% seed headroom.
    const sourceUtilisation = (aggressiveness: number) => {
      const soes = Object.values(baseline.corporations).filter((corp) => corp.countryId === "RU" && corp.soe);
      const totalTarget = soes.reduce((sum, corp) => sum + corp.soe!.planTarget, 0);
      const totalCredit = 0.15 * aggressiveness * totalTarget / 48;
      return soes.reduce((sum, corp) => {
        const soe = corp.soe!;
        const credit = totalCredit * soe.planTarget / totalTarget;
        const capacity = Math.round(soe.capacity + credit);
        const output = Math.round(Math.min(soe.output + credit * 0.5, capacity));
        return sum + output / capacity;
      }, 0) / soes.length;
    };
    const policyAndCapacityDelta = 0.0576 + 0.18 * (sourceUtilisation(0.55) - sourceUtilisation(0.1));
    // Unbacked directed credit also adds the source overhang/shortage pressure
    // and therefore a small additional marketization drift.
    expect(resumed.commandEconomy.RU!.marketizationLevel - baseline.commandEconomy.RU!.marketizationLevel).toBeCloseTo(policyAndCapacityDelta, 3);
  });

  it("rejects command directives for a market country and invalid Gosbank ranges", () => {
    const market = createWorld({ ...OPTIONS, countryId: "US" });
    expect(executeAction(market, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.5,
    }).ok).toBe(false);

    const command = createWorld(OPTIONS);
    const before = JSON.stringify(command.commandEconomy.RU);
    const rejected = executeAction(command, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 1.1,
    });
    expect(rejected.ok).toBe(false);
    expect(JSON.stringify(command.commandEconomy.RU)).toBe(before);

    const career = createWorld({ ...OPTIONS, mode: "career" });
    const careerActions = career.player.actions;
    expect(executeAction(career, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.5,
    }).ok).toBe(false);
    expect(career.player.actions).toBe(careerActions);
  });

  it("expires a queued posture if the country leaves the planned regime before it resolves", () => {
    const world = createWorld(OPTIONS);
    expect(executeAction(world, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.1,
    }).ok).toBe(true);
    world.commandEconomy.RU!.marketizationLevel = 70;

    advanceTurn(world);

    expect(world.commandEconomy.RU!.pendingDirectives).toEqual([]);
    expect(world.commandEconomy.RU!.creditAggressiveness).toBe(0.55);
  });

  it("accepts the recorded Gosbank chair, persists source sector weights, and allocates credit to production", () => {
    const world = createWorld({ ...OPTIONS, mode: "career" });
    const baseline = createWorld({ ...OPTIONS, mode: "career" });
    const energy = Object.values(world.corporations).find((corp) => corp.countryId === "RU" && corp.sectorType === "energy")!;
    const manufacturing = Object.values(world.corporations).find((corp) => corp.countryId === "RU" && corp.sectorType === "manufacturing")!;
    const energyBefore = structuredClone(energy.soe!);
    const manufacturingBefore = structuredClone(manufacturing.soe!);
    const unweightedBefore = Object.fromEntries(Object.values(world.corporations)
      .filter((corp) => corp.countryId === "RU" && corp.soe && !["energy", "manufacturing"].includes(corp.sectorType))
      .map((corp) => [corp.id, structuredClone(corp.soe!)]));
    const totalPlan = Object.values(world.corporations).filter((corp) => corp.countryId === "RU" && corp.soe).reduce((sum, corp) => sum + corp.soe!.planTarget, 0);
    const actionsBefore = world.player.actions;
    world.cabinetMembers.push({
      countryId: "RU", positionId: "gosbank_liaison", characterId: "player", characterName: "P", partyId: null,
      appointedBy: null, appointedAtTurn: 0, confirmedAtTurn: 0,
    });

    const result = executeAction(world, "player", "commandEconomyDirective", {
      directiveOp: "setGosbankPosture",
      creditAggressiveness: 0.8,
      budgetSoftness: 0.85,
      sectorCredit: { energy: 1, manufacturing: 3, unregistered_sector: 7 },
    });
    expect(result.ok).toBe(true);
    expect(world.player.actions).toBe(actionsBefore);
    const saved = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(saved.commandEconomy.RU!.pendingDirectives?.[0]?.sectorCredit).toEqual({ energy: 1, manufacturing: 3 });

    advanceTurn(saved);

    const totalCredit = 0.15 * 0.8 * totalPlan / 48;
    const savedEnergy = saved.corporations[energy.id]!.soe!;
    const savedManufacturing = saved.corporations[manufacturing.id]!.soe!;
    expect(saved.commandEconomy.RU!.directedCreditBySector).toMatchObject({
      energy: Math.round(totalCredit / 4),
      manufacturing: Math.round(totalCredit * 3 / 4),
    });
    expect(savedEnergy.capacity).toBe(Math.round(energyBefore.capacity + totalCredit / 4));
    expect(savedEnergy.output).toBe(Math.round(energyBefore.output + totalCredit / 8));
    expect(savedManufacturing.capacity).toBe(Math.round(manufacturingBefore.capacity + totalCredit * 3 / 4));
    expect(savedManufacturing.output).toBe(Math.round(manufacturingBefore.output + totalCredit * 3 / 8));
    for (const [corpId, before] of Object.entries(unweightedBefore)) {
      expect(saved.corporations[corpId]!.soe).toEqual(before);
    }
    advanceTurn(baseline);
    const baselineCredit = 0.15 * 0.55 * totalPlan / 48;
    const creditInjectionDelta = overhangInjectionFromIssuance(directedCreditIssuance(totalCredit), totalPlan, plannedShare(world.commandEconomy.RU!.marketizationLevel))
      - overhangInjectionFromIssuance(directedCreditIssuance(baselineCredit), totalPlan, plannedShare(world.commandEconomy.RU!.marketizationLevel));
    expect(saved.commandEconomy.RU!.monetaryOverhang - baseline.commandEconomy.RU!.monetaryOverhang).toBeCloseTo(creditInjectionDelta, 5);
  });

  it("accepts the actual head-of-government record and rejects an unseated career player", () => {
    const career = createWorld({ ...OPTIONS, mode: "career" });
    const command = { directiveOp: "setGosbankPosture", creditAggressiveness: 0.5 } as const;
    expect(executeAction(career, "player", "commandEconomyDirective", command).ok).toBe(false);
    career.player.currentOffice = { type: "primeMinister", countryId: "RU" };
    expect(executeAction(career, "player", "commandEconomyDirective", command).ok).toBe(true);
  });
});
