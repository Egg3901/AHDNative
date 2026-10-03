import { anchorToLocal, getRateForCountry, localToAnchor } from "../forex/conversion.js";
import { perTurnCouponPayment } from "../bonds/constants.js";
import type { WorldState } from "../types.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";
import { findSourceNppEntryCandidate } from "./nppCapacityReinvestment.js";
import { advanceNppStrategy, type StrategySituation } from "./nppCorpStrategy.js";
import { sourceCorporateStrategyStaggerEligible } from "./strategyRetooling.js";

const CHRONIC_LOW_FILL_THRESHOLD = 0.35;

/** Advance and persist the source NPP strategy memory after this turn's P&L settles. */
export function advanceNppCorporationStrategies(world: WorldState, onlyCorporationId?: string): void {
  const assetsByCorp = new Map<string, CorporateSectorAsset[]>();
  for (const asset of Object.values(corporateSectorAssets(world))) {
    const rows = assetsByCorp.get(asset.corporationId) ?? [];
    rows.push(asset);
    assetsByCorp.set(asset.corporationId, rows);
  }
  for (const corp of Object.values(world.corporations)) {
    if (onlyCorporationId && corp.id !== onlyCorporationId) continue;
    if (corp.suspended || isCorpStateOwned(corp) || (corp.ceoType ?? "npp") !== "npp") continue;
    const assets = assetsByCorp.get(corp.id) ?? [];
    const corpRate = getRateForCountry(world, corp.countryId);
    let revenueLocal = 0;
    let operatingIncomeLocal = 0;
    let lowFillSectors = 0;
    for (const asset of assets) {
      const hostRate = getRateForCountry(world, asset.countryId);
      const pnlRevenue = asset.plantsPnl?.revenue ?? asset.realizedRevenue ?? asset.revenue ?? 0;
      const margin = asset.effectiveProfitMargin ?? asset.profitMargin ?? corp.effectiveProfitMargin;
      const pnlIncome = asset.plantsPnl?.profit ?? pnlRevenue * (margin / 100);
      revenueLocal += anchorToLocal(localToAnchor(Math.max(0, pnlRevenue), hostRate), corpRate);
      operatingIncomeLocal += anchorToLocal(localToAnchor(pnlIncome, hostRate), corpRate);
      if (asset.soldFraction !== undefined && asset.soldFraction < CHRONIC_LOW_FILL_THRESHOLD) lowFillSectors += 1;
    }
    // Legacy Native issuer-only records map to Game's single sector with the
    // issuer's recorded revenue/margin; retain that actual aggregate read
    // until a physical asset row exists rather than inventing an empty P&L.
    if (assets.length === 0) {
      revenueLocal = Math.max(0, corp.revenue);
      operatingIncomeLocal = revenueLocal * (corp.effectiveProfitMargin / 100);
    }
    const debtServiceLocal = Object.values(world.bonds ?? {})
      .filter((bond) => bond.issuerType === "corporation" && bond.corporationId === corp.id && !bond.matured && !bond.defaulted)
      .reduce((sum, bond) => sum + perTurnCouponPayment(bond.couponRate, bond.faceValue) * bond.totalIssued, 0);
    const overhead = Math.max(0, corp.lastCeoSalaryPaid ?? 0) + Math.max(0, corp.lastRdSpendPerTurn ?? 0);
    const totalIncome = operatingIncomeLocal - overhead - debtServiceLocal;
    const situation: StrategySituation = {
      score: revenueLocal > 0 ? totalIncome / revenueLocal * 100 : 0,
      debtDominant: debtServiceLocal > 0 && debtServiceLocal >= operatingIncomeLocal,
      chronicLowFill: assets.length > 0 && lowFillSectors * 2 > assets.length,
      hasHeadroom: findSourceNppEntryCandidate(world, corp) !== null,
      // Native has no caretaker mandate or caretaker-run player corporation.
      isCaretaker: false,
    };
    const decision = advanceNppStrategy({
      prior: corp.nppStrategy,
      turn: world.meta.turn,
      situation,
      eligible: sourceCorporateStrategyStaggerEligible(corp.id, world.meta.turn),
    });
    corp.nppStrategy = decision.state;
  }
}
