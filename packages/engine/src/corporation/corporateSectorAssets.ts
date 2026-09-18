import type { WorldState } from "../types.js";
import type { CorporationType } from "./types.js";

/**
 * Native's persisted asset identity port of AHDGame CorporateSector at
 * e364c04954ed628beef73a993a8e9e156650a31e, db/types/corporation.ts.
 * Native still has one aggregate corporation per country/industry. Until the
 * regional economy split lands, each aggregate explicitly retains national,
 * unallocated scope instead of inventing state ownership.
 */
/**
 * Sector owner. "corporation" is the #293 default: the recorded
 * `corporationId` operates and owns the sector. "player" records a #295
 * player acquisition: the buyer paid the listed asking price from personal
 * cash, the seller corporation was credited, the listing cleared, and the
 * recorded corporation keeps operating the sector (it remains the turn-math
 * SSOT — Native has one aggregate corporation per country/sector, so no
 * buyer corporation can receive the asset). Routing operating income to the
 * player owner (dividends/claims) is explicitly out of scope.
 */
export type CorporateSectorOwner = "corporation" | "player";

export interface CorporateSectorAsset {
  id: string;
  corporationId: string;
  countryId: string;
  stateId: string | null;
  sectorType: CorporationType;
  /** Staffed headcount, derived from recorded revenue (#296). */
  workers: number;
  /** Seeded-union owner for the (countryId, sectorType) pair, or null when unrepresented (#296). */
  representingUnionId: string | null;
  /**
   * Shop-floor union density, 0-100 (#322). Ports CorporateSector.unionization:
   * the mandate coverage term, the escalation eligibility gate
   * (STRIKE_CALL_MIN_UNIONIZATION), and the raid/organize surface all read
   * this field, not the union's worker-weighted density (which stays the
   * dues/display figure per #320). Backfilled from the representing union's
   * density (represented) or 0 (unrepresented); present-but-invalid fails
   * closed. Source: db/types/corporation.ts CorporateSector.unionization.
   */
  unionization?: number;
  /**
   * Employer-set wage level, unitless index (#322). Ports
   * CorporateSector.wageLevel: the mandate grievance term and the NPP
   * settlement policy read this. Defaults to 1 (the reference's own
   * `?? 1` read default). Source: db/types/corporation.ts
   * CorporateSector.wageLevel.
   */
  wageLevel?: number;
  /**
   * Slow-moving worker pay expectation the grievance term trends against
   * (#322). Ports CorporateSector.workerExpectationIndex: absent until the
   * first observation initializes it AT the real wage (reference
   * trendWorkerExpectations first-turn rule), so there is no spurious
   * opening gap. Escalation records the pre-strike value on the campaign so
   * settlement/lapse can restore it. Source: labour/strikes.ts
   * trendWorkerExpectation.
   */
  workerExpectationIndex?: number | null;
  /**
   * Turn a union-called strike started on this sector, null when not
   * striking (#322). Ports CorporateSector.strikeStartedAtTurn: the
   * corporation turn throttles revenue while set (exactly once — the unions
   * turn never touches revenue) and clears it through the strike resolution
   * paths. Source: labour/strikes.ts StrikeState.
   */
  strikeStartedAtTurn?: number | null;
  /**
   * Turn before which this sector cannot strike again, null when clear
   * (#322). Ports CorporateSector.strikeCooldownUntilTurn: planted on every
   * resolution path (concession, waitout, ban, agreement). Source:
   * labour/strikes.ts STRIKE_COOLDOWN_TURNS.
   */
  strikeCooldownUntilTurn?: number | null;
  forSale: { priceAnchor: number } | null;
  owner: CorporateSectorOwner;
}

/**
 * Worker headcount substrate (#296).
 *
 * Reference (AHDGame e364c04954ed628beef73a993a8e9e156650a31e):
 * - A spawned sector births at DEFAULT_SECTOR_STARTING_WORKERS = 500 against
 *   DEFAULT_SECTOR_STARTING_REVENUE = 1,000,000 (admin/spawnNppCorporation.ts),
 *   and live headcount is re-derived from revenue every turn by
 *   calculateWorkers(revenue, skill) (turn/corporation/sectorLabour.ts
 *   resolveSectorHeadcount). The stored-sector display fallbacks call it
 *   directly on the recorded revenue field with no time-basis conversion
 *   (corporations/queries/sectorDetail.ts:794,879 and
 *   corporations/queries/corporationDetail.ts:1338,1341, FX restatement only).
 * - calculateWorkers: baseWorkers = revenue / REVENUE_PER_WORKER (2000);
 *   workforce skill 0-100 adjusts the count by at most +-30% around neutral
 *   50; the result is an integer with a minimum of 1
 *   (lib/constants/corporations.ts:330-365, "at $1M revenue, a neutral-skill
 *   sector needs 500 workers").
 *
 * Native's lazily seeded assets stand in for already-running sectors (the
 * aggregate corporations have been turning since founding), so the seed
 * records the steady-state derived value, not the 500 birth constant.
 * Skill: Native has no per-state workforce-skill reading (the metric-engine
 * input wiring is an open missing-input gate, see
 * demographics/laborForce.ts), so the seed passes null and takes
 * calculateWorkers' own neutral-50 default — the same value the reference
 * uses on cold start with no reading. Pure function of recorded revenue: no
 * RNG is consumed and re-seeding is idempotent.
 */
