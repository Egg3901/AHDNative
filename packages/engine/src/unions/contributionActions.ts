import type { WorldState } from "../types.js";
import { clampPoliticalContributionPct } from "./political.js";

export type SetUnionPoliticalContributionsResult =
  | { ok: true; politicalContributionPct: number }
  | { ok: false; reason: "union-not-found" | "not-president" | "invalid-rate" | "suspended" };

/** Set the share of free cash flow paid to union organizers, as in AHDGame's union president command. */
export function setUnionPoliticalContributionsAction(
  world: WorldState,
  unionId: string,
  requested: number,
): SetUnionPoliticalContributionsResult {
  const union = world.unions[unionId];
  if (!union) return { ok: false, reason: "union-not-found" };
  if (world.player.countryId !== union.countryId || union.ownerType !== "player" || union.ownerId !== "player") {
    return { ok: false, reason: "not-president" };
  }
  if (union.suspended) return { ok: false, reason: "suspended" };
  if (!Number.isFinite(requested)) return { ok: false, reason: "invalid-rate" };

  const politicalContributionPct = clampPoliticalContributionPct(requested);
  union.politicalContributionPct = politicalContributionPct;
  union.updatedAtTurn = world.meta.turn;
  return { ok: true, politicalContributionPct };
}
