/**
 * Compass maths for character creation and profile display.
 *
 * Ported from AHDGame `src/lib/registration/alignment.ts` and the
 * `getCompassPositionLabel` archetype table in `src/lib/utils/politics.ts` at
 * e364c04954ed628beef73a993a8e9e156650a31e. Everything works in the shared
 * −5..+5 policy space: `economic` runs left(−) → right(+), `social` runs
 * liberal(−) → traditional(+): the same ruler as party `economicPosition` /
 * `socialPosition`, so candidate and platform are directly comparable.
 */

export interface CompassPoint {
  economic: number;
  social: number;
}

/** Half-range of the shared policy ruler. Source: POLICY_INTEGER_AXIS_RANGE. */
export const POLICY_INTEGER_AXIS_RANGE = 5;

/** Longest possible separation on the plane, corner to corner. Source: MAX_COMPASS_DISTANCE. */
export const MAX_COMPASS_DISTANCE = Math.hypot(
  POLICY_INTEGER_AXIS_RANGE * 2,
  POLICY_INTEGER_AXIS_RANGE * 2,
);

/** Euclidean distance between two points in policy space. Source: compassDistance. */
export function compassDistance(a: CompassPoint, b: CompassPoint): number {
  return Math.hypot(a.economic - b.economic, a.social - b.social);
}

export type AlignmentBand = "aligned" | "close" | "daylight" | "at-odds";

/**
 * Bucket a policy distance into a band. Thresholds are tuned to the ±5 ruler.
 * Source: alignmentBand.
 */
export function alignmentBand(distance: number): AlignmentBand {
  if (distance < 1.5) return "aligned";
  if (distance < 3) return "close";
  if (distance < 5.5) return "daylight";
  return "at-odds";
}

export const ALIGNMENT_META: Record<AlignmentBand, { label: string }> = {
  aligned: { label: "Aligned" },
  close: { label: "Close" },
  daylight: { label: "Some daylight" },
  "at-odds": { label: "At odds" },
};

/**
 * Reference archetype table. Source: COMPASS_ARCHETYPES in politics.ts. The
 * social axis is stored here in the reference compass orientation
 * (authoritarian negative → libertarian positive), the INVERSE of the
 * character/party `socialPosition` ruler. `ideologyLabel` flips the sign.
 */
const COMPASS_ARCHETYPES: { econ: number; social: number; label: string }[] = [
  { econ: -4, social: 3.5, label: "Democratic Socialist" },
  { econ: -3, social: 2.5, label: "Progressive" },
  { econ: -1.5, social: 2, label: "Social Liberal" },
  { econ: 0, social: 0, label: "Centrist" },
  { econ: 0, social: 1.5, label: "Reformist" },
  { econ: 1.5, social: 2, label: "Liberal Conservative" },
  { econ: 3.5, social: 3, label: "Libertarian" },
  { econ: 2.5, social: 1, label: "Neoliberal" },
  { econ: 2.5, social: -1, label: "Conservative" },
  { econ: 3, social: -2.5, label: "Right-Wing Populist" },
  { econ: 2, social: -3.5, label: "Nationalist" },
  { econ: -3.5, social: -2.5, label: "Authoritarian Left" },
  { econ: -4, social: -1.5, label: "State Socialist" },
  { econ: -1, social: -2, label: "Communitarian" },
  { econ: 1, social: -2.5, label: "Traditionalist" },
];

/**
 * Name the candidate's quadrant using the game's own archetype table. The sign
 * flip reconciles the two social rulers (see COMPASS_ARCHETYPES).
 * Source: getCompassPositionLabel.
 */
export function ideologyLabel(point: CompassPoint): string {
  const e = Math.max(-5, Math.min(5, point.economic));
  const s = Math.max(-5, Math.min(5, -point.social));
  let best = COMPASS_ARCHETYPES[0]!;
  let bestD = Infinity;
  for (const archetype of COMPASS_ARCHETYPES) {
    const d = (archetype.econ - e) ** 2 + (archetype.social - s) ** 2;
    if (d < bestD) {
      bestD = d;
      best = archetype;
    }
  }
  return best.label;
}

export interface NearestParty<T extends CompassPoint> {
  party: T;
  distance: number;
  band: AlignmentBand;
}

/**
 * The party whose platform sits closest to the candidate. Returns null when no
 * party carries positions, so callers show nothing rather than inventing a
 * match. Source: nearestParty.
 */
export function nearestParty<T extends CompassPoint>(point: CompassPoint, parties: T[]): NearestParty<T> | null {
  let best: NearestParty<T> | null = null;
  for (const party of parties) {
    const distance = compassDistance(point, party);
    if (!best || distance < best.distance) {
      best = { party, distance, band: alignmentBand(distance) };
    }
  }
  return best;
}
