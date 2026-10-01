import type { WorldState } from "../types.js";
import { calculateSectorWorkers, corporateSectorAssets, validateCorporateSectorAssets } from "./corporateSectorAssets.js";

type ParentShares = { SCO: number; WAL: number };

/**
 * AHDGame 01797b27082b098fdf3929bb498215c94c8dda24 source receipts for
 * UK 1953-default, computed by its computeUnownedSeedRevenue for all 12 live
 * UK region rows, then parent receipt / total UK receipt per sector. This
 * preserves source regional specialization and the min-market floor. Numbers
 * are receipts from that immutable source function, not Native runtime rules.
 */
const UK_1953_SOURCE_MARKET_SHARES: Partial<Record<string, ParentShares>> = {
  financial: { SCO: 0.026864140834994783, WAL: 0.0112829667711795 },
  media: { SCO: 0.025889231840771743, WAL: 0.016636185477940973 },
  manufacturing: { SCO: 0.0822680841350579, WAL: 0.032249117175865004 },
  chemical_industries: { SCO: 0.07601576153620702, WAL: 0.03192688036646657 },
  healthcare: { SCO: 0.07270762148305732, WAL: 0.046721257860851635 },
  retail: { SCO: 0.03903637539725701, WAL: 0.01639531780226484 },
  automobiles: { SCO: 0.04548808688648115, WAL: 0.01948709954010445 },
  technology: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  energy: { SCO: 0.0760155114290627, WAL: 0.03192686650375411 },
  agriculture: { SCO: 0.11232087403889099, WAL: 0.012865967259411618 },
  real_estate: { SCO: 0.042419853418212417, WAL: 0.0178166110276172 },
  construction: { SCO: 0.07601595039680602, WAL: 0.03192684570970799 },
  defense: { SCO: 0.07569934945744881, WAL: 0.031794213219699184 },
  telecommunications: { SCO: 0.07270762148305732, WAL: 0.046721257860851635 },
  entertainment: { SCO: 0.07270762148305732, WAL: 0.046721257860851635 },
  logistics: { SCO: 0.04863634545248462, WAL: 0.020427315095710847 },
  extraction: { SCO: 0.19281005016069444, WAL: 0.15459856426275795 },
};

/** Source `computeUnownedSeedRevenue` receipt shares across the same UK seed rows. */
const UK_1979_SOURCE_MARKET_SHARES: Partial<Record<string, ParentShares>> = {
  financial: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 }, media: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  manufacturing: { SCO: 0.08200555474345855, WAL: 0.048725819811918335 }, chemical_industries: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  healthcare: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 }, retail: { SCO: 0.07992966189753017, WAL: 0.07992966189753017 },
  automobiles: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 }, technology: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  energy: { SCO: 0.07992966189753017, WAL: 0.07992966189753017 }, agriculture: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  real_estate: { SCO: 0.08175277959450622, WAL: 0.08175277959450622 }, construction: { SCO: 0.0832778147901399, WAL: 0.0832778147901399 },
  defense: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 }, telecommunications: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  entertainment: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 }, logistics: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
  extraction: { SCO: 0.08333333333333333, WAL: 0.08333333333333333 },
};

const UK_1991_SOURCE_MARKET_SHARES: Partial<Record<string, ParentShares>> = {
  financial: { SCO: 0.08237701164302182, WAL: 0.03890025842582112 }, media: { SCO: 0.0733695576762613, WAL: 0.06453804282060419 },
  manufacturing: { SCO: 0.08306094428248942, WAL: 0.03922321962990476 }, chemical_industries: { SCO: 0.07906295407823104, WAL: 0.04636408230180977 },
  healthcare: { SCO: 0.07906295407823104, WAL: 0.04636408230180977 }, retail: { SCO: 0.0818974647756007, WAL: 0.03867380725757868 },
  automobiles: { SCO: 0.0733695576762613, WAL: 0.06453804282060419 }, technology: { SCO: 0.08137044758791141, WAL: 0.08137044758791141 },
  energy: { SCO: 0.07692309357878517, WAL: 0.054131051817761316 }, agriculture: { SCO: 0.08137044758791141, WAL: 0.08137044758791141 },
  real_estate: { SCO: 0.08216051269966117, WAL: 0.0387980158709051 }, construction: { SCO: 0.08157099004207696, WAL: 0.038519630200299325 },
  defense: { SCO: 0.07692309357878517, WAL: 0.054131051817761316 }, telecommunications: { SCO: 0.0742042558218433, WAL: 0.0742042558218433 },
  entertainment: { SCO: 0.08137044758791141, WAL: 0.08137044758791141 }, logistics: { SCO: 0.0742042558218433, WAL: 0.0742042558218433 },
  extraction: { SCO: 0.0733695576762613, WAL: 0.06453804282060419 },
};

