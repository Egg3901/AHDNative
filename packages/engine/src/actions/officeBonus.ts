/**
 * Player office action-bonus projection (#31).
 *
 * Ports the per-turn AP refresh inputs of AHDGame
 * `src/lib/turn/actionRefresh.ts` at d4baf899:
 * - base `max(config.baseActionsPerTurn, 4)` - solo stores no gameConfig, so
 *   the shipped default 4 always applies (see DEFAULT_BASE_ACTIONS_PER_TURN).
 * - office bonus via `resolveOfficeActionBonus` (`src/lib/actions/
 *   officeActionBonus.ts`): `gameConfig.officeActionBonus` wins, else the
 *   per-country office registry (`src/lib/actions/officeBonusRegistry.ts`
 *   over `src/lib/constants/countries.ts`, exported here as officeRegistry.ts).
 * - cabinet bonus stacks on the underlying seat and is counted once.
 * - central-bank chair bonus (+3) stacks on top. Solo's CentralBank carries no
 *   character holder field (chairMode is always "npp"), so no player can hold
 *   the chair today; the bonus resolves to 0 without inventing a holder field.
 *   The nomination lifecycle that could seat a character chair is #119.
 * - party/congress leadership and justice seats grant national-influence tiers
 *   in the reference, never action points, so they contribute 0 here (#30 owns
 *   national influence; do not mistake NI tiers for AP bonuses).
 * - Energy-scaled cap/threshold (`src/lib/stats/statDrift.ts`,
 *   statsConstants.ts): Math.round linear 200->250 cap, 100->125 threshold
 *   over Energy 1->10; a missing stat resolves at STAT_MIN (baseline 200/100).
 *   Imported Energy is honored; missing Energy keeps the baseline. Full stat
 *   allocation/XP and per-action efficacy scalars stay #48/#91.
 *
 * One authoritative projection (`projectPlayerActionRefresh`) is reused by the
 * actionRefresh phase and by the Profile/footer resource breakdowns so the
 * displayed gain always matches the actions actually granted.
 */

import type { WorldState } from "../types.js";
import {
  ACTION_HOARD_PENALTY,
  ENERGY_BASE_ACTION_CAP,
  ENERGY_BASE_HOARD_THRESHOLD,
  ENERGY_MAX_ACTION_CAP,
  ENERGY_MAX_HOARD_THRESHOLD,
  MIN_BASE_ACTIONS_PER_TURN,
} from "./constants.js";
import { OFFICE_REGISTRY, EXECUTIVE_OFFICE_BY_COUNTRY } from "./officeRegistry.js";

/** Shipped default; solo stores no gameConfig document to override it. */
export const DEFAULT_BASE_ACTIONS_PER_TURN = MIN_BASE_ACTIONS_PER_TURN;

/**
 * Default `gameConfig.officeActionBonus` map, copied from the reference game
 * config initializer (`src/app/api/admin/config/init/route.ts` at d4baf899).
 * Authoritative over the office registry for the keys it names.
 */
export const DEFAULT_OFFICE_ACTION_BONUS: Record<string, number> = {
  house: 1,
  senate: 2,
  stateSenate: 1,
  governor: 3,
  president: 4,
  vicePresident: 2,
  commons: 1,
  primeMinister: 4,
  regionalCouncil: 1,
  premier: 2,
  bundestag: 1,
  bundesrat: 2,
  chancellor: 4,
  ministerPresident: 2,
  sangiin: 1,
  shugiin: 1,
  npcDelegate: 1,
  peoplesCongress: 1,
};

/**
 * Cabinet office-type keys, ported verbatim from `CABINET_OFFICE_TYPES` in
 * `src/lib/actions/officeActionBonus.ts`. `deCabinet` is absent there and stays
 * absent here: such an appointment resolves as an ordinary (unknown) seat key.
 */
export const CABINET_OFFICE_TYPES: ReadonlySet<string> = new Set([
  "parliamentaryCabinet",
  "ukCabinet",
  "usCabinet",
]);

/**
 * The country's cabinet office-type key. Ports `cabinetOfficeTypeForCountry`:
 * US and UK have dedicated keys; all other parliamentary systems share
 * `parliamentaryCabinet`.
 */
