/**
 * AHDGame's JP Layer-1 electorate, materialized from its eight authored model
 * anchors. Source data/provenance is packages/content/src/packs/jpLayer1SourceModels.json.
 * The source year resolver is `seeds/eraSubstrateForYear.ts#getCountrySubstrateForYear`
 * and its generic cell derivation is `demographics/granularCells.ts`.
 */
import { JP_LAYER1_SOURCE_MODELS } from "@ahdclient/content";
import {
  deriveGranularCellsGeneric,
  type GenericGranularDimInput,
} from "./sourceGranularCells.js";
import type { SourceCampaignUnit } from "./sourceCampaignElectorate.js";

const SOURCE_ERAS = ["1953", "1979", "1991", "1999", "2007", "2019", "2023", "2027"] as const;
type SourceEra = (typeof SOURCE_ERAS)[number];
type Position = { economicLean: number; socialLean: number };
interface JpLayer1Model {
  countryId: "JP";
  dims: string[];
  census: Record<string, Record<string, Record<string, number>>>;
  positions: Record<string, Record<string, Position>>;
  turnoutRates: Record<string, Record<string, number>>;
  composition: Record<string, { weights: Array<{ dim: string; key: string; w: number }> }>;
}
interface JpSourceModelBundle { models: Record<SourceEra, JpLayer1Model> }
interface JpLayer1Substrate {
  dims: string[];
  marginals: Record<string, Record<string, number>>;
  positions: Record<string, Record<string, Position>>;
  turnoutRates: Record<string, Record<string, number>>;
}

const MODELS = (JP_LAYER1_SOURCE_MODELS as unknown as JpSourceModelBundle).models;
const YEARS: Record<SourceEra, number> = {
  "1953": 1953, "1979": 1979, "1991": 1991, "1999": 1999,
  "2007": 2007, "2019": 2019, "2023": 2023, "2027": 2027,
};
const LEAN_QUANT = 0.5;
const TURNOUT_QUANT = 5;

function blendForYear(year: number): { lo: SourceEra; hi: SourceEra; t: number } | null {
  if (!Number.isFinite(year)) return null;
  if (year <= YEARS["1953"]) return { lo: "1953", hi: "1953", t: 0 };
  if (year >= YEARS["2027"]) return { lo: "2027", hi: "2027", t: 0 };
  for (let i = 1; i < SOURCE_ERAS.length; i += 1) {
    const hi = SOURCE_ERAS[i]!;
    if (year > YEARS[hi]) continue;
    if (year === YEARS[hi]) return { lo: hi, hi, t: 0 };
    const lo = SOURCE_ERAS[i - 1]!;
    return { lo, hi, t: (year - YEARS[lo]) / (YEARS[hi] - YEARS[lo]) };
  }
  return null;
}

function unionBlend<T extends number | Position>(
  lo: Record<string, T> | undefined,
  hi: Record<string, T> | undefined,
  t: number,
): Record<string, T> {
  if (!lo) return { ...(hi ?? {}) };
  if (!hi) return { ...lo };
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(lo), ...Object.keys(hi)])) {
    const a = lo[key];
    const b = hi[key];
    if (a === undefined) out[key] = b!;
    else if (b === undefined) out[key] = a;
    else if (typeof a === "number" && typeof b === "number") {
      out[key] = (a + (b - a) * t) as T;
    } else {
      const left = a as Position;
      const right = b as Position;
      out[key] = {
        economicLean: left.economicLean + (right.economicLean - left.economicLean) * t,
        socialLean: left.socialLean + (right.socialLean - left.socialLean) * t,
      } as T;
    }
  }
  return out;
}

function renormalize(marginals: Record<string, number>): Record<string, number> {
  const total = Object.values(marginals).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { ...marginals };
  return Object.fromEntries(Object.entries(marginals).map(([key, value]) => [key, (value / total) * 100]));
}

