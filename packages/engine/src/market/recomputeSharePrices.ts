/**
 * recomputeSharePrices — W10. Re-prices every corp's shares each turn from
 * fresh, same-turn corp financials.
 *
 * Registered at the END of the phase list (registry.ts), just before
 * newsMaintenancePhase, per the same rng-stream-stability rule the
 * corporation, campaign, intra-party, government, presidential, and
 * cabinet/judiciary tail clusters already follow there — mainline runs
 * recomputeSharePrices mid-pipeline (turnPhaseNames.ts, after bondTurn);
 * inserting it there would shift every downstream rng draw for existing
 * goldens. This phase itself draws no rng (pure repricing), same as
 * corporationTurnPhase.
 *
 * Ordering vs corporationTurnPhase: this phase must run AFTER
 * corporationTurnPhase within the same turn (it reads corp.liquidCapital,
 * corp.currentGrowthRate, and corp.earningsHistory, all written by that
 * phase this same turn). registry.ts places it as the LAST phase before
 * newsMaintenancePhase — after every other tail cluster, including
 * corporationTurnPhase — which trivially guarantees the ordering (no other
 * phase in this worktree mutates world.corporations, so nothing in between
 * matters).
 *
 * Mainline's own recomputeSharePrices exists to fix a lag: it re-prices
 * AFTER bondTurn has applied coupon cash flows, because processCorporationTurn
 * already wrote a placeholder price before bondTurn ran (see
 * turn/corporation/recomputeSharePrices.ts file doc). The W13 bond cluster
 * (sovereignIssuance, bondCouponMaturity, npcBondHolder in bonds/phases.ts)
 * is live but placed at the tail AFTER this phase, so this phase still
 * prices before this turn's coupon/maturity servicing rather than after it
 * as in mainline. This is a tail-ordering deviation, not a missing system. It reads
 * the same-turn corporationTurn output directly.
 *
 * The live price is the source-shaped fundamental value multiplied by the
 * available sentiment and order-flow inputs. Native replaces the source's
 * wall-clock 15-minute window with a deterministic turn window: successful
 * player trades accumulate executed notional, this phase consumes it once,
 * and the windows reset. Event pulses remain absent because they have no
 * representation in the offline save contract; old saves without investor
 * confidence stay neutral.
 */
import type { TurnPhase } from "../phases/types.js";
import { computeEffectivePrimeRate } from "../centralBank/constants.js";
import { normalizedEarningsFromHistory } from "./earnings.js";
import { computeSharePrices, type SharePriceInput } from "./sharePriceFormula.js";
import {
  SECTOR_RISK_PREMIUM,
  FALLBACK_PRIME_RATE_PERCENT,
  MARKET_PRICE_HISTORY_TURNS,
  MIN_SHARE_PRICE,
} from "./constants.js";
import { computeOrderFlowMultiplier } from "./orderFlow.js";
import { getInvestorConfidenceSentiment } from "./sentiment.js";

export const recomputeSharePricesPhase: TurnPhase = {
  name: "recomputeSharePrices",
  run(world) {
    const corps = Object.values(world.corporations);
    if (corps.length === 0) return;

    const inputs: SharePriceInput[] = [];
    for (const corp of corps) {
      const bank = world.centralBanks[corp.countryId];
      const spotRate = bank?.primeRate ?? FALLBACK_PRIME_RATE_PERCENT;
      const history = bank?.interestRateHistory?.map((h) => h.rate);
      // Smoothed prime rate (30% spot / 70% trailing weighted avg): mirrors
      // mainline's primeRateSmoothedByCountry discount input (recomputeSharePrices.ts
      // "hourly turns" comment) — AHDClient's turns are the same instant-transmission
      // concern the smoothing exists for. computeEffectivePrimeRate is already
      // ported for the inflation monetary term (centralBank/constants.ts); reused
      // directly rather than re-derived.
      const smoothedPrimeRate = computeEffectivePrimeRate(spotRate, history) / 100;
      const riskPremium = SECTOR_RISK_PREMIUM[corp.sectorType] ?? SECTOR_RISK_PREMIUM.default!;

      inputs.push({
        corpId: corp.id,
        liquidCapitalAnchor: corp.liquidCapital,
        normalizedEarningsAnchor: normalizedEarningsFromHistory(corp.earningsHistory),
        sectorGrowthRate: corp.currentGrowthRate / 100,
        costOfCapital: smoothedPrimeRate + riskPremium,
        totalShares: corp.totalShares,
        previousSharePrice: corp.sharePrice,
      });
    }

    const newPrices = computeSharePrices(inputs);
    for (const corp of corps) {
      const price = newPrices.get(corp.id);
      if (price == null) continue;
      const sentimentMultiplier = getInvestorConfidenceSentiment(world.budgets[corp.countryId]?.investorConfidence);
      const orderFlowMultiplier = computeOrderFlowMultiplier(
        corp.orderFlowWindowBuyValue ?? 0,
        corp.orderFlowWindowSellValue ?? 0,
        corp.publicFloat,
        corp.sharePrice,
        corp.totalShares,
        corp.orderFlowMultiplier ?? 1,
      );
      const livePrice = Math.max(
        MIN_SHARE_PRICE,
        Math.round(price * sentimentMultiplier * orderFlowMultiplier * 100) / 100,
      );

      corp.fundamentalSharePrice = price;
      corp.sentimentMultiplier = sentimentMultiplier;
      corp.orderFlowMultiplier = orderFlowMultiplier;
      corp.sharePrice = livePrice;
      corp.orderFlowWindowBuyValue = 0;
      corp.orderFlowWindowSellValue = 0;
      const history = corp.priceHistory ?? [];
      corp.priceHistory = [...history, { turn: world.meta.turn, price: livePrice }].slice(-MARKET_PRICE_HISTORY_TURNS);
    }
  },
};
