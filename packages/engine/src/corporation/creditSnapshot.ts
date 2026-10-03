import type { WorldState } from "../types.js";
import { DAYS_PER_TURN } from "../calendar.js";
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { calculateSourceCorporateCreditScore } from "../bonds/corporateCredit.js";
import { TURNS_PER_DAY } from "./constants.js";

const NPV_ANNUAL_DISCOUNT_RATE = 0.15;
const INDEX_INCLUSION_THRESHOLD = 0.1;
const INSIDER_CONCENTRATION_THRESHOLD = 0.65;

function anchorRate(world: WorldState, currency: string | undefined, countryId: string): number {
  const code = currency ?? world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "USD";
  const row = Object.values(world.exchangeRates).find((item) => item.currencyCode === code);
  return row && Number.isFinite(row.rate) && row.rate > 0 ? row.rate : 1;
}

/** Recomputes the source credit writer from actual Native issuer assets and bond custody. */
export function refreshNativeCorporateCreditSnapshots(world: WorldState): void {
  for (const corp of Object.values(world.corporations)) {
    const issuerAssets = Object.values(world.corporateSectors ?? {}).filter((asset) => asset.corporationId === corp.id);
    let sectorNpv = 0;
    let constructionInProgressAnchor = 0;
    for (const asset of issuerAssets) {
      const sourceRevenueLocal = asset.realizedRevenue ?? asset.revenue ?? 0;
      const dailyRevenueAnchor = sourceRevenueLocal / DAYS_PER_TURN / anchorRate(world, undefined, asset.countryId);
      const margin = asset.effectiveProfitMargin ?? asset.profitMargin ?? corp.effectiveProfitMargin ?? corp.profitMargin ?? 35;
      const dailyProfitAnchor = dailyRevenueAnchor * margin / 100;
      const yearly = dailyProfitAnchor * TURNS_PER_YEAR / TURNS_PER_DAY;
      // Game sumCorporateSectorNpv includes positive sector NPVs only.
      if (yearly > 0) sectorNpv += yearly / NPV_ANNUAL_DISCOUNT_RATE;
      if (Number.isFinite(asset.constructionInProgressAnchor) && (asset.constructionInProgressAnchor ?? 0) > 0) {
        constructionInProgressAnchor += asset.constructionInProgressAnchor!;
      }
    }

    const activeBonds = Object.values(world.bonds).filter((bond) =>
      bond.issuerType === "corporation" && bond.corporationId === corp.id && !bond.matured,
    );
    let totalDebtAnchor = 0;
    let annualInterestAnchor = 0;
    for (const bond of activeBonds) {
      const rate = anchorRate(world, bond.currencyCode, bond.countryId);
      totalDebtAnchor += bond.totalIssued / rate;
      annualInterestAnchor += (bond.couponRate / 100 * bond.totalIssued) / rate;
    }
    const homeRate = anchorRate(world, corp.liquidCurrencyCode, corp.countryId);
    const liquidCapitalAnchor = corp.liquidCapital / homeRate;
    const annualIncomeAnchor = corp.earningsHistory.at(-1) ?? 0;
    const totalEquityAnchor = liquidCapitalAnchor + sectorNpv + constructionInProgressAnchor;
    const ceoHolder = corp.ceoVacant === true || corp.ceoType !== "player" ? undefined : "player";
    const ceoShares = ceoHolder ? corp.shareholders.filter((row) => row.holder === ceoHolder).reduce((sum, row) => sum + row.shares, 0) : 0;
    const ceoOwnershipFraction = corp.totalShares > 0 ? ceoShares / corp.totalShares : 0;
    const fundShares = corp.shareholders.filter((row) => row.holder === "fund").reduce((sum, row) => sum + row.shares, 0);
    const indexFundOwnershipFraction = corp.totalShares > 0 ? fundShares / corp.totalShares : 0;
    const snapshot = calculateSourceCorporateCreditScore({
      liquidCapitalAnchor,
      totalDebtAnchor,
      annualIncomeAnchor,
      annualInterestAnchor,
      totalEquityAnchor,
      previousCompositeScore: corp.creditCompositeSnapshot,
      bondDefaultCreditPenaltyActive: corp.bondDefaultCreditPenaltyUntilTurn != null &&
        world.meta.turn < corp.bondDefaultCreditPenaltyUntilTurn,
      insiderConcentrationPenalty: !corp.isPrivate && ceoOwnershipFraction > INSIDER_CONCENTRATION_THRESHOLD,
      indexInclusionUpgrade: !corp.isPrivate && indexFundOwnershipFraction >= INDEX_INCLUSION_THRESHOLD,
    });
    corp.creditRatingSnapshot = snapshot.rating;
    corp.creditCompositeSnapshot = snapshot.compositeScore;
    corp.creditSnapshotTurn = world.meta.turn;
    corp.creditRatingComponents = snapshot.components;
    if (corp.bondDefaultCreditPenaltyUntilTurn != null && corp.bondDefaultCreditPenaltyUntilTurn <= world.meta.turn) {
      delete corp.bondDefaultCreditPenaltyUntilTurn;
    }
  }
}
