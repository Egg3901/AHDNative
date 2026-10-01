import type { CommodityType } from "../commodity/constants.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";

const ADDITIVE_FIELDS = ["capitalStock", "capacityBookAnchor", "producedUnits", "soldUnits", "realizedRevenue"] as const;

function addOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  return (Number.isFinite(left) ? left! : 0) + (Number.isFinite(right) ? right! : 0);
}

function finiteWeight(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function mergeOptionalRatio(
  target: number | undefined,
  source: number | undefined,
  targetWeight: number,
  sourceWeight: number,
): number | undefined {
  if (target === undefined) return source;
  if (source === undefined) return target;
  const totalWeight = targetWeight + sourceWeight;
  return totalWeight > 0 ? (target * targetWeight + source * sourceWeight) / totalWeight : (target + source) / 2;
}

/** Merge additive plant/sales state when two same-location sector assets combine. */
export function mergeCorporateSectorPhysicalLedger(target: CorporateSectorAsset, source: CorporateSectorAsset): void {
  const targetOutput = finiteWeight(target.producedUnits);
  const sourceOutput = finiteWeight(source.producedUnits);
  const ratioTargetWeight = targetOutput + sourceOutput > 0 ? targetOutput : finiteWeight(target.capitalStock);
  const ratioSourceWeight = targetOutput + sourceOutput > 0 ? sourceOutput : finiteWeight(source.capitalStock);

  for (const field of ADDITIVE_FIELDS) {
    const total = addOptional(target[field], source[field]);
    if (total !== undefined) target[field] = total;
  }

  const mergedSoldFraction = mergeOptionalRatio(
    target.soldFraction,
    source.soldFraction,
    ratioTargetWeight,
    ratioSourceWeight,
  );
  if (mergedSoldFraction !== undefined) target.soldFraction = mergedSoldFraction;

  if (target.soldByCommodity || source.soldByCommodity) {
    const commodities = new Set<CommodityType>([
      ...Object.keys(target.soldByCommodity ?? {}) as CommodityType[],
      ...Object.keys(source.soldByCommodity ?? {}) as CommodityType[],
    ]);
    const soldByCommodity: Partial<Record<CommodityType, number>> = {};
    for (const commodity of commodities) {
      const mergedFill = mergeOptionalRatio(
        target.soldByCommodity?.[commodity],
        source.soldByCommodity?.[commodity],
        ratioTargetWeight,
        ratioSourceWeight,
      );
      if (mergedFill !== undefined) soldByCommodity[commodity] = mergedFill;
    }
    target.soldByCommodity = soldByCommodity;
  }
}
