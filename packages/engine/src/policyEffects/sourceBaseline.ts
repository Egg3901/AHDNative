/**
 * Current-source policy rows seeded on a fresh world.
 *
 * AHDGame's `src/lib/admin/seed/seedPoliticalLegislation.ts` writes the
 * authored national current level to statePolicies and an enactedLaws row
 * when that level is above zero. It also writes a level-0 regional
 * statePolicies row for each `both` law (without a regional enactedLaws row).
 * These source-backed catalog rows already have Native metric consumers, so
 * store their baselines instead of relying on a catalog-only fallback. This
 * is deliberately limited to SOURCE_METRIC_LAWS; legacy
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

    if (law.allowedScope === "both") {
      const regionalOption = resolveCatalogPolicyOption(law, "l0");
      if (!regionalOption) continue;
      for (const region of Object.values(world.regions)) {
        if (region.countryId !== law.countryId) continue;
        const regionalId = `${SOURCE_BASELINE_BILL_PREFIX}${region.id}:${law.id}`;
        world.policyLedger[regionalId] = {
          id: regionalId,
          legislationTypeId: law.id,
          policyOptionId: "0",
          sourcePolicyOptionId: regionalOption.id,
          effectDirection: regionalOption.effectDirection,
          scope: "regional",
          regionId: region.id,
          countryId: law.countryId,
          enactedTurn: 0,
          enactedAt: world.meta.date,
        };
      }
    }

  }
}
