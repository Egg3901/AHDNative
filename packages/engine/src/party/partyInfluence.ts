/**
 * Party influence pure helpers.
 * Port of src/lib/turn/partyInfluenceTurn.ts pure functions.
 */

import { INFAMY_REFERENCE } from "./constants.js";

export function computeClosenessScalar(
  myEcon: number,
  mySocial: number,
  partyEcon: number,
  partySocial: number,
): number {
  const MAX_DISTANCE = Math.sqrt(200);
  const dist = Math.sqrt((myEcon - partyEcon) ** 2 + (mySocial - partySocial) ** 2);
  return Math.max(0, 1 - dist / MAX_DISTANCE);
}

export function computeInfamyPenalty(infamy: number, maxPenalty: number): number {
  if (infamy <= 0) return 0;
  const raw = maxPenalty * (Math.log(1 + infamy) / Math.log(1 + INFAMY_REFERENCE));
  return Math.min(maxPenalty, raw);
}

export function computeLeadershipBonus(
  isChair: boolean,
  isViceChair: boolean,
): number {
  // This legacy helper covers the national chair/vice pair. The authoritative
  // projection in playerInfluence.ts reads every persisted national,
  // state-party, committee, and caucus holder.
  let bonus = 0;
  if (isChair) bonus += 5;
  if (isViceChair) bonus += 2;
  return bonus;
}

export function computeTurnGain(
  closenessScalar: number,
  leadershipBonus: number,
  infamyPenalty: number,
  baseRate: number,
): number {
  return baseRate * closenessScalar + leadershipBonus - infamyPenalty;
}

export function computeNewInfluence(current: number, turnGain: number, decayRate: number): number {
  return Math.max(0, current * (1 - decayRate) + turnGain);
}

export function computeBonusActions(
  myInfluence: number,
  totalInfluence: number,
  totalPool: number,
  closenessScalar: number,
  maxBonus: number,
): number {
  if (totalInfluence === 0) return 0;
  const rawShare = (myInfluence / totalInfluence) * totalPool;
  return Math.min(maxBonus, Math.floor(rawShare * closenessScalar));
}
