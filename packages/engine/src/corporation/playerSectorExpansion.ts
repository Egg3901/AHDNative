import type { WorldState } from "../types.js";
import { anchorToLocal, getRateForCountry, localToAnchor } from "../forex/conversion.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { resolveCountryCurrency } from "../bonds/denomination.js";
import { CORPORATION_TYPES, type CorporationType } from "./types.js";
import { corporateSectorAssets, initialRepresentingUnionId, validateCorporateSectorAssets } from "./corporateSectorAssets.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";
import { capacityEraPriceIndex, capacityPricePerUnitAnchor, corporateSectorBasePrices, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";
import { getSectorTechEffects } from "./techTree/selectors.js";
import { makeNppFoundingCashRecord, validateCorporateCashLedger } from "./corporateCashLedger.js";
import { NEUTRAL_STAT } from "../stats/characterStats.js";
import { DEFAULT_PROFIT_MARGIN } from "./constants.js";

const STARTER_UNITS: Record<CorporationType, number> = {
  financial: 6, media: 80, manufacturing: 25, chemical_industries: 60,
  healthcare: 5, retail: 80, automobiles: 1, technology: 25, energy: 250,
  agriculture: 60, real_estate: 5, construction: 3, defense: 8,
  telecommunications: 12, entertainment: 50, logistics: 5, extraction: 250,
};
const BUILD_TURNS: Record<CorporationType, number> = {
  energy: 96, extraction: 96, chemical_industries: 84, manufacturing: 72,
  automobiles: 72, defense: 72, telecommunications: 60, real_estate: 60,
  construction: 48, healthcare: 48, agriculture: 48, logistics: 36,
  entertainment: 24, media: 24, financial: 24, technology: 24, retail: 12,
};

export type ExpandPlayerCorporationResult =
  | { ok: true; assetId: string; entryFeeAnchor: number; starterBuildAnchor: number; fxSpreadAnchor: number; onlineTurn: number }
  | { ok: false; error: string };

/** Game expandSector greenfield first-plant transaction. */
export function expandPlayerCorporationSector(
  world: WorldState,
  input: { corporationId: string; regionId: string; sectorType: CorporationType },
): ExpandPlayerCorporationResult {
  const corporation = world.corporations[input.corporationId];
  if (!corporation) return { ok: false, error: `Unknown corporation: ${input.corporationId}` };
  if (corporation.ceoId !== "player" || corporation.ceoType !== "player" || corporation.ceoVacant === true) return { ok: false, error: "Only the corporation's active CEO may expand operations" };
  if (!(CORPORATION_TYPES as readonly string[]).includes(input.sectorType)) return { ok: false, error: "Unknown corporation sector type" };
  const region = world.regions[input.regionId];
  if (!region || region.corporationHeadquartersOnly) return { ok: false, error: "Choose a source-authored operating region" };
  if (!privateEnterprisePermittedInCountry(world, region.countryId)) return { ok: false, error: "Private sectors cannot be founded in a command economy" };
  const assets = corporateSectorAssets(world);
  if (Object.values(assets).some((asset) => asset.corporationId === corporation.id && asset.stateId === input.regionId && asset.sectorType === input.sectorType)) return { ok: false, error: "This corporation already operates in the selected region and sector" };
  const pool = Object.values(world.unownedSectors).find((candidate) => candidate.countryId === region.countryId && candidate.regionId === input.regionId && candidate.sectorType === input.sectorType && Number.isFinite(candidate.revenue) && candidate.revenue > 0);
  if (!pool) return { ok: false, error: "No positive source unowned-market pool is recorded for this region and sector" };
  if (input.sectorType === "extraction") return { ok: false, error: "Extraction entry requires the source regional deposit-headroom and resource writeback path" };
  const headroomUnits = sourcePoolHeadroom(world, pool);
  const units = STARTER_UNITS[input.sectorType];
  if (!(headroomUnits >= units)) return { ok: false, error: "The regional market does not have enough unowned headroom for its first facility" };

  const year = Number(world.meta.date.slice(0, 4));
  const scale = getEraNominalScale(world.meta.era);
  // Game's expandSector scopes the issuer's research tree to its primary type,
  // including the fee and a greenfield off-type sector build.
  const tech = getSectorTechEffects({ type: corporation.sectorType, ...corporation }, corporation.sectorType);
  const entryFeeAnchor = Math.round(Math.max(1, Math.round(100_000 * scale)) * (1 - tech.expansionDiscount));
  const locatedSameIndustry = Object.values(assets).filter((asset) => asset.countryId === region.countryId && asset.sectorType === input.sectorType && asset.stateId !== null);
  const nationalMarketRevenue = locatedSameIndustry.reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
  const thisCorporationRevenue = locatedSameIndustry.filter((asset) => asset.corporationId === corporation.id).reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
  const nationalShare = nationalMarketRevenue > 0 ? thisCorporationRevenue / nationalMarketRevenue * 100 : 0;
  const nationalDominance = nationalShare <= 30 ? 1 : 1 + 2 * ((nationalShare - 30) / 70) ** 2;
  // expandSector prices a not-yet-created local sector at 0% share and omits
  // competitorCount; the full national dominance multiplier therefore applies.
  const primeRate = world.centralBanks[region.countryId]?.primeRate ?? 0;
  const acumen = Number.isFinite(world.player.stats?.businessAcumen) ? world.player.stats!.businessAcumen! : NEUTRAL_STAT;
  const rateMultiplier = Math.max(0.5, 1 + (primeRate / 10) * Math.max(0, 1 - (acumen - NEUTRAL_STAT) * 0.06));
  const acumenMultiplier = Math.max(0.5, 1 - (acumen - NEUTRAL_STAT) * 0.03);
  const costOfLiving = world.regionalMetrics[input.regionId]?.["economic.costOfLiving"]?.value;
  const hostMultiplier = Number.isFinite(costOfLiving) && (costOfLiving ?? 0) > 0 ? Math.min(1.6, Math.max(0.6, costOfLiving! / 100)) : 1;
  const listPrice = capacityPricePerUnitAnchor(input.sectorType, corporateSectorBasePrices(world), null, year);
  const starterBuildAnchor = units * listPrice * nationalDominance * rateMultiplier * acumenMultiplier * tech.growthCostMultiplier * hostMultiplier * 0.9;
  const fromCurrency = resolveCountryCurrency(world, corporation.countryId);
  const toCurrency = resolveCountryCurrency(world, region.countryId);
  const fxSpreadAnchor = fromCurrency !== toCurrency ? (entryFeeAnchor + starterBuildAnchor) * 0.005 : 0;
  const totalCostAnchor = entryFeeAnchor + starterBuildAnchor + fxSpreadAnchor;
  const fxRate = getRateForCountry(world, corporation.countryId);
  const hostFxRate = getRateForCountry(world, region.countryId);
  const totalCostLocal = anchorToLocal(totalCostAnchor, fxRate);
  const cashBefore = corporation.liquidCapital;
  if (!Number.isFinite(totalCostLocal) || !(totalCostLocal > 0) || !Number.isFinite(cashBefore) || cashBefore < totalCostLocal) return { ok: false, error: `The corporation needs ${totalCostLocal} in available capital to expand and build its first facility` };

  const assetId = `corporate-sector:${region.countryId}:${input.sectorType}:${corporation.id}:${region.id}`;
  if (assets[assetId]) return { ok: false, error: "That regional sector identity already exists" };
  const onlineTurn = world.meta.turn + Math.max(1, Math.ceil((BUILD_TURNS[input.sectorType] ?? 48) / 2));
  // Game revenuePerCapacityUnit is 1 / (standard supply yield × eraUnitScale).
  // The Native list-price identity is 3 / yield × capacityEraPriceIndex, so
  // undo its capacity-price multiplier and apply the source unit scale here.
  const localPerUnitRevenueAnchor = listPrice / (3 * capacityEraPriceIndex(year)) * getEraNominalScale(world.meta.era);
  const asset: CorporateSectorAsset = {
    id: assetId, corporationId: corporation.id, countryId: region.countryId,
    stateId: region.id, sectorType: input.sectorType,
    profitMargin: DEFAULT_PROFIT_MARGIN,
    revenue: Math.round(anchorToLocal(units * localPerUnitRevenueAnchor, hostFxRate)),
    workers: 500, capitalStock: 0, capacityBookAnchor: 0,
    buildQueue: [{ unitsOrdered: units, costPaidAnchor: starterBuildAnchor, startTurn: world.meta.turn, onlineTurn, smooth: true }],
    constructionInProgressAnchor: Math.round(starterBuildAnchor), plantsStartTurn: world.meta.turn,
    producedUnits: 0, soldUnits: 0, soldFraction: 0, realizedRevenue: 0,
    representingUnionId: initialRepresentingUnionId(world, region.countryId, input.sectorType),
    unionization: 0, wageLevel: 1, workerExpectationIndex: null,
    strikeStartedAtTurn: null, strikeCooldownUntilTurn: null,
    forSale: null, owner: "corporation",
  };
  const cashAfter = cashBefore - totalCostLocal;
  const cashRow = makeNppFoundingCashRecord({
    corp: corporation, world, sector: asset, units, costLocal: totalCostLocal,
    cashDeltaLocal: cashAfter - cashBefore, costAnchor: starterBuildAnchor,
    entryFeeAnchor, fxSpreadAnchor, onlineTurn,
  });
  if (!cashRow) return { ok: false, error: "Could not build a valid source founding cash witness" };

  // Game marketMaker.distributeConversionSpread routes a 25% source-CB
  // forexRevenue leg and 50% destination-CB foreign reserve leg (remaining
  // 25% is extinguished). In this save family the supported authored currencies
  // have one explicit Native central-bank anchor each.
  const spreadRoute = fxSpreadAnchor > 0
    ? resolveSectorSpreadRoute(world, fromCurrency, toCurrency, Math.round(anchorToLocal(fxSpreadAnchor, fxRate)))
    : undefined;
  if (fxSpreadAnchor > 0 && !spreadRoute) return { ok: false, error: "Cross-currency founding requires source central-bank FX anchors" };

  // The source writes company cash, a located build order, pool headroom and
  // the realized cash witness as one command result.
  // The unowned market and the new asset are denominated in the operating
  // region's currency. Issuer FX is used only for the company cash debit.
  const unitsPerAnchor = headroomUnits / localToAnchor(pool.revenue, hostFxRate);
  const poolRevenueAfter = Math.round((Math.max(0, headroomUnits - units) / unitsPerAnchor) * hostFxRate);
  const nextAssets = { ...assets, [assetId]: asset };
  const nextLedger = [...(world.corporateCashLedger ?? []), cashRow];
  validateCorporateSectorAssets(world, nextAssets);
  validateCorporateCashLedger(nextLedger);
  if (spreadRoute) {
    const source = world.centralBanks[spreadRoute.sourceCountryId]!;
    const destination = world.centralBanks[spreadRoute.destinationCountryId]!;
    source.forexRevenue = (source.forexRevenue ?? 0) + spreadRoute.forexRevenue;
    destination.spreadFeeReserveBalances ??= {};
    destination.spreadFeeReserveBalances[fromCurrency] = (destination.spreadFeeReserveBalances[fromCurrency] ?? 0) + spreadRoute.reserveAmount;
  }
  assets[assetId] = asset;
  pool.revenue = poolRevenueAfter;
  corporation.liquidCapital = cashAfter;
  world.corporateCashLedger = nextLedger;
  return { ok: true, assetId, entryFeeAnchor, starterBuildAnchor, fxSpreadAnchor, onlineTurn };
}

export function resolveSectorSpreadRoute(
  world: WorldState,
  fromCurrency: string,
  toCurrency: string,
  feeLocal: number,
): { sourceCountryId: string; destinationCountryId: string; forexRevenue: number; reserveAmount: number } | undefined {
  const anchorCountry: Record<string, string> = { USD: "US", GBP: "UK", SUR: "RU", DDM: "DD" };
  const sourceCountryId = anchorCountry[fromCurrency];
  const destinationCountryId = anchorCountry[toCurrency];
  if (!sourceCountryId || !destinationCountryId || !world.centralBanks[sourceCountryId] || !world.centralBanks[destinationCountryId]) return undefined;
  return {
    sourceCountryId, destinationCountryId,
    forexRevenue: Math.round(feeLocal * 0.25),
    reserveAmount: Math.round(feeLocal * 0.5),
  };
}

function sourcePoolHeadroom(world: WorldState, pool: { countryId: string; sectorType: CorporationType; revenue: number }): number {
  if (!(pool.revenue > 0) || pool.sectorType === "extraction") return 0;
  const revenueAnchor = localToAnchor(pool.revenue, getRateForCountry(world, pool.countryId));
  let unitYield = 0;
  // Game unownedHeadroomUnits uses the standard/default sector output mix.
  const rates = SOURCE_DEFAULT_OPERATING_SUPPLY[pool.sectorType];
  const prices = corporateSectorBasePrices(world) as Record<string, number>;
  for (const [commodity, rate] of Object.entries(rates)) {
    const price = prices[commodity];
    if ((rate ?? 0) > 0 && Number.isFinite(price) && price > 0) unitYield += rate / price;
  }
  return Number.isFinite(revenueAnchor * unitYield) ? revenueAnchor * unitYield : 0;
}
