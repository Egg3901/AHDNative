/**
 * Current-source policy rows seeded on a fresh world.
 *
 * AHDGame's `src/lib/admin/seed/seedPoliticalLegislation.ts` writes the
 * authored current level to statePolicies and an enactedLaws row when that
 * level is above zero. For `both` laws, the regional reader defaults an absent
 * statePolicies row to level 0; the source does not write a regional baseline
 * row. These source-backed catalog rows already have Native metric consumers,
 * so store their national baseline instead of relying on a catalog-only
 * fallback. This is deliberately limited to SOURCE_METRIC_LAWS; legacy
 * reference laws and Native-only catalog entries do not acquire invented
 * source history here.
 */
import type { WorldState } from "../types.js";
import { SOURCE_METRIC_LAWS, resolveCatalogPolicyOption } from "../legislation/catalog.js";
import type { PolicyLedgerEntry } from "./types.js";

const SOURCE_BASELINE_BILL_PREFIX = "source-baseline:";

export function seedSourceBaselinePolicies(world: WorldState): void {
  for (const law of SOURCE_METRIC_LAWS) {
    if (law.status !== "available" || !world.countries[law.countryId]) continue;
    const baselineLevel = law.baselineLevel ?? 0;
    const nationalOption = resolveCatalogPolicyOption(law, `l${baselineLevel}`);
    if (!nationalOption) continue;

    const nationalId = `${SOURCE_BASELINE_BILL_PREFIX}${law.id}`;
    const nationalEntry: PolicyLedgerEntry = {
      id: nationalId,
      legislationTypeId: law.id,
      policyOptionId: String(baselineLevel),
      sourcePolicyOptionId: nationalOption.id,
      effectDirection: nationalOption.effectDirection,
      scope: "national",
      countryId: law.countryId,
      enactedTurn: 0,
      enactedAt: world.meta.date,
    };
    world.policyLedger[nationalId] = nationalEntry;

    if (baselineLevel > 0) {
      world.enactedLaws.push({
        id: law.id,
        countryId: law.countryId,
        billId: nationalId,
        enactedAtTurn: 0,
        level: baselineLevel,
        scope: "national",
        expiresAtTurn: null,
      });
    }

  }
}
