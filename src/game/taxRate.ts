import type { LegislationTaxPolicyView } from "./legislationDetails";

export function snapTaxRate(
  taxPolicy: LegislationTaxPolicyView,
  requested?: number,
): number {
  const raw =
    typeof requested === "number" && Number.isFinite(requested) ? requested : taxPolicy.baselineRate;
  if (taxPolicy.options?.length) {
    return [...taxPolicy.options].sort((left, right) =>
      Math.abs(left.rate - raw) - Math.abs(right.rate - raw) || left.rate - right.rate,
    )[0]!.rate;
  }
  const snapped =
    taxPolicy.step > 0
      ? Math.round((raw - taxPolicy.minRate) / taxPolicy.step) * taxPolicy.step + taxPolicy.minRate
      : raw;
  return Math.round(Math.min(taxPolicy.maxRate, Math.max(taxPolicy.minRate, snapped)) * 1000) / 1000;
}
