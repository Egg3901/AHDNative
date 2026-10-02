/**
 * Source union-ban general strike lifecycle.
 *
 * Ports AHDGame main 7ab3cc75 (identical union source blobs to cb66acdf)
 * src/lib/crises/unionBanStrike.ts and
 * src/lib/crises/unionBanStrikeCopy.ts: an enacted national ban with at least
 * one union creates a 24-turn country crisis; one successful mass underground
 * drive at cell strength 15+ extends it once per turn, up to six turns.
 * Crisis effects use Native's existing crisis turn and apply source economic
 * growth, inflation, unemployment, and approval consequences.
 */
import type { WorldState } from "../types.js";

export const UNION_BAN_STRIKE_KIND = "union_ban_general_strike";
export const UNION_BAN_STRIKE_DURATION_TURNS = 24;
export const UNDERGROUND_CRISIS_EXTENSION_LIMIT = 6;

export function hasActiveUnionBanStrike(world: WorldState, countryId: string): boolean {
  return world.crises.some((crisis) =>
    crisis.kind === UNION_BAN_STRIKE_KIND && crisis.status === "active" && crisis.countryIds.includes(countryId),
  );
}

/** Trigger after the authoritative ban is written, only where real unions exist. */
export function triggerUnionBanStrike(world: WorldState, countryId: string): boolean {
  if (world.budgets[countryId]?.unionsBanned !== true) return false;
  if (!Object.values(world.unions).some((union) => union.countryId === countryId)) return false;
  if (hasActiveUnionBanStrike(world, countryId)) return false;

  const turn = world.meta.turn;
  const id = `${UNION_BAN_STRIKE_KIND}:${countryId}:${turn}:${world.crises.length}`;
  const name = "Wildcat General Strike";
  const description = "The workforce has walked out in response to the national union ban.";
  world.crises.push({
    id,
    kind: UNION_BAN_STRIKE_KIND,
    name,
    description,
    scope: "country",
    countryIds: [countryId],
    startTurn: turn,
    durationTurns: UNION_BAN_STRIKE_DURATION_TURNS,
    effects: [
      { type: "gdpGrowth", value: -6, effectType: "tick" },
      { type: "inflation", value: 3, effectType: "tick" },
      { type: "unemployment", value: 3, effectType: "tick" },
      { type: "approval", value: -5, effectType: "tick" },
    ],
    status: "active",
    wireMessageOnStart: "Unions have been banned and the country has stopped working. Plants, docks and freight are all shut.",
    wireMessageOnEnd: "The general strike is over. Work is restarting on whatever terms the government could get.",
  });
  world.news.push({
    id: `${id}:start`,
    turn,
    date: world.meta.date,
    headline: world.crises.at(-1)!.wireMessageOnStart,
    body: description,
    category: "Crisis",
    countryId,
    eventId: id,
    eventName: name,
  });
  return true;
}

/** Repealing the ban ends the corresponding crisis through the ordinary lifecycle state. */
export function resolveUnionBanStrike(world: WorldState, countryId: string): number {
  let resolved = 0;
  for (const crisis of world.crises) {
    if (crisis.kind !== UNION_BAN_STRIKE_KIND || crisis.status !== "active" || !crisis.countryIds.includes(countryId)) continue;
    crisis.status = "resolved";
    crisis.endTurn = world.meta.turn;
    resolved++;
    world.news.push({
      id: `${crisis.id}:end`,
      turn: world.meta.turn,
      date: world.meta.date,
      headline: crisis.wireMessageOnEnd,
      body: crisis.description,
      category: "Crisis",
      countryId,
      eventId: crisis.id,
      eventName: crisis.name,
    });
  }
  return resolved;
}

/** Successful mass organizing prolongs only an active strike and records the turn guard. */
export function extendUnionBanStrikeFromUnderground(world: WorldState, countryId: string, strength: number, mode: "quiet" | "mass"): boolean {
  if (mode !== "mass" || strength < 15) return false;
  const crisis = world.crises.find((candidate) =>
    candidate.kind === UNION_BAN_STRIKE_KIND && candidate.status === "active" && candidate.countryIds.includes(countryId),
  );
  if (!crisis) return false;
  const duration = crisis.durationTurns ?? 0;
  if (
    duration < UNION_BAN_STRIKE_DURATION_TURNS ||
    duration >= UNION_BAN_STRIKE_DURATION_TURNS + UNDERGROUND_CRISIS_EXTENSION_LIMIT ||
    crisis.lastUndergroundExtensionTurn === world.meta.turn
  ) return false;
  crisis.durationTurns = duration + 1;
  crisis.lastUndergroundExtensionTurn = world.meta.turn;
  return true;
}
