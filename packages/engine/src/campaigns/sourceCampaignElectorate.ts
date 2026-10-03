/** Current AHDGame 1953 US campaign-unit substrate. The input tables are raw
 * Layer-1 marginals/positions/turnout rates; the cells and counted units are
 * derived here, not frozen output copied from a source run. */
import { US_LAYER1_CAMPAIGN_INPUTS_1953 } from "@ahdclient/content";
import type { CampaignCell } from "./targetedAds.js";
import {
  COUNTRY_PRIORS,
  GRANULAR_DIMENSIONS,
  deriveGranularCellsGeneric,
  type ConditionedLeanOffset,
  type GenericGranularDimInput,
} from "./sourceGranularCells.js";

export interface SourceCampaignUnit {
  id: string;
  share: number;
  economicLean: number;
  socialLean: number;
  turnout: number;
  bucketWeights: Record<string, number>;
  campaignCells: CampaignCell[];
}

interface Layer1Region {
  marginals: Record<string, Record<string, number>>;
  positions: Record<string, Record<string, { economicLean: number; socialLean: number }>>;
  turnoutRates: Record<string, Record<string, number>>;
  conditionedOffsets: ConditionedLeanOffset[];
}

const LAYER1 = US_LAYER1_CAMPAIGN_INPUTS_1953 as unknown as Record<string, Layer1Region>;
const PRUNE_FLOOR = 0.0025;
const PRESERVE_BUCKET_REPRESENTATION = 0.5;
const LEAN_QUANT = 0.5;
const TURNOUT_QUANT = 5;

// Exact source authored composition map used to remap legacy archetype effects
// onto Layer-1 buckets before they are folded into each coalesced unit.
const ARCHETYPE_BUCKETS: Record<string, Array<{ dim: string; key: string; w: number }>> = {
  young_renters: [{ dim: "age", key: "young", w: 0.5 }, { dim: "wealth", key: "low", w: 0.3 }, { dim: "education", key: "no_college", w: 0.2 }],
  evangelicals: [{ dim: "race", key: "white", w: 0.6 }, { dim: "education", key: "no_college", w: 0.4 }],
  rural_traditionalists: [{ dim: "education", key: "no_college", w: 0.5 }, { dim: "race", key: "white", w: 0.3 }, { dim: "age", key: "mature", w: 0.2 }],
  union_trades: [{ dim: "education", key: "no_college", w: 0.4 }, { dim: "wealth", key: "low", w: 0.35 }, { dim: "race", key: "black", w: 0.25 }],
  soccer_moms: [{ dim: "age", key: "mid", w: 0.5 }, { dim: "wealth", key: "middle", w: 0.4 }, { dim: "race", key: "white", w: 0.1 }],
  college_liberals: [{ dim: "education", key: "college", w: 0.4 }, { dim: "education", key: "graduate", w: 0.3 }, { dim: "age", key: "young", w: 0.3 }],
  small_business: [{ dim: "wealth", key: "high", w: 0.5 }, { dim: "age", key: "mature", w: 0.3 }, { dim: "race", key: "white", w: 0.2 }],
  public_sector: [{ dim: "education", key: "college", w: 0.4 }, { dim: "wealth", key: "middle", w: 0.4 }, { dim: "education", key: "graduate", w: 0.2 }],
  retirees: [{ dim: "age", key: "senior", w: 0.7 }, { dim: "age", key: "mature", w: 0.3 }],
  libertarians: [{ dim: "race", key: "white", w: 0.4 }, { dim: "education", key: "college", w: 0.3 }, { dim: "wealth", key: "middle", w: 0.3 }],
  new_immigrants: [{ dim: "race", key: "hispanic", w: 0.5 }, { dim: "race", key: "asian", w: 0.3 }, { dim: "race", key: "other", w: 0.2 }],
  secular_professionals: [{ dim: "education", key: "graduate", w: 0.5 }, { dim: "wealth", key: "high", w: 0.3 }, { dim: "age", key: "mid", w: 0.2 }],
};

export function sourceArchetypeBucketValues(values: Record<string, number>): Record<string, number> {
  const bucketValues: Record<string, number> = {};
  for (const [archetype, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value === 0) continue;
    if (archetype.includes(":")) {
      bucketValues[archetype] = (bucketValues[archetype] ?? 0) + value;
      continue;
    }
    for (const { dim, key, w } of ARCHETYPE_BUCKETS[archetype] ?? []) {
      const bucket = `${dim}:${key}`;
      bucketValues[bucket] = (bucketValues[bucket] ?? 0) + value * w;
    }
  }
  return bucketValues;
}

export function remapArchetypeValuesToSourceUnits(values: Record<string, number>, units: SourceCampaignUnit[]): Record<string, number> {
  const bucketValues = sourceArchetypeBucketValues(values);
  const out: Record<string, number> = {};
  for (const unit of units) {
    let value = 0;
    for (const [key, delta] of Object.entries(bucketValues)) {
      value += (unit.bucketWeights[key] ?? 0) * delta;
    }
    value = Math.max(-100, Math.min(100, value));
    if (value !== 0) out[unit.id] = value;
  }
  return out;
}