const UK_2019_SOURCE_MARKET_SHARES: Partial<Record<string, ParentShares>> = {
  financial: { SCO: 0.05705704368954137, WAL: 0.022380992728043128 }, media: { SCO: 0.02513716372484074, WAL: 0.018961947829111692 },
  manufacturing: { SCO: 0.06796589642521601, WAL: 0.06608050165571164 }, chemical_industries: { SCO: 0.05488095938104701, WAL: 0.04139885867738662 },
  healthcare: { SCO: 0.07237136529382662, WAL: 0.02183702568737785 }, retail: { SCO: 0.12213041275241286, WAL: 0.032244713368238954 },
  automobiles: { SCO: 0.03595722169335142, WAL: 0.03595722169335142 }, technology: { SCO: 0.03049977324108877, WAL: 0.018405741801907606 },
  energy: { SCO: 0.2749210111962204, WAL: 0.1340017923581634 }, agriculture: { SCO: 0.12843030353538276, WAL: 0.0968800356763655 },
  real_estate: { SCO: 0.06695406505835075, WAL: 0.025712189021709714 }, construction: { SCO: 0.11698137563521728, WAL: 0.030254978944445076 },
  defense: { SCO: 0.05226896977979585, WAL: 0.025891018695593907 }, telecommunications: { SCO: 0.0736923764245224, WAL: 0.036502932882896875 },
  entertainment: { SCO: 0.10077678006069528, WAL: 0.02995138022399619 }, logistics: { SCO: 0.036337813415478926, WAL: 0.05847689326812301 },
  extraction: { SCO: 0.37871030925559923, WAL: 0.04019809460227623 },
};

function sourceMarketShare(world: WorldState, regionId: "SCO" | "WAL", sectorType: string): number {
  const sharesByEra: Record<string, Partial<Record<string, ParentShares>>> = {
    "1953": UK_1953_SOURCE_MARKET_SHARES,
    "1979": UK_1979_SOURCE_MARKET_SHARES,
    "1991": UK_1991_SOURCE_MARKET_SHARES,
    "2019": UK_2019_SOURCE_MARKET_SHARES,
  };
  return sharesByEra[world.meta.era]?.[sectorType]?.[regionId] ?? 0;
}

