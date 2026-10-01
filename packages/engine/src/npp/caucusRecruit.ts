/**
 * Chair-only NPP caucus recruitment.
 *
 * Ports AHDGame pin 01797b27082b098fdf3929bb498215c94c8dda24
 * src/app/api/country/[code]/parties/[id]/caucuses/[slug]/members/route.ts
 * (memberType=npp POST + GET) and src/lib/constants/partyOrg.ts.
 *
 * Free. Chair-only. Same party and country. Not retired. Not in another
 * caucus. Relationship with the chair (player:${targetId}) >= 60. 12-turn
 * caucus-global cooldown after a successful recruit. GET hides
 * needs_relationship. Public action: recruitCaucusNpp { caucusId, targetId }.
 */

import { playerNppRelationshipKey } from "./nppInfluence.js";
import type { Politician, WorldState } from "../types.js";

export const CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP = 60;
export const CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS = 12;

export type CaucusNppRecruitStatus =
  | "eligible"
  | "already_member"
  | "other_caucus"
  | "retired"
  | "cooldown"
  | "needs_relationship";

export interface CaucusNppRecruitOption {
  id: string;
  name: string;
  office: string | null;
  relationshipScore: number;
  eligible: boolean;
  status: CaucusNppRecruitStatus;
  statusLabel: string;
  cooldownRemaining: number;
}

export type CaucusNppRecruitQuote =
  | { ok: true; actionCost: 0; fundCost: 0; caucusId: string; target: Politician }
  | { ok: false; error: string };

function playerChairsCaucus(caucus: { chairId?: string | null }): boolean {
  return caucus.chairId === "player";
}

function playerActivelyBelongsToCaucus(
  world: WorldState,
  caucus: { id: string; memberIds: string[] },
): boolean {
  return world.player.caucusId === caucus.id && caucus.memberIds.includes("player");
}

function activeCaucusIdForPolitician(world: WorldState, politicianId: string): string | null {
  for (const caucus of world.caucuses) {
    if (caucus.disbandedAt !== null) continue;
    if (caucus.memberIds.includes(politicianId)) return caucus.id;
  }
  return null;
}

export function caucusNppRecruitCooldownRemaining(world: WorldState, lastNppRecruitTurn: number | undefined): number {
  if (typeof lastNppRecruitTurn !== "number") return 0;
  return Math.max(0, lastNppRecruitTurn + CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS - world.meta.turn);
}

function buildRecruitability(args: {
  relationshipScore: number;
  activeCaucusId: string | null;
  targetCaucusId: string;
  retired: boolean;
  lastNppRecruitTurn: number | undefined;
  currentTurn: number;
}): {
  eligible: boolean;
  status: CaucusNppRecruitStatus;
  statusLabel: string;
  cooldownRemaining: number;
  error: string | null;
} {
  const { relationshipScore, activeCaucusId, targetCaucusId, retired, lastNppRecruitTurn, currentTurn } = args;
  if (activeCaucusId === targetCaucusId) {
    return {
      eligible: false,
      status: "already_member",
      statusLabel: "Already in this caucus",
      cooldownRemaining: 0,
      error: "NPP is already a member of this caucus.",
    };
  }
  if (activeCaucusId) {
    return {
      eligible: false,
      status: "other_caucus",
      statusLabel: "Already in another caucus",
      cooldownRemaining: 0,
      error: "NPP is already a member of another caucus.",
    };
  }
  if (retired) {
    return {
      eligible: false,
      status: "retired",
      statusLabel: "Retired",
      cooldownRemaining: 0,
      error: "Retired NPPs cannot join caucuses.",
    };
  }
  if (relationshipScore < CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP) {
    return {
      eligible: false,
      status: "needs_relationship",
      statusLabel: `Needs ${CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP} Relationship`,
      cooldownRemaining: 0,
      error: `Caucus recruitment requires at least ${CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP} relationship with this NPP.`,
    };
  }
  const onCooldown =
    typeof lastNppRecruitTurn === "number"
    && currentTurn < lastNppRecruitTurn + CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS;
  if (onCooldown) {
    const remaining = Math.max(0, lastNppRecruitTurn + CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS - currentTurn);
    return {
      eligible: false,
      status: "cooldown",
      statusLabel: "Caucus on 12-turn cooldown",
      cooldownRemaining: remaining,
      error: "This caucus is on a 12-turn NPP recruitment cooldown.",
    };
  }
  return {
    eligible: true,
    status: "eligible",
    statusLabel: "Eligible",
    cooldownRemaining: 0,
    error: null,
  };
}

