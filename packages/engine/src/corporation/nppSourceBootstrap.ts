import type { Corporation, CorporationType } from "./types.js";
import { getPackByEra } from "@ahdclient/content";
import { CORPORATION_TYPES } from "./types.js";
import type { CorporateNppActor, WorldState } from "../types.js";
import { DEFAULT_SHARE_PRICE, CEO_INITIAL_SHARES, NPC_FOUNDER_SHARE_FRACTION } from "../market/constants.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { getRateForCountry } from "../forex/conversion.js";
import { sourceUnownedHeadroomUnits } from "./nppCapacityReinvestment.js";
import { seedCorporateSectorAssets, initialRepresentingUnionId, validateCorporateSectorAssets } from "./corporateSectorAssets.js";
import { corporationIdentity, tickerForSector } from "./founding.js";
import { foundingTechState } from "./techTree/nppUnlock.js";
import { scheduledMarketizationLevel, DUAL_TRACK_CEILING } from "../commandEconomy/constants.js";
import { SOURCE_REGIONAL_UNOWNED_SEED } from "./sourceRegionalUnownedSeed.generated.js";
import { SOURCE_REGIONAL_UNOWNED_ANCHOR } from "./sourceRegionalUnownedAnchor.generated.js";
import { SOURCE_NPP_HQ_MARKET_SEED } from "./sourceNppHqMarketSeed.generated.js";

/** Source: AHDGame seedNppCorporations.ts/spawnNppCorporation.ts; current development rechecked at ad04918e. */
export const SOURCE_NPP_SEED_TIERS: Readonly<Record<string, { player: readonly string[]; econ: readonly string[] }>> = {
  "1953": {
    player: ["US", "UK", "RU", "DD"],
    econ: ["FR", "IT", "SE", "TR", "DE", "JP", "CN", "BR", "NG", "IE", "AT", "FI", "GR", "PL", "CS", "HU", "RO", "BG", "YU"],
  },
  "1979": {
    player: ["US", "UK", "RU", "DD"],
    econ: ["FR", "IT", "ES", "SE", "TR", "DE", "JP", "CN", "BR", "NG", "IE", "AT", "FI", "GR"],
  },
  "1991": {
    player: ["US", "UK", "JP"],
    econ: ["DE", "FR", "IT", "ES", "SE", "TR", "CN", "NG", "BR", "IE", "AT", "FI", "GR"],
  },
  "1999": {
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG", "FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR"],
  },
  "2007": {
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG", "FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR"],
  },
  "2019": {
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG"],
  },
};

const CAPITAL_REGION: Readonly<Record<string, string>> = {
  US: "DC", UK: "LON", JP: "KAN", DE: "BE", CN: "HB", IE: "DUB", NG: "NORTH_CENTRAL", BR: "CENTRO_OESTE",
  HU: "", PL: "", RO: "", YU: "", BG: "", UKR: "UKR_KYI", BLR: "BLR_MIN", CS: "", BAL: "BAL_LVA", RU: "",
  FR: "FR_IDF", IT: "IT_LAZ", ES: "ES_MAD", SE: "SE_STH", TR: "TR_ANK", GR: "GR_ATT", AT: "AT_VIE", FI: "FI_UUS",
  DD: "", SCO: "", WAL: "",
};

export interface SourceNppSpawnPlan {
  countryId: string;
  hqRegionId: string;
  perSectorCount: 1 | 2;
}

export function sourceNppSpawnPlan(world: Pick<WorldState, "meta" | "countries" | "regions">): SourceNppSpawnPlan[] {
  const preset = SOURCE_NPP_SEED_TIERS[world.meta.era];
  if (!preset) return [];
  const year = Number(world.meta.date.slice(0, 4));
  const countries = [...preset.player.map((id) => [id, 1] as const), ...preset.econ.map((id) => [id, 2] as const)];
  return countries.flatMap(([countryId, perSectorCount]) => {
    const hqRegionId = CAPITAL_REGION[countryId];
    const region = hqRegionId ? world.regions[hqRegionId] : undefined;
    if (!world.countries[countryId] || !region || region.countryId !== countryId) return [];
    if (scheduledMarketizationLevel(countryId, year) < DUAL_TRACK_CEILING) return [];
    return [{ countryId, hqRegionId, perSectorCount: perSectorCount as 1 | 2 }];
  });
}

