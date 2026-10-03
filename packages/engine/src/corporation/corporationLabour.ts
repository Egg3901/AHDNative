/**
 * Corporation-turn labour leg (#322).
 *
 * Ports the labour half of AHDGame's corporation sector pass
 * (turn/corporation/sectorLabour.ts resolveSectorLabourProductionEffects plus
 * the strike-step block, with the agreement/ban loaders from
 * unions/collectiveAgreementEffects.ts loadCollectiveAgreementEffects and
 * unions/industrialActionEffects.ts loadIndustrialActionOutputFactors) at
 * pinned e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * Two halves, both owned here so the economic hit lands EXACTLY ONCE per
 * turn (the unions pass never touches revenue, margin, or output):
 *
 * 1. Production effects, read from turn-start strike state BEFORE stepping
 *    (reference resolveSectorLabourProductionEffects ordering): a sector
 *    with strikeStartedAtTurn set and no agreement protection throttles its
 *    corporation's revenue by STRIKE_REVENUE_THROTTLE and takes the
 *    STRIKE_MARGIN_PENALTY_PP margin hit; a sector under a live
 *    overtime-ban dispute takes OVERTIME_BAN_OUTPUT_FACTOR. Settlement
 *    suppresses the strike hit immediately, the same turn it lands.
 * 2. Strike stepping AFTER the corp math: each observed asset's expectation
 *    trends toward real wage (reference trendWorkerExpectation rule), and
 *    source-eligible grievances start strikes while active strikes resolve
 *    through stepSectorStrike (concession / waitout / ban / agreement, with
 *    the waitout unionization bump capped at 100).
 *
 * Native adaptations (cited, not invented):
 * - One aggregate corporation per country/industry, so per-sector factors
 *   fold into the corp as a worker-weighted output factor, and the margin
 *   penalty applies when any of the corp's assets is strike-active. Worlds
 *   with no live action read exactly { outputFactor: 1, marginModifier: 0 }
 *   and stay byte-identical to pre-#322 turns.
 * - No per-state COL: realWageIndex uses the helper's absent-COL default of
 *   100. The source national union-law bias adjusts the strike threshold;
 *   full regional unionization drift remains absent because Native has no
 *   unemployment/COL/minimum-wage provider for that source calculation.
 *   Softening comes from the representing union's active services via
 *   servicesStrikeSoftening (verbatim MAX_STRIKE_SOFTENING cap).
 * - Agreement wage floors have no Native consumer (no sector labor-cost
 *   math runs in this worktree), so only the no-strike window is loaded.
 *   The floor stays on the agreement row for the future consumer.
 *
 * Determinism: sorted asset iteration, no RNG, no timestamps.
 */

import type { WorldState } from "../types.js";
import {
  validateBargainingCampaigns,
  validateCollectiveAgreements,
} from "../unions/campaigns.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import {
  isCollectiveAgreementActive,
  OVERTIME_BAN_OUTPUT_FACTOR,
  realWageIndex,
  stepSectorStrike,
  STRIKE_MARGIN_PENALTY_PP,
  STRIKE_REVENUE_THROTTLE,
  trendWorkerExpectation,
} from "../unions/bargaining.js";
import { normalizeServiceIds, servicesStrikeSoftening } from "../unions/services.js";
import { lawAdjustedUnionizationThreshold } from "../unions/unionLaws.js";
import { undergroundDensityAfterBanTurn, undergroundOutputFactor, undergroundSectorKey, undergroundStrength } from "../unions/underground.js";

/** Turn-start labour snapshot the corp math and the strike step share. */
export interface CorporationLabourState {
  /** Sectors covered by an active agreement still inside its no-strike window. */
  noStrikeProtectedSectorIds: Set<string>;
  /** Overtime-ban output factor per covered sector (min wins on overlap). */
  overtimeBanFactorBySectorId: Map<string, number>;
  /** Strongest banned cell in each country/industry pair, for labor feedback. */
  undergroundStrengthByCountrySector?: Map<string, number>;
}

/**
 * Load agreement protection + overtime-ban factors once per turn.
 * Source: collectiveAgreementEffects.ts loadCollectiveAgreementEffects
 * (defensive max wage-floor selection; protection while
 * currentTurn < noStrikeUntilTurn) + industrialActionEffects.ts
 * loadIndustrialActionOutputFactors (live overtime_ban disputes only,
 * min factor wins).
 */
