import type { CorporationType } from "./types.js";
import { getSectorStrategy } from "./plantCapacity.js";

/**
 * First year each tech-gated strategy is available to an otherwise-unresearched
 * source corporation from `autoGrantedNodeIds` alone. Values were computed by
 * executing Game `getStrategyAvailability` + `autoGrantedNodeIds` at immutable
 * 96831835, with `sectorTechTreesEnabled=true` and no stored unlocks. A null
 * means the source's baseline tree never grants it; it requires the real tech
 * unlock path, which Native does not yet model.
 */
const BASELINE_TECH_UNLOCK_YEAR: Partial<Record<CorporationType, Record<string, number | null>>> = {
  energy: { fracking: 2019, renewables: 2009, nuclear: 1960, smart_grid: 2019, fusion: null },
  manufacturing: { additive_manufacturing: 2019, autonomous_factory: null, electronics_manufacturing: 1979 },
  technology: { quantum_computing: null, ai_platforms: null },
  agriculture: { vertical_farming: 2029, precision_ag: null, sustainable: 1960 },
  chemical_industries: { specialty_chemicals: 1999, pharmaceuticals: 1950, plastics: 1940 },
  healthcare: { telehealth: 2019 },
  automobiles: { autonomous_driving: null, ev: 2029 },
  financial: { algorithmic_trading: 2019, fintech: 2009 },
  media: { streaming_media: 2019, digital_first: 1999 },
  defense: { directed_energy: null, cyber: 2009 },
  real_estate: { proptech: 2029 },
  construction: { modular_construction: 2029 },
  telecommunications: { mobile_5g: null, cloud: 2019 },
  entertainment: { live_service: 2029, streaming: 2009 },
  retail: { ecommerce_fulfillment: 2019, ecommerce: 1999 },
  logistics: { autonomous_freight: null, automated: 1999 },
};

/** Native projects the source's free passed-decade tree grants, not research choices. */
export function isBaselineSourceStrategyAvailable(
  strategySectorType: CorporationType,
  strategyId: string,
  currentYear: number,
  corporationSectorType: CorporationType = strategySectorType,
): boolean {
  const strategy = getSectorStrategy(strategySectorType, strategyId);
  if (strategy.minDecade && currentYear < Number(strategy.minDecade)) return false;
  if (!strategy.requiresTechUnlock) return true;
  // Game chooses a candidate from the CorporateSector's recipe catalog, but
  // evaluates its unlock against the owning Corporation's tech tree. Those
  // sector identities can differ for acquired or secondary-sector assets.
  const unlockedYear = BASELINE_TECH_UNLOCK_YEAR[corporationSectorType]?.[strategyId];
  return typeof unlockedYear === "number" && currentYear >= unlockedYear;
}
