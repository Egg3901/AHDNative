/**
 * Unions turn phases — W15.
 *
 * Ports src/lib/turn/unions/index.ts processUnionsTurn (dues/services/approval)
 * plus the NPP behavior hook above, as two TurnPhase objects registered at the
 * END of the phase list before newsMaintenance.
 *
 * Membership aggregation (#320): mainline computes members from
 * CorporateSector.workers * unionization / 100 over the sectors each union
 * represents. Native aggregates over the recorded #296 corporate-sector
 * assets (see sectorAggregation.ts representedSectorsForUnion): one dues row
 * per asset whose representingUnionId points at the union, with the stored
 * headcount and the union's density. Display headcount and dues headcount
 * therefore share one record and cannot drift apart.
 *
 * Wage bridge: mainline's averageAnnualWage uses wagePerWorker (daily) * GAME_DAYS_PER_YEAR.
 * AHDClient derives annualWage as:
 *   annualWage = (budget.wagesAndSalaries OR gdp*0.35) / totalCountryLaborForce
 * which is the same per-worker annual payroll that budget revenue uses (see
 * budget/revenue.ts wagesAndSalaries = gdp * ratios.wagesAndSalaries).
 * Falls back to 0 when laborForce is 0 so duesBurdenRatio returns 0 rather
 * than dividing by zero (matches mainline's annualWage <=0 ->0 guard).
 * Per-sector wage/unionization tables remain a #322 gap, not silent coverage.
 *
 * Treasury/services/approval math is verbatim from unionDues.ts:
 *  - duesRate = min(stored, maxDuesForWage(annualWage)) (re-clamped each turn)
 *  - duesIncome = duesIncomePerTurn(members, duesRate)
 *  - servicesCost floored to 0 when > treasury+duesIncome (lapses)
 *  - requested contribution = politicalContributionPerTurn(freeCashFlow, pct)
 *  - actual debit equals the paid organizer payouts (#320 organizer shares
 *    filtered to resolvable recipients, #321 atomic payout leg crediting
 *    recipient campaign funds with one union_contribution ledger row each;
 *    with no payable organizers Native retains the unpaid amount in treasury)
 *  - treasury += duesIncome - servicesCost - contribution
 *  - approval trends toward approvalTarget
 *
 * Suspension (union ban law) is honoured: suspended unions skip the whole block.
 * NPP behavior runs first so a union elected this turn still gets its dues tick
 * the same turn? Mainline runs nppUnionBehavior AFTER unionsTurn; AHDClient runs
 * NPP before unionsTurn in the tail cluster so election is visible same turn —
 * deviation documented in registry.ts comment.
 *
 * Source: <mainline-checkout>/src/lib/turn/unions/index.ts processUnionsTurn
 *         <mainline-checkout>/src/lib/unions/unionDues.ts
 *         <mainline-checkout>/src/lib/unions/unionServices.ts
 *         <mainline-checkout>/src/lib/unions/unionPoliticalContributions.ts
 *         demographics/laborForce.ts laborForces
 *         corporation/sectorSeedWeights1953.ts SECTOR_WEIGHTS_1953
 *         budget/revenue.ts wagesAndSalaries ratio
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { SECTOR_WEIGHTS_1953 } from "../corporation/sectorSeedWeights1953.js";
import {
  averageAnnualWage,
  duesIncomePerTurn,
  maxDuesForWage,
  servicesCostPerTurn,
  approvalTarget,
  trendApproval,
  unionApproval,
  unionMembers,
} from "./dues.js";
import { normalizeServiceIds } from "./services.js";
import {
  clampPoliticalContributionPct,
  distributePoliticalContributions,
  freeCashFlowPerTurn,
  politicalContributionPerTurn,
} from "./political.js";
import { decayUnionStrength, eligibleOrganizerShares } from "./organizers.js";
import { applyUnionContributionPayouts, resolveContributionRecipient } from "./contributions.js";
import {
  adoptUnrepresentedSectors,
  representedSectorsForUnion,
  totalLaborForceForCountry,
} from "./sectorAggregation.js";
import { processNppUnionBehavior } from "./nppBehavior.js";

export const unionsTurnPhase: TurnPhase = {
  name: "unionsTurn",
  run(world: WorldState) {
    const turn = world.meta.turn;
    const unions = world.unions as Record<string, import("./types.js").Union> | undefined;
    if (!unions || Object.keys(unions).length === 0) return;

    // #320: strength decay and null-pointer adoption run before dues, same
    // turn position as the reference (decay beside the dues pass, adoption
    // before the represented-sectors query).
    decayUnionStrength(world, turn);
    adoptUnrepresentedSectors(world);

    for (const union of Object.values(unions)) {
      if (union.suspended) continue;

      const countryId = union.countryId;
      const sectorType = union.sectorType;
      const weight = SECTOR_WEIGHTS_1953[countryId]?.[sectorType as keyof typeof SECTOR_WEIGHTS_1953[string]] ?? 0;
      if (weight <= 0) continue;

      const totalLF = totalLaborForceForCountry(world, countryId);
      if (totalLF <= 0) continue;

      // #320: dues rows come from the recorded corporate-sector assets this
      // union represents (stored headcount x union density), not the old
      // totalLF x weight synthetic sector. The dues helpers below are
      // untouched, so the arithmetic stays identical to mainline goldens.
      const sectors = representedSectorsForUnion(world, union);
      const members = unionMembers(sectors);
      const avgWage = averageAnnualWage(sectors);

      const activeServices = normalizeServiceIds(union.activeServices);
      const duesRate = Math.min(Math.max(0, union.duesPerWorkerAnnual ?? 0), maxDuesForWage(avgWage));
      const duesIncome = duesIncomePerTurn(members, duesRate);
      const fullServicesCost = servicesCostPerTurn(members, avgWage, activeServices);
      const affordableTreasury = union.treasury + duesIncome;
      const servicesLapsed = fullServicesCost > affordableTreasury;
      const servicesCost = servicesLapsed ? 0 : fullServicesCost;
      const contributionPct = clampPoliticalContributionPct(union.politicalContributionPct);
      const freeCashFlow = freeCashFlowPerTurn(duesIncome, servicesCost);
      // Mainline debits only the sum actually paid to eligible organizers
      // (#320 shares from banked organizer strength, split by the verbatim
      // distributePoliticalContributions rule). #321: shares whose organizer
      // identity resolves to no recipient record are excluded BEFORE the
      // split, so the debit equals exactly what real recipients are
      // credited; with no payable organizers the requested amount remains
      // in treasury. The payout leg below is atomic: treasury, recipient
      // campaign funds, and ledger rows move together, and any invalid
      // recipient throws before mutating anything.
      const requestedContribution = politicalContributionPerTurn(freeCashFlow, contributionPct);
      const payouts = distributePoliticalContributions(
        requestedContribution,
        eligibleOrganizerShares(world, union.id).filter(
          (share) => resolveContributionRecipient(world, share.characterId) !== null,
        ),
      );
      if (payouts.length > 0) {
        applyUnionContributionPayouts(world, { unionId: union.id, turn, payouts });
      }
      const target = approvalTarget({
        duesPerWorkerAnnual: duesRate,
        annualWage: avgWage,
        activeServices,
        servicesLapsed,
        politicalContributionPct: contributionPct,
      });
      const nextApproval = trendApproval(unionApproval(union), target);

      // The contribution leg already left treasury inside
      // applyUnionContributionPayouts (debit == paid exactly); only dues in
      // and services out remain here.
      union.treasury = union.treasury + duesIncome - servicesCost;
      // Clamp treasury to non-negative defensively (mainline never lets services push negative; contributions can still)
      if (union.treasury < 0) union.treasury = 0;
      // Round treasury to cents
      union.treasury = Math.round(union.treasury * 100) / 100;
      union.approval = nextApproval;
      union.duesPerWorkerAnnual = duesRate;
      union.updatedAtTurn = turn;
    }
  },
};

export const nppUnionBehaviorPhase: TurnPhase = {
  name: "nppUnionBehavior",
  run(world: WorldState) {
    // Deterministic NPP leadership filling + orphan cleanup. Campaign/bargaining
    // counters are PORT-STUB at 0 until bargainingCampaigns lands.
    processNppUnionBehavior(world);
  },
};