export function loadCorporationLabourState(world: WorldState, turn: number): CorporationLabourState {
  // Fail closed on present-but-invalid rows like the save path does, but
  // WITHOUT the lazy accessors: materializing absent maps here would dirty
  // every idle world that runs the corporation turn.
  validateBargainingCampaigns(world, world.bargainingCampaigns ?? {});
  validateCollectiveAgreements(world, world.collectiveAgreements ?? {});
  const noStrikeProtectedSectorIds = new Set<string>();
  for (const agreement of Object.values(world.collectiveAgreements ?? {})) {
    if (!isCollectiveAgreementActive(agreement, turn)) continue;
    for (const sectorId of agreement.sectorIds) {
      if (turn < agreement.noStrikeUntilTurn) noStrikeProtectedSectorIds.add(sectorId);
    }
  }
  const overtimeBanFactorBySectorId = new Map<string, number>();
  for (const campaign of Object.values(world.bargainingCampaigns ?? {})) {
    if (campaign.status !== "dispute" || campaign.escalationLevel !== "overtime_ban") continue;
    for (const sectorId of campaign.sectorIds) {
      const prior = overtimeBanFactorBySectorId.get(sectorId) ?? 1;
      overtimeBanFactorBySectorId.set(sectorId, Math.min(prior, OVERTIME_BAN_OUTPUT_FACTOR));
    }
  }
  const undergroundStrengthByCountrySector = new Map<string, number>();
  for (const union of Object.values(world.unions ?? {})) {
    if (world.budgets[union.countryId]?.unionsBanned !== true && union.suspended !== true) continue;
    const key = undergroundSectorKey(union.countryId, union.sectorType);
    undergroundStrengthByCountrySector.set(key, Math.max(undergroundStrengthByCountrySector.get(key) ?? 0, undergroundStrength(union)));
  }
  return { noStrikeProtectedSectorIds, overtimeBanFactorBySectorId, undergroundStrengthByCountrySector };
}

/** Economic hit for one corporation this turn. Multiplicative, applied once. */
export interface CorporationLabourFactors {
  /** Worker-weighted output factor over the corp's assets (1 when idle). */
  outputFactor: number;
  /** Margin modifier in percentage points (STRIKE_MARGIN_PENALTY_PP or 0). */
  marginModifierPP: number;
  /** True while any asset strikes without agreement protection. */
  strikeActive: boolean;
}

/**
 * Fold turn-start sector state into one corp-level factor.
 * Source: sectorLabour.ts resolveSectorLabourProductionEffects
 * (strikeFactor * industrialActionFactor; margin modifier on strike).
 * Staffing/labour-market rationing is a separate system, not ported here.
 */
