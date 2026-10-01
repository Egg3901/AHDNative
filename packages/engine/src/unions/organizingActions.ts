/** Public organize drives over persisted union and corporate-sector state. */
import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { createUnionOrganizer, unionOrganizers, unionStrength } from "./organizers.js";
import type { Union } from "./types.js";

export const ORGANIZE_ACTION_COST = 5;
export const ORGANIZE_STRENGTH_GAIN = 10;
export const ORGANIZE_SECTOR_ACTION_COST = 1;
export const ORGANIZE_TREASURY_COST_PER_WORKER = 2;
export const ORGANIZE_TREASURY_COST_MIN = 50;
export const ORGANIZE_TREASURY_COST_MAX = 8_000;
export const SECTOR_UNIONIZATION_GAIN_BASE = 5;
export const RAID_APPROVAL_EDGE_REQUIRED = 5;

function clampPercent(value: number | undefined): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value! : 0));
}

export function organizeSectorTreasuryCost(workers: number, unionization: number, isOwnSector: boolean): number {
  const workforce = Number.isFinite(workers) && workers > 0 ? workers : 0;
  const density = clampPercent(unionization) / 100;
  const raw = ORGANIZE_TREASURY_COST_PER_WORKER * workforce * (isOwnSector ? density : 1);
  return Math.round(Math.max(ORGANIZE_TREASURY_COST_MIN, Math.min(ORGANIZE_TREASURY_COST_MAX, raw)));
}

/** Rank-and-file drive; mirrors source cost, union strength and organizer bank. */
export function organizeUnionAction(world: WorldState, unionId: string): { strength: number; organizerStrength: number } {
  const union = world.unions[unionId];
  if (!union) throw new Error(`Union not found: ${unionId}`);
  if (world.player.countryId !== union.countryId) throw new Error("You must be in this union's country to help organize it.");
  if (union.suspended) throw new Error(`Union ${union.id} is suspended; organizing is blocked`);
  if (world.player.actions < ORGANIZE_ACTION_COST) {
    throw new Error(`An organize drive costs ${ORGANIZE_ACTION_COST} action points (you have ${world.player.actions}).`);
  }
  world.player.actions -= ORGANIZE_ACTION_COST;
  union.strength = unionStrength(union) + ORGANIZE_STRENGTH_GAIN;
  union.updatedAtTurn = world.meta.turn;
  const rows = unionOrganizers(world);
  const id = `${union.id}:player`;
  const organizer = rows[id] ?? (rows[id] = createUnionOrganizer(union.id, "player", world.meta.turn));
  organizer.strength += ORGANIZE_STRENGTH_GAIN;
  organizer.organizeCount++;
  organizer.updatedAtTurn = world.meta.turn;
  return { strength: union.strength, organizerStrength: organizer.strength };
}

/** Leader-only shop drive; a failed raid consumes the source-defined costs but leaves the asset unchanged. */
export function organizeSectorAction(world: WorldState, unionId: string, assetId: string): {
  applied: boolean;
  wasRaid: boolean;
  won: boolean;
  unionization: number;
  representingUnionId: string | null;
  treasurySpent: number;
} {
  const union = world.unions[unionId];
  if (!union) throw new Error(`Union not found: ${unionId}`);
  if (world.player.countryId !== union.countryId) throw new Error("You must be in this union's country to organize a sector.");
  if (union.suspended) throw new Error(`Union ${union.id} is suspended; organizing is blocked`);
  if (union.ownerType !== "player" || union.ownerId !== "player") throw new Error("Only this union's president can organize a sector.");
  const asset = corporateSectorAssets(world)[assetId];
  if (!asset) throw new Error(`Corporate sector not found: ${assetId}`);
  if (asset.countryId !== union.countryId || asset.sectorType !== union.sectorType) {
    throw new Error("This union can only organize sectors in its own country and industry.");
  }
  if (world.player.actions < ORGANIZE_SECTOR_ACTION_COST) throw new Error("An organizing drive costs 1 action point.");
  const currentUnionization = clampPercent(asset.unionization);
  const incumbentId = asset.representingUnionId ?? null;
  const cost = organizeSectorTreasuryCost(asset.workers, currentUnionization, incumbentId === unionId);
  if (union.treasury < cost) throw new Error("Not enough union treasury to run an organizing drive.");

  let applied = true;
  let won = true;
  let wasRaid = false;
  if (incumbentId && incumbentId !== unionId) {
    const incumbent: Union | undefined = world.unions[incumbentId];
    if (incumbent) {
      wasRaid = true;
      won = clampPercent(union.approval) - clampPercent(incumbent.approval) >= RAID_APPROVAL_EDGE_REQUIRED;
      applied = won;
    }
  }
  world.player.actions -= ORGANIZE_SECTOR_ACTION_COST;
  union.treasury = Math.round((union.treasury - cost) * 100) / 100;
  if (applied) {
    asset.unionization = Math.min(100, currentUnionization + SECTOR_UNIONIZATION_GAIN_BASE * clampPercent(union.approval) / 100);
    asset.representingUnionId = unionId;
  }
  return {
    applied,
    wasRaid,
    won,
    unionization: asset.unionization ?? 0,
    representingUnionId: asset.representingUnionId ?? null,
    treasurySpent: cost,
  };
}
