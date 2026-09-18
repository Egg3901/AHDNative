/**
 * Bond turn phases — W13.
 *
 * Mainline ordering (src/simulation/phases/turnPhaseNames.ts, e364c0495):
 *  corporationTurn (5) < bondTurn (18) < recomputeSharePrices (22), with the
 * central-bank cluster (~111-116) long after bondTurn — so the source prices
 * bonds off last turn's prime rate (one-turn lag).
 * Solo deviation: placed at END before newsMaintenance (same rng-stream-stability rule
 * every tail cluster since W9/W10/W15/W29/W31 uses — inserting mid-pipeline would
 * shift every downstream rng draw for existing goldens). A dedicated re-golden will
 * restore mainline order. Relative order inside this cluster mirrors mainline's
 * real cause-and-effect:
 *   1. sovereign issuance (budget deficit auction) → 2. coupon/maturity servicing
 *      (cash flows against budget debt) → 3. NPC holder behavior → 4. price
 *      refresh already inside step 2 (vs W3 prime rate). Steps 2+3 together
 *      constitute the mainline bondTurn's daily concerns.
 * #309 consumer edge: recomputeSharePricesPhase is registered immediately
 * after this cluster (registry.ts) so the mainline bondTurn <
 * recomputeSharePrices edge holds and this turn's repricing reads
 * post-coupon issuer capital.
 *
 * Each phase is rng-free (deterministic over WorldState only) so tail placement
 * does not shift any shared RNG stream — same justification as W10's
 * recomputeSharePricesPhase comment.
 */

import type { TurnPhase } from "../phases/types.js";
import {
  issueScheduledSovereignBonds,
  payCouponsAndUpdatePrices,
  settleMaturedBonds,
  runNpcHolderBehavior,
} from "./bondTurn.js";
import { processCorporateBondTurn } from "./corporateBondServicing.js";

export const sovereignIssuancePhase: TurnPhase = {
  name: "sovereignIssuance",
  run(world) {
    void issueScheduledSovereignBonds(world);
  },
};

export const bondCouponMaturityPhase: TurnPhase = {
  name: "bondCouponMaturity",
  run(world) {
    // Coupons and price updates first (so maturing bonds pay one last coupon at prior price)
    void payCouponsAndUpdatePrices(world);
    // Then settle maturities (principal repayment + holder cash)
    void settleMaturedBonds(world);
    // Corporate servicing (coupons, maturity, buyback-independent default) at
    // the same writer hook the source's processBondTurn provides. #309 owns
    // any further phase reordering; relative order here changes nothing the
    // sovereign path reads.
    void processCorporateBondTurn(world);
  },
};

export const npcBondHolderPhase: TurnPhase = {
  name: "npcBondHolder",
  run(world) {
    runNpcHolderBehavior(world);
  },
};