function allocateWorkers(total: number, shares: Array<[string, number]>): Map<string, number> {
  const rows = shares.map(([id, share], order) => {
    const raw = total * share;
    return { id, order, workers: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });
  let remainder = total - rows.reduce((sum, row) => sum + row.workers, 0);
  for (const row of [...rows].sort((a, b) => b.fraction - a.fraction || a.order - b.order).slice(0, remainder)) row.workers++;
  return new Map(rows.map((row) => [row.id, row.workers]));
}

const ADDITIVE_PLANT_FIELDS = [
  "capitalStock",
  "capacityBookAnchor",
  "producedUnits",
  "soldUnits",
  "realizedRevenue",
] as const;

function scaledPlantFields(
  asset: ReturnType<typeof corporateSectorAssets>[string],
  share: number,
): Partial<Pick<typeof asset, (typeof ADDITIVE_PLANT_FIELDS)[number]>> {
  const values: Partial<Pick<typeof asset, (typeof ADDITIVE_PLANT_FIELDS)[number]>> = {};
  for (const field of ADDITIVE_PLANT_FIELDS) {
    const value = asset[field];
    if (typeof value === "number" && Number.isFinite(value)) values[field] = value * share;
  }
  return values;
}

/**
 * Native stores one country-wide issuer and unowned pool per sector, while
 * AHDGame's secession fan-out consumes rows already scoped to the live parent
 * region. Materialize only the UK SCO/WAL parent rows at world creation from
 * the actual source receipt shares. Additive physical plant and sales totals
 * follow the same shares, preserving their country-wide sum. Sold fractions
 * remain ratios, so preserving them on each slice preserves per-commodity
 * sold units when multiplied by the correspondingly divided production.
 * The remainder remains at national scope. This is a Native aggregate-to-
 * parent seed adapter; secession itself only moves these pre-existing rows
 * and never slices national rows.
 *
 * The 1953 source table reflects per-region overrides and source market floors;
 * later source presets have no UK:SCO/UK:WAL weight overrides, so their shared
 * sector weight cancels from the regional GDP share. Native's own aggregate
 * revenue levels remain unchanged and are only divided by those source market
 * shares. Child GDP is not used here; Game's `partitionByGdp` uses the authored
 * child GDP vector at the later fan-out.
 */
export function materializeSourceParentSectorRows(world: WorldState): void {
  const countryId = "UK";
  if (world.player.countryId !== countryId) return;
  const parentIds = ["SCO", "WAL"];
  if (parentIds.some((id) => !world.regions[id] || world.regions[id]!.countryId !== countryId)) return;

  const assets = corporateSectorAssets(world);
  for (const asset of Object.values(assets).filter((row) => row.countryId === countryId && row.stateId === null && row.revenue === undefined)) {
    const nationalAsset = structuredClone(asset);
    const totalRevenue = world.corporations[asset.corporationId]?.revenue ?? 0;
    const totalWorkers = asset.workers;
    const shares = parentIds.map((regionId) => [regionId, sourceMarketShare(world, regionId as "SCO" | "WAL", asset.sectorType)] as const);
    const regionalShare = shares.reduce((sum, [, share]) => sum + share, 0);
    if (!(regionalShare > 0 && regionalShare < 1)) continue;
    const remainderShare = 1 - regionalShare;
    const workersByRegion = allocateWorkers(totalWorkers, [["$remaining", remainderShare], ...shares.map(([regionId, share]) => [regionId, share] as [string, number])]);
    asset.revenue = totalRevenue * remainderShare;
    Object.assign(asset, scaledPlantFields(nationalAsset, remainderShare));
    asset.workers = workersByRegion.get("$remaining") ?? 0;
    for (const [regionId, share] of shares) {
      const id = `${asset.id}:source-region:${regionId}`;
      if (assets[id]) continue;
      assets[id] = {
        ...asset,
        id,
        stateId: regionId,
        revenue: totalRevenue * share,
        ...scaledPlantFields(nationalAsset, share),
        workers: workersByRegion.get(regionId) ?? 0,
        forSale: null,
      };
    }
  }

  const hasRegionalUnownedRows = Object.values(world.unownedSectors).some((pool) => pool.countryId === countryId && pool.regionId !== undefined);
  // A partial regional set cannot be safely topped up from a national
  // remainder: that would allocate the source share twice on repeat/mixed
  // saves. Existing scoped rows stay authoritative and the adapter fails
  // closed for this collection.
  if (!hasRegionalUnownedRows) {
    for (const [key, pool] of Object.entries(world.unownedSectors).filter(([, row]) => row.countryId === countryId && row.regionId === undefined)) {
      const totalRevenue = pool.revenue;
      const shares = parentIds.map((regionId) => [regionId, sourceMarketShare(world, regionId as "SCO" | "WAL", pool.sectorType)] as const);
      const regionalShare = shares.reduce((sum, [, share]) => sum + share, 0);
      if (!(regionalShare > 0 && regionalShare < 1)) continue;
      pool.revenue = totalRevenue * (1 - regionalShare);
      for (const [regionId, share] of shares) {
        const regionalKey = `${countryId}:${regionId}:${pool.sectorType}`;
        world.unownedSectors[regionalKey] = {
          countryId,
          regionId,
          sectorType: pool.sectorType,
          revenue: totalRevenue * share,
        };
      }
      if (pool.revenue === 0) delete world.unownedSectors[key];
    }
  }

  validateCorporateSectorAssets(world, assets);
}

/** Keep materialized regional portions proportional as their aggregate issuer grows. */
export function syncSourceRegionalSectorReceipts(world: WorldState): void {
  const assets = world.corporateSectors;
  if (!assets) return;
  for (const corporation of Object.values(world.corporations)) {
    const rows = Object.values(assets).filter((asset) => asset.corporationId === corporation.id && asset.revenue !== undefined);
    if (rows.length < 2 || !rows.some((asset) => asset.stateId === "SCO" || asset.stateId === "WAL" || world.regions[asset.stateId ?? ""]?.sourceCountryId === "UK")) continue;
    const oldTotal = rows.reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
    if (!(oldTotal > 0)) continue;
    let allocated = 0;
    rows.forEach((asset, index) => {
      const revenue = index === rows.length - 1
        ? corporation.revenue - allocated
        : corporation.revenue * Math.max(0, asset.revenue ?? 0) / oldTotal;
      asset.revenue = Math.max(0, revenue);
      asset.workers = calculateSectorWorkers(asset.revenue);
      allocated += asset.revenue;
    });
  }
  validateCorporateSectorAssets(world, assets);
}