export function chooseFoundingActor(world: WorldState, countryId: string, hqRegionId: string): CorporateNppActor {
  const activeParties = Object.values(world.parties)
    .filter((party) => party.countryId === countryId && party.mergedIntoPartyId == null)
    .sort((a, b) =>
      (a.sourceSequentialId ?? Number.POSITIVE_INFINITY) - (b.sourceSequentialId ?? Number.POSITIVE_INFINITY) ||
      Number(a.id) - Number(b.id) || a.id.localeCompare(b.id),
    )
    .map((party) => party.id);
  const affiliations = [...activeParties, "independent"];
  const ownedCounts = new Map<string, number>();
  for (const corporation of Object.values(world.corporations)) {
    const actor = corporation.ceoId ? world.corporateNppActors?.[corporation.ceoId] : undefined;
    if (actor?.countryId === countryId) ownedCounts.set(actor.partyId, (ownedCounts.get(actor.partyId) ?? 0) + 1);
  }
  // Match the source's active/free NPP pool. Politicians are a separate Native
  // entity family and must never be aliased into corporate NPP identities.
  const freeByParty = new Map<string, CorporateNppActor[]>();
  for (const actor of Object.values(world.corporateNppActors ?? {})) {
    if (actor.countryId !== countryId || actor.retiredAtTurn != null || !affiliations.includes(actor.partyId)) continue;
    if (Object.values(world.corporations).some((corp) => corp.ceoType === "npp" && corp.ceoId === actor.id)) continue;
    const rows = freeByParty.get(actor.partyId) ?? [];
    rows.push(actor);
    freeByParty.set(actor.partyId, rows);
  }
  const partiesWithFreeActors = affiliations.filter((partyId) => (freeByParty.get(partyId)?.length ?? 0) > 0);
  if (partiesWithFreeActors.length > 0) {
    const partyId = [...partiesWithFreeActors].sort((a, b) =>
      (ownedCounts.get(a) ?? 0) - (ownedCounts.get(b) ?? 0) ||
      (a === "independent" ? 1 : b === "independent" ? -1 : Number(a) - Number(b)) || a.localeCompare(b),
    )[0]!;
    const actor = [...freeByParty.get(partyId)!].sort((a, b) =>
      b.politicalInfluence - a.politicalInfluence || a.sequentialId - b.sequentialId || a.id.localeCompare(b.id),
    )[0]!;
    return actor;
  }

  // Source createNPP fallback: when the persisted source NPP pool has no free
  // actor, create a distinct independent NPP at the capital. No politician or
  // personal-money row is inferred or copied.
  const actors = Object.values(world.corporateNppActors ?? {});
  // Game's sequential NPP id is global across countries, not a per-country
  // counter. Native IDs remain namespaced but retain that global tie-breaker.
  let ordinal = Math.max(0, ...actors.map((actor) => actor.sequentialId)) + 1;
  let id = `npp:${countryId}:seed:${ordinal}`;
  while (world.corporateNppActors?.[id]) {
    ordinal += 1;
    id = `npp:${countryId}:seed:${ordinal}`;
  }
  return { id, countryId, homeRegionId: hqRegionId, partyId: "independent", politicalInfluence: 0, sequentialId: ordinal, retiredAtTurn: null, generatedForFounding: true };
}

function sourceStartingCapital(world: WorldState, countryId: string): { amountLocal: number; currencyCode: string; rate: number } {
  const rate = getRateForCountry(world, countryId);
  const currencyCode = world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "USD";
  return {
    amountLocal: Math.round(2_000_000 * getEraNominalScale(world.meta.era) * rate),
    currencyCode,
    rate,
  };
}

/** Source DEFAULT_SECTOR_STARTING_REVENUE (₳ anchor) from AHDGame corporations constants. */
const SOURCE_NPP_STARTING_REVENUE_FLOOR = 1_000_000;

