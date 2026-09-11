import type { WorldState } from "../types.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import {
  getEffectiveBranchCost,
  getOpsBranch,
  type OpsBranchKey,
  type UpgradeCategory,
} from "../campaigns/upgradeCosts.js";
import type { Campaign } from "../types.js";

export interface CampaignUpgradeParams {
  electionId?: string | undefined;
  category?: string | undefined;
  branch?: OpsBranchKey | null | undefined;
}

export type CampaignUpgradeResult = { ok: true; message: string } | { ok: false; error: string };

const CATEGORIES: ReadonlySet<string> = new Set([
  "fundraising",
  "oppositionResearch",
  "groundGame",
  "mediaSpending",
]);

const BRANCHES: ReadonlySet<string> = new Set(["a", "b", "c"]);

/**
 * Player-initiated campaign upgrade purchase (solo port of mainline
 * `upgradeCampaign` in src/lib/campaigns/commands/campaignCommands.ts).
 *
 * Solo scope: the actor is always the nominee (player candidate); there is
 * no manager/surrogate access model in solo, so the only gates are presence
 * of the player's active campaign row, an unresolved race, starter-before-
 * branch sequencing, and campaign-treasury affordability. Costs come from
 * the exact upgrade table (getEffectiveBranchCost) with the verbatim
 * general-phase surcharge while the primary is closed. Spend accrues to
 * spendThisTurn (the money-driver accumulator), never directly to
 * spendStock. Opposition-research targeting is PORT-STUB (Native cut
 * oppositionTargetId): purchases still level the tree and pay maintenance
 * like every other lever, but no rival target is recorded.
 */
export function campaignUpgrade(
  world: WorldState,
  params: CampaignUpgradeParams,
): CampaignUpgradeResult {
  const { electionId, category, branch } = params;
  if (!electionId) return { ok: false, error: "campaignUpgrade requires electionId" };
  if (!category || !CATEGORIES.has(category)) {
    return { ok: false, error: "campaignUpgrade requires category fundraising|oppositionResearch|groundGame|mediaSpending" };
  }
  const lane = category as UpgradeCategory;
  const track = branch === undefined ? null : branch;
  if (track !== null && !BRANCHES.has(track)) {
    return { ok: false, error: "campaignUpgrade branch must be a, b, c or omitted for the starter" };
  }

  const election = world.elections.find((e) => e.id === electionId);
  if (!election) return { ok: false, error: `Unknown election ${electionId}` };
  if (election.status === "resolved") return { ok: false, error: "This election has ended." };
  if (!election.candidates.some((c) => c.id === "player")) {
    return { ok: false, error: "File candidacy in this race before managing its campaign." };
  }

  const campaign = world.campaigns[campaignKey(electionId, "player")] as Campaign | undefined;
  if (!campaign || campaign.status !== "active") {
    return { ok: false, error: "No active campaign for this race." };
  }

  const tree = campaign[`${lane}Tree` as
    | "fundraisingTree"
    | "oppositionResearchTree"
    | "groundGameTree"
    | "mediaSpendingTree"];
  const isStarterPurchase = !tree.starter;
  if (isStarterPurchase && track !== null) {
    return { ok: false, error: "Unlock this lever's starter before buying a branch" };
  }
  if (!isStarterPurchase && track === null) {
    return { ok: false, error: "Select a branch to upgrade" };
  }

  const currentLevel = track === null ? 0 : tree[track];
  const nextLevel = track === null ? 0 : currentLevel + 1;
  // General phase = primary closed and general not ended (turn-first port
  // of mainline isCampaignUpgradeGeneralPhase).
  const turn = world.meta.turn;
  const primaryClosed =
    typeof election.primaryEndTurn === "number" ? turn >= election.primaryEndTurn : true;
  const generalOpen =
    typeof election.endTurn === "number" ? turn <= election.endTurn : true;
  const isGeneralPhase = primaryClosed && generalOpen;
  const cost = getEffectiveBranchCost(lane, track, nextLevel, election.electionType, isGeneralPhase);
  if (!cost) return { ok: false, error: "Max level reached" };

  const costLocal = campaignAnchorToLocal(cost.funds, campaign.countryId);
  if (campaign.funds < costLocal) {
    return { ok: false, error: `Insufficient campaign funds. Required: ${costLocal}, Available: ${Math.floor(campaign.funds)}` };
  }
  if (campaign.actions < cost.actions) {
    return { ok: false, error: `Insufficient campaign actions. Required: ${cost.actions}, Available: ${campaign.actions}` };
  }

  const branchDef = track === null ? null : getOpsBranch(lane, track);
  const lumpAnchor =
    branchDef?.effectType === "incomeLumpOnPurchase" && cost.lumpSum ? cost.lumpSum : 0;
  const lumpLocal = lumpAnchor > 0 ? campaignAnchorToLocal(lumpAnchor, campaign.countryId) : 0;

  campaign.funds = campaign.funds - costLocal + lumpLocal;
  campaign.actions -= cost.actions;
  campaign.totalFundsSpent += costLocal;
  campaign.spendThisTurn += costLocal;
  campaign.totalActionsSpent += cost.actions;
  if (track === null) {
    tree.starter = true;
    tree.a = 0;
    tree.b = 0;
    tree.c = 0;
  } else {
    tree[track] = nextLevel;
  }

  const activity: NonNullable<Campaign["activityHistory"]>[number] = {
    type: "upgrade",
    category: lane,
    ...(track === null ? {} : { branch: track }),
    newLevel: track === null ? 1 : nextLevel,
    costFunds: costLocal,
    costActions: cost.actions,
    turnNumber: world.meta.turn,
  };
  campaign.activityHistory = [...(campaign.activityHistory ?? []), activity].slice(-10);

  const what = track === null ? `starter (${cost.effect})` : `branch ${track} level ${nextLevel} (${cost.effect})`;
  return { ok: true, message: `Upgraded ${lane} ${what} for ${costLocal} funds and ${cost.actions} actions.` };
}
