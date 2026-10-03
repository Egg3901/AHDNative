import { US_ERA_CHECKPOINTS_1953 } from "@ahdclient/content";
import type { WorldState } from "../types.js";
import { sourceElectionClockForWorld } from "../elections/sourceElectionClock.js";
import { computeActiveShiftsForCountry, type CatalogLookup } from "./demographicEffects.js";
import { sourceArchetypeBucketValues } from "../campaigns/sourceCampaignElectorate.js";

type Axis = "economicLean" | "socialLean" | "turnout";
type Target = {
  groupId?: string;
  dim?: string;
  bucket?: string;
  stateIds: string[];
  axis: Axis;
  totalShift: number;
};
type Checkpoint = {
  id: string;
  triggerCaseKey?: string;
  fallbackStartTurn: number;
  durationTurns: number;
  targets: Target[];
};
type SourceCheckpoints = { startingYear: number; checkpoints: Checkpoint[] };

const SOURCE = US_ERA_CHECKPOINTS_1953 as unknown as SourceCheckpoints;

function sourceTurnForNativeCompletedTurn(world: WorldState, turn: number): number {
  if (world.meta.preIteration?.active) return 1;
  return Math.max(1, turn + 1 - (world.meta.preIterationTurns ?? 0));
}

function checkpointStartTurn(world: WorldState, checkpoint: Checkpoint): number {
  if (!checkpoint.triggerCaseKey) return checkpoint.fallbackStartTurn;
  const docketCase = world.docketCases.find((row) => row.countryId === "US" && row.caseKey === checkpoint.triggerCaseKey);
  if (docketCase?.status === "decided" && docketCase.outcome === "affirmed" && Number.isSafeInteger(docketCase.decidedAtTurn)) {
    return sourceTurnForNativeCompletedTurn(world, docketCase.decidedAtTurn!);
  }
  return checkpoint.fallbackStartTurn;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function applyBucketLean(world: WorldState, stateId: string, dim: string, bucket: string, axis: Exclude<Axis, "turnout">, delta: number): void {
  if (delta === 0) return;
  const baseline = world.baselineDemographics[stateId];
  if (!baseline) return;
  const current = baseline.layer1PositionOverrides ?? (baseline.layer1PositionOverrides = {});
  const byBucket = current[dim] ?? (current[dim] = {});
  const position = byBucket[bucket] ?? (byBucket[bucket] = {});
  position[axis] = clamp((position[axis] ?? 0) + delta, -5, 5);
}

function applyBucketTurnout(world: WorldState, stateId: string, dim: string, bucket: string, delta: number): void {
  if (delta === 0) return;
  const baseline = world.baselineDemographics[stateId];
  if (!baseline) return;
  const current = baseline.layer1TurnoutOverrides ?? (baseline.layer1TurnoutOverrides = {});
  const byBucket = current[dim] ?? (current[dim] = {});
  byBucket[bucket] = clamp((byBucket[bucket] ?? 0) + delta, -80, 80);
}

function applyGroupValue(world: WorldState, stateId: string, groupId: string, axis: Axis, delta: number): void {
  if (delta === 0) return;
  const live = world.stateDemographics[stateId]?.groups[groupId];
  const baseline = world.baselineDemographics[stateId]?.groups[groupId];
  if (!live || !baseline) return;
  const minimum = axis === "turnout" ? 0 : -5;
  const maximum = axis === "turnout" ? 100 : 5;
  live[axis] = clamp(live[axis] + delta, minimum, maximum);
  baseline[axis] = clamp(baseline[axis] + delta, minimum, maximum);
}

function projectedCounterpressure(groupDeltas: Record<string, number>, bucketKey: string): number {
  const projected = sourceArchetypeBucketValues(groupDeltas);
  return projected[bucketKey] ?? 0;
}

/** Source Game's 1953-only era-checkpoint writer, ported as an RNG-free turn phase. */
export function processEraCheckpointsTurn(world: WorldState, lookupCatalog?: CatalogLookup): { checkpointsActive: number; statesUpdated: number } {
  const clock = sourceElectionClockForWorld(world);
  if (!clock || clock.startingYear !== SOURCE.startingYear) return { checkpointsActive: 0, statesUpdated: 0 };
  const active = SOURCE.checkpoints.flatMap((checkpoint) => {
    const startTurn = checkpointStartTurn(world, checkpoint);
    return clock.calendarTurn >= startTurn && clock.calendarTurn < startTurn + checkpoint.durationTurns
      ? [{ checkpoint, startTurn }]
      : [];
  });
  if (active.length === 0) return { checkpointsActive: 0, statesUpdated: 0 };

  const shiftsForState = new Map<string, ReturnType<typeof computeActiveShiftsForCountry>>();
  const touched = new Set<string>();
  for (const { checkpoint } of active) {
    for (const target of checkpoint.targets) {
      const rawDelta = target.totalShift / checkpoint.durationTurns;
      for (const stateId of target.stateIds) {
        const live = world.stateDemographics[stateId];
        const baseline = world.baselineDemographics[stateId];
        if (!live || !baseline) continue;
        let shifts = shiftsForState.get(stateId);
        if (!shifts) {
          const activePolicies = Object.fromEntries(Object.entries(world.policyLedger).filter(([, policy]) =>
            policy.countryId === "US" && policy.repealedAtTurn === undefined && !policy.isRepeal &&
            (policy.scope === "national" || policy.regionId === stateId)
          ));
          shifts = computeActiveShiftsForCountry({ ...world, policyLedger: activePolicies }, "US", lookupCatalog);
          shiftsForState.set(stateId, shifts);
        }
        let counterDelta = 0;
        if (target.groupId) {
          counterDelta = shifts.get(target.groupId)?.[target.axis] ?? 0;
        } else if (target.dim && target.bucket) {
          const groupDeltas: Record<string, number> = {};
          for (const [groupId, values] of shifts) {
            const value = values[target.axis];
            if (typeof value === "number" && Number.isFinite(value)) groupDeltas[groupId] = value;
          }
          counterDelta = projectedCounterpressure(groupDeltas, `${target.dim}:${target.bucket}`);
        }
        const delta = rawDelta !== 0 && Math.sign(rawDelta) !== Math.sign(counterDelta) ? rawDelta + counterDelta : rawDelta;
        if (target.groupId) {
          applyGroupValue(world, stateId, target.groupId, target.axis, delta);
          if (target.axis === "turnout") {
            for (const [bucketKey, bucketDelta] of Object.entries(sourceArchetypeBucketValues({ [target.groupId]: delta }))) {
              const split = bucketKey.indexOf(":");
              if (split > 0) applyBucketTurnout(world, stateId, bucketKey.slice(0, split), bucketKey.slice(split + 1), bucketDelta);
            }
          } else {
            for (const [bucketKey, bucketDelta] of Object.entries(sourceArchetypeBucketValues({ [target.groupId]: delta }))) {
              const split = bucketKey.indexOf(":");
              if (split > 0) applyBucketLean(world, stateId, bucketKey.slice(0, split), bucketKey.slice(split + 1), target.axis, bucketDelta);
            }
          }
        } else if (target.dim && target.bucket) {
          if (target.axis === "turnout") applyBucketTurnout(world, stateId, target.dim, target.bucket, delta);
          else applyBucketLean(world, stateId, target.dim, target.bucket, target.axis, delta);
        }
        if (delta !== 0) touched.add(stateId);
      }
    }
  }
  return { checkpointsActive: active.length, statesUpdated: touched.size };
}
