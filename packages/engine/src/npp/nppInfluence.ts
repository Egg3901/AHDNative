/**
 * Personal NPP relationship influence.
 *
 * Ports AHDGame pin 01797b27082b098fdf3929bb498215c94c8dda24:
 *   src/lib/influence/constants.ts
 *   src/lib/influence/calculator.ts
 *   src/lib/influence/executor.ts (validateInfluenceAttempt + executeInfluence)
 *
 * Bounded slice: relationship-only types (boost_loyalty, boost_favorability,
 * boost_influence, reduce_stubbornness). Source applyInfluenceEffects has no
 * cases for those types, so a resolved roll writes relationship only. Endorse /
 * withdraw / oppose / leadership / relocate stay refused.
 *
 * Public action: influenceNpp { targetId, influenceType, influenceFundAmount? }.
 * Player-only, same-country. Dedicated RNG stream `${seed}:npp-influence`.
 * Eligibility refusals return ok:false with no charge. Stochastic failure /
 * backfire return ok:true and consume AP + funds.
 */

import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import { rngFromSeed, rngFromState, type WorldRng } from "../rng.js";
import type { Politician, WorldState } from "../types.js";

export const NPP_INFLUENCE_STREAM_LABEL = "npp-influence";

/** Quote-time refusal when Native has no recorded NPP stubbornness. Game calculator reads npp.personality.stubbornness with no default. */
export const NPP_INFLUENCE_MISSING_STUBBORNNESS =
  "This NPP has no recorded personality stubbornness.";

