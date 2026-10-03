import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import {
  electoralVoteUnitsFromSeats,
  electoralVotesFromSeats,
} from "../electionEngine/resolution/apportionment.js";
import { eraToPreset } from "../electionEngine/resolution/constants.js";
import { sha256FirstUint32BE } from "../corporation/rdInnovationRng.js";

/**
 * Electoral College math (W24b) — winner-take-all per-state allocation and
 * the era's real electoral-vote apportionment, replacing the W24 nationwide
 * simplification.
 *
 * EV SOURCE: mainline's `src/lib/elections/apportionment.ts`
 * `electoralVotesFromSeats` (ported verbatim at
 * `packages/engine/src/electionEngine/resolution/apportionment.ts`), which
 * defines EV = house seats + 2 senators per state, plus DC's 3 once the
 * 23rd Amendment is in force (from 1961), with Maine/Nebraska splitting
 * into congressional-district units from 1972/1992. This module feeds the
 * live per-region `houseSeats` through that helper with the world's era
 * preset and live year, so the era gates apply structurally here instead
 * of living only in the helper's own tests.
 *
 * DC's Game fallback state and source-generated presidential demographics are
 * applied only to this Electoral College path. The native headquarters-only
 * region stays out of every other regional mechanic. ME/NE use source
 * congressional-district units when their year gates are active. For the 1953 pack (48 states,
 * sourced from mainline's `HOUSE_SEATS_1953` / `ELECTORAL_VOTES_1953` —
 * see `packages/engine/src/electionEngine/resolution/constants.ts`, which
 * holds that table byte-for-byte for golden tests) the gates are inert:
 * sum 435 house seats + 2×48 senators = 531 electoral votes,
 * majority = floor(531/2)+1 = 266.
 */

/**
 * Electoral votes per modeled region of `countryId`, via the ported
 * `electoralVotesFromSeats` helper (live `houseSeats`, era preset + live
 * year). DC uses its own source presidential unit when either the fallback
 * headquarters row or an authored federal-district row exists.
 */
export function electoralVotesByState(world: WorldState, countryId: string): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const region of Object.values(world.regions)) {
    if (region.countryId !== countryId || region.corporationHeadquartersOnly === true) continue;
    // A source territory has a real region and population before statehood,
    // but zero House districts and no federal electors. Do not turn its two
    // future Senate seats into present-day electoral votes.
    if (typeof region.houseSeats === "number" && region.houseSeats > 0) seats[region.id] = region.houseSeats;
  }
  const liveYear = Number(world.meta.date.slice(0, 4));
  const evAll = electoralVotesFromSeats(seats, {
    preset: eraToPreset(world.meta.era),
    year: Number.isFinite(liveYear) ? liveYear : null,
  });
  const ev: Record<string, number> = {};
  for (const id of Object.keys(seats)) {
    const v = evAll[id];
    if (v !== undefined) ev[id] = v;
  }
  if (countryId === "US" && world.regions.DC?.countryId === "US" && evAll.DC !== undefined) {
    ev.DC = evAll.DC;
  }
  return ev;
}

/** Source apportionment units intersected with electoral regions in this world. */
export function electoralVoteUnitsForWorld(
  world: WorldState,
  countryId: string,
): Array<{ unitId: string; ev: number; stateId: string }> {
  const seats: Record<string, number> = {};
  for (const region of Object.values(world.regions)) {
    if (region.countryId !== countryId || region.corporationHeadquartersOnly === true) continue;
    if (typeof region.houseSeats === "number" && region.houseSeats > 0) seats[region.id] = region.houseSeats;
  }
  const liveYear = Number(world.meta.date.slice(0, 4));
  const units = electoralVoteUnitsFromSeats(seats, {
    preset: eraToPreset(world.meta.era),
    year: Number.isFinite(liveYear) ? liveYear : null,
  });
  // Game's fallback DC state supplies the source 689,545 population and its
  // source-generated demographic table. This synthetic electoral unit is
  // intentionally local to presidential tallies; the HQ row stays excluded
  // from regional population and other election mechanics.
  return units.filter((unit) =>
    seats[unit.stateId] !== undefined ||
    (unit.stateId === "DC" && world.regions.DC?.countryId === "US"),
  );
}

export interface ElectoralCollegeResult {
  /** candidate id -> electoral votes won. */
  evByCandidate: Record<string, number>;
  /** Total electoral votes actually allocated this cycle (college size). */
  totalEv: number;
  /** State-by-state winner, for display/debugging. */
  stateWinners: Record<string, string>;
}

