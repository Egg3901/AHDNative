/**
 * Pure cohort/poll math for referendums. Verbatim port of mainline's
 * `src/lib/referendum/cohortEngine.ts` (saturate/effLean/effTurnout,
 * leanFromUnits, aggregateYesShare),
 * `src/lib/referendum/resolveYesShare.ts` (referendumYesShare),
 * `src/lib/referendum/pollSnapshot.ts` (upsertPollPoint), and the campaign
 * tunables they read from `src/lib/constants/referendum.ts`. No I/O.
 *
 * Deliberately NOT ported: `buildReferendumCohorts`, `cohortAffinitiesFor`
 * (`src/lib/constants/referendumCohorts.ts`) and `getBucketProfileForRegion`
 * (`src/lib/demographics/bucketProfile.ts`). Those need the Layer-1 granular
 * electorate (units with `bucketWeights` in the `age/young`-style bucket
 * vocabulary). AHDNative demographics are voter archetypes
 * (`post_industrial_workers`, `green_activists`, ... ; see
 * demographics/ukDemographics*.ts), and the affinity table's own doc states
 * that projecting archetypes onto census buckets is "arithmetically faithful
 * and historically wrong". So a region with no Layer-1 substrate takes
 * mainline's own verbatim fallback from `buildCohortBaseline`
 * (processReferendumLifecycle.ts:55-66): a single synthetic cohort with
 * `yesLean` equal to the opening desire. See lifecycle.ts for where the
 * snapshot is taken.
 */

/** Per-cohort soft caps, verbatim from `src/lib/constants/referendum.ts`. */
export const GG_TURNOUT_MOD_CAP = 20;
export const GG_LEAN_MOD_CAP = 25;
/** Base pp of `yesShare` shift per spend unit at zero prior spend. */
export const CAMPAIGN_SPEND_YESSHARE_PER_UNIT = 0.5;
/** Diminishing-returns scale: marginal effect halves every this-many units. */
export const CAMPAIGN_SPEND_HALF_LIFE_UNITS = 20;
/** Max poll readings kept on a referendum (campaign window + slack). */
export const POLL_HISTORY_CAP = 64;

export interface ReferendumCohort {
  groupId: string;
  /** 0..1 of the electorate. */
  share: number;
  /** 0..100 baseline turnout. */
  turnout: number;
  /** 0..100 baseline Yes share within the cohort. */
  yesLean: number;
}

export interface CohortModifier {
  groupId: string;
  turnoutMod: number;
  leanMod: number;
}

export interface PollPoint {
  turn: number;
  yesShare: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Raw accumulated units → effective modifier (soft cap via tanh). */
export function saturate(raw: number, cap: number): number {
  return cap * Math.tanh(raw / cap);
}
export const effLean = (raw: number) => saturate(raw, GG_LEAN_MOD_CAP);
export const effTurnout = (raw: number) => saturate(raw, GG_TURNOUT_MOD_CAP);

/** PS spend → a uniform lean shift, reusing the diminishing-returns curve. */
export function leanFromUnits(yesUnits: number, noUnits: number): number {
  return cumulativeCampaignEffect(yesUnits) - cumulativeCampaignEffect(noUnits);
}

/**
 * Cumulative yesShare effect of a side's first `units` of spend, with
 * diminishing returns. Pure and order-independent.
 */
export function cumulativeCampaignEffect(units: number): number {
  let total = 0;
  for (let i = 0; i < units; i++) {
    total += CAMPAIGN_SPEND_YESSHARE_PER_UNIT / (1 + i / CAMPAIGN_SPEND_HALF_LIFE_UNITS);
  }
  return total;
}

/**
 * Legacy scalar yesShare from the campaign baseline + each side's cumulative
 * spend units. Since the cohort cutover this is only the FALLBACK for a
 * referendum with no cohort baseline. Clamped to [0,100].
 */
export function deriveCampaignYesShare(
  baseYesShare: number,
  yesUnits: number,
  noUnits: number
): number {
  return clamp(
    baseYesShare + cumulativeCampaignEffect(yesUnits) - cumulativeCampaignEffect(noUnits),
    0,
    100
  );
}

/**
 * Turnout-weighted aggregate of `cohorts` after `modifiers` + a uniform shift.
 * `modifiers` carry RAW accumulated ground-game units; the per-cohort soft cap
 * (`saturate`) is applied here at read time.
 */
export function aggregateYesShare(
  cohorts: ReferendumCohort[],
  modifiers: CohortModifier[],
  uniformLeanShift: number
): number {
  const modById = new Map(modifiers.map((m) => [m.groupId, m]));
  let num = 0;
  let den = 0;
  for (const c of cohorts) {
    const m = modById.get(c.groupId);
    const turnout = clamp(c.turnout + effTurnout(m?.turnoutMod ?? 0), 0, 100);
    const lean = clamp(c.yesLean + effLean(m?.leanMod ?? 0) + uniformLeanShift, 0, 100);
    const weight = c.share * turnout;
    num += weight * lean;
    den += weight;
  }
  if (den === 0) return clamp(uniformLeanShift, 0, 100);
  return clamp(num / den, 0, 100);
}

/**
 * Single source of truth for a referendum's canonical Yes share. With a cohort
 * baseline it is the turnout-weighted aggregate (PS spend folded in as a
 * uniform lean shift); without one it falls back to the legacy scalar
 * derivation. Always recompute ; never trust the stored `yesShare`.
 */
export function referendumYesShare(ref: {
  cohortBaseline?: ReferendumCohort[];
  cohortModifiers?: CohortModifier[];
  campaignSpendUnits?: { yes: number; no: number } | null;
  campaignBaseYesShare?: number;
  yesShare: number;
}): number {
  const base = ref.campaignBaseYesShare ?? ref.yesShare;
  const yes = ref.campaignSpendUnits?.yes ?? 0;
  const no = ref.campaignSpendUnits?.no ?? 0;
  if (ref.cohortBaseline && ref.cohortBaseline.length > 0) {
    return aggregateYesShare(ref.cohortBaseline, ref.cohortModifiers ?? [], leanFromUnits(yes, no));
  }
  return deriveCampaignYesShare(base, yes, no);
}

/**
 * Insert (or replace) the reading for `turn`, keep the series turn-ascending,
 * clamp the value to [0, 100], and trim to the most recent `cap` points.
 * Idempotent by turn: re-running a turn overwrites rather than duplicates.
 */
export function upsertPollPoint(
  history: PollPoint[] | undefined,
  turn: number,
  yesShare: number,
  cap: number = POLL_HISTORY_CAP
): PollPoint[] {
  const clamped = Math.max(0, Math.min(100, yesShare));
  const next = [
    ...(history ?? []).filter((p) => p.turn !== turn),
    { turn, yesShare: clamped },
  ].sort((a, b) => a.turn - b.turn);
  return next.length > cap ? next.slice(next.length - cap) : next;
}
