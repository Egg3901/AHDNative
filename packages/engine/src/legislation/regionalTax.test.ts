/**
 * Issue #100 — regional (state-scope) tax enactment and phase-in.
 *
 * Ports src/lib/billEnactment.ts applyTaxRateChange scope "state" +
 * src/lib/budget/taxRatePhaseIn.ts onto Native's regional budget
 * (budget/types.ts RegionalBudget, budget/phases.ts regionalBudgetProcessingPhase,
 * legislation/billLifecycle.ts applyStateTaxChange). Driven through the public
 * turn/save boundary (createWorld / advanceTurn / serializeSave / deserializeSave)
 * plus applyBillEffects, which the bill lifecycle calls at enactment.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { applyBillEffects } from "./billLifecycle.js";
import { calculateStateTaxRevenue, STATE_TAX_GDP_FACTORS } from "../budget/regionalBudget.js";
import type { Bill } from "./types.js";

const OPTS = { seed: "regional-tax", playerName: "Tester", countryId: "US", era: "1953" } as const;
const REGION = "CA";
/** Available US catalog law: kind "tax", taxPolicy scope "state", taxType "incomeTax", baselineRate 4. */
const STATE_TAX_LAW = "us.state.tax.incomeTax";
const TARGET_RATE = 12;

function regionalTaxBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-regional-tax-1",
    title: "State Income Tax Structure",
    summary: "",
    countryId: "US",
    category: "economy",
    legislationTypeId: STATE_TAX_LAW,
    regionId: REGION,
    selectedRate: TARGET_RATE,
    effectDirection: 1,
    provisions: [{ type: "policy", legislationTypeId: STATE_TAX_LAW, effectDirection: 1, economic: 0, social: 0 }],
    originChamber: "house",
    currentChamber: "house",
    // Pre-enrolled with the executive window already elapsed, so the next
    // advanceTurn pockets it into law through the real lifecycle.
    status: "enrolled",
    sponsorId: "player",
    sponsorName: "P",
    sponsorPartyId: null,
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 0,
    presidentActionDeadlineOnTurn: 0,
    filibusterInvocations: [],
    updatedAtTurn: 0,
    committeeId: null,
    ...overrides,
  } as Bill;
}