/**
 * Winner-take-all EV allocation from the presidential race's per-state
 * cumulative tallies (`rec.stateTallyStates`, written by
 * `tallyAdapter.ts`'s `realAccumulatePresident`). Returns null when no
 * per-state tallies exist (real EC path never ran — either the accumulation
 * phase never ran, as in direct-resolution unit tests, or the world's
 * states lack demographics and the nationwide fallback ran instead) or when
 * every state fails to produce a winner (no votes cast anywhere).
 *
 * Tie-break: highest cumulative votes; an EXACT tie within a state resolves
 * to the first-seen candidate (insertion order of the per-state
 * `totalVotes` map). That matches mainline's unit-winner rule in
 * `src/lib/elections/electoralVoteService.ts`: entries are filtered to
 * `v > 0` and stable-sorted by votes descending with no secondary key, so
 * the earliest entry wins an exact tie. The source turn resolver uses a
 * separate SHA-256 rule in `src/lib/turn/electionCalculations.ts`; this
 * function describes live display only, not the final election result.
 * First-seen is deterministic here because `totalVotes` insertion order
 * follows `rec.candidates` order (`initElectionVoteTally` seeds keys in
 * candidate order; accumulation updates them in place) and JSON save/reload
 * preserves string-key order.
 */
export function allocateElectoralVotes(world: WorldState, rec: ElectionRecord): ElectoralCollegeResult | null {
  const stateTallyStates = rec.stateTallyStates as Record<string, { totalVotes?: Record<string, number> }> | undefined;
  if (!stateTallyStates || Object.keys(stateTallyStates).length === 0) return null;

  const units = electoralVoteUnitsForWorld(world, rec.countryId);
  const votesByUnit = Object.fromEntries(units.map((unit) => [unit.unitId,
    stateTallyStates[unit.unitId]?.totalVotes ?? stateTallyStates[unit.stateId]?.totalVotes ?? {},
  ]));
  return allocateUnits(units, votesByUnit, (_unitId, entries) => entries[0]![0]);
}

/** Final source turn allocation, whose exact ties do not depend on saved key order. */
export function allocatePresidentialResolutionVotes(world: WorldState, rec: ElectionRecord): ElectoralCollegeResult | null {
  const states = rec.stateTallyStates as Record<string, { totalVotes?: Record<string, number> }> | undefined;
  if (!states) return null;
  const votesByUnit = Object.fromEntries(Object.entries(states).map(([unitId, state]) => [unitId, state.totalVotes ?? {}]));
  return allocateUnits(electoralVoteUnitsForWorld(world, rec.countryId), votesByUnit, (unitId, entries) => {
    const highest = entries[0]![1];
    const tiedIds = entries.filter(([, votes]) => votes === highest).map(([id]) => id).sort();
    if (tiedIds.length === 1) return tiedIds[0]!;
    // Source digest()[0] is the high byte of the first big-endian digest word.
    const seed = sha256FirstUint32BE(`${unitId}:${tiedIds.join(":")}`) >>> 24;
    return tiedIds[seed % tiedIds.length]!;
  });
}

function allocateUnits(
  units: Array<{ unitId: string; ev: number; stateId: string }>,
  votesByUnit: Record<string, Record<string, number>>,
  winnerFor: (unitId: string, rankedVotes: Array<[string, number]>) => string,
): ElectoralCollegeResult | null {
  const evByCandidate: Record<string, number> = {};
  const stateWinners: Record<string, string> = {};
  let totalEv = 0;

  for (const unit of units) {
    const ev = unit.ev;
    if (!Number.isFinite(ev) || ev <= 0) continue;

    const votes = votesByUnit[unit.unitId] ?? {};
    const entries = Object.entries(votes)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    if (!top) continue; // no votes cast in this state yet

    const winnerId = winnerFor(unit.unitId, entries);
    stateWinners[unit.unitId] = winnerId;
    evByCandidate[winnerId] = (evByCandidate[winnerId] ?? 0) + ev;
    totalEv += ev;
  }

  if (totalEv === 0) return null;
  return { evByCandidate, totalEv, stateWinners };
}

/** Majority-of-the-actual-college threshold — never a hardcoded 270 (mainline's `electoralMajorityFor`). */
export function electoralMajorityFor(totalEv: number): number {
  if (!Number.isFinite(totalEv) || totalEv <= 0) return 0;
  return Math.floor(totalEv / 2) + 1;
}
