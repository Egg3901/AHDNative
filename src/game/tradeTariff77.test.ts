import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { projectTradeRoutes } from "./tradeRoutes";
import { deserializeSave, recordCorporateTradeSnapshot } from "@ahdclient/engine";

const stamp = "2026-10-01T21:00:00.000Z";

describe("signed customs tariff trade effect (#77)", () => {
  it("authors and decrees a source trade-category tariff, changes real trade flows, and preserves the Markets receipt on reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "CN", seed: "cn-tariff-public-flow", playerName: "Player", mode: "hos" });
    const actionsBefore = (JSON.parse(session.serialize(stamp)) as { world: { player: { actions: number; nationalInfluence?: number } } }).world.player;
    const proposal = session.act("sponsorBill", { catalogId: "trade.customs_tariff", tariffRate: 10 });
    expect(proposal.ok).toBe(true);
    const actionsAfterProposal = (JSON.parse(session.serialize(stamp)) as { world: { player: { actions: number; nationalInfluence?: number } } }).world.player;
    // Successful enactment returns the source proposal charge on passage;
    // the signed bill retains the 10 AP charge and its one-time refund marker.
    expect(actionsAfterProposal.actions).toBe(actionsBefore.actions);
    expect(actionsBefore.nationalInfluence).toBe(actionsAfterProposal.nationalInfluence);
    session.advance();
    const enacted = JSON.parse(session.serialize(stamp)) as {
      world: {
        bills: Array<{ id: string; legislationTypeId: string; category: string; status: string; proposalActionCost?: number; proposalNpiCost?: number; proposalCostsRefunded?: boolean; provisions: Array<{ type: string; tariffScopeType?: string; tariffRate?: number }> }>;
        tradeTariffs?: Array<{ countryId: string; scopeType: string; rate: number; sourceBillId: string }>;
        budgets: Record<string, { taxRates: { tariffs: number } }>;
        corporateTradeSnapshot?: { byCommodity: Record<string, Record<string, Record<string, { units: number; value: number }>>> };
      };
    };
    const signedBill = enacted.world.bills.find((bill) => bill.legislationTypeId === "trade.customs_tariff" && bill.status === "signed");
    expect(signedBill).toMatchObject({ category: "trade", proposalActionCost: 10, proposalCostsRefunded: true });
    expect(signedBill?.proposalNpiCost).toBeUndefined();
    expect(signedBill?.provisions).toContainEqual(expect.objectContaining({ type: "tariff", tariffScopeType: "economy_wide", tariffRate: 10 }));
    expect(enacted.world.tradeTariffs).toContainEqual(expect.objectContaining({
      countryId: "CN", scopeType: "economy_wide", rate: 10, sourceBillId: signedBill!.id,
    }));
    expect(enacted.world.budgets.CN!.taxRates.tariffs).toBe(10);

    // Hold the entire saved world fixed and remove only the enacted trade
    // provision/record. This compares identical producer stock, demand,
    // prices and RNG with and without importer tariff affinity drag.
    const baselineWorld = deserializeSave(session.serialize(stamp));
    baselineWorld.tradeTariffs = [];
    baselineWorld.bills = baselineWorld.bills.filter((bill) => !bill.provisions.some((provision) => provision.type === "tariff"));
    recordCorporateTradeSnapshot(baselineWorld);
    const importsToChina = (world: typeof baselineWorld) => Object.values(world.corporateTradeSnapshot!.byCommodity)
      .flatMap((byExporter) => Object.values(byExporter).map((destinations) => destinations.CN?.units ?? 0))
      .reduce((sum, units) => sum + units, 0);
    const baselineImports = importsToChina(baselineWorld);
    const tariffWorld = deserializeSave(session.serialize(stamp));
    recordCorporateTradeSnapshot(tariffWorld);
    const tariffImports = importsToChina(tariffWorld);
    expect(baselineImports).toBeGreaterThan(0);
    expect(tariffImports).toBeLessThan(baselineImports);

    const resumed = new GameSession();
    resumed.load(session.serialize(stamp));
    const route = projectTradeRoutes(deserializeSave(resumed.serialize(stamp))).find((row) => row.countryId === "CN");
    expect(route?.customsTariff).toEqual({ ratePercent: 10, sourceBillId: signedBill!.id });
    expect(route?.corporateTrade).toBeDefined();
  });

  it("refuses customs tariff sponsorship without a legislative or sovereign authority", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "CN", seed: "cn-tariff-authority-gate", playerName: "Player" });
    const result = session.act("sponsorBill", { catalogId: "trade.customs_tariff", tariffRate: 10 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Must hold a legislative seat");
  });

  it("leaves the CN customs tax law on the ordinary one-point fiscal phase-in path", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "CN", seed: "cn-customs-tax-remains-tax", playerName: "Player", mode: "hos" });
    const result = session.act("sponsorBill", { catalogId: "cn_customs_tariff", taxRate: 10 });
    expect(result.ok).toBe(true);
    for (let turn = 0; turn < 10; turn += 1) {
      const current = JSON.parse(session.serialize(stamp)) as { world: { bills: Array<{ legislationTypeId?: string; status: string }> } };
      if (current.world.bills.some((bill) => bill.legislationTypeId === "cn_customs_tariff" && bill.status === "signed")) break;
      session.advance();
    }
    const save = JSON.parse(session.serialize(stamp)) as { world: { bills: Array<{ legislationTypeId?: string; status: string; provisions: Array<{ type: string }> }>; budgets: Record<string, { taxRates: { tariffs: number }; taxRatePhaseIn?: Record<string, number> }>; tradeTariffs?: Array<{ countryId: string }> } };
    const bill = save.world.bills.find((row) => row.legislationTypeId === "cn_customs_tariff");
    expect(bill?.provisions.some((provision) => provision.type === "tariff")).toBe(false);
    expect(save.world.budgets.CN!.taxRates.tariffs).toBe(1);
    expect(save.world.budgets.CN!.taxRatePhaseIn?.tariffs).toBe(10);
    expect(save.world.tradeTariffs?.some((row) => row.countryId === "CN")).toBe(false);
  });
});
