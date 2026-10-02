import type { WorldState } from "../types.js";
import { getCatalog, lawTargets, structuralResidual, composeTarget, driftStep, macroResidualFor, engineTermFor, legacyPoliticalHalfFromBoard, politicalNodeTargets, getNeutralFederalSalesTaxRate, getNeutralStateSalesTaxRate, NATIONAL_SCOPE_IDS } from "./sourceRuntime.mjs";
import type { TurnPhase } from "../phases/types.js";
import {
  addContributions,
  foldCabinetResidualsBySource,
  seedBySourceFromLegacy,
  sumCabinetResiduals,
} from "./cabinetResidual.js";
import { labourNudgesForTurn } from "../unions/labourRelationsTurn.js";

const SPENDING_KEYS: Record<string, readonly string[]> = {
  education: ["education"], healthcare: ["healthcare"],
  infrastructure: ["infrastructure", "transport", "transportation"],
  publicSafety: ["publicSafety"], social: ["social", "welfare", "socialSecurity"],
  environment: ["environment"], defense: ["defense"],
};
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;

function sameNumbers(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Game spendingProvider: national plus local per-capita, in US-reference units. */
function spendingFor(world: WorldState, regionId: string, countryId: string): Record<string, number> {
  const population = finite(world.regions[regionId]?.population);
  if (population <= 0 || NATIONAL_SCOPE_IDS.has(regionId)) return {};
  const countryPopulation = Object.values(world.regions).filter(r => r.countryId === countryId && !NATIONAL_SCOPE_IDS.has(r.id))
    .reduce((sum, r) => sum + finite(r.population), 0);
  const federal = world.budgets[countryId];
  const gdpPerCapita = countryPopulation > 0 ? finite(federal?.gdp) / countryPopulation : 0;
  const norm = gdpPerCapita > 0 ? 24_000 / gdpPerCapita : 1;
  const local = world.regionalBudgets[regionId]?.spending.byCategory ?? {};
  const national = federal?.spending.byCategory ?? {};
  return Object.fromEntries(Object.entries(SPENDING_KEYS).map(([channel, keys]) => [channel,
    keys.reduce((sum, key) => sum + (countryPopulation > 0 ? finite(national[key]) / countryPopulation : 0) + finite(local[key]) / population, 0) * norm,
  ]));
}

function enactedLevels(world: WorldState, countryId: string, regionId?: string): Map<string, number> {
  const levels = new Map<string, number>();
  for (const law of getCatalog(countryId)) {
    if (law.kind !== "tax") levels.set(law.id, regionId || law.allowedScope === "regional" ? 0 : law.baselineLevel ?? 0);
  }
  for (const law of [...world.enactedLaws].sort((a, b) => a.enactedAtTurn - b.enactedAtTurn)) {
    if (law.countryId !== countryId || law.repealedAtTurn !== undefined || (law.expiresAtTurn != null && law.expiresAtTurn <= world.meta.turn)) continue;
    if (regionId ? law.scope !== "regional" || law.regionId !== regionId : law.scope !== "national") continue;
    if (levels.has(law.id)) levels.set(law.id, Math.max(0, Math.min(4, law.level)));
  }
  return levels;
}

/** Game political dynamics consumes the previous ministerial snapshot. */
export const politicalCabinetResidualPhase: TurnPhase = {
  name: "politicalMetricsDynamics",
  run(world) {
    const labourByCountry = labourNudgesForTurn(world, world.meta.turn);
    for (const [regionId, board] of Object.entries(world.regionalPoliticalMetrics ?? {})) {
      const region = world.regions[regionId];
      if (!region || region.countryId !== board.countryId) continue;
      const snapshot = world.politicalCabinetContributions?.[board.countryId];
      const contributions: Record<string, Record<string, number>> = {};
      if (snapshot && snapshot.turn < world.meta.turn) {
        for (const [source, value] of Object.entries(snapshot.sources)) {
          contributions[source] = addContributions(value.contribution, value.regional[regionId] ?? {});
        }
        if (Object.keys(snapshot.sources).length === 0) {
          const legacy = addContributions(snapshot.contribution, snapshot.regional[regionId] ?? {});
          if (Object.keys(legacy).length) contributions.legacy = legacy;
        }
      }
      const previous = board.cabinetResidualsBySource
        ?? seedBySourceFromLegacy(board.cabinetResiduals ?? {}, contributions);
      board.cabinetResidualsBySource = foldCabinetResidualsBySource(previous, contributions);
      board.cabinetResiduals = sumCabinetResiduals(board.cabinetResidualsBySource);
      const labourByMetric = Object.fromEntries(labourByCountry.get(board.countryId) ?? []);
      const labourChanged = !sameNumbers(board.labourResiduals ?? {}, labourByMetric);
      // The provider owns dispute/settlement decay. Store its current-turn
      // output for inspection; this is a snapshot, not another accumulator.
      if (labourChanged) board.labourResiduals = labourByMetric;
      const national = lawTargets(board.countryId, enactedLevels(world, board.countryId));
      const regional = lawTargets(board.countryId, enactedLevels(world, board.countryId, regionId));
      // The source first observation adopts the current board as equilibrium.
      // No scored value moves on that healing turn.
      if (!board.residuals) {
        board.residuals = Object.fromEntries(Object.entries(national).map(([id, points]) =>
          [id, structuralResidual(board.values[id] ?? 0, points, regional[id] ?? 0)]));
        continue;
      }
      const macro = Object.fromEntries(Object.entries(world.regionalMetrics[regionId] ?? {})
        .filter(([path, metric]) => /^(economic|population)\./.test(path) && Number.isFinite(metric.value))
        .map(([path, metric]) => [path, metric.value]));
      const year = Number(world.meta.date.slice(0, 4));
      const legacy = legacyPoliticalHalfFromBoard(board.values, { countryId: board.countryId, year });
      const projected: Record<string, number> = {};
      for (const [category, rows] of Object.entries(legacy ?? {})) {
        for (const [id, metric] of Object.entries(rows)) if (Number.isFinite(metric.value)) projected[`${category}.${id}`] = metric.value;
      }
      const nodes = politicalNodeTargets({
        countryId: board.countryId, stateId: regionId,
        legacy: { ...macro, ...projected }, spending: spendingFor(world, regionId, board.countryId),
        providers: {
          sectorRevenueTax: {
            // Only recorded region-owned turnover enters a regional mix. The
            // national unowned pool is not arbitrarily spread across regions.
            owned: Object.values(world.corporateSectors ?? {}).filter(a => a.stateId === regionId)
              .map(a => ({ revenue: finite(a.revenue), sectorType: a.sectorType })),
            unowned: Object.values(world.unownedSectors).filter(a => a.regionId === regionId)
              .map(a => ({ revenue: a.revenue, sectorType: a.sectorType })),
            federalSalesTax: world.budgets[board.countryId]?.taxRates.salesTax ?? getNeutralFederalSalesTaxRate(board.countryId),
            stateSalesTax: world.regionalBudgets[regionId]?.taxRates?.salesTax ?? getNeutralStateSalesTaxRate(board.countryId),
            countryId: board.countryId,
          },
          // Game's provider falls back to45 when no authoritative approval
          // record exists. The provisional countryPolitics proxy is not one.
          governmentApproval: 45,
        },
      });
      for (const [id, points] of Object.entries(national)) {
        const value = board.values[id] ?? 0;
        const supplement = regional[id] ?? 0;
        const structural = board.residuals[id] ?? structuralResidual(value, points, supplement);
        const lawTarget = composeTarget(points, supplement, structural);
        const target = composeTarget(points, supplement, structural
          + macroResidualFor(id, lawTarget, macro, board.countryId)
          + engineTermFor(id, lawTarget, nodes, board.countryId, year)
          + (board.cabinetResiduals[id] ?? 0)
          + (labourByMetric[id] ?? 0));
        board.values[id] = driftStep(value, target);
      }
    }
  },
};