export function cabinetOfficeTypeForCountry(countryId: string): string {
  if (countryId === "US") return "usCabinet";
  if (countryId === "UK") return "ukCabinet";
  return "parliamentaryCabinet";
}

/**
 * Per-turn action bonus for holding `officeType`. Ports
 * `resolveOfficeActionBonusForType`: the configured map is authoritative when
 * it names the key; otherwise the country office registry is the fallback
 * (exact country first, then the highest cross-country match); 0 for keys
 * neither source knows.
 */
export function resolveOfficeActionBonusForType(
  officeType: string | undefined,
  officeActionBonus: Record<string, number> | undefined,
  countryId?: string,
): number {
  if (!officeType) return 0;
  const configured = officeActionBonus?.[officeType];
  if (typeof configured === "number") return configured;
  if (countryId) {
    const exact = OFFICE_REGISTRY.find(
      (entry) => entry.countryId === countryId && entry.officeType === officeType,
    );
    if (exact) return exact.actionBonus;
  }
  let best: number | undefined;
  for (const entry of OFFICE_REGISTRY) {
    if (entry.officeType !== officeType) continue;
    if (best === undefined || entry.actionBonus > best) best = entry.actionBonus;
  }
  return best ?? 0;
}

export interface OfficeActionBonusBreakdown {
  /** The resolved underlying-seat office type (cabinet keys excluded), or undefined. */
  seatType: string | undefined;
  /** Bonus from the legislative/executive seat. */
  seatBonus: number;
  /** Bonus from the cabinet seat (stacks on top of the seat bonus). */
  cabinetBonus: number;
}

export interface ResolveOfficeActionBonusArgs {
  currentOfficeType: string | undefined;
  electedSeatOfficeType: string | undefined;
  isCabinetMember: boolean;
  cabinetOfficeType: string | undefined;
  officeActionBonus: Record<string, number> | undefined;
  countryId?: string;
}

/**
 * Resolve the seat/cabinet split of a per-turn office AP bonus. Ports
 * `resolveOfficeActionBonusBreakdown`: when the current office is a cabinet
 * key it is not a real seat, so the underlying legislative seat is recovered
 * from the elected record instead; the cabinet key is counted exactly once as
 * `cabinetBonus`, never doubled as the seat bonus.
 */
export function resolveOfficeActionBonusBreakdown({
  currentOfficeType,
  electedSeatOfficeType,
  isCabinetMember,
  cabinetOfficeType,
  officeActionBonus,
  countryId,
}: ResolveOfficeActionBonusArgs): OfficeActionBonusBreakdown {
  const seatType =
    currentOfficeType && CABINET_OFFICE_TYPES.has(currentOfficeType)
      ? electedSeatOfficeType
      : currentOfficeType;
  const seatBonus = resolveOfficeActionBonusForType(seatType, officeActionBonus, countryId);
  const cabinetBonus =
    isCabinetMember && cabinetOfficeType
      ? resolveOfficeActionBonusForType(cabinetOfficeType, officeActionBonus, countryId)
      : 0;
  return { seatType, seatBonus, cabinetBonus };
}

/** Total per-turn office AP bonus (seatBonus + cabinetBonus). */
export function resolveOfficeActionBonus(args: ResolveOfficeActionBonusArgs): number {
  const { seatBonus, cabinetBonus } = resolveOfficeActionBonusBreakdown(args);
  return seatBonus + cabinetBonus;
}

// Energy-scaled limits
// Ports energyActionLimits from src/lib/stats/statDrift.ts. STAT_MIN/MAX are
// copied from statsConstants.ts (the shared game-rules package only pins the
// fundraiser scope, so the engine keeps this local copy with the citation).

const STAT_MIN = 1;
const STAT_MAX = 10;

function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

/**
 * Energy-scaled action economy limits: linear from the baseline at Energy 1
 * to the max at Energy 10. Callers pass STAT_MIN for characters with no Energy
 * stat so they keep exact baseline limits.
 */
export function energyActionLimits(energy: number): { cap: number; threshold: number } {
  const t = (clampStat(energy) - STAT_MIN) / (STAT_MAX - STAT_MIN);
  return {
    cap: Math.round(ENERGY_BASE_ACTION_CAP + t * (ENERGY_MAX_ACTION_CAP - ENERGY_BASE_ACTION_CAP)),
    threshold: Math.round(
      ENERGY_BASE_HOARD_THRESHOLD + t * (ENERGY_MAX_HOARD_THRESHOLD - ENERGY_BASE_HOARD_THRESHOLD),
    ),
  };
}

