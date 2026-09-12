import type { WorldState } from "../types.js";
import { UK_DEVOLUTION_REGIONS } from "../devolution/independenceDesireDrift.js";
import { CAMPAIGN_WINDOW_TURNS } from "./lifecycle.js";
import type { ReferendumRecord } from "./types.js";

/** Min independence desire required by AHDGame's requestReferendum command. */
export const REQUEST_THRESHOLD = 60;
/** First Minister office AP cost in AHDGame. Native maps this to the action catalog cost. */
export const REQUEST_AP_COST = 3;

const ACTIVE_STATUSES = new Set<ReferendumRecord["status"]>([
  "granted",
  "campaigning",
  "polling",
  "actuating",
]);

const TERMINAL_STATUSES = new Set<ReferendumRecord["status"]>([
  "settled",
  "completed",
  "cancelled",
]);

export interface RequestEligibilityArgs {
  desire: number;
  hasActiveReferendum: boolean;
  cooldownReadyAtTurn: number | null;
  currentTurn: number;
}

/**
 * Pure port of AHDGame's referendumRequestEligibility. The order is
 * intentional: an active record and an unexpired cooldown take precedence
 * over the desire threshold in the surfaced error.
 */
export function referendumRequestEligibility(args: RequestEligibilityArgs): {
  eligible: boolean;
  reason?: string;
} {
  if (args.hasActiveReferendum) {
    return { eligible: false, reason: "A referendum is already in progress for this region." };
  }
  if (args.cooldownReadyAtTurn != null && args.currentTurn < args.cooldownReadyAtTurn) {
    return { eligible: false, reason: `On cooldown until turn ${args.cooldownReadyAtTurn}.` };
  }
  if (args.desire < REQUEST_THRESHOLD) {
    return {
      eligible: false,
      reason: `Independence desire must reach ${REQUEST_THRESHOLD} to request a referendum.`,
    };
  }
  return { eligible: true };
}

export type RequestReferendumResult =
  | { ok: true; message: string; referendum: ReferendumRecord }
  | { ok: false; error: string };

function nextReferendumId(world: WorldState, regionId: string): string {
  const base = `referendum-${regionId}-${world.meta.turn}`;
  let id = base;
  let suffix = 1;
  while (world.referendums.some((record) => record.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

/**
 * Display-facing eligibility for one devolution region: the same active and
 * cooldown precedence the request action enforces. Read-only; no state change.
 */
export function referendumRegionStatus(world: WorldState, regionId: string): {
  desire: number; eligible: boolean; reason?: string; active: boolean;
  lastTerminal: ReferendumRecord | null;
} {
  const region = world.regions[regionId];
  const active = world.referendums.some(
    (record) => record.regionId === regionId && ACTIVE_STATUSES.has(record.status),
  );
  const lastTerminal = [...world.referendums]
    .reverse()
    .find((record) => record.regionId === regionId && TERMINAL_STATUSES.has(record.status)) ?? null;
  const desire = region?.independenceDesire ?? 0;
  const eligibility = referendumRequestEligibility({
    desire,
    hasActiveReferendum: active,
    cooldownReadyAtTurn: lastTerminal?.cooldownReadyAtTurn ?? null,
    currentTurn: world.meta.turn,
  });
  return {
    desire,
    active,
    lastTerminal,
    eligible: eligibility.eligible,
    ...(eligibility.reason ? { reason: eligibility.reason } : {}),
  };
}

/**
 * Player-facing Native equivalent of AHDGame's request + PM grant seam.
 *
 * AHDNative has no devolved First Minister office ledger yet. The action
 * catalog therefore owns the source's three-point cost, while this helper
 * ports the request eligibility and records the immediately granted state
 * needed by the campaign lifecycle. The later Westminster/Dáil consent and
 * in-memory secession/reunification actuation are owned by lifecycle.ts.
 */
export function requestReferendum(world: WorldState, requestedRegionId: string): RequestReferendumResult {
  if (world.player.countryId !== "UK") {
    return { ok: false, error: "Referendums are UK-only." };
  }

  const regionId = requestedRegionId.trim().toUpperCase();
  const region = world.regions[regionId];
  if (!region || region.countryId !== "UK" || !UK_DEVOLUTION_REGIONS.has(regionId)) {
    return { ok: false, error: "Region cannot hold an independence referendum." };
  }

  const active = world.referendums.some(
    (record) => record.regionId === regionId && ACTIVE_STATUSES.has(record.status),
  );
  const lastTerminal = [...world.referendums]
    .reverse()
    .find((record) => record.regionId === regionId && TERMINAL_STATUSES.has(record.status));
  const eligibility = referendumRequestEligibility({
    desire: region.independenceDesire ?? 0,
    hasActiveReferendum: active,
    cooldownReadyAtTurn: lastTerminal?.cooldownReadyAtTurn ?? null,
    currentTurn: world.meta.turn,
  });
  if (!eligibility.eligible) return { ok: false, error: eligibility.reason! };

  const desire = Math.max(0, Math.min(100, region.independenceDesire ?? 0));
  const kind = regionId === "NIR" ? "reunification" : "independence";
  const referendum: ReferendumRecord = {
    id: nextReferendumId(world, regionId),
    countryId: "UK",
    regionId,
    kind,
    targetCountryId: kind === "reunification" ? "IE" : null,
    status: "granted",
    yesShare: desire,
    campaignBaseYesShare: desire,
    campaignSpendUnits: { yes: 0, no: 0 },
    requestedTurn: world.meta.turn,
    grantedTurn: world.meta.turn,
    campaignOpenTurn: world.meta.turn,
    campaignCloseTurn: world.meta.turn + CAMPAIGN_WINDOW_TURNS,
    cooldownReadyAtTurn: null,
  };
  world.referendums.push(referendum);

  return {
    ok: true,
    message: `${regionId} ${kind} referendum granted.`,
    referendum,
  };
}
