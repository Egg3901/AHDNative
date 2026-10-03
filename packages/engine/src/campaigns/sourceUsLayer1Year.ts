import { US_SOURCE_YEAR_ELECTORATE } from "@ahdclient/content";
import type { ConditionedLeanOffset } from "./sourceGranularCells.js";

export interface SourceYearSubstrate {
  marginals: Record<string, Record<string, number>>;
  positions: Record<string, Record<string, { economicLean: number; socialLean: number }>>;
  turnoutRates: Record<string, Record<string, number>>;
  conditionedOffsets: ConditionedLeanOffset[];
}

type SourceAnchor = Omit<SourceYearSubstrate, "turnoutRates" | "conditionedOffsets">;
type SourceYearCorpus = {
  provenance: { worldStartYears: number[]; sourceAnchorYears: number[]; sourceCalendarYears: [number, number] };
  anchors: Record<string, Record<string, Record<string, SourceAnchor>>>;
  turnout: {
    noCheckpoint: Record<string, Record<string, Record<string, number>>>;
    startingYear1953: Record<string, Record<string, Record<string, Record<string, number>>>>;
  };
  conditionedOffsets: Record<string, Record<string, ConditionedLeanOffset[]>>;
};

const CORPUS = US_SOURCE_YEAR_ELECTORATE as unknown as SourceYearCorpus;

export function supportsSourceUsStartingYear(startingYear: number): boolean {
  return CORPUS.provenance.worldStartYears.includes(startingYear);
}

function resolveBounds(year: number): { low: number; high: number; fraction: number } | null {
  if (!Number.isSafeInteger(year)) return null;
  const anchors = CORPUS.provenance.sourceAnchorYears;
  const first = anchors[0];
  const last = anchors.at(-1);
  if (first === undefined || last === undefined) return null;
  const resolved = Math.max(first, Math.min(last, year));
  for (const anchor of anchors) {
    if (resolved === anchor) return { low: anchor, high: anchor, fraction: 0 };
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const high = anchors[index];
    const low = anchors[index - 1];
    if (high !== undefined && low !== undefined && resolved < high) {
      return { low, high, fraction: (resolved - low) / (high - low) };
    }
  }
  return { low: last, high: last, fraction: 0 };
}

function unionLerp<T extends number>(low: Record<string, T> | undefined, high: Record<string, T> | undefined, fraction: number): Record<string, T> {
  if (!low) return high ? { ...high } : {};
  if (!high) return { ...low };
  const result: Record<string, T> = {};
  for (const key of new Set([...Object.keys(low), ...Object.keys(high)])) {
    const left = low[key];
    const right = high[key];
    if (left === undefined) result[key] = right!;
    else if (right === undefined) result[key] = left;
    else result[key] = (left + (right - left) * fraction) as T;
  }
  return result;
}

function renormalize(values: Record<string, number>): Record<string, number> {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return { ...values };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total * 100]));
}

/** Rebuild Game's year-resolved US Layer-1 inputs from current-source anchors. */
export function sourceUsLayer1ForYear(stateId: string, year: number, startingYear: number): SourceYearSubstrate | null {
  if (!supportsSourceUsStartingYear(startingYear)) return null;
  const bounds = resolveBounds(year);
  if (!bounds) return null;
  const stateAnchors = CORPUS.anchors[String(startingYear)]?.[stateId];
  const low = stateAnchors?.[String(bounds.low)];
  const high = stateAnchors?.[String(bounds.high)];
  if (!low) return null;

  const dimensions = new Set([...Object.keys(low.marginals), ...Object.keys(high?.marginals ?? {})]);
  const marginals: Record<string, Record<string, number>> = {};
  const positions: SourceYearSubstrate["positions"] = {};
  for (const dimension of dimensions) {
    const lowMarginals = low.marginals[dimension];
    const highMarginals = high?.marginals[dimension];
    if (lowMarginals || highMarginals) {
      marginals[dimension] = renormalize(unionLerp(lowMarginals, highMarginals, bounds.fraction));
    }
    const lowPositions = low.positions[dimension];
    const highPositions = high?.positions[dimension];
    if (lowPositions || highPositions) {
      const blended: Record<string, { economicLean: number; socialLean: number }> = {};
      for (const bucket of new Set([...Object.keys(lowPositions ?? {}), ...Object.keys(highPositions ?? {})])) {
        const left = lowPositions?.[bucket];
        const right = highPositions?.[bucket];
        if (!left) blended[bucket] = { ...right! };
        else if (!right) blended[bucket] = { ...left };
        else blended[bucket] = {
          economicLean: left.economicLean + (right.economicLean - left.economicLean) * bounds.fraction,
          socialLean: left.socialLean + (right.socialLean - left.socialLean) * bounds.fraction,
        };
      }
      positions[dimension] = blended;
    }
  }

  const yearKey = String(Math.max(CORPUS.provenance.sourceCalendarYears[0], Math.min(CORPUS.provenance.sourceCalendarYears[1], year)));
  const baseTurnout = CORPUS.turnout.noCheckpoint[yearKey];
  if (!baseTurnout) return null;
  const turnoutRates = startingYear === 1953
    ? CORPUS.turnout.startingYear1953[yearKey]?.[stateId] ?? baseTurnout
    : baseTurnout;
  const conditionedOffsets = CORPUS.conditionedOffsets[yearKey]?.[stateId] ?? [];
  return { marginals, positions, turnoutRates, conditionedOffsets };
}