/** Seed the source Nigeria governor NPPs before they can be selected as corporation CEOs. */
export function seedSourceNppGovernorActors(world: WorldState): void {
  const background = getPackByEra(world.meta.era)?.sourceNppBackground;
  if (!background) return;
  const actors = structuredClone(world.corporateNppActors ?? {});
  let nextSequentialId = Math.max(0, ...Object.values(actors).map((actor) => actor.sequentialId)) + 1;
  for (const region of background.regions) {
    const id = `npp:${background.countryId}:governor:${region.id}`;
    const worldRegion = world.regions[region.id];
    if (!worldRegion || worldRegion.countryId !== background.countryId) {
      throw new Error(`Missing source governor region ${background.countryId}/${region.id}`);
    }
    const existing = actors[id];
    if (existing) {
      if (existing.countryId !== background.countryId || existing.homeRegionId !== region.id || existing.partyId !== region.governorPartyId ||
          existing.currentOffice?.type !== "governor" || existing.currentOffice.regionId !== region.id) {
        throw new Error(`Conflicting source governor NPP identity ${id}`);
      }
    } else {
      actors[id] = {
        id,
        countryId: background.countryId,
        homeRegionId: region.id,
        partyId: region.governorPartyId,
        politicalInfluence: 10,
        sequentialId: nextSequentialId++,
        retiredAtTurn: null,
        currentOffice: { type: "governor", regionId: region.id },
      };
    }
    world.regions[region.id] = { ...worldRegion, governorNppId: id };
  }
  world.corporateNppActors = actors;
}