export const SECTOR_REVENUE_PER_WORKER = 2000;
export const SECTOR_WORKFORCE_SKILL_NEUTRAL = 50;
export const SECTOR_WORKER_SKILL_MAX_ADJUSTMENT = 0.3;

export function calculateSectorWorkers(
  revenuePerTurn: number | null | undefined,
  workforceSkill?: number | null,
): number {
  const revenue = typeof revenuePerTurn === "number" && Number.isFinite(revenuePerTurn) ? revenuePerTurn : 0;
  const baseWorkers = revenue / SECTOR_REVENUE_PER_WORKER;
  const skill = workforceSkill ?? SECTOR_WORKFORCE_SKILL_NEUTRAL;
  const clamped = Math.max(0, Math.min(100, skill));
  const skillMultiplier = 1 - ((clamped - 50) / 50) * SECTOR_WORKER_SKILL_MAX_ADJUSTMENT;
  return Math.max(1, Math.round(baseWorkers * skillMultiplier));
}

/**
 * Representing-union initialization (#296). The reference hands every
 * world-seeded union the sectors matching its (countryId, sectorType) that no
 * union represents yet (admin/seed/seedUnions.ts sector backfill) and keeps
 * adopting unrepresented sectors on later turns (turn/unions/index.ts
 * adoptUnrepresentedSectors): same-industry only, and a present pointer is
 * never overwritten so a rival that won a shop keeps it. Native unions are
 * keyed `${countryId}-${sectorType}` (unions/founding.ts, same nonzero-weight
 * granularity as corporations), and every Native union is a seeded roster
 * union (ownerType "npp" | null; no player-claimed unions exist), so the
 * seeded union for the pair adopts. Returns null when no matching union
 * exists rather than inventing coverage.
 */
export function initialRepresentingUnionId(
  world: WorldState,
  countryId: string,
  sectorType: CorporationType,
): string | null {
  const candidate = world.unions[`${countryId}-${sectorType}`];
  if (!candidate) return null;
  if (candidate.countryId !== countryId || candidate.sectorType !== sectorType) return null;
  return candidate.id;
}

export interface CorporateSectorProjection extends CorporateSectorAsset {
  revenue: number;
  profitMargin: number;
  targetGrowthRate: number;
  currentGrowthRate: number;
}

/** Live economic projection; Corporation remains the turn-math owner in this slice. */
export function projectCorporateSector(world: WorldState, asset: CorporateSectorAsset): CorporateSectorProjection {
  validateCorporateSectorAssets(world, { [asset.id]: asset });
  const corporation = world.corporations[asset.corporationId];
  if (!corporation || corporation.countryId !== asset.countryId || corporation.sectorType !== asset.sectorType) {
    throw new Error(`Corporate sector ${asset.id} has an invalid corporation reference`);
  }
  return {
    ...asset,
    revenue: corporation.revenue,
    profitMargin: corporation.profitMargin,
    targetGrowthRate: corporation.targetGrowthRate,
    currentGrowthRate: corporation.currentGrowthRate,
  };
}

export function seedCorporateSectorAssets(world: WorldState): Record<string, CorporateSectorAsset> {
  const assets: Record<string, CorporateSectorAsset> = {};
  for (const corporation of Object.values(world.corporations).sort((a, b) => a.id.localeCompare(b.id))) {
    const id = `corporate-sector:${corporation.countryId}:${corporation.sectorType}:${corporation.id}`;
    const representingUnionId = initialRepresentingUnionId(world, corporation.countryId, corporation.sectorType);
    const union = representingUnionId ? world.unions[representingUnionId] : undefined;
    const density = union && Number.isFinite(union.unionization) ? union.unionization : 0;
    assets[id] = {
      id,
      corporationId: corporation.id,
      countryId: corporation.countryId,
      stateId: null,
      sectorType: corporation.sectorType,
      workers: calculateSectorWorkers(corporation.revenue, null),
      representingUnionId,
      unionization: Math.max(0, Math.min(100, density)),
      wageLevel: 1,
      workerExpectationIndex: null,
      strikeStartedAtTurn: null,
      strikeCooldownUntilTurn: null,
      forSale: null,
      owner: "corporation",
    };
  }
  validateCorporateSectorAssets(world, assets);
  return assets;
}