export function labourFactorsForCorporation(
  world: WorldState,
  corporationId: string,
  labour: CorporationLabourState,
): CorporationLabourFactors {
  const assets = corporateSectorAssets(world);
  const scoped = Object.values(assets)
    .filter((asset) => asset.corporationId === corporationId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let weighted = 0;
  let totalWeight = 0;
  let strikeActive = false;
  for (const asset of scoped) {
    const weight = Math.max(0, asset.workers ?? 0);
    const protectedByAgreement = labour.noStrikeProtectedSectorIds.has(asset.id);
    const representingUnion = asset.representingUnionId
      ? world.unions[asset.representingUnionId]
      : undefined;
    const banned = world.budgets[asset.countryId]?.unionsBanned === true || representingUnion?.suspended === true;
    const striking = asset.strikeStartedAtTurn != null && !protectedByAgreement && !banned;
    if (striking) strikeActive = true;
    const strikeFactor = striking ? 1 - STRIKE_REVENUE_THROTTLE : 1;
    const banFactor = labour.overtimeBanFactorBySectorId.get(asset.id) ?? 1;
    const undergroundStrength = banned
      ? labour.undergroundStrengthByCountrySector?.get(undergroundSectorKey(asset.countryId, asset.sectorType)) ?? 0
      : 0;
    weighted += strikeFactor * banFactor * undergroundOutputFactor(undergroundStrength) * weight;
    totalWeight += weight;
  }
  return {
    outputFactor: totalWeight > 0 ? weighted / totalWeight : 1,
    marginModifierPP: strikeActive ? STRIKE_MARGIN_PENALTY_PP : 0,
    strikeActive,
  };
}

export interface SectorStrikeStepResult {
  sectorsTrended: number;
  started: number;
  resolvedConcession: number;
  resolvedWaitout: number;
  resolvedBanned: number;
  resolvedAgreement: number;
}

/**
 * Trend every observed asset's expectation toward the real wage, then step
 * the source strike state machine. A source-authorized
 * national ban also decays recorded shop-floor density by the source 3pp
 * per turn and supplies the source country ban/bias gates.
 * Source: sectorLabour.ts strike-step block (expectation trend, softening
 * from the representing union's services, bump capped at 100).
 */
export function stepCorporateSectorStrikes(
  world: WorldState,
  turn: number,
  labour: CorporationLabourState,
): SectorStrikeStepResult {
  const result: SectorStrikeStepResult = {
    sectorsTrended: 0,
    started: 0,
    resolvedConcession: 0,
    resolvedWaitout: 0,
    resolvedBanned: 0,
    resolvedAgreement: 0,
  };
  const assets = corporateSectorAssets(world);
  const scoped = Object.values(assets).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const asset of scoped) {
    const budget = world.budgets[asset.countryId];
    const unionsBanned = budget?.unionsBanned === true;
    if (unionsBanned && typeof asset.unionization === "number") {
      const shadowStrength = labour.undergroundStrengthByCountrySector?.get(undergroundSectorKey(asset.countryId, asset.sectorType)) ?? 0;
      asset.unionization = undergroundDensityAfterBanTurn(asset.unionization, shadowStrength);
    }
    // Idle assets (no strike in flight, no observed expectation) are left
    // untouched: a null expectation initializes AT the real wage on first
    // observation and only a strike call displaces it, so trending one is a
    // behavior no-op that would dirty idle worlds. Assets carrying a
    // post-strike expectation still trend back, exactly like the reference.
    if (asset.strikeStartedAtTurn == null && asset.workerExpectationIndex == null && !unionsBanned) continue;
    const realWage = realWageIndex(asset.wageLevel ?? 1, undefined);
    asset.workerExpectationIndex = trendWorkerExpectation(asset.workerExpectationIndex, realWage);
    result.sectorsTrended++;
    const representingUnion = asset.representingUnionId
      ? world.unions[asset.representingUnionId]
      : undefined;
    const step = stepSectorStrike({
      unionization: asset.unionization ?? representingUnion?.unionization ?? 0,
      realWage,
      workerExpectation: asset.workerExpectationIndex,
      turn,
      prior: {
        strikeStartedAtTurn: asset.strikeStartedAtTurn,
        strikeCooldownUntilTurn: asset.strikeCooldownUntilTurn,
      },
      ...(typeof budget?.unionLawBias === "number" && {
        unionizationThreshold: lawAdjustedUnionizationThreshold(budget.unionLawBias),
      }),
      unionsBanned: unionsBanned || representingUnion?.suspended === true,
      noStrikeProtected: labour.noStrikeProtectedSectorIds.has(asset.id),
      strikeSoftening: representingUnion
        ? servicesStrikeSoftening(normalizeServiceIds(representingUnion.activeServices))
        : 0,
    });
    if (step.event !== null || asset.strikeStartedAtTurn != null || asset.strikeCooldownUntilTurn != null) {
      asset.strikeStartedAtTurn = step.next.strikeStartedAtTurn;
      asset.strikeCooldownUntilTurn = step.next.strikeCooldownUntilTurn;
    }
    if (step.unionizationBump > 0) {
      const density = asset.unionization ?? 0;
      asset.unionization = Math.min(100, density + step.unionizationBump);
    }
    if (step.event === "started") result.started++;
    else if (step.event === "resolved_concession") result.resolvedConcession++;
    else if (step.event === "resolved_waitout") result.resolvedWaitout++;
    else if (step.event === "resolved_banned") result.resolvedBanned++;
    else if (step.event === "resolved_agreement") result.resolvedAgreement++;
  }
  return result;
}