/** Mirrors source `getCountrySubstrateForYear("JP", regionId, year)`. */
export function sourceJpLayer1ForYear(regionId: string, year: number): JpLayer1Substrate | null {
  const blend = blendForYear(year);
  if (!blend) return null;
  const low = MODELS[blend.lo];
  const high = MODELS[blend.hi];
  const lowCensus = low.census[regionId];
  const highCensus = high.census[regionId];
  if (!lowCensus && !highCensus) return null;
  const atLow = lowCensus ? { dims: low.dims, census: lowCensus, positions: low.positions, turnoutRates: low.turnoutRates } : null;
  const atHigh = highCensus ? { dims: high.dims, census: highCensus, positions: high.positions, turnoutRates: high.turnoutRates } : null;
  if (blend.t === 0 || blend.lo === blend.hi) {
    const exact = atLow ?? atHigh;
    return exact ? {
      dims: [...exact.dims],
      marginals: Object.fromEntries(Object.entries(exact.census).map(([dim, values]) => [dim, { ...values }])),
      positions: Object.fromEntries(Object.entries(exact.positions).map(([dim, values]) => [dim, { ...values }])),
      turnoutRates: Object.fromEntries(Object.entries(exact.turnoutRates).map(([dim, values]) => [dim, { ...values }])),
    } : null;
  }
  const present = atLow ?? atHigh;
  if (!atLow || !atHigh) return present ? {
    dims: [...present.dims],
    marginals: Object.fromEntries(Object.entries(present.census).map(([dim, values]) => [dim, { ...values }])),
    positions: Object.fromEntries(Object.entries(present.positions).map(([dim, values]) => [dim, { ...values }])),
    turnoutRates: Object.fromEntries(Object.entries(present.turnoutRates).map(([dim, values]) => [dim, { ...values }])),
  } : null;

  const dims = atLow.dims.filter((dim) => atHigh.dims.includes(dim));
  const marginals: Record<string, Record<string, number>> = {};
  const positions: Record<string, Record<string, Position>> = {};
  const turnoutRates: Record<string, Record<string, number>> = {};
  for (const dim of dims) {
    marginals[dim] = renormalize(unionBlend(atLow.census[dim], atHigh.census[dim], blend.t));
    positions[dim] = unionBlend(atLow.positions[dim], atHigh.positions[dim], blend.t);
    turnoutRates[dim] = unionBlend(atLow.turnoutRates[dim], atHigh.turnoutRates[dim], blend.t);
  }
  return { dims, marginals, positions, turnoutRates };
}

/** AHDGame `getCountryArchetypeBuckets("JP")`, from the authored JP model. */
export function sourceJpArchetypeBucketValues(values: Record<string, number>): Record<string, number> {
  const bucketValues: Record<string, number> = {};
  for (const [archetype, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value === 0) continue;
    for (const { dim, key, w } of MODELS["2019"].composition[archetype]?.weights ?? []) {
      const id = `${dim}:${key}`;
      bucketValues[id] = (bucketValues[id] ?? 0) + value * w;
    }
  }
  return bucketValues;
}

/** Build source JP cell rows and counted units. Source JP has no association priors. */
export function sourceJpCampaignUnitsForYear(regionId: string, year: number): SourceCampaignUnit[] | null {
  const substrate = sourceJpLayer1ForYear(regionId, year);
  if (!substrate) return null;
  const dims: GenericGranularDimInput[] = substrate.dims.map((name) => ({
    name,
    marginals: substrate.marginals[name] ?? {},
    positions: substrate.positions[name] ?? {},
    turnoutRates: substrate.turnoutRates[name] ?? {},
  }));
  if (dims.some((dim) => Object.keys(dim.marginals).length === 0)) return null;
  const cells = deriveGranularCellsGeneric({ dims, priors: {}, opts: { pruneFloor: 0.0025 } });
  const byKey = new Map<string, {
    share: number;
    economicLean: number;
    socialLean: number;
    turnout: number;
    bucketWeights: Record<string, number>;
    campaignCells: SourceCampaignUnit["campaignCells"];
  }>();
  for (const cell of cells) {
    const key = [
      Math.round(cell.economicLean / LEAN_QUANT),
      Math.round(cell.socialLean / LEAN_QUANT),
      Math.round(cell.turnout / TURNOUT_QUANT),
    ].join("|");
    let unit = byKey.get(key);
    if (!unit) {
      unit = { share: 0, economicLean: 0, socialLean: 0, turnout: 0, bucketWeights: {}, campaignCells: [] };
      byKey.set(key, unit);
    }
    unit.campaignCells.push({
      ...cell,
      stateId: regionId,
      identities: Object.fromEntries(Object.entries(cell.buckets).map(([dim, bucket]) => [
        dim,
        substrate.positions[dim]?.[bucket] ?? { economicLean: cell.economicLean, socialLean: cell.socialLean },
      ])),
    });
    unit.share += cell.share;
    unit.economicLean += cell.share * cell.economicLean;
    unit.socialLean += cell.share * cell.socialLean;
    unit.turnout += cell.share * cell.turnout;
    for (const [dim, bucket] of Object.entries(cell.buckets)) {
      const bucketId = `${dim}:${bucket}`;
      unit.bucketWeights[bucketId] = (unit.bucketWeights[bucketId] ?? 0) + cell.share;
    }
  }
  const units = [...byKey.values()].map((unit, index): SourceCampaignUnit => ({
    id: `gcell_${index}`,
    share: unit.share,
    economicLean: unit.economicLean / unit.share,
    socialLean: unit.socialLean / unit.share,
    turnout: Math.max(5, Math.min(95, unit.turnout / unit.share)),
    bucketWeights: Object.fromEntries(Object.entries(unit.bucketWeights).map(([key, value]) => [key, value / unit.share])),
    campaignCells: unit.campaignCells,
  }));
  return units.sort((a, b) => b.share - a.share);
}