export function sourceCampaignUnits1953(
  stateId: string,
  overlays: { leanBucketDeltas?: Record<string, { economicLean?: number; socialLean?: number }>; turnoutBucketDeltas?: Record<string, number> } = {},
): SourceCampaignUnit[] | null {
  const input = LAYER1[stateId];
  if (!input) return null;
  const dims: GenericGranularDimInput[] = GRANULAR_DIMENSIONS.map((name) => ({
    name,
    marginals: input.marginals[name] ?? {},
    positions: input.positions[name] ?? {},
    turnoutRates: Object.fromEntries(Object.entries(input.turnoutRates[name] ?? {}).map(([bucket, rate]) => [
      bucket,
      rate + (overlays.turnoutBucketDeltas?.[`${name}:${bucket}`] ?? 0),
    ])),
  }));
  if (dims.some((dim) => Object.keys(dim.marginals).length === 0)) return null;
  const priors = COUNTRY_PRIORS.US;
  const derived = deriveGranularCellsGeneric({
    dims,
    ...(priors ? { priors } : {}),
    opts: {
      pruneFloor: PRUNE_FLOOR,
      preserveBucketRepresentation: PRESERVE_BUCKET_REPRESENTATION,
      conditionedOffsets: input.conditionedOffsets,
    },
  });
  const positions = input.positions;
  const cells = derived;
  const byKey = new Map<string, {
    share: number; ep: number; sp: number; turnout: number;
    bucketWeights: Record<string, number>; campaignCells: CampaignCell[];
  }>();
  for (const cell of cells) {
    const key = [
      Math.round(cell.economicLean / LEAN_QUANT),
      Math.round(cell.socialLean / LEAN_QUANT),
      Math.round(cell.turnout / TURNOUT_QUANT),
    ].join("|");
    let acc = byKey.get(key);
    if (!acc) {
      acc = { share: 0, ep: 0, sp: 0, turnout: 0, bucketWeights: {}, campaignCells: [] };
      byKey.set(key, acc);
    }
    acc.campaignCells.push({
      ...cell,
      stateId,
      identities: Object.fromEntries(Object.entries(cell.buckets).map(([dim, bucket]) => [
        dim,
        positions[dim]?.[bucket] ?? { economicLean: cell.economicLean, socialLean: cell.socialLean },
      ])),
    });
    acc.share += cell.share;
    acc.ep += cell.share * cell.economicLean;
    acc.sp += cell.share * cell.socialLean;
    acc.turnout += cell.share * cell.turnout;
    for (const [dim, bucket] of Object.entries(cell.buckets)) {
      const k = `${dim}:${bucket}`;
      acc.bucketWeights[k] = (acc.bucketWeights[k] ?? 0) + cell.share;
    }
  }
  const units: SourceCampaignUnit[] = [];
  let i = 0;
  for (const acc of byKey.values()) {
    units.push({
      id: `gcell_${i++}`,
      share: acc.share,
      economicLean: acc.ep / acc.share,
      socialLean: acc.sp / acc.share,
      turnout: Math.max(5, Math.min(95, acc.turnout / acc.share)),
      bucketWeights: Object.fromEntries(Object.entries(acc.bucketWeights).map(([key, weight]) => [key, weight / acc.share])),
      campaignCells: acc.campaignCells,
    });
  }
  return units.sort((a, b) => b.share - a.share).map((unit) => {
    let economicLean = unit.economicLean;
    let socialLean = unit.socialLean;
    for (const [key, delta] of Object.entries(overlays.leanBucketDeltas ?? {})) {
      const weight = unit.bucketWeights[key] ?? 0;
      economicLean += weight * (delta.economicLean ?? 0);
      socialLean += weight * (delta.socialLean ?? 0);
    }
    const campaignCells = unit.campaignCells.map((cell) => {
      let cellEconomicLean = cell.economicLean;
      let cellSocialLean = cell.socialLean;
      const identities = { ...cell.identities };
      for (const [dim, bucket] of Object.entries(cell.buckets)) {
        const delta = overlays.leanBucketDeltas?.[`${dim}:${bucket}`];
        cellEconomicLean += delta?.economicLean ?? 0;
        cellSocialLean += delta?.socialLean ?? 0;
        const position = identities[dim] ?? cell;
        identities[dim] = {
          economicLean: Math.max(-5, Math.min(5, position.economicLean + (delta?.economicLean ?? 0))),
          socialLean: Math.max(-5, Math.min(5, position.socialLean + (delta?.socialLean ?? 0))),
        };
      }
      return {
        ...cell,
        economicLean: Math.max(-5, Math.min(5, cellEconomicLean)),
        socialLean: Math.max(-5, Math.min(5, cellSocialLean)),
        identities,
      };
    });
    return {
      ...unit,
      economicLean: Math.max(-5, Math.min(5, economicLean)),
      socialLean: Math.max(-5, Math.min(5, socialLean)),
      campaignCells,
    };
  });
}

export function sourceCampaignCells1953(
  stateId: string,
  overlays?: Parameters<typeof sourceCampaignUnits1953>[1],
): CampaignCell[] | null {
  const units = sourceCampaignUnits1953(stateId, overlays);
  return units ? units.flatMap((unit) => unit.campaignCells) : null;
}
