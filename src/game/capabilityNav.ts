import type { WorldState } from "@ahdclient/engine";

/**
 * Capability-navigation support (#510): the projected support/applicability
 * signal behind the metrics and referendum drawer/screen gates.
 *
 * Reference (public Egg3901/AHDGame):
 * - `nationDetailsSections.ts` lists Political Metrics only for the playable
 *   pipeline (`POLITICAL_METRIC_COUNTRY_IDS`: US/UK/RU/DD) and Referendums
 *   only with `hasActiveReferendumCampaign`;
 * - `GET /api/country/[code]/referendums/active` reports
 *   `status === "campaigning"` scoped to that country.
 *
 * Native consumes only existing-domain signals, never country names:
 * - metrics support is the saved `metrics` feature flag ("National metrics,
 *   models, confidence, and vital signs", packages/engine/src/featureFlags.ts).
 *   Native runs one metrics registry for every country, so the reference's
 *   pipeline-country list is not copied: a flag-off world must not offer
 *   metrics rows whose data can never update. The reference's
 *   playable/non-playable registry split stays a documented gap.
 * - referendum support mirrors the active endpoint exactly: a record for the
 *   player's country with `status === "campaigning"`. Granted/polling/
 *   actuating records are lifecycle states, not campaigns, and foreign
 *   records never gate the home drawer. The UK-only request seam stays owned
 *   by projectReferendumRequest in politics.ts.
 *
 * Pre-signal saves (missing flags or referendum ledger) project undefined so
 * callers keep today's rows instead of hiding destinations the save predates.
 */
export interface CapabilityNavSupport {
  metricsAvailable: boolean;
  referendumCampaignActive: boolean;
}

export function projectCapabilityNav(world: WorldState): CapabilityNavSupport | undefined {
  const flags = (world as unknown as { featureFlags?: { metrics?: unknown } }).featureFlags;
  const referendums = (world as unknown as { referendums?: unknown }).referendums;
  if (!flags || !Array.isArray(referendums)) return undefined;
  const countryId = world.player.countryId;
  return {
    metricsAvailable: flags.metrics === true,
    referendumCampaignActive: referendums.some(
      (record) =>
        !!record &&
        (record as { countryId?: unknown }).countryId === countryId &&
        (record as { status?: unknown }).status === "campaigning",
    ),
  };
}
