/**
 * Command-economy turn phase — solo port of src/lib/turn/commandEconomyTurn.ts
 * processCommandEconomyTurn (the P1/P3 macro-state cluster only).
 *
 * Ports source-seeded RU/DD SOE plan/output overlays and directed credit. The
 * player-authored Gosplan target and director-request paths, plus the plants-
 * tier replacement floor, remain unavailable. The P1/P3 macro-state kernel
 * (state.ts) and the REAL parts of
 * the v2 policy-stance/marketization-drift layer (constants.ts): the
 * governing-party reformism read is wired to W23's real
 * `world.governments[countryId].governingPartyId` (RU="RU_CPSU",
 * DD="DD_SED" per government/government.test.ts), exactly mirroring
 * mainline's P3 "who actually governs" fix. Gosbank posture starts from the
 * mainline NPP-brain defaults (NPP_DEFAULT_*), then player-authored posture
 * and sector-weight directives resolve at their saved effective turn.
 *
 * Ships ON (no `commandEconomyEnabled` flag) — see constants.ts file doc.
 */

import type { TurnPhase } from "../phases/types.js";
import { aggregateCapacityUtilisation, aggregatePlanFulfillment, applyDirectedCreditToSoe, directedCreditBudget, resolveCreditAllocation } from "./soe.js";
import {
  accumulateOverhang,
  blackMarketPremiumFrom,
  blackMarketPressure,
  directedCreditIssuance,
  overhangInjectionFromIssuance,
  shortageIndexFrom,
  updateSecondEconomy,
} from "./state.js";
import {
  NPP_DEFAULT_BUDGET_SOFTNESS,
  NPP_DEFAULT_CREDIT_AGGRESSIVENESS,
  NPP_DEFAULT_REFORMISM,
  NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
  computePolicyStance,
  driftMarketizationLevel,
  governmentReformismFromEconomicPosition,
  internalRepressionFromReformism,
  isPlannedEconomy,
  marketizationDrift,
  marketizationGravity,
  plannedShare,
  scheduledMarketizationLevel,
  wageFundConstrainedGrowth,
} from "./constants.js";