export function listCaucusNppRecruitOptions(
  world: WorldState,
  caucusId: string,
): { ok: true; items: CaucusNppRecruitOption[] } | { ok: false; error: string } {
  const caucus = world.caucuses.find((entry) => entry.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is disbanded" };
  if (!playerChairsCaucus(caucus)) {
    return { ok: false, error: "Only the Caucus Chair can review recruitable NPPs." };
  }
  if (!playerActivelyBelongsToCaucus(world, caucus)) {
    return { ok: false, error: "Only an active member holding the caucus chair can recruit NPPs" };
  }

  const items: CaucusNppRecruitOption[] = [];
  for (const politician of world.politicians) {
    if (politician.countryId !== caucus.countryId) continue;
    if (politician.partyId !== caucus.partyId) continue;
    const activeCaucusId = activeCaucusIdForPolitician(world, politician.id);
    if (activeCaucusId) continue;
    const relationshipScore = world.nppRelationships[playerNppRelationshipKey(politician.id)]?.score ?? 0;
    const recruitability = buildRecruitability({
      relationshipScore,
      activeCaucusId: null,
      targetCaucusId: caucus.id,
      retired: !!politician.retiredAt,
      lastNppRecruitTurn: caucus.lastNppRecruitTurn,
      currentTurn: world.meta.turn,
    });
    if (recruitability.status === "needs_relationship") continue;
    items.push({
      id: politician.id,
      name: politician.name,
      office: politician.chamberKey || null,
      relationshipScore,
      eligible: recruitability.eligible,
      status: recruitability.status,
      statusLabel: recruitability.statusLabel,
      cooldownRemaining: recruitability.cooldownRemaining,
    });
  }
  items.sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    if (left.relationshipScore !== right.relationshipScore) return right.relationshipScore - left.relationshipScore;
    return left.name.localeCompare(right.name);
  });
  return { ok: true, items };
}

export function quoteRecruitCaucusNpp(
  world: WorldState,
  params: { caucusId?: string; targetId?: string },
  actorId = "player",
): CaucusNppRecruitQuote {
  if (actorId !== "player") return { ok: false, error: "Only the player can recruit NPPs" };
  const caucusId = params.caucusId;
  const targetId = params.targetId;
  if (!caucusId || !targetId) return { ok: false, error: "recruitCaucusNpp requires caucusId and targetId" };

  const caucus = world.caucuses.find((entry) => entry.id === caucusId);
  if (!caucus) return { ok: false, error: `Caucus not found: ${caucusId}` };
  if (caucus.disbandedAt !== null) return { ok: false, error: "Caucus is disbanded" };
  if (!playerChairsCaucus(caucus)) {
    return { ok: false, error: "Only the chair can recruit NPPs into the caucus." };
  }
  if (!playerActivelyBelongsToCaucus(world, caucus)) {
    return { ok: false, error: "Only an active member holding the caucus chair can recruit NPPs" };
  }

  const target = world.politicians.find((politician) => politician.id === targetId);
  if (!target) return { ok: false, error: "NPP not found" };
  if (target.partyId !== caucus.partyId || target.countryId !== caucus.countryId) {
    return { ok: false, error: "NPP must be a member of this party to join its caucus." };
  }
  if (target.countryId !== world.player.countryId) {
    return { ok: false, error: "NPP must be in the same country." };
  }

  const relationshipScore = world.nppRelationships[playerNppRelationshipKey(target.id)]?.score ?? 0;
  const recruitability = buildRecruitability({
    relationshipScore,
    activeCaucusId: activeCaucusIdForPolitician(world, target.id),
    targetCaucusId: caucus.id,
    retired: !!target.retiredAt,
    lastNppRecruitTurn: caucus.lastNppRecruitTurn,
    currentTurn: world.meta.turn,
  });
  if (!recruitability.eligible) return { ok: false, error: recruitability.error ?? "NPP is not eligible" };
  return { ok: true, actionCost: 0, fundCost: 0, caucusId: caucus.id, target };
}

export function applyRecruitCaucusNpp(
  world: WorldState,
  params: { caucusId?: string; targetId?: string },
): { ok: true; message: string } | { ok: false; error: string } {
  const quoted = quoteRecruitCaucusNpp(world, params, "player");
  if (!quoted.ok) return quoted;
  const caucus = world.caucuses.find((entry) => entry.id === quoted.caucusId)!;
  if (!caucus.memberIds.includes(quoted.target.id)) caucus.memberIds.push(quoted.target.id);
  caucus.lastNppRecruitTurn = world.meta.turn;
  return { ok: true, message: `Recruited ${quoted.target.name} into ${caucus.name}.` };
}
