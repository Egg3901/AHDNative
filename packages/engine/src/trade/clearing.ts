/**
 * Pure one-commodity bilateral clearing from AHDGame's `trade/clearing.ts`
 * at `cb66acdf0129616b8a09902727e9b58715c8bacb`.
 *
 * Each recorded country balance is a hard feasibility ceiling: exporters
 * cannot ship more than surplus, and importers cannot receive more than
 * deficit. Embargo pair caps remain cell-level ceilings. Unreachable or
 * capped volume remains in the per-country `uncleared` receipt.
 */

export const TRADE_IPF_ITERATIONS = 40;

export interface CommodityClearingInput {
  countries: readonly string[];
  /** National supply in commodity units; absent entries are zero. */
  supply: Readonly<Record<string, number | undefined>>;
  /** National demand in commodity units; absent entries are zero. */
  demand: Readonly<Record<string, number | undefined>>;
  /** Nonnegative exporter→importer affinity; zero excludes a route. */
  affinity: (exporter: string, importer: string) => number;
  /** Optional pair cap in commodity units. */
  capUnits?: (exporter: string, importer: string) => number | undefined;
}

export interface CountryCommodityClearing {
  exports: number;
  imports: number;
  /** exports − imports */
  net: number;
  /** Remaining surplus (+) or unmet deficit (−). */
  uncleared: number;
}

/** Bilateral unit flows and public per-country receipts for one commodity. */
export interface CommodityClearingResult {
  /** `flow[exporter][importer]`; self-pairs are never written. */
  flow: Record<string, Record<string, number>>;
  perCountry: Record<string, CountryCommodityClearing>;
  clearedVolume: number;
}

/** Clear one commodity's national surplus against reachable deficits. */
export function clearCommodity(input: CommodityClearingInput): CommodityClearingResult {
  const { countries, supply, demand, affinity, capUnits } = input;
  const surplus: Record<string, number> = {};
  const deficit: Record<string, number> = {};
  let totalSurplus = 0;
  let totalDeficit = 0;

  for (const country of countries) {
    const net = (supply[country] ?? 0) - (demand[country] ?? 0);
    if (net > 0) {
      surplus[country] = net;
      totalSurplus += net;
    } else if (net < 0) {
      deficit[country] = -net;
      totalDeficit += -net;
    }
  }

  const flow: Record<string, Record<string, number>> = {};
  for (const country of countries) flow[country] = {};
  const clearedTarget = Math.min(totalSurplus, totalDeficit);
  if (clearedTarget <= 0) {
    return { flow, perCountry: buildPerCountry(countries, flow, surplus, deficit), clearedVolume: 0 };
  }

  const exporters = countries.filter((country) => surplus[country] > 0);
  const importers = countries.filter((country) => deficit[country] > 0);
  const surplusBinds = totalSurplus <= totalDeficit;
  const rowLimit = surplus;
  const colLimit = deficit;
  const matrix: Record<string, Record<string, number>> = {};
  for (const exporter of exporters) {
    matrix[exporter] = {};
    for (const importer of importers) {
      matrix[exporter][importer] = exporter === importer ? 0 : Math.max(0, affinity(exporter, importer));
    }
  }

  const clampCaps = () => {
    if (!capUnits) return;
    for (const exporter of exporters) {
      for (const importer of importers) {
        const cap = capUnits(exporter, importer);
        if (cap !== undefined && matrix[exporter][importer]! > cap) matrix[exporter][importer] = cap;
      }
    }
  };

  for (let iteration = 0; iteration < TRADE_IPF_ITERATIONS; iteration += 1) {
    for (const exporter of exporters) {
      let rowSum = 0;
      for (const importer of importers) rowSum += matrix[exporter][importer]!;
      if (rowSum > 0) {
        const factor = surplusBinds ? rowLimit[exporter]! / rowSum : Math.min(1, rowLimit[exporter]! / rowSum);
        for (const importer of importers) matrix[exporter][importer] *= factor;
      }
    }
    clampCaps();

    for (const importer of importers) {
      let columnSum = 0;
      for (const exporter of exporters) columnSum += matrix[exporter][importer]!;
      if (columnSum > 0) {
        const factor = surplusBinds
          ? Math.min(1, colLimit[importer]! / columnSum)
          : colLimit[importer]! / columnSum;
        for (const exporter of exporters) matrix[exporter][importer] *= factor;
      }
    }
    clampCaps();
  }

  // IPF cannot satisfy an exact binding margin across structural zeros. Keep
  // both sides feasible after the last column pass and leave the remainder
  // uncleared, matching the source fix for over-exported scarcity.
  for (const exporter of exporters) {
    let rowSum = 0;
    for (const importer of importers) rowSum += matrix[exporter][importer]!;
    if (rowSum > rowLimit[exporter]!) {
      const factor = rowLimit[exporter]! / rowSum;
      for (const importer of importers) matrix[exporter][importer] *= factor;
    }
  }
  for (const importer of importers) {
    let columnSum = 0;
    for (const exporter of exporters) columnSum += matrix[exporter][importer]!;
    if (columnSum > colLimit[importer]!) {
      const factor = colLimit[importer]! / columnSum;
      for (const exporter of exporters) matrix[exporter][importer] *= factor;
    }
  }

  for (const exporter of exporters) {
    for (const importer of importers) {
      if (matrix[exporter]![importer]! > 0) flow[exporter]![importer] = matrix[exporter]![importer]!;
    }
  }

  const perCountry = buildPerCountry(countries, flow, surplus, deficit);
  const clearedVolume = countries.reduce((sum, country) => sum + perCountry[country]!.exports, 0);
  return { flow, perCountry, clearedVolume };
}

function buildPerCountry(
  countries: readonly string[],
  flow: Record<string, Record<string, number>>,
  surplus: Record<string, number>,
  deficit: Record<string, number>,
): Record<string, CountryCommodityClearing> {
  const receipts: Record<string, CountryCommodityClearing> = {};
  for (const country of countries) {
    const exports = Object.values(flow[country] ?? {}).reduce((sum, amount) => sum + amount, 0);
    let imports = 0;
    for (const exporter of countries) imports += flow[exporter]?.[country] ?? 0;
    const remainingSurplus = surplus[country] ?? 0;
    const remainingDeficit = deficit[country] ?? 0;
    receipts[country] = {
      exports,
      imports,
      net: exports - imports,
      uncleared: remainingSurplus - exports - (remainingDeficit - imports),
    };
  }
  return receipts;
}