// Player office derivation
// The reference keys everything off one `character.currentOffice`. Solo
// records each role where its own system owns it, so the effective office is
// derived here with highest-executive precedence: president,
// vice president, head of government, governor, then the legislative seat.

export interface PlayerSeat {
  seatType: string;
  countryId: string;
}

export function resolvePlayerSeat(world: WorldState): PlayerSeat | undefined {
  for (const [countryId, executive] of Object.entries(world.executives)) {
    if (executive.presidentId === "player") return { seatType: "president", countryId };
    if (executive.vicePresidentId === "player") return { seatType: "vicePresident", countryId };
  }
  for (const [countryId, government] of Object.entries(world.governments)) {
    if (government.status === "formed" && government.pmPoliticianId === "player") {
      const seatType = EXECUTIVE_OFFICE_BY_COUNTRY[countryId];
      if (!seatType) continue;
      return {
        seatType,
        countryId,
      };
    }
  }
  for (const governor of Object.values(world.governors)) {
    if (governor.governorId === "player") return { seatType: "governor", countryId: governor.countryId };
  }
  const seat = world.player.legislativeSeat;
  if (seat) return { seatType: seat.chamberKey, countryId: seat.countryId };
  return undefined;
}

export interface PlayerActionProjection {
  base: number;
  seatType: string | undefined;
  seatCountryId: string | undefined;
  seatBonus: number;
  cabinetBonus: number;
  /** Central-bank chair bonus. Always 0: solo seats no character chair (#119). */
  chairBonus: number;
  /** Total refresh applied this turn: base + seat + cabinet + chair. Party clout pays later. */
  refresh: number;
  cap: number;
  threshold: number;
  penalty: number;
  /** Actions after this turn's refresh: min(cap, max(0, actions - penalty + refresh)). */
  next: number;
}

/**
 * Authoritative player action refresh projection, reused by the
 * actionRefresh phase and the Profile/footer breakdowns. Roles are read at
 * refresh time, so a newly won office pays out on the same turn's refresh and
 * a lost office stops paying immediately, matching the reference.
 */
export function projectPlayerActionRefresh(world: WorldState): PlayerActionProjection {
  const base = Math.max(DEFAULT_BASE_ACTIONS_PER_TURN, MIN_BASE_ACTIONS_PER_TURN);
  const seat = resolvePlayerSeat(world);
  const cabinet = world.cabinetMembers.find((member) => member.characterId === "player");
  const cabinetCountryId = cabinet?.countryId;
  const { seatBonus, cabinetBonus } = resolveOfficeActionBonusBreakdown({
    currentOfficeType: seat?.seatType,
    electedSeatOfficeType: seat?.seatType,
    isCabinetMember: cabinet !== undefined,
    cabinetOfficeType: cabinetCountryId ? cabinetOfficeTypeForCountry(cabinetCountryId) : undefined,
    officeActionBonus: DEFAULT_OFFICE_ACTION_BONUS,
    countryId: cabinetCountryId ?? seat?.countryId ?? world.player.countryId,
  });
  // Reference chair bonus is +3 (DEFAULT_CHAIR_ACTION_BONUS), but solo seats
  // no character chair (CentralBank.chairMode is always "npp"), so the player
  // can never hold it. No holder field is invented; #119 owns nominations.
  const chairBonus = 0;
  const refresh = base + seatBonus + cabinetBonus + chairBonus;
  // Imported Energy is optional; absent legacy stats retain baseline limits.
  // Full allocation/XP stays #48/#91.
  const energy = world.player.stats?.energy ?? STAT_MIN;
  const { cap, threshold } = energyActionLimits(energy);
  const actions = world.player.actions;
  const penalty = actions > threshold ? ACTION_HOARD_PENALTY : 0;
  const next = Math.min(cap, Math.max(0, actions - penalty + refresh));
  return {
    base,
    seatType: seat?.seatType,
    seatCountryId: seat?.countryId,
    seatBonus,
    cabinetBonus,
    chairBonus,
    refresh,
    cap,
    threshold,
    penalty,
    next,
  };
}