export const commandEconomyPhase: TurnPhase = {
  name: "commandEconomy",
  run(world) {
    const currentYear = Number(world.meta.date.slice(0, 4));
    for (const ce of Object.values(world.commandEconomy)) {
      const budget = world.budgets[ce.countryId];
      if (!budget) continue;
      // Execute player-costed Gosbank directives at their effective turn boundary.
      // A queued posture expires if the country leaves the planned-economy
      // regime before resolution; it cannot silently rewrite obsolete policy.
      const plannedRegimeAtResolution = isPlannedEconomy(ce.marketizationLevel);
      const ready = (ce.pendingDirectives ?? []).filter((d) => d.effectiveTurn <= world.meta.turn);
      const future = (ce.pendingDirectives ?? []).filter((d) => d.effectiveTurn > world.meta.turn);
      for (const directive of ready) {
        if (directive.countryId !== ce.countryId) continue;
        if (!plannedRegimeAtResolution) continue;
        if (directive.creditAggressiveness !== undefined) ce.creditAggressiveness = directive.creditAggressiveness;
        if (directive.budgetSoftness !== undefined) ce.budgetSoftness = directive.budgetSoftness;
        if (directive.sectorCredit !== undefined) {
          if (directive.sectorCredit === null) delete ce.sectorCredit;
          else ce.sectorCredit = directive.sectorCredit;
        }
      }
      ce.pendingDirectives = future;

      // Dual-track ceiling reached: plan machinery stops entirely (mirrors
      // mainline's isPlannedEconomy gate in commandEconomyTurn.ts).
      if (!isPlannedEconomy(ce.marketizationLevel)) continue;

      const soes = Object.values(world.corporations).filter((corporation) =>
        corporation.countryId === ce.countryId && corporation.soe !== undefined,
      );
      const aggregatePlanTarget = soes.reduce((sum, corporation) => sum + (corporation.soe?.planTarget ?? 0), 0);
      const totalCredit = directedCreditBudget(aggregatePlanTarget, ce.creditAggressiveness ?? NPP_DEFAULT_CREDIT_AGGRESSIVENESS);
      const creditAllocation = resolveCreditAllocation(
        soes.flatMap((corporation) => corporation.soe ? [{ sector: corporation.soe.sector, output: corporation.soe.output, planTarget: corporation.soe.planTarget }] : []),
        totalCredit,
        ce.sectorCredit,
      );
      const directedCreditBySector: Record<string, number> = {};
      for (const corporation of soes) {
        const soe = corporation.soe;
        if (!soe) continue;
        const amount = creditAllocation.get(soe.sector) ?? 0;
        corporation.soe = applyDirectedCreditToSoe(soe, amount);
        directedCreditBySector[soe.sector] = Math.round(amount);
      }
      ce.directedCreditBySector = directedCreditBySector;
      const soePerf = aggregateCapacityUtilisation(soes.flatMap((corporation) => corporation.soe ? [corporation.soe] : []));
      const soeFulfillment = aggregatePlanFulfillment(soes.flatMap((corporation) => corporation.soe ? [corporation.soe] : []));

      const share = plannedShare(ce.marketizationLevel);

      // ── LIVE government reformism (P3): who actually governs ──────────────
      const gov = world.governments[ce.countryId];
      const governingParty = gov?.governingPartyId ? world.parties[gov.governingPartyId] : undefined;
      const partyReformism = governmentReformismFromEconomicPosition(governingParty?.economicPosition);
      const reformism = partyReformism ?? NPP_DEFAULT_REFORMISM;
      const internalRepression = internalRepressionFromReformism(reformism);
      const budgetSoftness = ce.budgetSoftness ?? NPP_DEFAULT_BUDGET_SOFTNESS;
      const creditAggressiveness = ce.creditAggressiveness ?? NPP_DEFAULT_CREDIT_AGGRESSIVENESS;

      // ── Two-circuit wage fund: constrain nominal wage growth ──────────────
      const wageGrowth = wageFundConstrainedGrowth(
        budget.economicFactors.wageGrowth,
        budget.economicFactors.gdpGrowth,
        share,
      );
      budget.economicFactors.wageGrowth = wageGrowth;

      // ── Overhang / shortage / black market / second economy ───────────────
      const relief = updateSecondEconomy(
        ce.secondEconomyShare,
        ce.shortageIndex,
        ce.monetaryOverhang,
        NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
      ).relief;
      const overhang = accumulateOverhang(
        ce.monetaryOverhang,
        wageGrowth,
        budget.economicFactors.gdpGrowth,
        share,
        relief,
        overhangInjectionFromIssuance(
          directedCreditIssuance(totalCredit),
          aggregatePlanTarget,
          share,
        ),
        soeFulfillment,
      );
      const shortageIndex = shortageIndexFrom(overhang);
      const blackMarketPremium = blackMarketPremiumFrom(
        shortageIndex,
        overhang,
        NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
      );
      const secondEconomyShare = updateSecondEconomy(
        ce.secondEconomyShare,
        shortageIndex,
        overhang,
        NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE,
      ).share;

      const pressureBase = blackMarketPressure(shortageIndex, blackMarketPremium, secondEconomyShare);
      const pressureEffective = blackMarketPressure(
        shortageIndex,
        blackMarketPremium,
        secondEconomyShare,
        internalRepression,
      );

      // ── Endogenous marketization drift ─────────────────────────────────────
      const policyStance = computePolicyStance(reformism, creditAggressiveness, budgetSoftness);
      const gravity = marketizationGravity(
        ce.marketizationLevel,
        scheduledMarketizationLevel(ce.countryId, currentYear),
      );
      const drift =
        marketizationDrift(pressureEffective, soePerf, policyStance) + gravity;
      const nextLevel = driftMarketizationLevel(ce.marketizationLevel, drift);

      ce.marketizationLevel = nextLevel;
      ce.monetaryOverhang = overhang;
      ce.shortageIndex = shortageIndex;
      ce.blackMarketPremium = blackMarketPremium;
      ce.secondEconomyShare = secondEconomyShare;
      ce.blackMarketPressureBase = pressureBase;
      ce.blackMarketPressureEffective = pressureEffective;
      ce.governmentReformism = reformism;
      ce.internalRepression = internalRepression;
      ce.budgetSoftness = budgetSoftness;
    }
  },
};