/** Recorded stubbornness only. Game generateDefaultPersonality is seed-time Math.random, not an influence heal. */
export function recordedNppStubbornness(politician: Politician): number | null {
  const value = politician.personality?.stubbornness;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const RELATIONSHIP_INFLUENCE_TYPES = [
  "boost_loyalty",
  "boost_favorability",
  "boost_influence",
  "reduce_stubbornness",
] as const;

export type RelationshipInfluenceType = (typeof RELATIONSHIP_INFLUENCE_TYPES)[number];

export interface InfluenceActionConfig {
  type: RelationshipInfluenceType;
  name: string;
  description: string;
  actionCost: number;
  baseFundCost: number;
  baseChance: number;
}

export const INFLUENCE_ACTIONS: Record<RelationshipInfluenceType, InfluenceActionConfig> = {
  boost_favorability: {
    type: "boost_favorability",
    name: "Boost Favorability",
    description: "Run a campaign to increase the NPP's public favorability",
    actionCost: 3,
    baseFundCost: 25000,
    baseChance: 50,
  },
  boost_influence: {
    type: "boost_influence",
    name: "Boost Political Influence",
    description: "Help the NPP expand their political connections and influence",
    actionCost: 3,
    baseFundCost: 50000,
    baseChance: 45,
  },
  boost_loyalty: {
    type: "boost_loyalty",
    name: "Strengthen Party Loyalty",
    description: "Reinforce the NPP's commitment and loyalty to the party",
    actionCost: 3,
    baseFundCost: 10000,
    baseChance: 55,
  },
  reduce_stubbornness: {
    type: "reduce_stubbornness",
    name: "Improve Cooperation",
    description: "Work with the NPP to make them more receptive to party guidance",
    actionCost: 3,
    baseFundCost: 20000,
    baseChance: 40,
  },
};

export const INFLUENCE_LIMITS = {
  PER_NPP_COOLDOWN_TURNS: 2,
  MAX_ATTEMPTS_PER_TURN: 3,
  MIN_SUCCESS_CHANCE: 5,
  MAX_SUCCESS_CHANCE: 85,
  FUND_BONUS_PER_50K: 5,
  MAX_FUND_BONUS: 15,
  MIN_RELATIONSHIP: -100,
  MAX_RELATIONSHIP: 100,
  RELATIONSHIP_CHANGE_SUCCESS: 10,
  RELATIONSHIP_CHANGE_FAILURE: -5,
  RELATIONSHIP_CHANGE_BACKFIRE: -25,
  BACKFIRE_THRESHOLD: 95,
} as const;

export const INFLUENCE_MODIFIERS = {
  STUBBORNNESS_PENALTY_MULTIPLIER: 0.4,
  SAME_PARTY_BONUS: 20,
  CROSS_PARTY_PENALTY: -10,
  POLITICAL_INFLUENCE_DIVISOR: 5,
  MAX_POLITICAL_INFLUENCE_BONUS: 15,
  FAVORABILITY_DIVISOR: 10,
  MAX_FAVORABILITY_BONUS: 10,
  RELATIONSHIP_BONUS_MULTIPLIER: 0.15,
} as const;

export interface NppInfluenceCalculation {
  baseChance: number;
  stubbornnessPenalty: number;
  partyBonus: number;
  politicalInfluenceBonus: number;
  favorabilityBonus: number;
  fundBonus: number;
  relationshipBonus: number;
  finalChance: number;
}

export type NppInfluenceOutcome = "success" | "failure" | "backfire";

export interface NppInfluenceAttemptRecord {
  targetId: string;
  turn: number;
  influenceType: RelationshipInfluenceType;
  outcome: NppInfluenceOutcome;
  roll: number;
  relationshipChange: number;
  message: string;
}

export interface NppInfluenceQuoteOk {
  ok: true;
  actionCost: number;
  fundCost: number;
  extraAnchor: number;
  config: InfluenceActionConfig;
  calculation: NppInfluenceCalculation;
  target: Politician;
  relationshipScore: number;
}

export type NppInfluenceQuote =
  | NppInfluenceQuoteOk
  | { ok: false; error: string };

export function isRelationshipInfluenceType(value: unknown): value is RelationshipInfluenceType {
  return typeof value === "string" && (RELATIONSHIP_INFLUENCE_TYPES as readonly string[]).includes(value);
}

/** Native player↔NPP key. Source uses `${characterId}_${nppId}`; solo actor is `player`. */
export function playerNppRelationshipKey(targetId: string): string {
  return `player:${targetId}`;
}

export function nppInfluenceStreamSeed(worldSeed: string): string {
  return `${worldSeed}:${NPP_INFLUENCE_STREAM_LABEL}`;
}

/** Fork the dedicated stream without consuming it. Tests preview the next roll this way. */
export function forkNppInfluenceRng(world: WorldState): WorldRng {
  return world.nppInfluenceRng
    ? rngFromState(world.nppInfluenceRng)
    : rngFromSeed(nppInfluenceStreamSeed(world.meta.seed));
}

function partyIdentity(partyId: string | null | undefined): string {
  if (partyId == null || partyId === "" || partyId === "independent") return "independent";
  return partyId;
}

export function calculateNppInfluenceChance(input: {
  actorPartyId: string | null | undefined;
  actorCountryId: string;
  actorPoliticalInfluence: number;
  actorFavorability: number;
  nppPartyId: string | null | undefined;
  nppCountryId: string;
  stubbornness: number;
  extraAnchor: number;
  relationshipScore: number;
  influenceType: RelationshipInfluenceType;
}): NppInfluenceCalculation {
  const config = INFLUENCE_ACTIONS[input.influenceType];
  const baseChance = config.baseChance;
  const stubbornnessPenalty = Math.round(
    input.stubbornness * INFLUENCE_MODIFIERS.STUBBORNNESS_PENALTY_MULTIPLIER,
  );

  let partyBonus = 0;
  const actorParty = partyIdentity(input.actorPartyId);
  const nppParty = partyIdentity(input.nppPartyId);
  const sameParty = actorParty === nppParty && input.actorCountryId === input.nppCountryId;
  if (sameParty) partyBonus = INFLUENCE_MODIFIERS.SAME_PARTY_BONUS;
  else if (actorParty !== "independent" && nppParty !== "independent") {
    partyBonus = INFLUENCE_MODIFIERS.CROSS_PARTY_PENALTY;
  }

  const politicalInfluenceBonus = Math.min(
    INFLUENCE_MODIFIERS.MAX_POLITICAL_INFLUENCE_BONUS,
    Math.round((input.actorPoliticalInfluence || 0) / INFLUENCE_MODIFIERS.POLITICAL_INFLUENCE_DIVISOR),
  );
  const favorabilityBonus = Math.min(
    INFLUENCE_MODIFIERS.MAX_FAVORABILITY_BONUS,
    Math.round(input.actorFavorability / INFLUENCE_MODIFIERS.FAVORABILITY_DIVISOR),
  );
  const fundBonus = Math.min(
    INFLUENCE_LIMITS.MAX_FUND_BONUS,
    Math.floor(input.extraAnchor / 50000) * INFLUENCE_LIMITS.FUND_BONUS_PER_50K,
  );
  const relationshipBonus = Math.round(
    input.relationshipScore * INFLUENCE_MODIFIERS.RELATIONSHIP_BONUS_MULTIPLIER,
  );

  const finalChance = Math.max(
    INFLUENCE_LIMITS.MIN_SUCCESS_CHANCE,
    Math.min(
      INFLUENCE_LIMITS.MAX_SUCCESS_CHANCE,
      baseChance - stubbornnessPenalty + partyBonus + politicalInfluenceBonus
        + favorabilityBonus + fundBonus + relationshipBonus,
    ),
  );

  return {
    baseChance,
    stubbornnessPenalty,
    partyBonus,
    politicalInfluenceBonus,
    favorabilityBonus,
    fundBonus,
    relationshipBonus,
    finalChance: Math.round(finalChance),
  };
}

export function determineNppInfluenceOutcome(
  roll: number,
  finalChance: number,
): NppInfluenceOutcome {
  if (roll <= finalChance) return "success";
  if (roll >= INFLUENCE_LIMITS.BACKFIRE_THRESHOLD) return "backfire";
  return "failure";
}

export function nppInfluenceRelationshipChange(outcome: NppInfluenceOutcome): number {
  switch (outcome) {
    case "success":
      return INFLUENCE_LIMITS.RELATIONSHIP_CHANGE_SUCCESS;
    case "failure":
      return INFLUENCE_LIMITS.RELATIONSHIP_CHANGE_FAILURE;
    case "backfire":
      return INFLUENCE_LIMITS.RELATIONSHIP_CHANGE_BACKFIRE;
  }
}

export function nppInfluenceOutcomeMessage(
  outcome: NppInfluenceOutcome,
  nppName: string,
  influenceType: RelationshipInfluenceType,
): string {
  const actionConfig = INFLUENCE_ACTIONS[influenceType];
  switch (outcome) {
    case "success":
      return `${nppName} has agreed to your request.`;
    case "failure":
      return `${nppName} politely declined your request for ${actionConfig.name.toLowerCase()}.`;
    case "backfire":
      return `${nppName} was offended by your approach and is now less likely to work with you in the future.`;
  }
}

function extraAnchorFromParams(params: { influenceFundAmount?: number }): number | { error: string } {
  if (params.influenceFundAmount === undefined) return 0;
  const extra = params.influenceFundAmount;
  if (!Number.isFinite(extra) || extra < 0) {
    return { error: "influenceFundAmount must be a finite amount of at least 0" };
  }
  return extra;
}

export function quoteNppInfluence(
  world: WorldState,
  params: { targetId?: string; influenceType?: string; influenceFundAmount?: number },
  actorId = "player",
): NppInfluenceQuote {
  if (actorId !== "player") return { ok: false, error: "Only the player can influence NPPs" };
  const targetId = params.targetId;
  if (!targetId) return { ok: false, error: "influenceNpp requires targetId and influenceType" };
  if (!isRelationshipInfluenceType(params.influenceType)) {
    return { ok: false, error: "This influence type is not available." };
  }
  const extra = extraAnchorFromParams(params);
  if (typeof extra === "object") return { ok: false, error: extra.error };

  const target = world.politicians.find((politician) => politician.id === targetId);
  if (!target) return { ok: false, error: "NPP not found" };
  if (target.countryId !== world.player.countryId) {
    return { ok: false, error: "NPP must be in the same country." };
  }
  if (target.retiredAt) return { ok: false, error: "This NPP has retired from politics." };
  const stubbornness = recordedNppStubbornness(target);
  if (stubbornness === null) {
    return { ok: false, error: NPP_INFLUENCE_MISSING_STUBBORNNESS };
  }

  const config = INFLUENCE_ACTIONS[params.influenceType];
  const player = world.player;
  const actionCost = config.actionCost;
  if ((player.actions ?? 0) < actionCost) {
    return { ok: false, error: `Not enough actions. Need ${actionCost}, have ${player.actions}.` };
  }

  const totalAnchor = config.baseFundCost + extra;
  const fundCost = campaignAnchorToLocal(totalAnchor, player.countryId);
  if ((player.funds ?? 0) < fundCost) {
    return {
      ok: false,
      error: `Not enough funds. Need $${totalAnchor.toLocaleString("en-US")}, have $${(player.funds ?? 0).toLocaleString("en-US")}.`,
    };
  }

  const rel = world.nppRelationships[playerNppRelationshipKey(targetId)];
  const currentTurn = world.meta.turn;
  if (rel && typeof rel.lastAttemptTurn === "number") {
    const turnsSinceLastAttempt = currentTurn - rel.lastAttemptTurn;
    if (turnsSinceLastAttempt < INFLUENCE_LIMITS.PER_NPP_COOLDOWN_TURNS) {
      const turnsRemaining = INFLUENCE_LIMITS.PER_NPP_COOLDOWN_TURNS - turnsSinceLastAttempt;
      return {
        ok: false,
        error: `You must wait ${turnsRemaining} more turn(s) before attempting to influence this NPP again.`,
      };
    }
  }

  const attemptsThisTurn = (world.nppInfluenceAttempts ?? []).filter((row) => row.turn === currentTurn).length;
  if (attemptsThisTurn >= INFLUENCE_LIMITS.MAX_ATTEMPTS_PER_TURN) {
    return {
      ok: false,
      error: `You have already made ${INFLUENCE_LIMITS.MAX_ATTEMPTS_PER_TURN} influence attempts this turn.`,
    };
  }

  const relationshipScore = rel?.score ?? 0;
  const calculation = calculateNppInfluenceChance({
    actorPartyId: player.partyId,
    actorCountryId: player.countryId,
    actorPoliticalInfluence: player.politicalInfluence ?? 0,
    actorFavorability: player.favorability ?? 0,
    nppPartyId: target.partyId,
    nppCountryId: target.countryId,
    stubbornness,
    extraAnchor: extra,
    relationshipScore,
    influenceType: params.influenceType,
  });

  return {
    ok: true,
    actionCost,
    fundCost,
    extraAnchor: extra,
    config,
    calculation,
    target,
    relationshipScore,
  };
}

/** Resolve a quoted attempt. Caller already charged AP/funds. Always ok:true. */
export function resolveNppInfluence(
  world: WorldState,
  quoted: NppInfluenceQuoteOk,
): { ok: true; message: string } {
  const rng = forkNppInfluenceRng(world);
  const roll = rng.int(1, 100);
  world.nppInfluenceRng = rng.state();

  const outcome = determineNppInfluenceOutcome(roll, quoted.calculation.finalChance);
  const relationshipChange = nppInfluenceRelationshipChange(outcome);
  const newScore = Math.max(
    INFLUENCE_LIMITS.MIN_RELATIONSHIP,
    Math.min(INFLUENCE_LIMITS.MAX_RELATIONSHIP, quoted.relationshipScore + relationshipChange),
  );
  const message = nppInfluenceOutcomeMessage(outcome, quoted.target.name, quoted.config.type);
  const key = playerNppRelationshipKey(quoted.target.id);
  const prev = world.nppRelationships[key];
  world.nppRelationships[key] = {
    score: newScore,
    updatedAtTurn: world.meta.turn,
    lastAttemptTurn: world.meta.turn,
    totalAttempts: (prev?.totalAttempts ?? 0) + 1,
    successfulAttempts: (prev?.successfulAttempts ?? 0) + (outcome === "success" ? 1 : 0),
  };
  const attempts = world.nppInfluenceAttempts ?? [];
  attempts.push({
    targetId: quoted.target.id,
    turn: world.meta.turn,
    influenceType: quoted.config.type,
    outcome,
    roll,
    relationshipChange,
    message,
  });
  world.nppInfluenceAttempts = attempts;
  return { ok: true, message };
}
