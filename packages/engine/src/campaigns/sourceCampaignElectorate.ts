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

export function sourceCampaignUnits1953(stateId: string): SourceCampaignUnit[] | null {
  const input = LAYER1[stateId];
  if (!input) return null;
  const dims: GenericGranularDimInput[] = GRANULAR_DIMENSIONS.map((name) => ({
    name,
    marginals: input.marginals[name] ?? {},
    positions: input.positions[name] ?? {},
    turnoutRates: input.turnoutRates[name] ?? {},
  }));
  if (dims.some((dim) => Object.keys(dim.marginals).length === 0)) return null;
  const cells = deriveGranularCellsGeneric({
    dims,
    priors: COUNTRY_PRIORS.US,
    opts: {
      pruneFloor: PRUNE_FLOOR,
      preserveBucketRepresentation: PRESERVE_BUCKET_REPRESENTATION,
      conditionedOffsets: input.conditionedOffsets,
    },
  });
  const positions = input.positions;
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
      turnout: Math.max(15, Math.min(95, Math.round((acc.turnout / acc.share) * 10) / 10)),
      bucketWeights: Object.fromEntries(Object.entries(acc.bucketWeights).map(([key, weight]) => [key, weight / acc.share])),
      campaignCells: acc.campaignCells,
    });
  }
  return units.sort((a, b) => b.share - a.share);
}

export function sourceCampaignCells1953(stateId: string): CampaignCell[] | null {
  const units = sourceCampaignUnits1953(stateId);
  return units ? units.flatMap((unit) => unit.campaignCells) : null;
}