/** Replace fresh GDP-only placeholders with Game's source-plan HQ companies. Never called on load. */
export function seedSourceNppCorporations(world: WorldState): void {
  if (world.corporateCashLedger?.some((row) => row.type === "corp_starting_grant")) return;
  seedSourceNppGovernorActors(world);
  const plan = sourceNppSpawnPlan(world);
  if (plan.length === 0) return;
  const assets = structuredClone(world.corporateSectors ?? seedCorporateSectorAssets(world));
  const corporations = structuredClone(world.corporations);
  const actors = structuredClone(world.corporateNppActors ?? {});
  const pools = structuredClone(world.unownedSectors);
  const poolAnchorBalances = new Map<string, number>();
  const removedIds = new Set<string>();
  const creationRows: Array<{ corporation: Corporation; asset: ReturnType<typeof sourceAsset>; actor: CorporateNppActor; grant: number; currencyCode: string; rate: number }> = [];

  // Native excludes DC from economic regions; Game still seeds its actual
  // state-level unowned market and uses it when the US NPP spawn captures its
  // DC headquarters. Materialize only the separately source-measured HQ-only
  // rows required by this source spawn plan.
  for (const country of plan) {
    if (!world.regions[country.hqRegionId]?.corporationHeadquartersOnly) continue;
    for (const sectorType of CORPORATION_TYPES) {
      const key = `${country.countryId}:${country.hqRegionId}:${sectorType}`;
      if (pools[key]) continue;
      const source = SOURCE_NPP_HQ_MARKET_SEED.find((row) => row.era === world.meta.era && row.countryId === country.countryId && row.stateId === country.hqRegionId && row.sectorType === sectorType);
      if (!source) throw new Error(`Missing source NPP HQ market seed for ${world.meta.era}/${key}`);
      pools[key] = { countryId: country.countryId, regionId: country.hqRegionId, sectorType, revenue: source.nativePoolRevenueLocal };
    }
  }
  for (const country of plan) {
    for (const sectorType of CORPORATION_TYPES) {
      const poolKey = `${country.countryId}:${country.hqRegionId}:${sectorType}`;
      const pool = pools[poolKey];
      if (!pool || !(Number.isFinite(pool.revenue) && pool.revenue >= 0)) continue;
      const original = world.corporations[`${country.countryId}-${sectorType}`];
      const template = original ??
        Object.values(world.corporations).find((row) => row.countryId === country.countryId && row.sectorType === sectorType) ??
        Object.values(world.corporations).find((row) => row.sectorType === sectorType) ??
        Object.values(world.corporations).find((row) => row.countryId === country.countryId) ??
        Object.values(world.corporations)[0];
      if (!template) throw new Error(`No source corporation template exists for ${sectorType}`);
      const replaced = Object.values(corporations).filter((row) => row.countryId === country.countryId && row.sectorType === sectorType && row.ownershipState !== "stateOwned");
      for (const row of replaced) removedIds.add(row.id);

      for (let ordinal = 1; ordinal <= country.perSectorCount; ordinal += 1) {
        const marketRate = getRateForCountry(world, country.countryId);
        const sourceSeedAnchor = sourcePoolRevenueAnchor(world, country.countryId, country.hqRegionId, sectorType);
        const currentPoolAnchor = pool.revenue > 0
          ? poolAnchorBalances.get(poolKey) ?? sourceSeedAnchor
          : sourceSeedAnchor;
        if (!(Number.isFinite(currentPoolAnchor) && currentPoolAnchor > 0)) break;
        // Game spawnNppCorporation uses 25% of the current source pool (or
        // computeUnownedSeedRevenue if it is empty), then applies its absolute
        // ₳ seed floor. The source writer clamps the captured pool at zero.
        const startingRevenueAnchor = Math.max(Math.round(currentPoolAnchor * 0.25), SOURCE_NPP_STARTING_REVENUE_FLOOR);
        const startingRevenue = Math.round(startingRevenueAnchor * marketRate);
        if (!(Number.isFinite(startingRevenue) && startingRevenue > 0)) break;
        const id = ordinal === 1 ? `${country.countryId}-${sectorType}` : `${country.countryId}-npp-${ordinal}-${sectorType}`;
        const actorWorld = { ...world, corporations, corporateNppActors: actors };
        const actor = chooseFoundingActor(actorWorld, country.countryId, country.hqRegionId);
        actors[actor.id] = actor;
        const founding = sourceStartingCapital(world, country.countryId);
        const totalShares = Math.max(1, Math.round(CEO_INITIAL_SHARES * getEraNominalScale(world.meta.era)));
        const actorShares = Math.floor(totalShares * NPC_FOUNDER_SHARE_FRACTION);
        const identity = corporationIdentity(country.countryId, sectorType);
        const corporation = structuredClone(template);
        for (const field of ["soe", "countryOwnerId", "isNationalCorporation", "isPrimaryNationalCorporation", "assignedSectorTypes", "legacySoeProjection"] as const) delete corporation[field];
        Object.assign(corporation, {
          id,
          ...identity,
          name: `${country.countryId} ${identity.name} ${ordinal}`,
          tickerSymbol: ordinal === 1 ? tickerForSector(country.countryId, sectorType) : `${tickerForSector(country.countryId, sectorType)}.${ordinal}`,
          countryId: country.countryId,
          headquartersRegionId: country.hqRegionId,
          sectorType,
          ceoId: actor.id,
          ceoType: "npp" as const,
          ceoVacant: false,
          nationalizationOwnerKind: "npc" as const,
          ownershipState: "private" as const,
          isPrivate: false,
          liquidCurrencyCode: founding.currencyCode,
          liquidCapital: founding.amountLocal,
          revenue: startingRevenue / 24,
          // Native insolvency recovery uses foundingRevenue as its local
          // recapture basis; retain the source-issued startup treasury rather
          // than inventing a multiple of the unowned-market draw.
          foundingRevenue: founding.amountLocal,
          targetGrowthRate: 0,
          currentGrowthRate: 0,
          currentGrowthCost: 0,
          profitMargin: 35,
          effectiveProfitMargin: 35,
          dividendRate: 5,
          rdBudgetPerTurn: founding.amountLocal * 0.01,
          marketingStrength: 10,
          logisticsStrength: 0,
          totalShares,
          shareholders: [{ holder: "npc", nppId: actor.id, shares: actorShares }],
          publicFloat: totalShares - actorShares,
          sharePrice: Math.max(DEFAULT_SHARE_PRICE, Math.round((founding.amountLocal / totalShares) * 100) / 100),
          fundamentalSharePrice: Math.max(DEFAULT_SHARE_PRICE, Math.round((founding.amountLocal / totalShares) * 100) / 100),
          earningsHistory: [],
          priceHistory: [],
          sentimentMultiplier: 1,
          orderFlowMultiplier: 1,
          orderFlowWindowBuyValue: 0,
          orderFlowWindowSellValue: 0,
          foundedAtTurn: 0,
          insolventSinceTurn: null,
          reincorporationCount: 0,
          ...foundingTechState(sectorType, Number(world.meta.date.slice(0, 4))),
        });
        const idAsset = `corporate-sector:${country.countryId}:${sectorType}:${id}`;
        const asset = sourceAsset(world, {
          id: idAsset,
          corporationId: id,
          countryId: country.countryId,
          stateId: country.hqRegionId,
          sectorType,
          revenue: startingRevenue / 24,
          capitalStock: sourceUnownedHeadroomUnits(world, { ...pool, revenue: startingRevenueAnchor * marketRate }),
        });
        creationRows.push({
          corporation,
          asset,
          actor,
          grant: founding.amountLocal,
          currencyCode: founding.currencyCode,
          rate: founding.rate,
        });
        const remainingAnchor = Math.max(0, currentPoolAnchor - startingRevenueAnchor);
        poolAnchorBalances.set(poolKey, remainingAnchor);
        pool.revenue = Math.round(remainingAnchor * marketRate);
        corporations[id] = corporation;
      }
    }
  }

  if (creationRows.length === 0) return;
  for (const id of removedIds) delete world.corporations[id];
  for (const [assetId, asset] of Object.entries(assets)) if (removedIds.has(asset.corporationId)) delete assets[assetId];
  for (const row of creationRows) {
    world.corporations[row.corporation.id] = row.corporation;
    assets[row.asset.id] = row.asset;
    // The source cash ledger stamps bootstrap grants for the first closing
    // snapshot after the initial clock (ledgerTurnFromClock(0) === 1).
    const ledgerId = `starting-grant:${row.corporation.id}:t1`;
    (world.corporateCashLedger ??= []).push({
      id: ledgerId,
      type: "corp_starting_grant",
      turn: 1,
      corporationId: row.corporation.id,
      corporationName: row.corporation.name ?? row.corporation.tickerSymbol,
      amount: row.grant,
      currencyCode: row.currencyCode,
      meta: { ledgerKey: ledgerId, source: "npp_seed", grantAnchor: row.grant / row.rate },
    });
  }
  world.corporateNppActors = actors;
  world.unownedSectors = pools;
  world.corpRevenueSnapshots = {};
  for (const corporation of Object.values(world.corporations)) {
    const previous = world.corpRevenueSnapshots[corporation.countryId];
    const current = (previous?.current ?? 0) + corporation.revenue;
    world.corpRevenueSnapshots[corporation.countryId] = { current, previous: current, turn: 0 };
  }
  validateCorporateSectorAssets(world, assets);
  world.corporateSectors = assets;
}