export function validateCorporateSectorAssets(
  world: WorldState,
  assets: Record<string, CorporateSectorAsset>,
): void {
  const tuples = new Set<string>();
  for (const [key, asset] of Object.entries(assets)) {
    if (key !== asset.id) throw new Error(`Corporate sector key does not match id: ${key}`);
    const corporation = world.corporations[asset.corporationId];
    if (!corporation || corporation.countryId !== asset.countryId || corporation.sectorType !== asset.sectorType) {
      throw new Error(`Corporate sector ${asset.id} has an invalid corporation reference`);
    }
    if (asset.stateId !== null && world.regions[asset.stateId]?.countryId !== asset.countryId) {
      throw new Error(`Corporate sector ${asset.id} has an invalid region reference`);
    }
    // #294: the for-sale listing is persisted content, so a stored value that
    // is neither null nor a positive finite asking price fails closed here
    // (and therefore at the save boundary, which validates through this
    // function). Unknown extra fields are ignored for forward compatibility.
    validateSectorForSale(asset);
    validateSectorOwner(asset);
    validateSectorWorkers(asset);
    validateSectorUnionReference(world, asset);
    validateSectorLaborRelations(asset);
    const tuple = `${asset.corporationId}\u0000${asset.countryId}\u0000${asset.stateId ?? "national"}\u0000${asset.sectorType}`;
    if (tuples.has(tuple)) throw new Error(`Duplicate corporate sector identity: ${asset.id}`);
    tuples.add(tuple);
  }
}

/**
 * Strict for-sale content validation (#294). Null means unlisted; any listed
 * value must carry a positive finite asking price. A missing field, a
 * non-object, or a non-positive non-finite anchor is corruption, not a
 * defaultable absence — every seeded asset records the field explicitly.
 */
export function validateSectorForSale(asset: CorporateSectorAsset): void {
  const forSale = (asset as { forSale?: unknown }).forSale;
  if (forSale === null) return;
  if (typeof forSale !== "object" || forSale === null) {
    throw new Error(`Corporate sector ${asset.id} has an invalid for-sale listing`);
  }
  const priceAnchor = (forSale as { priceAnchor?: unknown }).priceAnchor;
  if (typeof priceAnchor !== "number" || !Number.isFinite(priceAnchor) || priceAnchor <= 0) {
    throw new Error(`Corporate sector ${asset.id} has an invalid for-sale price anchor`);
  }
}

/**
 * Strict ownership validation (#295). Every seeded asset records the field
 * explicitly; a missing or non-enum value is corruption, not a defaultable
 * absence. Saves written before #295 carry materialized assets without the
 * field — those are backfilled to "corporation" at the save boundary
 * (save.ts, same additive pattern as the campaign spend-stock backfill), so
 * this strict check only ever sees current-shape records.
 */
export function validateSectorOwner(asset: CorporateSectorAsset): void {
  const owner = (asset as { owner?: unknown }).owner;
  if (owner !== "corporation" && owner !== "player") {
    throw new Error(`Corporate sector ${asset.id} has an invalid owner`);
  }
}

/**
 * Strict headcount validation (#296). The count must be an explicitly
 * recorded non-negative finite integer. A missing field is corruption, not a
 * defaultable absence: every seeded asset records it, and pre-#296 saves are
 * recomputed at the save boundary (v46 -> v47 migration). Negative,
 * non-finite, and fractional values fail closed — a fractional headcount can
 * never come out of calculateSectorWorkers. Zero is accepted: a fully
 * supply-constrained sector staffs nobody in the reference (filledWorkers can
 * reach 0), so 0 reads as "no staff", never as "unknown".
 */
export function validateSectorWorkers(asset: CorporateSectorAsset): void {
  const workers = (asset as { workers?: unknown }).workers;
  if (typeof workers !== "number" || !Number.isFinite(workers) || !Number.isInteger(workers) || workers < 0) {
    throw new Error(`Corporate sector ${asset.id} has an invalid worker headcount`);
  }
}

/**
 * Strict labor-relations validation (#322). All five fields are optional on
 * pre-#322 rows and degrade to their read defaults (density 0 / wage 1 /
 * expectation unset / no strike / no cooldown); a present-but-invalid value
 * is corruption and fails closed. Density stays 0-100 like the union table;
 * the wage is a finite non-negative index; strike/cooldown markers are null
 * or integer turns >= 0.
 */