describe("issue #100 regional tax enactment + phase-in", () => {
  it("enacts a regional tax bill, phases the rate in across turns, and feeds regional revenue", () => {
    const w = createWorld(OPTS);
    const rb = w.regionalBudgets[REGION]!;
    expect(rb, "CA regional budget seeded").toBeDefined();
    expect(rb.taxRates?.incomeTax ?? 0).toBe(0);
    expect(rb.revenue.stateTax ?? 0).toBe(0);

    w.bills.push(regionalTaxBill());
    advanceTurn(w); // enrolled -> signed -> applyBillEffects

    expect(w.bills[0]!.status).toBe("signed");
    // The selected rate becomes the phase-in target; the rate starts moving the
    // same turn the bill passes and never lands whole.
    expect(rb.taxRatePhaseIn?.incomeTax).toBe(TARGET_RATE);
    const afterEnact = rb.taxRates!.incomeTax;
    expect(afterEnact).toBeGreaterThan(0);
    expect(afterEnact).toBeLessThan(TARGET_RATE);

    // Regional revenue is fed from the phased rate immediately: stateTax enters
    // revenue.total and the reported lines sum to the total.
    expect(rb.revenue.stateTax).toBeGreaterThan(0);
    expect(rb.revenue.total).toBe(
      rb.revenue.councilTax + rb.revenue.businessRates + rb.revenue.grant + rb.revenue.stateTax!,
    );

    // Phase-in continues across turns until the target is reached, then the
    // pending entry empties itself (completion).
    const stateTaxEarly = rb.revenue.stateTax!;
    let previous = afterEnact;
    let turns = 1;
    while (rb.taxRatePhaseIn?.incomeTax !== undefined && turns < 30) {
      advanceTurn(w);
      const now = rb.taxRates!.incomeTax;
      expect(now ?? 0).toBeGreaterThanOrEqual(previous ?? 0);
      previous = now ?? 0;
      turns++;
    }
    expect(rb.taxRatePhaseIn?.incomeTax).toBeUndefined();
    expect(rb.taxRates!.incomeTax).toBe(TARGET_RATE);
    expect(turns).toBeLessThan(30);
    // At the higher completed rate the regional state-tax revenue is larger.
    expect(rb.revenue.stateTax!).toBeGreaterThan(stateTaxEarly);
  });

  it("is a no-op when no regional tax exists", () => {
    const w = createWorld(OPTS);
    const rb = w.regionalBudgets[REGION]!;
    for (let i = 0; i < 3; i++) advanceTurn(w);
    // No state tax enacted: no ramp, no invented rate, and the per-turn regional
    // revenue recompute never manufactures a state tax line.
    expect(rb.taxRates?.incomeTax ?? 0).toBe(0);
    expect(rb.taxRatePhaseIn?.incomeTax).toBeUndefined();
    expect(rb.revenue.stateTax ?? 0).toBe(0);
  });

  it("a state-scope tax bill with no real region target touches no regional budget", () => {
    const w = createWorld(OPTS);
    const before = JSON.stringify(w.regionalBudgets);

    // No regionId (the reference's national pseudo-state target).
    // A truly region-less bill: omit the key (exactOptionalPropertyTypes).
    const noRegionBill = regionalTaxBill({ id: "no-region", status: "signed" });
    delete noRegionBill.regionId;
    applyBillEffects(w, noRegionBill);
    // A regionId that is not a real region of the bill's country.
    applyBillEffects(w, regionalTaxBill({ id: "bad-region", regionId: "US_CA", status: "signed" }));

    expect(JSON.stringify(w.regionalBudgets)).toBe(before);
  });

  it("repeal reverts a regional tax toward the catalog baseline under the same phase-in", () => {
    const w = createWorld(OPTS);
    const rb = w.regionalBudgets[REGION]!;
    applyBillEffects(w, regionalTaxBill({ status: "signed" }));
    while (rb.taxRatePhaseIn?.incomeTax !== undefined) advanceTurn(w);
    expect(rb.taxRates!.incomeTax).toBe(TARGET_RATE);

    // A repeal bill (actions/execute.ts repealLaw) carries no selectedRate, so
    // the catalog baseline (4) becomes the target and the ramp runs downward.
    const repealBill = regionalTaxBill({
      id: "repeal-1",
      status: "signed",
      effectDirection: -1,
      repealsLawId: STATE_TAX_LAW,
    });
    // A repeal carries no selectedRate (actions/execute.ts repealLaw): omit it.
    delete repealBill.selectedRate;
    applyBillEffects(w, repealBill);
    expect(rb.taxRatePhaseIn?.incomeTax).toBe(4);
    expect(rb.taxRates!.incomeTax).toBe(TARGET_RATE - 1);
  });

  it("save/reload mid-phase-in preserves the same regional tax trajectory", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    a.bills.push(regionalTaxBill());
    b.bills.push(regionalTaxBill());
    advanceTurn(a);
    advanceTurn(b); // both enact
    advanceTurn(a);
    advanceTurn(b); // a couple of ramp steps

    const saved = serializeSave(a, "2026-09-11T00:00:00.000Z");
    const restored = deserializeSave(saved);
    expect(JSON.stringify(restored.regionalBudgets)).toBe(JSON.stringify(a.regionalBudgets));

    // Enough turns for the ramp to reach the target (0 -> 12 at one point per
    // turn after the enactment turn) with margin.
    for (let i = 0; i < 16; i++) {
      advanceTurn(a);
      advanceTurn(restored);
    }

    expect(JSON.stringify(restored.regionalBudgets)).toBe(JSON.stringify(a.regionalBudgets));
    expect(JSON.stringify(restored.bills)).toBe(JSON.stringify(a.bills));
    // The ramp actually completed on both, so the comparison is non-trivial.
    expect(a.regionalBudgets[REGION]!.taxRates!.incomeTax).toBe(TARGET_RATE);
    expect(a.regionalBudgets[REGION]!.taxRatePhaseIn?.incomeTax).toBeUndefined();
  });

  it("calculateStateTaxRevenue prices the reference GDP base factors", () => {
    // Source: src/lib/budget/revenue.ts:169-178.
    expect(STATE_TAX_GDP_FACTORS.incomeTax).toBe(0.35);
    expect(STATE_TAX_GDP_FACTORS.salesTax).toBe(0.55);
    const gdp = 38_000_000_000;
    expect(calculateStateTaxRevenue(gdp, { incomeTax: 10 })).toBeCloseTo(gdp * 0.35 * 0.1, 6);
    expect(calculateStateTaxRevenue(gdp, {})).toBe(0);
    expect(calculateStateTaxRevenue(gdp, { notAStateTaxType: 5 })).toBe(0);
  });
});