function sourcePoolRevenueAnchor(world: WorldState, countryId: string, regionId: string, sectorType: CorporationType): number {
  const hq = SOURCE_NPP_HQ_MARKET_SEED.find((row) => row.era === world.meta.era && row.countryId === countryId && row.stateId === regionId && row.sectorType === sectorType);
  if (hq) return hq.sourceRevenueAnchor;
  return SOURCE_REGIONAL_UNOWNED_ANCHOR[world.meta.era]?.find((row) => row[0] === countryId && row[1] === regionId && row[2] === sectorType)?.[3] ?? 0;
}

function sourceAsset(
  world: WorldState,
  input: {
    id: string;
    corporationId: string;
    countryId: string;
    stateId: string;
    sectorType: CorporationType;
    revenue: number;
    capitalStock: number;
  },
) {
  const unionId = initialRepresentingUnionId(world, input.countryId, input.sectorType);
  const unionization = unionId ? world.unions[unionId]?.unionization ?? 0 : 0;
  return {
    ...input,
    profitMargin: 35,
    capitalStock: input.capitalStock,
    capacityBookAnchor: 0,
    buildQueue: [],
    plantsStartTurn: 0,
    producedUnits: 0,
    soldUnits: 0,
    soldFraction: 0,
    realizedRevenue: 0,
    workers: 500,
    representingUnionId: unionId,
    unionization: Math.max(0, Math.min(100, unionization)),
    wageLevel: 1,
    workerExpectationIndex: null,
    strikeStartedAtTurn: null,
    strikeCooldownUntilTurn: null,
    forSale: null,
    owner: "corporation" as const,
  };
}