export function validateSectorLaborRelations(asset: CorporateSectorAsset): void {
  const row = asset as unknown as Record<string, unknown>;
  const unionization = row["unionization"];
  if (unionization !== undefined && (typeof unionization !== "number" || !Number.isFinite(unionization) || unionization < 0 || unionization > 100)) {
    throw new Error(`Corporate sector ${asset.id} has an invalid unionization`);
  }
  const wageLevel = row["wageLevel"];
  if (wageLevel !== undefined && (typeof wageLevel !== "number" || !Number.isFinite(wageLevel) || wageLevel < 0)) {
    throw new Error(`Corporate sector ${asset.id} has an invalid wage level`);
  }
  const expectation = row["workerExpectationIndex"];
  if (expectation !== undefined && expectation !== null && (typeof expectation !== "number" || !Number.isFinite(expectation) || expectation <= 0)) {
    throw new Error(`Corporate sector ${asset.id} has an invalid worker expectation index`);
  }
  for (const key of ["strikeStartedAtTurn", "strikeCooldownUntilTurn"] as const) {
    const value = row[key];
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      throw new Error(`Corporate sector ${asset.id} has an invalid ${key}`);
    }
  }
}

/**
 * Backfill pre-#295 materialized assets that predate the owner field. Missing
 * degrades to the #293 default ("corporation"); a present but invalid value
 * is left for validateSectorOwner to fail closed on.
 */
export function backfillSectorOwner(assets: Record<string, CorporateSectorAsset>): void {
  for (const asset of Object.values(assets)) {
    if ((asset as { owner?: unknown }).owner === undefined) {
      asset.owner = "corporation";
    }
  }
}

/**
 * Strict union-reference validation (#296). Null means unrepresented: the
 * reference leaves sectors with no seeded union unpointed rather than
 * inventing coverage. A present pointer must resolve to a recorded union in
 * the same country and industry — raids are same-industry only
 * (db/types/corporation.ts representingUnionId doc: "this always points at a
 * union whose `sectorType` matches"), so a dangling or cross-pair pointer is
 * corruption, not a defaultable absence.
 */
export function validateSectorUnionReference(world: WorldState, asset: CorporateSectorAsset): void {
  const unionId = (asset as { representingUnionId?: unknown }).representingUnionId;
  if (unionId === null) return;
  if (typeof unionId !== "string" || unionId.length === 0) {
    throw new Error(`Corporate sector ${asset.id} has an invalid representing union reference`);
  }
  const union = world.unions[unionId];
  if (!union || union.countryId !== asset.countryId || union.sectorType !== asset.sectorType) {
    throw new Error(`Corporate sector ${asset.id} has an invalid representing union reference`);
  }
}

/**
 * Backfill asset rows that predate an explicitly recorded workforce field
 * (#296). A missing headcount is derived from the recorded corporation's live
 * revenue — the reference re-derives headcount from live revenue every turn,
 * so this is the steady-state value, not history — and a missing union
 * pointer adopts via the seeded-union rule. Present-but-invalid values are
 * left for the strict validators to fail closed on. No RNG is consumed and no
 * identity changes.
 */
export function backfillSectorWorkforce(world: WorldState, assets: Record<string, CorporateSectorAsset>): void {
  for (const asset of Object.values(assets)) {
    if ((asset as { workers?: unknown }).workers === undefined) {
      asset.workers = calculateSectorWorkers(world.corporations[asset.corporationId]?.revenue, null);
    }
    if ((asset as { representingUnionId?: unknown }).representingUnionId === undefined) {
      asset.representingUnionId = initialRepresentingUnionId(world, asset.countryId, asset.sectorType);
    }
    // #322: pre-existing materialized rows predate the shop-floor
    // labor-relations fields. Missing density degrades to the representing
    // union's current density (represented) or 0 (unrepresented) — the same
    // figure #320 dues rows already read — and the wage to the reference's
    // own `?? 1` read default. Expectation and strike markers stay
    // absent/null (no strike in flight, no observed expectation yet).
    // Present-but-invalid values are left for the strict validators.
    if (asset.unionization === undefined) {
      const union = asset.representingUnionId ? world.unions[asset.representingUnionId] : undefined;
      const density = union && Number.isFinite(union.unionization) ? union.unionization : 0;
      asset.unionization = Math.max(0, Math.min(100, density));
    }
    if (asset.wageLevel === undefined) asset.wageLevel = 1;
    if (asset.workerExpectationIndex === undefined) asset.workerExpectationIndex = null;
    if (asset.strikeStartedAtTurn === undefined) asset.strikeStartedAtTurn = null;
    if (asset.strikeCooldownUntilTurn === undefined) asset.strikeCooldownUntilTurn = null;
  }
}

/** Lazy materialization preserves the serialized shape and hashes of untouched schema-44 worlds. */
export function corporateSectorAssets(world: WorldState): Record<string, CorporateSectorAsset> {
  const assets = world.corporateSectors ?? seedCorporateSectorAssets(world);
  backfillSectorWorkforce(world, assets);
  validateCorporateSectorAssets(world, assets);
  world.corporateSectors = assets;
  return assets;
}
